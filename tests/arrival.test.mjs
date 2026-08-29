import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter } from "../dist-test/src/webmcp.js";
import { acceptedPlanHeadIsCurrent, handleArrivalRequest } from "../dist-test/worker/arrival.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input) { return this.tools.get(name)?.execute(input) ?? { ok: false, code: "TOOL_NOT_FOUND" }; }
}

test("site-first, Codex-later orientation returns the whole order and every unprocessed human update", async () => {
  let tick = 0;
  const arrivals = new MemoryArrivalRepository(() => new Date(Date.parse("2026-08-26T00:00:00.000Z") + tick++ * 1000));
  const created = await arrivals.create({
    idempotencyKey: "site-first-0001",
    rawOutcome: "Plan a three-week Europe trip that stays comfortable.",
    structured: { dates: { start: "2026-10-03", end: "2026-10-24" } },
    attachments: [{ kind: "flight_receipt", ref: "receipt-1" }],
    sourceSurface: "site",
  });
  const first = await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: 1, kind: "constraint", payload: { flight: "non-refundable", route: "SYD-LHR" }, sourceSurface: "site" });
  await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: 2, kind: "preference", payload: { pace: "slow", priority: "Paris" }, sourceSurface: "site" });

  const opened = await arrivals.open({ orderId: created.order.orderId });
  assert.equal(opened.orientation.exactOrderVersion, 3);
  assert.equal(opened.orientation.latestHumanInputVersion, 3);
  assert.equal(opened.orientation.latestOperatorEventVersion, null);
  assert.equal(opened.orientation.operatorEventCount, 0);
  assert.equal(opened.orientation.unprocessedHumanInputCount, 3);
  assert.equal(opened.orientation.order.rawOutcome, created.order.rawOutcome);
  assert.deepEqual(opened.orientation.evidenceReferences, [{ kind: "flight_receipt", ref: "receipt-1" }]);
  assert.equal(opened.orientation.delta[0].eventType, "human_order_created");
  assert.equal(opened.orientation.delta[2].eventType, "human_input_added");
  assert.equal(first.order.status, "waiting_for_codex");

  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: opened.orientation.exactOrderVersion });
  assert.equal(checkpoint.code, "ARRIVAL_CHECKPOINTED");
  assert.equal(checkpoint.orientation.unprocessedHumanInputCount, 0);
  assert.equal(checkpoint.orientation.latestHumanInputVersion, 3);
  assert.equal(checkpoint.orientation.latestOperatorEventVersion, 4);
  const staged = await arrivals.stageInterpretation({
    orderId: created.order.orderId,
    expectedVersion: checkpoint.order.version,
    inferredFamily: "travel",
    summary: "A 21-day Europe plan with fixed international flights and a preference for slower travel.",
    known: { fixedFlight: true, durationDays: 21 },
    inferred: { likelyRegions: ["London", "Paris"] },
    missing: [],
    contradictions: [],
    savedOperatorWork: { candidateRouteCount: 3 },
    complete: true,
  });
  assert.equal(staged.order.status, "proposed_plan_ready");
  assert.equal(staged.orientation.interpretationBasedOnVersion, 4);
  assert.equal(staged.orientation.interpretationIsCurrent, true);
  assert.equal(staged.orientation.latestHumanInputVersion, 3);
  assert.equal(staged.acceptedStateChanged, false);

  const reviewed = await arrivals.reviewInterpretation({
    orderId: staged.order.orderId,
    expectedVersion: staged.order.version,
    expectedChecksum: staged.order.checksum,
    sourceSurface: "site",
  });
  assert.equal(reviewed.code, "ARRIVAL_INTERPRETATION_REVIEWED");
  assert.equal(reviewed.order.status, "interpretation_confirmed");
  assert.equal(reviewed.order.version, 6);
  assert.equal(reviewed.orientation.interpretationIsCurrent, true);
  assert.equal(reviewed.orientation.delta.at(-1).eventType, "interpretation_reviewed");
  assert.equal(reviewed.orientation.delta.at(-1).payload.decision, "confirm_for_construction");
  assert.equal(reviewed.orientation.delta.at(-1).payload.reviewedOrderChecksum, staged.order.checksum);
  assert.equal(reviewed.acceptedStateChanged, false);

  const staleReview = await arrivals.reviewInterpretation({
    orderId: staged.order.orderId,
    expectedVersion: staged.order.version,
    expectedChecksum: staged.order.checksum,
    sourceSurface: "site",
  });
  assert.equal(staleReview.code, "ORDER_VERSION_CONFLICT");
  assert.equal(staleReview.acceptedStateChanged, false);

  const corrected = await arrivals.appendInput({ orderId: reviewed.order.orderId, expectedVersion: reviewed.order.version, kind: "correction", payload: { text: "Make the trip four weeks." }, sourceSurface: "site" });
  assert.equal(corrected.order.status, "waiting_for_codex");
  assert.equal(corrected.orientation.interpretationIsCurrent, false);
});

test("Codex workspace options are non-authoritative operator work and never become human input", async () => {
  let tick = 0;
  const arrivals = new MemoryArrivalRepository(() => new Date(Date.parse("2026-08-29T00:00:00.000Z") + tick++ * 1000));
  const created = await arrivals.create({ idempotencyKey: "option-provenance-0001", rawOutcome: "Plan a flexible Europe arrival.", structured: {}, attachments: [], sourceSurface: "site" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  const staged = await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, inferredFamily: "travel", summary: "A flexible Europe arrival.", known: {}, inferred: {}, missing: [], contradictions: [], dependencies: [], savedOperatorWork: {}, complete: true });
  const saved = await arrivals.saveWorkspaceOption({
    orderId: created.order.orderId,
    expectedVersion: staged.order.version,
    operation: "add",
    moduleId: "transport",
    optionId: "arrive_munich",
    parentRecordId: "arrival_flight",
    label: "Arrive Munich",
    fields: { title: "Arrive Munich", from: "Australia", to: "Munich", provisional: true },
  });
  assert.equal(saved.code, "ARRIVAL_WORKSPACE_OPTION_SAVED");
  assert.equal(saved.order.status, "proposed_plan_ready");
  assert.equal(saved.orientation.unprocessedHumanInputCount, 0);
  assert.equal(saved.orientation.latestHumanInputVersion, 1);
  assert.equal(saved.orientation.latestOperatorEventVersion, 4);
  assert.equal(saved.orientation.interpretationIsCurrent, true);
  assert.equal(saved.orientation.delta.at(-1).eventType, "operator_option_saved");
  assert.equal(saved.orientation.delta.at(-1).actor, "codex");
  assert.equal(saved.order.inputs.at(-1).payload.workspaceOperation, "option_add");
  assert.equal(saved.order.inputs.at(-1).payload.optionSource, "codex");
  assert.equal(saved.order.inputs.at(-1).payload.parentRecordId, "arrival_flight");
});

test("Codex specialist sections are bounded operator work and remain outside human authority", async () => {
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "module-provenance-0001", rawOutcome: "Prepare for a job interview.", structured: {}, attachments: [], sourceSurface: "site" });
  const saved = await arrivals.saveWorkspaceModule({
    orderId: created.order.orderId,
    expectedVersion: created.order.version,
    operation: "add",
    moduleId: "custom_interview_evidence",
    label: "Interview evidence",
    description: "Connect each competency to a concise example and result.",
    variant: "cards",
    fields: [
      { fieldId: "title", label: "Competency", inputType: "text" },
      { fieldId: "example", label: "Example", inputType: "textarea" },
      { fieldId: "result", label: "Result", inputType: "textarea" },
    ],
  });
  assert.equal(saved.code, "ARRIVAL_WORKSPACE_MODULE_SAVED");
  assert.equal(saved.acceptedStateChanged, false);
  assert.equal(saved.orientation.unprocessedHumanInputCount, 1);
  assert.equal(saved.orientation.latestHumanInputVersion, 1);
  assert.equal(saved.orientation.delta.at(-1).eventType, "operator_module_saved");
  assert.equal(saved.orientation.delta.at(-1).actor, "codex");
  assert.equal(saved.order.inputs.at(-1).payload.workspaceOperation, "module_add");
  assert.equal(saved.order.inputs.at(-1).payload.moduleSource, "codex");
  assert.equal(saved.order.inputs.at(-1).payload.fields[0].fieldId, "title");
});

test("Codex-first, Site-later preserves a staged question and treats the later Site answer as new human input", async () => {
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "codex-first-0001", rawOutcome: "Help me renovate the kitchen before Christmas.", sourceSurface: "codex" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  const question = await arrivals.stageClarification({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, prompt: "What is the latest acceptable handover date?", answerKind: "date", fieldPaths: ["deadline"] });
  assert.equal(question.order.status, "clarification_required");
  const answer = await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: question.order.version, kind: "answer", payload: { questionId: question.order.pendingClarification.questionId, value: "2026-12-18" }, sourceSurface: "site" });
  assert.equal(answer.order.pendingClarification, null);
  assert.equal(answer.order.status, "waiting_for_codex");

  const resumed = await arrivals.open({ orderId: created.order.orderId });
  assert.equal(resumed.orientation.unprocessedHumanInputCount, 1);
  assert.equal(resumed.orientation.delta.at(-1).payload.input.sourceSurface, "site");
  assert.match(resumed.orientation.next, /Process 1 human-supplied update/);
});

test("one reconcile atomically checkpoints human input, classifies dependencies, and stages the exact next boundary", async () => {
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "reconcile-arrival-0001", rawOutcome: "Plan a Europe trip around people and one event.", sourceSurface: "site" });
  const reconciled = await arrivals.reconcile({
    orderId: created.order.orderId,
    expectedVersion: 1,
    inferredFamily: "travel",
    summary: "A flexible Europe trip whose dates depend on one human decision and later research.",
    known: { outcome: "Europe trip" },
    inferred: { shape: "people-and-event anchored" },
    missing: ["departure month"],
    dependencies: [
      { dependencyId: "departure_month", kind: "human_decision", title: "Choose the departure month", status: "open", blocking: true, sourcePaths: ["structured.deadline"] },
      { dependencyId: "event_dates", kind: "operator_research", title: "Research event operating dates", status: "open", blocking: false, sourcePaths: ["rawOutcome"] },
    ],
    nextHumanBoundary: { prompt: "Which month should I plan around?", answerKind: "text", fieldPaths: ["structured.deadline"] },
    complete: false,
  });
  assert.equal(reconciled.code, "ARRIVAL_RECONCILED");
  assert.equal(reconciled.order.version, 2);
  assert.equal(reconciled.order.status, "clarification_required");
  assert.equal(reconciled.order.lastOperatorCheckpoint, 2);
  assert.equal(reconciled.order.pendingClarification.prompt, "Which month should I plan around?");
  assert.equal(reconciled.orientation.unprocessedHumanInputCount, 0);
  assert.equal(reconciled.orientation.dependencies[0].kind, "human_decision");
  assert.equal(reconciled.orientation.delta.length, 0);

  const refused = await arrivals.reconcile({
    orderId: reconciled.order.orderId,
    expectedVersion: 2,
    inferredFamily: "travel",
    summary: "Pretend this is complete.",
    dependencies: [{ dependencyId: "departure_month", kind: "human_decision", title: "Choose the departure month", status: "open", blocking: true, sourcePaths: [] }],
    complete: true,
  });
  assert.equal(refused.code, "ARRIVAL_BLOCKING_DEPENDENCY_OPEN");
  assert.equal(refused.acceptedStateChanged, false);
});

test("a concurrent Site edit refuses stale Codex staging and returns the reorientation delta", async () => {
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "concurrent-arrival-0001", rawOutcome: "Plan a 120-person launch event.", sourceSurface: "site" });
  const codexOpened = await arrivals.open({ orderId: created.order.orderId });
  assert.equal(codexOpened.orientation.exactOrderVersion, 1);
  const humanChanged = await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: 1, kind: "constraint", payload: { venueCapacity: 110 }, sourceSurface: "site" });
  assert.equal(humanChanged.order.version, 2);

  const stale = await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: 1, inferredFamily: "event", summary: "A 120-person launch event.", complete: true });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "ORDER_VERSION_CONFLICT");
  assert.equal(stale.currentVersion, 2);
  assert.equal(stale.orientation.unprocessedHumanInputCount, 2);
  assert.equal(stale.orientation.delta.at(-1).payload.input.payload.venueCapacity, 110);
  assert.equal(stale.acceptedStateChanged, false);
});

test("WebMCP exposes the arrival kitchen but no human authority creator", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const arrivals = new MemoryArrivalRepository();
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals);
  const inventory = await adapter.register();
  assert.equal(inventory.length, 11);
  for (const name of ["finite_enter_kitchen", "finite_open_toolset", "finite_create_arrival_order", "finite_append_arrival_input", "finite_open_arrival", "finite_reconcile_arrival", "finite_checkpoint_arrival", "finite_stage_clarification", "finite_stage_interpretation"]) assert(host.tools.has(name));
  assert.equal(host.tools.has("finite_review_arrival_interpretation"), false);
  const created = await host.execute("finite_create_arrival_order", { idempotencyKey: "webmcp-arrival-0001", rawOutcome: "Help me make a finite plan." });
  assert.equal(created.code, "ARRIVAL_ORDER_CREATED");
  assert.equal(created.order.status, "waiting_for_codex");
  assert.equal(created.acceptedStateChanged, false);
  assert.equal(created.operationProof.toolName, "finite_create_arrival_order");
  assert.equal((await host.execute("finite_open_arrival", {})).orientation.exactOrderChecksum, created.order.checksum);

  const entered = await host.execute("finite_enter_kitchen", {
    orderId: created.order.orderId,
    expectedOrderVersion: created.order.version,
    expectedOrderChecksum: created.order.checksum,
    expectedPlanId: runtime.kernel.profile.planId,
    expectedPlanRevision: runtime.kernel.revision,
  });
  assert.equal(entered.code, "KITCHEN_ENTERED");
  assert.equal(entered.operatingContract.operator, "Codex");
  assert.equal(entered.operatingContract.consumer, "human");
  assert.equal(entered.operatingContract.copiedPromptIsAuthority, false);
  assert.equal(entered.arrival.orientation.exactOrderChecksum, created.order.checksum);

  const changed = await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: 1, kind: "detail", payload: { text: "A later Site update" }, sourceSurface: "site" });
  const reentered = await host.execute("finite_enter_kitchen", {
    orderId: created.order.orderId,
    expectedOrderVersion: 1,
    expectedOrderChecksum: created.order.checksum,
    expectedPlanId: runtime.kernel.profile.planId,
    expectedPlanRevision: runtime.kernel.revision,
  });
  assert.equal(changed.order.version, 2);
  assert.equal(reentered.code, "KITCHEN_ENTERED_WITH_CURRENT_STATE");
  assert.equal(reentered.handoffReceipt.matchedCurrentState, false);
  assert.equal(reentered.arrival.orientation.exactOrderVersion, 2);
  assert.equal(reentered.operatorPacket.nextAction.stage, "arrival_draft_preparation");
  assert.equal(reentered.operatorPacket.nextAction.nextTool, "finite_get_capabilities");
  assert.match(reentered.operatorPacket.nextAction.reason, /2 human-supplied arrival update/);
  assert.deepEqual(reentered.operatorPacket.nextAction.requiredArgs, []);
  assert.equal(reentered.operatorPacket.nextAction.knownArgsComplete, true);
  assert.equal(reentered.operatorPacket.nextAction.callReady, true);
  assert.deepEqual(reentered.operatorPacket.nextAction.derivedArgs, []);
  assert.equal(reentered.operatorPacket.nextAction.preMutationGate.readOnlyPlanPreparationRequiresConfirmation, false);
  assert.match(reentered.operatorPacket.law, /Read and analyse canonical plan state without asking again/);

  const missing = await host.execute("finite_enter_kitchen", { orderId: "arrival_ffffffffffffffff" });
  assert.equal(missing.code, "HANDOFF_ORDER_NOT_FOUND");
  assert.equal(missing.acceptedStateChanged, false);
});

test("arrival API refuses missing identity and cross-origin writes before touching D1", async () => {
  const unavailableDb = {};
  const missingIdentity = await handleArrivalRequest(new Request("https://finite.example/api/arrivals/current"), unavailableDb);
  assert.equal(missingIdentity.status, 401);
  assert.equal((await missingIdentity.json()).code, "AUTHENTICATED_USER_REQUIRED");
  const crossOrigin = await handleArrivalRequest(new Request("https://finite.example/api/arrivals", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json", "oai-authenticated-user-id": "user-a" }, body: "{}" }), unavailableDb);
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "CROSS_ORIGIN_WRITE_REFUSED");
});

test("an arrival can close only against the exact durable accepted plan head", async () => {
  const rows = new Map();
  const db = {
    prepare() {
      const values = [];
      return {
        bind(...next) { values.push(...next); return this; },
        async first() { return rows.get(`${values[0]}:${values[1]}`) ?? null; },
      };
    },
  };
  const scopeId = "user_arrival_head_test";
  const planId = "plan_trip_exact";
  const profileHash = "a".repeat(64);
  assert.equal((await acceptedPlanHeadIsCurrent(db, scopeId, planId, profileHash, 3)).matches, false);
  rows.set(`${scopeId}:${planId}`, { profile_hash: profileHash, revision: 2 });
  assert.equal((await acceptedPlanHeadIsCurrent(db, scopeId, planId, profileHash, 3)).matches, false);
  rows.set(`${scopeId}:${planId}`, { profile_hash: "b".repeat(64), revision: 3 });
  assert.equal((await acceptedPlanHeadIsCurrent(db, scopeId, planId, profileHash, 3)).matches, false);
  rows.set(`${scopeId}:${planId}`, { profile_hash: profileHash, revision: 3 });
  assert.equal((await acceptedPlanHeadIsCurrent(db, scopeId, planId, profileHash, 3)).matches, true);
});

test("kitchen entry distinguishes no waiting order from an unreadable arrival service", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const unavailable = {
    open: async () => ({ ok: false, code: "ARRIVAL_SERVICE_UNAVAILABLE", acceptedStateChanged: false }),
  };
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, unavailable).register();
  const entered = await host.execute("finite_enter_kitchen", {});
  assert.equal(entered.ok, false);
  assert.equal(entered.code, "KITCHEN_ENTRY_INCOMPLETE");
  assert.match(entered.next, /Do not infer that no order exists/);
});
