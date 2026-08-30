import test from "node:test";
import assert from "node:assert/strict";
import { createAcceptedTruthEnvelope, MemoryAcceptedTruthRepository } from "../dist-test/src/accepted-truth.js";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles, getProfileDefinition } from "../dist-test/src/profiles.js";
import { compileCatalogEntries, FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { handleAcceptedTruthRequest } from "../dist-test/worker/accepted-truth.js";
import { sha256 } from "../dist-test/src/crypto.js";

class ActivationStatement {
  values = [];
  constructor(db, query) { this.db = db; this.query = query; }
  bind(...values) { assert.equal((this.query.match(/\?/g) ?? []).length, values.length, this.query); this.values = values; return this; }
  async first() { return this.db.first(this.query, this.values); }
  async all() { return { results: [] }; }
}

class ActivationGateDb {
  challenge = null;
  activation = null;
  consumption = null;
  targetEnvelope = null;
  batchCalls = 0;
  firstCalls = 0;
  beforeGuardedWrite = null;
  constructor({ baseEnvelope, arrival, construction }) {
    this.baseEnvelope = baseEnvelope;
    this.arrival = arrival;
    this.construction = construction;
  }
  prepare(query) { return new ActivationStatement(this, query); }
  async first(query, values) {
    this.firstCalls += 1;
    if (query.includes("FROM tenant_accounts")) return { scope_id: "scope_test" };
    if (query.includes("FROM plan_heads h") && query.includes("JOIN plan_revisions")) {
      const planId = values[1];
      const envelope = planId === this.baseEnvelope.planId ? this.baseEnvelope : this.targetEnvelope?.planId === planId ? this.targetEnvelope : null;
      return envelope ? { profile_id: envelope.profileId, profile_hash: envelope.profileHash, revision: envelope.revision, snapshot_hash: envelope.snapshotHash, snapshot_json: JSON.stringify(envelope.snapshot), previous_snapshot_hash: envelope.previousSnapshotHash } : null;
    }
    if (query.includes("FROM arrival_orders")) return this.arrival;
    if (query.includes("FROM construction_packets")) return this.construction;
    if (query.includes("SELECT request_hash, receipt_json FROM activation_receipts")) return this.activation;
    if (query.includes("FROM challenge_consumptions")) return this.consumption;
    if (query.includes("FROM authority_challenges")) return this.challenge;
    throw new Error(`Unhandled activation-gate first query: ${query}`);
  }
  async batch(statements) {
    this.batchCalls += 1;
    if (statements[0]?.query.includes("INSERT INTO challenge_consumptions") && statements[0]?.query.includes("WHERE EXISTS") && this.beforeGuardedWrite) {
      const interleave = this.beforeGuardedWrite;
      this.beforeGuardedWrite = null;
      interleave(this);
    }
    const results = [];
    for (const statement of statements) {
      const guardedWrite = statement.query.includes("WHERE EXISTS (SELECT 1 FROM challenge_consumptions");
      const guardActive = Boolean(this.consumption);
      if (statement.query.includes("SELECT profile_hash, revision FROM plan_heads")) {
        const envelope = statement.values[1] === this.baseEnvelope.planId ? this.baseEnvelope : this.targetEnvelope;
        results.push({ success: true, results: envelope ? [{ profile_hash: envelope.profileHash, revision: envelope.revision }] : [] });
      } else if (statement.query.includes("SELECT order_id, version, status, packet_checksum FROM arrival_orders")) {
        results.push({ success: true, results: this.arrival ? [this.arrival] : [] });
      } else if (statement.query.includes("SELECT packet_id, packet_json, base_plan_id")) {
        results.push({ success: true, results: this.construction ? [this.construction] : [] });
      } else if (statement.query.includes("SELECT request_hash, receipt_json FROM activation_receipts")) {
        results.push({ success: true, results: this.activation ? [this.activation] : [] });
      } else if (statement.query.trimStart().startsWith("SELECT") && statement.query.includes("FROM authority_challenges")) {
        results.push({ success: true, results: this.challenge ? [this.challenge] : [] });
      } else if (statement.query.trimStart().startsWith("SELECT") && statement.query.includes("FROM challenge_consumptions")) {
        results.push({ success: true, results: this.consumption ? [this.consumption] : [] });
      } else if (statement.query.includes("FROM plan_heads h") && statement.query.includes("JOIN plan_revisions")) {
        const planId = statement.values[1];
        const envelope = planId === this.baseEnvelope.planId ? this.baseEnvelope : this.targetEnvelope?.planId === planId ? this.targetEnvelope : null;
        results.push({ success: true, results: envelope ? [{ profile_id: envelope.profileId, profile_hash: envelope.profileHash, revision: envelope.revision, snapshot_hash: envelope.snapshotHash, snapshot_json: JSON.stringify(envelope.snapshot), previous_snapshot_hash: envelope.previousSnapshotHash }] : [] });
      } else if (statement.query.includes("INTO authority_challenges")) {
        const v = statement.values;
        this.challenge = { challenge_id: v[1], plan_id: v[2], profile_hash: v[3], revision: v[4], target_type: v[5], target_id: v[6], content_hash: v[7], authority_id: v[8], command_hash: v[9], created_at: v[10], expires_at: v[11] };
        results.push({ success: true, meta: { changes: 1 } });
      } else if (statement.query.includes("INSERT INTO plan_heads")) {
        if (guardedWrite && !guardActive) { results.push({ success: true, meta: { changes: 0 } }); continue; }
        const v = statement.values;
        this.targetEnvelope = { envelopeVersion: "finite-plan-accepted-truth.v1", scopeId: "authenticated-user-v1", planId: v[1], profileId: v[2], profileHash: v[3], revision: v[4], snapshotHash: v[5], previousSnapshotHash: null, snapshot: null };
        results.push({ success: true, meta: { changes: 1 } });
      } else if (statement.query.includes("INSERT INTO plan_revisions")) {
        if (guardedWrite && !guardActive) { results.push({ success: true, meta: { changes: 0 } }); continue; }
        this.targetEnvelope.snapshot = JSON.parse(statement.values[5]);
        results.push({ success: true, meta: { changes: 1 } });
      } else if (statement.query.includes("INSERT INTO activation_receipts")) {
        if (guardedWrite && !guardActive) { results.push({ success: true, meta: { changes: 0 } }); continue; }
        const v = statement.values;
        this.activation = { request_hash: v[5], receipt_json: v[6] };
        results.push({ success: true, meta: { changes: 1 } });
      } else if (statement.query.includes("INSERT INTO challenge_consumptions")) {
        if (statement.query.includes("WHERE EXISTS")) {
          const v = statement.values;
          const currentPayload = this.construction ? JSON.parse(this.construction.packet_json).payload : null;
          const permitted = this.challenge?.challenge_id === v[7]
            && this.challenge?.plan_id === v[8]
            && this.challenge?.profile_hash === v[9]
            && this.challenge?.revision === v[10]
            && this.challenge?.target_id === v[11]
            && this.challenge?.content_hash === v[12]
            && this.challenge?.authority_id === v[13]
            && this.challenge?.command_hash === v[14]
            && Date.parse(this.challenge?.expires_at ?? "") > Date.parse(v[15])
            && this.baseEnvelope.planId === v[19]
            && this.baseEnvelope.profileHash === v[20]
            && this.baseEnvelope.revision === v[21]
            && this.arrival?.order_id === v[23]
            && this.arrival?.version === v[24]
            && this.arrival?.packet_checksum === v[25]
            && ["interpretation_confirmed", "proposed_plan_ready"].includes(this.arrival?.status)
            && this.construction?.packet_id === v[27]
            && this.construction?.base_plan_id === v[29]
            && this.construction?.base_profile_hash === v[30]
            && this.construction?.base_revision === v[31]
            && this.construction?.source_order_id === v[32]
            && this.construction?.source_order_version === v[33]
            && this.construction?.source_order_checksum === v[34]
            && this.construction?.kind === "draft"
            && !this.construction?.cleared_at
            && this.construction?.disposition === "current"
            && Date.parse(this.construction?.expires_at ?? "") > Date.parse(v[28])
            && currentPayload?.draftId === v[35]
            && currentPayload?.contentHash === v[36]
            && !this.targetEnvelope
            && !this.activation
            && !this.consumption;
          if (permitted) this.consumption = { challenge_id: v[1], receipt_id: v[3], request_hash: v[4] };
          results.push({ success: true, meta: { changes: permitted ? 1 : 0 } });
        } else {
          this.consumption = { challenge_id: statement.values[1] };
          results.push({ success: true, meta: { changes: 1 } });
        }
      } else if (statement.query.includes("UPDATE construction_packets SET cleared_at")) {
        if (guardedWrite && !guardActive) { results.push({ success: true, meta: { changes: 0 } }); continue; }
        this.construction.cleared_at = statement.values[0];
        this.construction.disposition = "discarded";
        results.push({ success: true, meta: { changes: 1 } });
      } else if (statement.query.includes("INSERT INTO plan_catalog") || statement.query.includes("INSERT OR IGNORE INTO evidence_records")) {
        if (guardedWrite && !guardActive) { results.push({ success: true, meta: { changes: 0 } }); continue; }
        // Catalog and evidence rows are covered by integrity validation; the fake stores only activation state.
        results.push({ success: true, meta: { changes: 1 } });
      } else throw new Error(`Unhandled activation-gate batch query: ${statement.query}`);
    }
    return results;
  }
}

const makeRuntime = (profiles, profileId, repository, storage = new MemoryStorage()) =>
  new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), profileId, undefined, [], () => new Date("2026-08-26T00:00:00.000Z"), repository);

const assertPrivacySafeActivationTiming = (response, operation, d1Calls) => {
  assert.match(response.headers.get("server-timing") ?? "", /^finite_worker;dur=\d+\.\d, finite_d1;dur=\d+\.\d, finite_runtime;dur=\d+\.\d$/);
  assert.equal(response.headers.get("x-finite-activation-timing"), `finite-activation-timing.v1; operation=${operation}; d1_calls=${d1Calls}`);
  assert.doesNotMatch(response.headers.get("server-timing") ?? "", /plan|arrival|user|scope|hash/i);
};

const assertPrivacySafeActivationTimingBody = (body, operation, d1Calls) => {
  assert.equal(body.activationTiming.measurementVersion, "finite-plan-activation-timing.v1");
  assert.equal(body.activationTiming.operation, operation);
  assert.equal(body.activationTiming.d1Calls, d1Calls);
  for (const key of ["workerMs", "d1AwaitMs", "runtimeMs"]) assert.equal(typeof body.activationTiming[key], "number");
  assert.doesNotMatch(JSON.stringify(body.activationTiming), /planId|arrival|user|scope|hash|content/i);
};

const prepareApprovedOption = async (runtime, title) => {
  const kernel = runtime.kernel;
  const recorded = kernel.recordChangeEvent({
    type: "live_change",
    title,
    costDeltaMinor: 10_000,
    minimumBufferMinor: 0,
    evidenceRefs: ["evidence_current"],
    expectedRevision: kernel.revision,
  });
  assert.equal(recorded.code, "CHANGE_RECORDED");
  const compared = await kernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
  const chosen = compared.options.find((option) => option.valid);
  assert(chosen);
  const staged = await kernel.stageOption({ candidateId: chosen.candidateId, expectedRevision: kernel.revision });
  assert.equal(staged.code, "OPTION_STAGED");
  const approved = await kernel.humanApprove({ candidateId: chosen.candidateId, warningsAcknowledged: staged.staged.warnings.map((warning) => String(warning.code)) });
  assert.equal(approved.code, "HUMAN_APPROVAL_RECORDED");
  return {
    candidateId: chosen.candidateId,
    approvalId: approved.approval.approvalId,
    authorityChallengeId: approved.approval.authorityChallengeId,
    event: recorded.event,
    expectedRevision: kernel.revision,
  };
};

test("the hosted activation challenge validates current arrival and exact draft before minting authority", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = makeRuntime(profiles, "travel", undefined);
  const snapshot = runtime.kernel.snapshot();
  const baseEnvelope = { planId: snapshot.planId, profileId: snapshot.profileId, profileHash: snapshot.profileHash, revision: snapshot.revision, snapshot, snapshotHash: "c".repeat(64), previousSnapshotHash: null };
  const sourceArrival = { orderId: "arrival_guarded_activation", orderVersion: 7, orderChecksum: "a".repeat(64) };
  const draftId = "plan_draft_1234567890abcdef";
  const contentHash = "b".repeat(64);
  const packetId = "construction_1234567890abcdef";
  const construction = { packet_id: packetId, packet_json: JSON.stringify({ kind: "draft", payload: { draftId, contentHash } }), base_plan_id: snapshot.planId, base_profile_hash: snapshot.profileHash, base_revision: 1, kind: "draft", source_order_id: sourceArrival.orderId, source_order_version: sourceArrival.orderVersion, source_order_checksum: sourceArrival.orderChecksum, expires_at: "2099-08-30T00:00:00.000Z", cleared_at: null, disposition: "current" };
  const db = new ActivationGateDb({ baseEnvelope, arrival: { order_id: sourceArrival.orderId, version: 7, status: "interpretation_confirmed", packet_checksum: sourceArrival.orderChecksum }, construction });
  const body = { planId: snapshot.planId, profileHash: snapshot.profileHash, revision: 1, targetType: "plan_activation", targetId: draftId, contentHash, authorityId: "plan_confirmation_guarded", ttlSeconds: 300, gate: { gateVersion: "finite-plan-activation-gate.v1", source: "human_action", constructionPacketId: packetId, baseProfileHash: snapshot.profileHash, sourceArrival } };
  const headers = { origin: "https://finite.example", "content-type": "application/json", "oai-authenticated-user-id": "site-user-123" };
  const accepted = await handleAcceptedTruthRequest(new Request("https://finite.example/api/authority-challenges/plan-activation", { method: "POST", headers, body: JSON.stringify(body) }), db);
  assert.equal(accepted.status, 201);
  assertPrivacySafeActivationTiming(accepted, "challenge", 3);
  const acceptedBody = await accepted.json();
  assert.equal(acceptedBody.code, "AUTHORITY_CHALLENGE_CREATED");
  assertPrivacySafeActivationTimingBody(acceptedBody, "challenge", 3);
  assert.equal(db.challenge.target_id, draftId);
  assert.equal(db.batchCalls, 2, "guard validation and challenge persistence should use two D1 batches");
  assert.equal(db.firstCalls, 1, "a fresh guarded challenge should only read tenant identity outside the batches");

  db.arrival.version = 8;
  const stale = await handleAcceptedTruthRequest(new Request("https://finite.example/api/authority-challenges/plan-activation", { method: "POST", headers, body: JSON.stringify(body) }), db);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "PLAN_ACTIVATION_ARRIVAL_STALE");

  db.arrival.version = 7;
  const untrusted = structuredClone(body);
  untrusted.gate.source = "operator_claim";
  const refused = await handleAcceptedTruthRequest(new Request("https://finite.example/api/authority-challenges/plan-activation", { method: "POST", headers, body: JSON.stringify(untrusted) }), db);
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).code, "PLAN_ACTIVATION_GATE_INVALID");
});

test("accepted initialization consumes the prior guarded challenge and retires the exact draft in one batch", async () => {
  const profiles = await compileBuiltInProfiles();
  const baseRuntime = makeRuntime(profiles, "travel", undefined);
  const targetRuntime = makeRuntime(profiles, "event", undefined);
  const baseSnapshot = baseRuntime.kernel.snapshot();
  const targetSnapshot = targetRuntime.kernel.snapshot();
  const baseEnvelope = await createAcceptedTruthEnvelope(baseSnapshot, null);
  const sourceArrival = { orderId: "arrival_batched_activation", orderVersion: 5, orderChecksum: "d".repeat(64) };
  const draftId = "plan_draft_fedcba0987654321";
  const contentHash = "e".repeat(64);
  const packetId = "construction_fedcba0987654321";
  const construction = { packet_id: packetId, packet_json: JSON.stringify({ kind: "draft", payload: { draftId, contentHash } }), base_plan_id: baseSnapshot.planId, base_profile_hash: baseSnapshot.profileHash, base_revision: 1, kind: "draft", source_order_id: sourceArrival.orderId, source_order_version: sourceArrival.orderVersion, source_order_checksum: sourceArrival.orderChecksum, expires_at: "2099-08-30T00:00:00.000Z", cleared_at: null, disposition: "current" };
  const db = new ActivationGateDb({ baseEnvelope, arrival: { order_id: sourceArrival.orderId, version: 5, status: "interpretation_confirmed", packet_checksum: sourceArrival.orderChecksum }, construction });
  const gate = { gateVersion: "finite-plan-activation-gate.v1", source: "human_action", constructionPacketId: packetId, baseProfileHash: baseSnapshot.profileHash, sourceArrival };
  const challengeBody = { planId: baseSnapshot.planId, profileHash: baseSnapshot.profileHash, revision: 1, targetType: "plan_activation", targetId: draftId, contentHash, authorityId: "plan_confirmation_batched", ttlSeconds: 300, gate };
  const headers = { origin: "https://finite.example", "content-type": "application/json", "oai-authenticated-user-id": "site-user-123" };
  const challengeResponse = await handleAcceptedTruthRequest(new Request("https://finite.example/api/authority-challenges/plan-activation", { method: "POST", headers, body: JSON.stringify(challengeBody) }), db);
  const challenge = (await challengeResponse.json()).challenge;
  const batchesBeforeActivation = db.batchCalls;
  const readsBeforeActivation = db.firstCalls;
  const receiptBase = { idempotencyKey: "batched-activation-0001", fromPlanId: baseSnapshot.planId, toPlanId: targetSnapshot.planId, profileId: targetSnapshot.profileId, profileHash: targetSnapshot.profileHash, draftId, confirmationId: "plan_confirmation_batched", contentHash, baseRevision: 1, activationKind: "new_plan", sourceArrival };
  const replayChecksum = await sha256(receiptBase);
  const activationReceipt = { receiptId: `plan_activation_${replayChecksum.slice(0, 16)}`, ...receiptBase, replayChecksum };
  const targetDefinition = getProfileDefinition("event");
  const catalogEntry = { definition: targetDefinition, evidenceRecords: [], lineage: { activationKind: "new_plan", supersedesPlanId: null, supersedesProfileHash: null, diffHash: null, activationReceiptId: activationReceipt.receiptId } };
  const envelope = await createAcceptedTruthEnvelope(targetSnapshot, null);
  const activationRequestHash = await sha256({ envelope, activationReceipt, catalogEntry, authorityChallengeId: challenge.challengeId, activationGate: gate });
  const activationBody = { envelope, activationReceipt, catalogEntry, authorityChallengeId: challenge.challengeId, activationGate: gate, activationRequestHash };

  const activated = await handleAcceptedTruthRequest(new Request("https://finite.example/api/accepted-truth/initialize", { method: "POST", headers, body: JSON.stringify(activationBody) }), db);
  const activatedBody = await activated.json();
  assert.equal(activated.status, 201, JSON.stringify(activatedBody));
  assertPrivacySafeActivationTiming(activated, "initialize", 4);
  assertPrivacySafeActivationTimingBody(activatedBody, "initialize", 4);
  assert.equal(activatedBody.code, "ACCEPTED_TRUTH_INITIALIZED");
  assert.equal(activatedBody.constructionPacketCleared, true);
  assert.equal(db.consumption.challenge_id, challenge.challengeId);
  assert.equal(db.construction.disposition, "discarded");
  assert.equal(db.targetEnvelope.planId, targetSnapshot.planId);
  assert.equal(db.batchCalls - batchesBeforeActivation, 3, "guarded activation should use one authority read batch, one gate read batch and one atomic write batch");
  assert.equal(db.firstCalls - readsBeforeActivation, 1, "guarded activation should only read tenant identity outside the batches");

  const replayed = await handleAcceptedTruthRequest(new Request("https://finite.example/api/accepted-truth/initialize", { method: "POST", headers, body: JSON.stringify(activationBody) }), db);
  const replayedBody = await replayed.json();
  assert.equal(replayed.status, 200, JSON.stringify(replayedBody));
  assert.equal(replayedBody.code, "ACCEPTED_TRUTH_CURRENT");
  assert.equal(replayedBody.replay, true);
});

test("guarded initialization aborts when source truth changes between validation and the write batch", async () => {
  const profiles = await compileBuiltInProfiles();
  const scenarios = [
    { name: "source plan", code: "PLAN_ACTIVATION_BASE_STALE", mutate: (db) => { db.baseEnvelope.revision += 1; } },
    { name: "arrival", code: "PLAN_ACTIVATION_ARRIVAL_STALE", mutate: (db) => { db.arrival.version += 1; } },
    { name: "draft", code: "PLAN_ACTIVATION_DRAFT_STALE", mutate: (db) => { db.construction.disposition = "returned"; } },
  ];
  for (const scenario of scenarios) {
    const baseSnapshot = makeRuntime(profiles, "travel", undefined).kernel.snapshot();
    const targetSnapshot = makeRuntime(profiles, "event", undefined).kernel.snapshot();
    const baseEnvelope = await createAcceptedTruthEnvelope(baseSnapshot, null);
    const sourceArrival = { orderId: `arrival_interleaved_${scenario.name.replace(" ", "_")}`, orderVersion: 5, orderChecksum: "d".repeat(64) };
    const draftId = `plan_draft_${scenario.code.toLowerCase().replaceAll("_", "").slice(0, 16)}`;
    const contentHash = "e".repeat(64);
    const packetId = `construction_${contentHash.slice(0, 16)}`;
    const construction = { packet_id: packetId, packet_json: JSON.stringify({ kind: "draft", payload: { draftId, contentHash } }), base_plan_id: baseSnapshot.planId, base_profile_hash: baseSnapshot.profileHash, base_revision: 1, kind: "draft", source_order_id: sourceArrival.orderId, source_order_version: sourceArrival.orderVersion, source_order_checksum: sourceArrival.orderChecksum, expires_at: "2099-08-30T00:00:00.000Z", cleared_at: null, disposition: "current" };
    const db = new ActivationGateDb({ baseEnvelope, arrival: { order_id: sourceArrival.orderId, version: 5, status: "interpretation_confirmed", packet_checksum: sourceArrival.orderChecksum }, construction });
    const gate = { gateVersion: "finite-plan-activation-gate.v1", source: "human_action", constructionPacketId: packetId, baseProfileHash: baseSnapshot.profileHash, sourceArrival };
    const confirmationId = `plan_confirmation_${scenario.code.toLowerCase()}`;
    const challengeBody = { planId: baseSnapshot.planId, profileHash: baseSnapshot.profileHash, revision: 1, targetType: "plan_activation", targetId: draftId, contentHash, authorityId: confirmationId, ttlSeconds: 300, gate };
    const headers = { origin: "https://finite.example", "content-type": "application/json", "oai-authenticated-user-id": "site-user-123" };
    const challengeResponse = await handleAcceptedTruthRequest(new Request("https://finite.example/api/authority-challenges/plan-activation", { method: "POST", headers, body: JSON.stringify(challengeBody) }), db);
    assert.equal(challengeResponse.status, 201, scenario.name);
    const challenge = (await challengeResponse.json()).challenge;
    const receiptBase = { idempotencyKey: `interleaved-${scenario.name}-0001`, fromPlanId: baseSnapshot.planId, toPlanId: targetSnapshot.planId, profileId: targetSnapshot.profileId, profileHash: targetSnapshot.profileHash, draftId, confirmationId, contentHash, baseRevision: 1, activationKind: "new_plan", sourceArrival };
    const replayChecksum = await sha256(receiptBase);
    const activationReceipt = { receiptId: `plan_activation_${replayChecksum.slice(0, 16)}`, ...receiptBase, replayChecksum };
    const catalogEntry = { definition: getProfileDefinition("event"), evidenceRecords: [], lineage: { activationKind: "new_plan", supersedesPlanId: null, supersedesProfileHash: null, diffHash: null, activationReceiptId: activationReceipt.receiptId } };
    const envelope = await createAcceptedTruthEnvelope(targetSnapshot, null);
    const activationRequestHash = await sha256({ envelope, activationReceipt, catalogEntry, authorityChallengeId: challenge.challengeId, activationGate: gate });
    db.beforeGuardedWrite = scenario.mutate;
    const response = await handleAcceptedTruthRequest(new Request("https://finite.example/api/accepted-truth/initialize", { method: "POST", headers, body: JSON.stringify({ envelope, activationReceipt, catalogEntry, authorityChallengeId: challenge.challengeId, activationGate: gate, activationRequestHash }) }), db);
    const body = await response.json();
    assert.equal(response.status, 409, scenario.name);
    assert.equal(body.code, scenario.code, scenario.name);
    assert.equal(db.targetEnvelope, null, scenario.name);
    assert.equal(db.activation, null, scenario.name);
    assert.equal(db.consumption, null, scenario.name);
  }
});

for (const profileId of ["travel", "renovation", "event"]) {
  test(`${profileId} human authority and Codex operation commit to remote truth and survive a browser-empty reload`, async () => {
    const profiles = await compileBuiltInProfiles();
    const repository = new MemoryAcceptedTruthRepository();
    const runtime = makeRuntime(profiles, profileId, repository);
    const hydrated = await runtime.hydrateAcceptedTruth();
    assert.equal(hydrated.code, "ACCEPTED_TRUTH_INITIALIZED");
    assert.deepEqual(runtime.kernel.acceptedTruth.status, "ready");

    const command = await prepareApprovedOption(runtime, `${profileId} remote journey`);
    const applied = await runtime.kernel.applyApprovedOption({ ...command, idempotencyKey: `remote-${profileId}-0001` });
    assert.equal(applied.code, "OPTION_APPLIED");
    assert.equal(runtime.kernel.revision, 2);
    assert.equal(runtime.kernel.acceptedTruth.status, "ready");

    const browserEmptyReload = makeRuntime(profiles, profileId, repository, new MemoryStorage());
    assert.equal(browserEmptyReload.kernel.revision, 1);
    const rehydrated = await browserEmptyReload.hydrateAcceptedTruth();
    assert.equal(rehydrated.code, "ACCEPTED_TRUTH_CURRENT");
    assert.equal(browserEmptyReload.kernel.revision, 2);
    assert.deepEqual(browserEmptyReload.kernel.accepted, runtime.kernel.accepted);
    assert.deepEqual(browserEmptyReload.kernel.entities, runtime.kernel.entities);
    assert.equal(browserEmptyReload.kernel.receipts[0].receiptId, runtime.kernel.receipts[0].receiptId);
  });
}

test("optimistic concurrency permits one operator commit and rolls the losing kitchen back to its exact approved checkpoint", async () => {
  const profiles = await compileBuiltInProfiles();
  const repository = new MemoryAcceptedTruthRepository();
  const first = makeRuntime(profiles, "travel", repository);
  const second = makeRuntime(profiles, "travel", repository);
  await first.hydrateAcceptedTruth();
  await second.hydrateAcceptedTruth();
  const firstCommand = await prepareApprovedOption(first, "First operator route");
  const secondCommand = await prepareApprovedOption(second, "Second operator route");

  const [firstResult, secondResult] = await Promise.all([
    first.kernel.applyApprovedOption({ ...firstCommand, idempotencyKey: "concurrent-first" }),
    second.kernel.applyApprovedOption({ ...secondCommand, idempotencyKey: "concurrent-second" }),
  ]);
  const outcomes = [firstResult.code, secondResult.code].sort();
  assert.deepEqual(outcomes, ["ACCEPTED_STATE_CONFLICT", "OPTION_APPLIED"]);
  const winner = firstResult.code === "OPTION_APPLIED" ? first : second;
  const loser = firstResult.code === "ACCEPTED_STATE_CONFLICT" ? first : second;
  assert.equal(winner.kernel.revision, 2);
  assert.equal(loser.kernel.revision, 1);
  assert(loser.kernel.stagedCandidate);
  assert(loser.kernel.approval);
  assert.equal(loser.kernel.receipts.length, 0);

  const refreshed = await loser.hydrateAcceptedTruth();
  assert.equal(refreshed.code, "ACCEPTED_TRUTH_CURRENT");
  assert.equal(loser.kernel.revision, 2);
  assert.equal(loser.kernel.stagedCandidate, null);
  assert.equal(loser.kernel.approval, null);
});

test("a lost commit response retries with the same deterministic receipt and resolves as an exact repository replay", async () => {
  const profiles = await compileBuiltInProfiles();
  const durable = new MemoryAcceptedTruthRepository();
  let loseNextResponse = true;
  const repository = {
    initialize: (...args) => durable.initialize(...args),
    load: (...args) => durable.load(...args),
    createAuthorityChallenge: (...args) => durable.createAuthorityChallenge(...args),
    async commit(...args) {
      const result = await durable.commit(...args);
      if (loseNextResponse) {
        loseNextResponse = false;
        throw new Error("injected lost response after durable commit");
      }
      return result;
    },
  };
  const runtime = makeRuntime(profiles, "event", repository);
  await runtime.hydrateAcceptedTruth();
  const command = { ...(await prepareApprovedOption(runtime, "Lost response route")), idempotencyKey: "lost-response-0001" };
  const failed = await runtime.kernel.applyApprovedOption(command);
  assert.equal(failed.code, "ACCEPTED_STATE_STORAGE_FAILED");
  assert.equal(runtime.kernel.revision, 1);
  assert.equal(runtime.kernel.receipts.length, 0);
  const retried = await runtime.kernel.applyApprovedOption(command);
  assert.equal(retried.code, "OPTION_APPLIED");
  assert.equal(runtime.kernel.revision, 2);
  const durableEnvelope = await durable.load(runtime.kernel.profile.planId, runtime.kernel.profile.profileHash);
  assert.equal(durableEnvelope.revision, 2);
  assert.equal(durableEnvelope.snapshot.receipts.length, 1);
  assert.equal(durableEnvelope.snapshot.receipts[0].receiptId, runtime.kernel.receipts[0].receiptId);
});

test("client hydration refuses a tampered durable envelope before consequential work", async () => {
  const profiles = await compileBuiltInProfiles();
  const durable = new MemoryAcceptedTruthRepository();
  const repository = {
    load: (...args) => durable.load(...args),
    commit: (...args) => durable.commit(...args),
    async initialize(...args) {
      const result = await durable.initialize(...args);
      result.envelope.snapshot.accepted.bufferMinor += 1;
      return result;
    },
  };
  const runtime = makeRuntime(profiles, "renovation", repository);
  const result = await runtime.hydrateAcceptedTruth();
  assert.equal(result.ok, false);
  assert.equal(result.code, "REMOTE_ACCEPTED_TRUTH_INTEGRITY_FAILED");
  assert.equal(runtime.kernel.acceptedTruth.status, "unavailable");
});

test("a revision-two browser cache loads the authoritative head before attempting initialization", async () => {
  const profiles = await compileBuiltInProfiles();
  const durable = new MemoryAcceptedTruthRepository();
  const storage = new MemoryStorage();
  const first = makeRuntime(profiles, "travel", durable, storage);
  await first.hydrateAcceptedTruth();
  const command = await prepareApprovedOption(first, "Cached accepted route");
  assert.equal((await first.kernel.applyApprovedOption({ ...command, idempotencyKey: "cached-accepted-0001" })).code, "OPTION_APPLIED");
  assert.equal(first.kernel.revision, 2);

  const loadOnlyRepository = {
    load: (...args) => durable.load(...args),
    initialize: async () => { throw new Error("existing accepted truth must load, not initialize"); },
    commit: (...args) => durable.commit(...args),
  };
  const cachedReload = makeRuntime(profiles, "travel", loadOnlyRepository, storage);
  assert.equal(cachedReload.kernel.revision, 2);
  const hydrated = await cachedReload.hydrateAcceptedTruth();
  assert.equal(hydrated.code, "ACCEPTED_TRUTH_CURRENT");
  assert.equal(cachedReload.kernel.acceptedTruth.status, "ready");
  assert.equal(cachedReload.kernel.revision, 2);
});

test("a custom compiled plan is reconstructable from durable catalog truth on a browser-empty device", async () => {
  const profiles = await compileBuiltInProfiles();
  const repository = new MemoryAcceptedTruthRepository();
  const firstStorage = new MemoryStorage();
  const firstCatalog = new PlanCatalogStore(firstStorage);
  const first = new FinitePlanRuntime(profiles, new PlanSnapshotStore(firstStorage), "travel", firstCatalog, [], () => new Date("2026-08-26T00:00:00.000Z"), repository);
  assert.equal((await first.hydrateAcceptedTruth()).code, "ACCEPTED_TRUTH_INITIALIZED");

  const definition = getProfileDefinition("event");
  definition.planId = "plan_event_durable_catalog";
  definition.name = "Durable catalog event";
  definition.surface.hero = { eyebrow: "Durable event", title: "A custom surface follows the plan.", brief: "This exact compiled surface must survive an empty browser." };
  const staged = await first.stagePlanDraft(definition);
  assert.equal(staged.code, "PLAN_DRAFT_STAGED");
  const confirmed = first.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const activated = await first.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "durable-catalog-activation-0001",
  });
  assert.equal(activated.code, "PLAN_ACTIVATED");

  const remoteCatalog = await repository.listCatalog();
  const customEntry = remoteCatalog.entries.find((entry) => entry.definition.planId === definition.planId);
  assert(customEntry);
  assert.equal(customEntry.definition.surface.hero.title, "A custom surface follows the plan.");

  const emptyBrowser = new MemoryStorage();
  const emptyCatalog = new PlanCatalogStore(emptyBrowser);
  for (const entry of remoteCatalog.entries) emptyCatalog.save(entry.definition, entry.evidenceRecords, entry.lineage);
  for (const receipt of remoteCatalog.activationReceipts) emptyCatalog.saveActivationReceipt(receipt);
  const compiled = await compileCatalogEntries(emptyCatalog.load(), emptyCatalog.loadActivationReceipts());
  const second = new FinitePlanRuntime(profiles, new PlanSnapshotStore(emptyBrowser), definition.planId, emptyCatalog, compiled, () => new Date("2026-08-26T00:01:00.000Z"), repository);
  assert.equal(second.kernel.profile.surface.hero.title, "A custom surface follows the plan.");
  assert.equal((await second.hydrateAcceptedTruth()).code, "ACCEPTED_TRUTH_CURRENT");
  assert.equal(second.kernel.profile.planId, definition.planId);
  assert.equal(second.kernel.accepted.totalBudgetMinor, 300_000);
  assert.equal(second.kernel.accepted.bufferMinor, 40_000);
});

for (const profileId of ["travel", "renovation", "event"]) {
  test(`${profileId} cross-device handoff rebuilds exact work and consumes one expiring human authority challenge`, async () => {
    const profiles = await compileBuiltInProfiles();
    const repository = new MemoryAcceptedTruthRepository();
    const firstDevice = makeRuntime(profiles, profileId, repository);
    const secondDevice = makeRuntime(profiles, profileId, repository);
    await firstDevice.hydrateAcceptedTruth();
    await secondDevice.hydrateAcceptedTruth();
    const command = await prepareApprovedOption(firstDevice, `${profileId} cross-device route`);
    assert(command.authorityChallengeId);
    const saved = await firstDevice.saveOperatorSession({
      idempotencyKey: `cross-device-${profileId}-0001`,
      kind: "decision_work",
      payload: { event: command.event, candidateId: command.candidateId, challengeId: command.authorityChallengeId },
      ttlSeconds: 3600,
    });
    assert.equal(saved.code, "OPERATOR_SESSION_SAVED");
    const listed = await secondDevice.listOperatorSessions();
    assert.equal(listed.sessions.length, 1);
    assert.equal(listed.sessions[0].baseCurrent, true);
    const resumed = await secondDevice.resumeOperatorSession({ sessionId: saved.session.sessionId });
    assert.equal(resumed.code, "OPERATOR_DECISION_SESSION_RESUMED");
    assert.equal(resumed.authorityRestored, false);
    assert.equal(secondDevice.kernel.stagedCandidate.candidateId, command.candidateId);
    assert.equal(secondDevice.kernel.approval, null);

    const authority = await secondDevice.kernel.resumeHumanAuthorityChallenge({ challengeId: command.authorityChallengeId });
    assert.equal(authority.code, "HUMAN_AUTHORITY_HANDOFF_RESUMED");
    assert.equal(authority.approval.approvalId, command.approvalId);
    const applied = await secondDevice.kernel.applyApprovedOption({ candidateId: command.candidateId, approvalId: authority.approval.approvalId, expectedRevision: command.expectedRevision, idempotencyKey: `cross-device-apply-${profileId}` });
    assert.equal(applied.code, "OPTION_APPLIED");
    await assert.rejects(repository.loadAuthorityChallenge(command.authorityChallengeId), (error) => error.code === "AUTHORITY_CHALLENGE_CONSUMED");
    await firstDevice.hydrateAcceptedTruth();
    const stale = await firstDevice.resumeOperatorSession({ sessionId: saved.session.sessionId });
    assert.equal(stale.code, "OPERATOR_SESSION_BASE_STALE");
  });
}

test("operator sessions expire and human authority challenges fail closed without consuming accepted truth", async () => {
  let clock = new Date("2026-08-26T00:00:00.000Z");
  const profiles = await compileBuiltInProfiles();
  const repository = new MemoryAcceptedTruthRepository(() => new Date(clock));
  const runtime = makeRuntime(profiles, "travel", repository);
  await runtime.hydrateAcceptedTruth();
  const saved = await runtime.saveOperatorSession({ idempotencyKey: "expiring-session-0001", kind: "research_handoff", payload: { finding: "bounded context" }, ttlSeconds: 60 });
  assert.equal(saved.code, "OPERATOR_SESSION_SAVED");
  clock = new Date("2026-08-26T00:01:01.000Z");
  assert.equal((await runtime.listOperatorSessions()).sessions.length, 0);
  assert.equal((await runtime.resumeOperatorSession({ sessionId: saved.session.sessionId })).code, "OPERATOR_SESSION_EXPIRED");

  clock = new Date("2026-08-26T01:00:00.000Z");
  const command = await prepareApprovedOption(runtime, "Expiring authority route");
  const before = runtime.kernel.getState(["allocations", "pending"]);
  clock = new Date("2026-08-26T01:05:01.000Z");
  const refused = await runtime.kernel.applyApprovedOption({ ...command, idempotencyKey: "expired-authority-0001" });
  assert.equal(refused.code, "ACCEPTED_STATE_STORAGE_FAILED");
  assert.equal(refused.repositoryCode, "AUTHORITY_CHALLENGE_EXPIRED");
  assert.equal(runtime.kernel.revision, 1);
  assert.deepEqual(runtime.kernel.getState(["allocations", "pending"]), before);
});

test("finite API refuses missing authenticated identity and cross-origin writes before touching D1", async () => {
  const unavailableDb = {};
  const missingIdentity = await handleAcceptedTruthRequest(new Request("https://finite.example/api/accepted-truth/plan", { method: "GET" }), unavailableDb);
  assert.equal(missingIdentity.status, 401);
  assert.equal((await missingIdentity.json()).code, "AUTHENTICATED_USER_REQUIRED");
  const crossOrigin = await handleAcceptedTruthRequest(new Request("https://finite.example/api/operator-sessions", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json", "oai-authenticated-user-id": "user-a" }, body: "{}" }), unavailableDb);
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "CROSS_ORIGIN_WRITE_REFUSED");
});
