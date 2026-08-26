import test from "node:test";
import assert from "node:assert/strict";
import { MemoryAcceptedTruthRepository } from "../dist-test/src/accepted-truth.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { handleAcceptedTruthRequest } from "../dist-test/worker/accepted-truth.js";

const makeRuntime = (profiles, profileId, repository, storage = new MemoryStorage()) =>
  new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), profileId, undefined, [], () => new Date("2026-08-26T00:00:00.000Z"), repository);

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
