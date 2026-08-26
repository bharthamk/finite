import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles, compileProfile, getProfileDefinition } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter } from "../dist-test/src/webmcp.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input = {}) { return this.tools.get(name)?.execute(input) ?? { ok: false, code: "TOOL_NOT_FOUND" }; }
}

const setup = async (profileId = "travel") => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), profileId);
  const arrivals = new MemoryArrivalRepository();
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals).register();
  return { runtime, arrivals, host };
};

test("empty arrival handoff starts a new outcome instead of routing into the seeded plan", async () => {
  const { runtime, host } = await setup("travel");
  const entered = await host.execute("finite_enter_kitchen", { entryIntent: "start_new" });
  assert.equal(entered.code, "KITCHEN_ENTERED");
  assert.equal(entered.entryIntent, "start_new");
  assert.equal(entered.operatorPacket.nextAction.stage, "outcome_required");
  assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_create_arrival_order");
  assert.equal(entered.operatorPacket.nextAction.requiresHuman, true);
  assert.equal(entered.operatorPacket.nextAction.exactQuestion, "What are we making happen? Tell me the outcome in ordinary language; we can work out the structure together.");
  assert.equal(entered.operatorPacket.chefMenu.items.length, 3);
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "arrival_tell_outcome");
  assert.equal(runtime.kernel.revision, 1);
  assert.equal(entered.acceptedStateChanged, false);
});

for (const [profileId, expectedFirst, expectedTool] of [
  ["travel", "travel_research_paris_stays", "finite_register_evidence"],
  ["renovation", "renovation_source_substitute", "finite_register_evidence"],
  ["event", "event_price_headcount", "event_change_headcount"],
]) {
  test(`${profileId} current-plan handoff returns a three-dish grounded menu`, async () => {
    const { runtime, host } = await setup(profileId);
    const entered = await host.execute("finite_enter_kitchen", {
      entryIntent: "continue_current",
      expectedPlanId: runtime.kernel.profile.planId,
      expectedPlanRevision: runtime.kernel.revision,
    });
    const packet = entered.operatorPacket;
    assert.equal(packet.nextAction.stage, "menu_ready");
    assert.equal(packet.nextAction.nextTool, null);
    assert.equal(packet.nextAction.requiresHuman, true);
    assert.equal(packet.chefMenu.items.length, 3);
    assert.equal(packet.chefMenu.items[0].menuItemId, expectedFirst);
    assert.equal(packet.chefMenu.items[0].nextTool, expectedTool);
    assert.equal(packet.chefMenu.items.every((item) => item.viability === "not_yet_tested"), true);
    assert.match(packet.chefMenu.basis.law, /Only constraint-validated options may be presented as viable/);
    assert.equal(entered.handoffReceipt.matchedCurrentState, true);
    assert.equal(entered.acceptedStateChanged, false);
  });
}

test("a waiting human order wins route arbitration over an accepted plan", async () => {
  const { runtime, arrivals, host } = await setup("event");
  const created = await arrivals.create({ idempotencyKey: "chef-arrival-0001", rawOutcome: "Plan a small wedding dinner.", sourceSurface: "site" });
  const entered = await host.execute("finite_enter_kitchen", {
    entryIntent: "continue_current",
    expectedPlanId: runtime.kernel.profile.planId,
    expectedPlanRevision: runtime.kernel.revision,
  });
  assert.equal(entered.arrival.orientation.order.orderId, created.order.orderId);
  assert.equal(entered.operatorPacket.nextAction.stage, "arrival_delta_ready");
  assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_checkpoint_arrival");
  assert.deepEqual(entered.operatorPacket.nextAction.knownArgs, { orderId: created.order.orderId, expectedVersion: 1 });
  assert.equal(entered.next.includes("finite_create_arrival_order"), false);
});

test("a saved incomplete interpretation advances to one operator-ready clarification instead of looping", async () => {
  const { arrivals, host } = await setup("travel");
  const created = await arrivals.create({ idempotencyKey: "arrival-lifecycle-0001", rawOutcome: "Plan a multi-stop Europe trip under A$10,000.", sourceSurface: "site" });
  const checkpoint = await host.execute("finite_checkpoint_arrival", { orderId: created.order.orderId, expectedVersion: 1 });
  const interpreted = await host.execute("finite_stage_plan_interpretation", {
    orderId: created.order.orderId,
    expectedVersion: checkpoint.order.version,
    inferredFamily: "travel",
    summary: "A multi-stop Europe trip with a hard A$10,000 ceiling.",
    known: { maximumSpendMinor: 1_000_000, currencyCode: "AUD" },
    inferred: { routeShape: "multi_stop" },
    missing: ["Departure month and year", "Approximate return window"],
    contradictions: [],
    savedOperatorWork: { planningAxes: ["time", "cost", "commitments"] },
    nextHumanBoundary: {
      prompt: "When you say leaving around the 15th, which month and year do you mean, and roughly when do you need to be back?",
      answerKind: "text",
      fieldPaths: ["travel.departureWindow", "travel.returnWindow"],
    },
    complete: false,
  });
  assert.equal(interpreted.code, "ARRIVAL_INTERPRETATION_STAGED");
  assert.equal(interpreted.order.version, 3);
  assert.equal(interpreted.orientation.latestHumanInputVersion, 1);
  assert.equal(interpreted.orientation.latestOperatorEventVersion, 3);
  assert.equal(interpreted.orientation.operatorEventCount, 2);
  assert.equal(interpreted.orientation.interpretationBasedOnVersion, 2);
  assert.equal(interpreted.orientation.interpretationIsCurrent, true);

  const entered = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId, expectedOrderVersion: 1, expectedOrderChecksum: created.order.checksum });
  const action = entered.operatorPacket.nextAction;
  assert.equal(action.stage, "arrival_clarification_ready");
  assert.equal(action.nextTool, "finite_stage_clarification");
  assert.equal(action.requiresHuman, false);
  assert.equal(action.exactQuestion, null);
  assert.equal(action.knownArgs.expectedVersion, 3);
  assert.equal(action.knownArgs.prompt, "When you say leaving around the 15th, which month and year do you mean, and roughly when do you need to be back?");
  assert.equal(action.missingInputs[0].source, "human");
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "arrival_resolve_first_boundary");
  assert.equal(entered.operatorPacket.chefMenu.items[0].knownArgs.prompt, action.knownArgs.prompt);
  assert.equal(entered.handoffReceipt.versionSemantics.humanInputChangedSinceHandoff, false);
  assert.equal(entered.handoffReceipt.versionSemantics.operatorWorkAdvancedSinceHandoff, true);

  const stagedQuestion = await host.execute(action.nextTool, action.knownArgs);
  assert.equal(stagedQuestion.code, "ARRIVAL_CLARIFICATION_STAGED");
  const waiting = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(waiting.operatorPacket.nextAction.stage, "awaiting_human");
  assert.equal(waiting.operatorPacket.nextAction.requiresHuman, true);
  assert.equal(waiting.operatorPacket.nextAction.exactQuestion, action.knownArgs.prompt);
  assert.equal(waiting.operatorPacket.chefMenu.items[0].menuItemId, "arrival_answer_staged_question");

  const answered = await arrivals.appendInput({ orderId: created.order.orderId, expectedVersion: stagedQuestion.order.version, kind: "answer", payload: { questionId: stagedQuestion.order.pendingClarification.questionId, value: "September 2026; return in early November." }, sourceSurface: "site" });
  const delta = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(delta.operatorPacket.nextAction.stage, "arrival_delta_ready");
  assert.equal(delta.arrival.orientation.interpretationIsCurrent, false);
  const processed = await host.execute("finite_checkpoint_arrival", { orderId: created.order.orderId, expectedVersion: answered.order.version });
  const refreshed = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(processed.orientation.latestHumanInputVersion, 5);
  assert.equal(refreshed.operatorPacket.nextAction.stage, "arrival_review");
  assert.equal(refreshed.operatorPacket.nextAction.nextTool, "finite_stage_plan_interpretation");
  assert.match(refreshed.operatorPacket.nextAction.reason, /Human input advanced/);
});

for (const inferredFamily of ["travel", "event", "renovation", "custom_relocation"]) {
  test(`${inferredFamily} incomplete arrival uses the same source-safe clarification contract`, async () => {
    const { arrivals, host } = await setup("event");
    const created = await arrivals.create({ idempotencyKey: `family-arrival-${inferredFamily}`, rawOutcome: `Build a ${inferredFamily} plan.`, sourceSurface: "site" });
    const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
    await arrivals.stageInterpretation({
      orderId: created.order.orderId,
      expectedVersion: checkpoint.order.version,
      inferredFamily,
      summary: `A bounded ${inferredFamily} interpretation.`,
      missing: ["The first finite boundary"],
      savedOperatorWork: {},
      complete: false,
    });
    const entered = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
    assert.equal(entered.operatorPacket.nextAction.stage, "arrival_clarification_ready");
    assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_stage_clarification");
    assert.equal(entered.operatorPacket.nextAction.knownArgs.answerKind, "text");
    assert.match(entered.operatorPacket.nextAction.knownArgs.prompt, /first finite boundary/i);
    assert.equal(entered.operatorPacket.chefMenu.items[0].viability, "not_yet_tested");
    assert.equal(entered.operatorPacket.chefMenu.items[0].nextTool, "finite_stage_clarification");
  });
}

test("a complete interpretation stops at human review instead of entering plan tools", async () => {
  const { arrivals, host } = await setup("renovation");
  const created = await arrivals.create({ idempotencyKey: "complete-interpretation-0001", rawOutcome: "Renovate the kitchen within the confirmed brief.", sourceSurface: "site" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, inferredFamily: "renovation", summary: "A bounded kitchen renovation with all construction inputs present.", missing: [], contradictions: [], complete: true });
  const entered = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(entered.operatorPacket.nextAction.stage, "arrival_interpretation_ready");
  assert.equal(entered.operatorPacket.nextAction.nextTool, null);
  assert.equal(entered.operatorPacket.nextAction.requiresHuman, true);
  assert.match(entered.operatorPacket.nextAction.exactQuestion, /capture what you want/i);
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "arrival_review_interpretation");
  assert.equal(entered.acceptedStateChanged, false);
});

test("a custom family plan receives a generic live menu rather than built-in story assumptions", async () => {
  const profiles = await compileBuiltInProfiles();
  const definition = getProfileDefinition("travel");
  definition.planId = "plan_custom_conference_trip";
  definition.name = "Conference trip";
  definition.surface.hero.brief = "Attend a conference without moving the fixed return date.";
  const custom = await compileProfile(definition);
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), custom.planId, undefined, [{ profile: custom, evidenceRecords: [] }]);
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, new MemoryArrivalRepository()).register();
  const entered = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current", expectedPlanId: custom.planId, expectedPlanRevision: 1 });
  const serialized = JSON.stringify(entered.operatorPacket.chefMenu);
  assert.equal(serialized.includes("Paris"), false);
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "generic_describe_change");
  assert.equal(entered.operatorPacket.chefMenu.items[1].nextTool, "finite_get_movable_set");
  assert.equal(entered.operatorPacket.chefMenu.basis.planId, custom.planId);
});

test("generated candidates replace suggestions with a validated menu and preserve human choice", async () => {
  const { runtime, host } = await setup("travel");
  const recorded = await host.execute("travel_extend_stay", { destination: "Paris", nights: 3, nightlyMinor: 22_000, minimumBufferMinor: 50_000 });
  const compared = await host.execute("finite_compare_options", { eventId: recorded.event.eventId, generate: true });
  assert.equal(compared.code, "OPTIONS_AVAILABLE");
  const menu = await host.execute("finite_get_chef_menu", { entryIntent: "continue_current", expectedPlanId: runtime.kernel.profile.planId, expectedPlanRevision: 1 });
  assert.equal(menu.code, "CHEF_MENU_READY");
  assert.equal(menu.nextAction.stage, "menu_ready");
  assert.equal(menu.nextAction.requiresHuman, true);
  assert.equal(menu.chefMenu.items.length, 3);
  assert.equal(menu.chefMenu.items.every((item) => item.kind === "validated_option"), true);
  assert.equal(menu.chefMenu.items.every((item) => item.viability === "constraint_validated"), true);
  assert.equal(menu.chefMenu.items.every((item) => item.nextTool === "finite_stage_option"), true);
  assert.equal(runtime.kernel.stagedCandidate, null);
  assert.equal(runtime.kernel.revision, 1);

  const chosen = menu.chefMenu.items[0];
  const staged = await host.execute("finite_stage_option", { candidateId: chosen.candidateId, expectedRevision: 1 });
  assert.equal(staged.code, "OPTION_STAGED");
  const approval = await runtime.kernel.humanApprove({ candidateId: chosen.candidateId, warningsAcknowledged: staged.staged.warnings.map((warning) => String(warning.code)) });
  assert.equal(approval.code, "HUMAN_APPROVAL_RECORDED");
  const authorized = await host.execute("finite_get_chef_menu", { entryIntent: "continue_current", expectedPlanId: runtime.kernel.profile.planId, expectedPlanRevision: 1 });
  assert.equal(authorized.nextAction.stage, "human_approved");
  assert.equal(authorized.nextAction.nextTool, "finite_apply_approved_option");
  assert.equal(authorized.nextAction.requiresHuman, false);
  assert.equal(authorized.nextAction.knownArgs.candidateId, chosen.candidateId);
  assert.equal(authorized.nextAction.knownArgs.approvalId, approval.approval.approvalId);
  assert.equal(authorized.chefMenu.items.length, 1);
  assert.equal(authorized.chefMenu.items[0].menuItemId, `approved_${chosen.candidateId}`);
  assert.equal(runtime.kernel.revision, 1);
});
