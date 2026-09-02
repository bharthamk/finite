import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArrivalRepository } from "../dist-test/src/arrival.js";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
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
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals);
  await adapter.register();
  return { runtime, arrivals, host, adapter };
};

test("empty arrival handoff starts a new outcome instead of routing into the seeded plan", async () => {
  const { runtime, host } = await setup("travel");
  const entered = await host.execute("finite_enter_kitchen", { entryIntent: "start_new" });
  assert.equal(entered.code, "KITCHEN_ENTERED");
  assert.equal(entered.entryIntent, "start_new");
  assert.equal(entered.operatorPacket.nextAction.stage, "outcome_required");
  assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_create_arrival_order");
  assert.equal(entered.operatorPacket.nextAction.requiresHuman, true);
  assert.equal(entered.operatorPacket.nextAction.exactQuestion, "What are you trying to make happen? Tell me the outcome in ordinary language; we can work out the structure together.");
  assert.equal(entered.operatorPacket.chefMenu.items.length, 3);
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "arrival_tell_outcome");
  assert.equal(runtime.kernel.revision, 1);
  assert.equal(entered.acceptedStateChanged, false);
});

test("handoff integrity detects same-revision profile and snapshot drift", async () => {
  const { runtime, host } = await setup("travel");
  const entered = await host.execute("finite_enter_kitchen", {
    entryIntent: "resume_handoff",
    expectedPlanId: runtime.kernel.profile.planId,
    expectedPlanRevision: runtime.kernel.revision,
    expectedProfileHash: "f".repeat(64),
    expectedSnapshotHash: "e".repeat(64),
  });
  assert.equal(entered.code, "KITCHEN_ENTERED_WITH_CURRENT_STATE");
  assert.equal(entered.handoffReceipt.matchedCurrentState, false);
  assert(entered.handoffReceipt.differences.some((difference) => difference.field === "profileHash"));
  assert(entered.handoffReceipt.differences.some((difference) => difference.field === "snapshotHash"));
  assert.equal(runtime.kernel.revision, 1);
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
  const { runtime, arrivals, host, adapter } = await setup("travel");
  const created = await arrivals.create({ idempotencyKey: "chef-arrival-0001", rawOutcome: "Plan a small wedding dinner.", sourceSurface: "site" });
  const entered = await host.execute("finite_enter_kitchen", {
    entryIntent: "continue_current",
    expectedPlanId: runtime.kernel.profile.planId,
    expectedPlanRevision: runtime.kernel.revision,
  });
  assert.equal(entered.arrival.orientation.order.orderId, created.order.orderId);
  assert.equal(entered.operatorPacket.nextAction.stage, "arrival_draft_preparation");
  assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_open_toolset");
  assert.deepEqual(entered.operatorPacket.nextAction.knownArgs, { group: "construction" });
  assert.deepEqual(entered.operatorPacket.nextAction.requiredArgs, []);
  assert.equal(entered.operatorPacket.nextAction.knownArgsComplete, true);
  assert.equal(entered.operatorPacket.nextAction.callReady, true);
  assert.deepEqual(entered.operatorPacket.nextAction.derivedArgs, []);
  assert.equal(entered.operatorPacket.nextAction.afterOpen.action, "finite_get_plan_blueprint");
  assert.equal(entered.operatorPacket.nextAction.afterOpen.arguments.profileId, "event");
  assert.equal(entered.operatorPacket.nextAction.preMutationGate.presentChefMenuInHumanLanguage, true);
  assert.equal(entered.operatorPacket.nextAction.preMutationGate.sensitiveWebMcpTransmissionRequiresActionTimeConfirmation, true);
  assert.equal(entered.operatorPacket.nextAction.preMutationGate.readOnlyPlanPreparationRequiresConfirmation, false);
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "arrival_develop_before_save");
  assert.equal(entered.operatorPacket.chefMenu.items[0].nextTool, "finite_open_toolset");
  assert.deepEqual(entered.operatorPacket.chefMenu.items[0].knownArgs, { group: "construction" });
  assert.equal(entered.operatorPacket.chefMenu.items[0].knownArgsComplete, true);
  assert.equal(entered.operatorPacket.chefMenu.items[0].afterOpen.derivedArgs[0].source, "current_rough_plan");
  assert.equal(entered.operatingContract.preMutationGate.copiedHandoffIsNotPlanAuthority, true);
  assert.match(entered.operatorPacket.law, /knownArgs are executable only when knownArgsComplete is not false/);
  assert.match(entered.operatorPacket.law, /Bundle that confirmation at the concrete save boundary/);
  assert.equal(entered.next.includes("finite_create_arrival_order"), false);

  const opened = await host.execute(entered.operatorPacket.nextAction.nextTool, entered.operatorPacket.nextAction.knownArgs);
  assert.equal(opened.code, "TOOLSET_READY");
  await adapter.waitForRouteSettlement();
  const blueprint = await host.execute(entered.operatorPacket.nextAction.afterOpen.action, entered.operatorPacket.nextAction.afterOpen.arguments);
  assert.equal(blueprint.code, "PLAN_BLUEPRINT");
  assert.equal(blueprint.profileId, "event");
  assert.equal(blueprint.profile.profileId, "event");
  assert.notEqual(blueprint.profile.planId, runtime.kernel.profile.planId);
  assert.equal(JSON.stringify(blueprint.profile).includes(runtime.kernel.profile.planId), false);
});

test("a saved incomplete interpretation advances to one operator-ready clarification instead of looping", async () => {
  const { arrivals, host } = await setup("travel");
  const created = await arrivals.create({ idempotencyKey: "arrival-lifecycle-0001", rawOutcome: "Plan a multi-stop Europe trip under A$10,000.", sourceSurface: "site" });
  const checkpoint = await host.execute("finite_checkpoint_arrival", { orderId: created.order.orderId, expectedVersion: 1 });
  const interpreted = await host.execute("finite_stage_interpretation", {
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
  assert.equal(delta.operatorPacket.nextAction.stage, "arrival_draft_preparation");
  assert.equal(delta.arrival.orientation.interpretationIsCurrent, false);
  const processed = await host.execute("finite_checkpoint_arrival", { orderId: created.order.orderId, expectedVersion: answered.order.version });
  const refreshed = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(processed.orientation.latestHumanInputVersion, 5);
  assert.equal(refreshed.operatorPacket.nextAction.stage, "arrival_draft_preparation");
  assert.equal(refreshed.operatorPacket.nextAction.nextTool, "finite_open_toolset");
  assert.equal(refreshed.operatorPacket.nextAction.afterOpen.arguments.profileId, "travel");
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

test("a complete interpretation opens the editable rough-plan construction route without a confirmation gate", async () => {
  const { arrivals, host } = await setup("renovation");
  const created = await arrivals.create({ idempotencyKey: "complete-interpretation-0001", rawOutcome: "Renovate the kitchen within the confirmed brief.", sourceSurface: "site" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  const interpreted = await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, inferredFamily: "renovation", summary: "A bounded kitchen renovation with all construction inputs present.", missing: [], contradictions: [], complete: true });
  const entered = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(interpreted.order.status, "proposed_plan_ready");
  assert.equal(entered.operatorPacket.nextAction.stage, "arrival_construction_ready");
  assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_get_plan_blueprint");
  assert.equal(entered.operatorPacket.nextAction.requiresHuman, false);
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "arrival_develop_rough_plan");
  assert.equal(entered.acceptedStateChanged, false);
  assert.deepEqual(entered.operatorPacket.nextAction.knownArgs, { profileId: "renovation" });
  assert.equal(entered.operatorPacket.nextAction.authorityPresent, false);
  assert.equal(entered.operatorPacket.chefMenu.items[0].nextTool, "finite_get_plan_blueprint");
  assert.equal(entered.plan.role, "source_guard_only");
  assert.equal("consumerOutcome" in entered.plan, false);
  assert.equal(entered.acceptedStateChanged, false);
});

test("confirmed arrival resumes an existing construction packet instead of restarting from the example blueprint", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const arrivals = new MemoryArrivalRepository();
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals).register();
  const created = await arrivals.create({ idempotencyKey: "resume-construction-0001", rawOutcome: "Plan an open Europe trip.", sourceSurface: "site" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  const interpreted = await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, inferredFamily: "travel", summary: "An open Europe trip.", complete: true });
  const reviewed = await arrivals.reviewInterpretation({ orderId: interpreted.order.orderId, expectedVersion: interpreted.order.version, expectedChecksum: interpreted.order.checksum, sourceSurface: "site" });
  const assessed = await runtime.assessPlanIntake({ profileId: "travel", name: "Europe trip", sourceArrival: { orderId: reviewed.order.orderId, orderVersion: reviewed.order.version, orderChecksum: reviewed.order.checksum } });
  assert.equal(assessed.code, "INTAKE_FACTS_MISSING");
  const entered = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(entered.operatorPacket.nextAction.stage, "construction_intake_incomplete");
  assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_resume_build_packet");
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "construction_resume_intake");
  assert.equal(entered.plan.construction.packetId, assessed.constructionPacket.packetId);
  assert.equal("consumerOutcome" in entered.plan, false);
});

test("entering an already-active construction route does not invalidate the page tool registry", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "stable-construction-tools-0001", rawOutcome: "Plan a Europe trip.", sourceSurface: "site" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  const interpreted = await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, inferredFamily: "travel", summary: "A Europe trip.", complete: true });
  await arrivals.reviewInterpretation({ orderId: interpreted.order.orderId, expectedVersion: interpreted.order.version, expectedChecksum: interpreted.order.checksum, sourceSurface: "site" });
  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals).register();
  const blueprintBefore = host.tools.get("finite_get_plan_blueprint");
  await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(host.tools.get("finite_get_plan_blueprint"), blueprintBefore);
});

test("a compiled plan draft asks for draft judgment and keeps the activation route discoverable", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "draft-review-route-0001", rawOutcome: "Plan a Europe trip.", sourceSurface: "site" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  const interpreted = await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, inferredFamily: "travel", summary: "A Europe trip.", complete: true });
  const reviewed = await arrivals.reviewInterpretation({ orderId: interpreted.order.orderId, expectedVersion: interpreted.order.version, expectedChecksum: interpreted.order.checksum, sourceSurface: "site" });
  const assessed = await runtime.assessPlanIntake({
    sourceArrival: { orderId: reviewed.order.orderId, orderVersion: reviewed.order.version, orderChecksum: reviewed.order.checksum },
    constructionMode: "adaptive_shell",
    profileId: "travel",
    planId: "plan_europe_review_test",
    name: "Europe trip",
    brief: "Build an adaptive Europe trip.",
    allocation: { totalBudgetMinor: 1_000_000 },
    actuals: [],
    locks: ["total_budget"],
    preferenceLabels: ["protect_trip"],
    entityEstimates: {
      trip_days: { days: { value: 30, basis: "A one-month working duration.", sourcePaths: ["known.duration"] } },
      booked_segment_days: { days: { value: 0, basis: "No booked segments are recorded.", sourcePaths: ["known.bookings"] } },
    },
    stages: [{ stageId: "europe", label: "Europe", status: "planned" }],
  });
  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  assert.equal(staged.code, "PLAN_DRAFT_STAGED_FROM_INTAKE");
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals);
  await adapter.register();
  const entered = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(entered.operatorPacket.nextAction.stage, "awaiting_human");
  assert.equal(entered.operatorPacket.nextAction.missingInputs[0].argument, "plan_draft_judgment");
  assert.match(entered.operatorPacket.nextAction.exactQuestion, /working assumptions and dependencies/i);
  assert.equal(host.tools.has("finite_activate_confirmed_plan"), false);
  assert.equal(entered.operatorPacket.chefMenu.items[0].menuItemId, "construction_review_draft");

  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  assert.equal(confirmed.code, "HUMAN_PLAN_ACTIVATION_CONFIRMED");
  const authorized = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(authorized.operatorPacket.nextAction.stage, "human_confirmed");
  assert.equal(authorized.operatorPacket.nextAction.nextTool, "finite_activate_confirmed_plan");
  assert.deepEqual(authorized.operatorPacket.nextAction.knownArgs, {
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
  });
  assert.equal(authorized.operatorPacket.nextAction.missingInputs[0].argument, "idempotencyKey");

  const returned = await runtime.humanRejectPlanDraft({ draftId: staged.draft.draftId, reasonCode: "structure", reason: "Make the route and open decisions primary; keep the budget subordinate." });
  assert.equal(returned.code, "HUMAN_PLAN_DRAFT_RETURNED");
  const reentered = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(reentered.operatorPacket.nextAction.stage, "draft_returned");
  assert.equal(reentered.operatorPacket.nextAction.nextTool, "finite_get_returned_plan_draft");
  assert.equal(reentered.operatorPacket.chefMenu.items[0].menuItemId, "construction_revise_returned_draft");
  assert.equal(reentered.plan.construction.status, "returned_for_revision");
  assert.equal("staleReason" in reentered.plan.construction, false);
  await adapter.waitForRouteSettlement();
  const context = await host.execute("finite_get_returned_plan_draft", {});
  assert.equal(context.code, "RETURNED_PLAN_DRAFT_CONTEXT");
  assert.equal(context.returned.returnReview.message, "Make the route and open decisions primary; keep the budget subordinate.");
  assert.equal(context.acceptedStateChanged, false);
});

test("new human input invalidates an older kitchen draft and restores the arrival reconcile route", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const arrivals = new MemoryArrivalRepository();
  const created = await arrivals.create({ idempotencyKey: "draft-arrival-stale-0001", rawOutcome: "Plan a Europe trip.", sourceSurface: "site" });
  const checkpoint = await arrivals.checkpoint({ orderId: created.order.orderId, expectedVersion: 1 });
  const interpreted = await arrivals.stageInterpretation({ orderId: created.order.orderId, expectedVersion: checkpoint.order.version, inferredFamily: "travel", summary: "A Europe trip.", complete: true });
  const reviewed = await arrivals.reviewInterpretation({ orderId: interpreted.order.orderId, expectedVersion: interpreted.order.version, expectedChecksum: interpreted.order.checksum, sourceSurface: "site" });
  const staged = await runtime.stagePlanDraft(runtime.getPlanBlueprint("travel").profile);
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  assert.equal(confirmed.code, "HUMAN_PLAN_ACTIVATION_CONFIRMED");
  const updated = await arrivals.appendInput({ orderId: reviewed.order.orderId, expectedVersion: reviewed.order.version, kind: "preference", payload: { text: "Mix five-star stays with party hostels." }, sourceSurface: "site" });
  assert.equal(updated.order.version, reviewed.order.version + 1);

  const host = new MemoryModelContext();
  await new FinitePlanWebMCPAdapter(host, runtime, undefined, arrivals).register();
  const entered = await host.execute("finite_enter_kitchen", { orderId: created.order.orderId });
  assert.equal(entered.operatorPacket.nextAction.stage, "arrival_draft_preparation");
  assert.equal(entered.operatorPacket.nextAction.nextTool, "finite_open_toolset");
  assert.equal(entered.operatorPacket.nextAction.afterOpen.arguments.profileId, "travel");
  assert.equal(entered.operatorPacket.nextAction.authorityPresent, false);
  assert.equal(entered.plan.construction.status, "stale_arrival");
  assert.equal(entered.plan.pendingDraft, null);
  assert.equal(host.tools.has("finite_activate_confirmed_plan"), false);
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
  const { runtime, host, adapter } = await setup("travel");
  await host.execute("finite_enter_kitchen", { entryIntent: "continue_current", expectedPlanId: runtime.kernel.profile.planId, expectedPlanRevision: 1 });
  await adapter.waitForRouteSettlement();
  const recorded = await host.execute("travel_extend_stay", { destination: "Paris", nights: 3, nightlyMinor: 22_000, minimumBufferMinor: 50_000 });
  const compared = await host.execute("finite_compare_options", { eventId: recorded.event.eventId, generate: true });
  assert.equal(compared.code, "OPTIONS_AVAILABLE");
  const menu = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current", expectedPlanId: runtime.kernel.profile.planId, expectedPlanRevision: 1 });
  assert.equal(menu.code, "KITCHEN_ENTERED");
  assert.equal(menu.operatorPacket.nextAction.stage, "menu_ready");
  assert.equal(menu.operatorPacket.nextAction.requiresHuman, true);
  assert.equal(menu.operatorPacket.chefMenu.items.length, compared.options.length);
  assert.equal(menu.operatorPacket.chefMenu.items.length, 5);
  assert.equal(menu.operatorPacket.chefMenu.items.every((item) => item.kind === "validated_option"), true);
  assert.equal(menu.operatorPacket.chefMenu.items.every((item) => item.viability === "constraint_validated"), true);
  assert.equal(menu.operatorPacket.chefMenu.items.every((item) => item.nextTool === "finite_stage_option"), true);
  assert.equal(runtime.kernel.stagedCandidate, null);
  assert.equal(runtime.kernel.revision, 1);

  const chosen = menu.operatorPacket.chefMenu.items[0];
  await adapter.waitForRouteSettlement();
  const staged = await host.execute("finite_stage_option", { candidateId: chosen.candidateId, expectedRevision: 1 });
  assert.equal(staged.code, "OPTION_STAGED");
  const approval = await runtime.kernel.humanApprove({ candidateId: chosen.candidateId, warningsAcknowledged: staged.staged.warnings.map((warning) => String(warning.code)) });
  assert.equal(approval.code, "HUMAN_APPROVAL_RECORDED");
  const authorized = await host.execute("finite_enter_kitchen", { entryIntent: "continue_current", expectedPlanId: runtime.kernel.profile.planId, expectedPlanRevision: 1 });
  assert.equal(authorized.operatorPacket.nextAction.stage, "human_approved");
  assert.equal(authorized.operatorPacket.nextAction.nextTool, "finite_apply_approved_option");
  assert.equal(authorized.operatorPacket.nextAction.requiresHuman, false);
  assert.equal(authorized.operatorPacket.nextAction.knownArgs.candidateId, chosen.candidateId);
  assert.equal(authorized.operatorPacket.nextAction.knownArgs.approvalId, approval.approval.approvalId);
  assert.equal(authorized.operatorPacket.chefMenu.items.length, 1);
  assert.equal(authorized.operatorPacket.chefMenu.items[0].menuItemId, `approved_${chosen.candidateId}`);
  assert.equal(runtime.kernel.revision, 1);
  await adapter.waitForRouteSettlement();
});
