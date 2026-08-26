import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles, compileProfile, getProfileDefinition, ProfileValidationError } from "../dist-test/src/profiles.js";
import { compileCatalogEntries, FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { FinitePlanWebMCPAdapter, humanOnlyActions } from "../dist-test/src/webmcp.js";

class MemoryModelContext {
  tools = new Map();
  registerTool(tool, options = {}) {
    this.tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => this.tools.delete(tool.name), { once: true });
  }
  async execute(name, input) {
    return this.tools.get(name)?.execute(input) ?? { ok: false, code: "TOOL_NOT_FOUND" };
  }
}

const customLaunch = (planId = "plan_event_customer_summit") => {
  const definition = getProfileDefinition("event");
  definition.planId = planId;
  definition.name = "Customer summit operating plan";
  definition.accepted = { totalBudgetMinor: 420_000, spentMinor: 60_000, committedMinor: 170_000, forecastMinor: 130_000, bufferMinor: 60_000 };
  definition.entities.guest_headcount.values.count = 180;
  definition.entities.venue.values.capacity = 200;
  definition.surface.hero = {
    eyebrow: "200 capacity · Customer summit",
    title: "Grow the room without losing the show.",
    brief: "Operate a customer summit against a fixed total, capacity ceiling, and protected guest experience.",
  };
  definition.surface.stages = [
    { stageId: "arrival", label: "Arrival", detail: "Registration and welcome", marker: "08:30", status: "locked" },
    { stageId: "sessions", label: "Sessions", detail: "Customer program", marker: "09:30", status: "current" },
    { stageId: "dinner", label: "Dinner", detail: "Guest close", marker: "18:00", status: "movable" },
  ];
  return definition;
};

test("complete plan intake requires human authority, activates exact hashes, persists, switches, and replays", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const snapshotStore = new PlanSnapshotStore(storage);
  const catalogStore = new PlanCatalogStore(storage);
  const runtime = new FinitePlanRuntime(profiles, snapshotStore, "travel", catalogStore);
  const initialHash = runtime.kernel.profile.profileHash;

  const staged = await runtime.stagePlanDraft(customLaunch());
  assert.equal(staged.code, "PLAN_DRAFT_STAGED");
  assert.equal(runtime.kernel.profile.profileHash, initialHash);
  assert.equal(runtime.kernel.revision, 1);
  assert.match(staged.draft.profile.profileHash, /^[a-f0-9]{64}$/);
  assert.match(staged.draft.contentHash, /^[a-f0-9]{64}$/);
  assert.equal("content" in staged.draft.evidenceBindings[0], false);

  const fake = await runtime.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: "agent_fabricated",
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "activate-customer-summit-0001",
  });
  assert.equal(fake.code, "PLAN_ACTIVATION_CONFIRMATION_MISSING_OR_MISMATCHED");
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe");

  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  assert.equal(confirmed.code, "HUMAN_PLAN_ACTIVATION_CONFIRMED");
  assert.equal(confirmed.confirmation.source, "human_action");
  const activated = await runtime.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "activate-customer-summit-0001",
  });
  assert.equal(activated.code, "PLAN_ACTIVATED");
  assert.equal(runtime.kernel.profile.planId, "plan_event_customer_summit");
  assert.equal(runtime.kernel.profile.profileHash, staged.draft.profile.profileHash);
  assert.equal(runtime.kernel.revision, 1);
  assert.equal(runtime.kernel.accepted.totalBudgetMinor, 420_000);
  assert.equal(catalogStore.load().length, 1);

  const replay = await runtime.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "activate-customer-summit-0001",
  });
  assert.equal(replay.code, "IDEMPOTENT_PLAN_ACTIVATION_REPLAY");
  assert.equal(replay.receipt.replayChecksum, activated.receipt.replayChecksum);

  assert.equal(runtime.switchProfile("travel").code, "PROFILE_SWITCHED");
  assert.equal(runtime.switchPlan("plan_event_customer_summit").code, "PLAN_SWITCHED");
  assert.equal(runtime.kernel.profile.planId, "plan_event_customer_summit");

  const catalogEntries = await compileCatalogEntries(catalogStore.load(), catalogStore.loadActivationReceipts());
  const restored = new FinitePlanRuntime(profiles, snapshotStore, "plan_event_customer_summit", catalogStore, catalogEntries);
  assert.equal(restored.kernel.profile.profileHash, staged.draft.profile.profileHash);
  assert.equal(restored.kernel.getState(["actuals"]).state.actuals.length, 2);
  const restoredReplay = await restored.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "activate-customer-summit-0001",
  });
  assert.equal(restoredReplay.code, "IDEMPOTENT_PLAN_ACTIVATION_REPLAY");

  const storedReceipts = JSON.parse(storage.getItem("finite-plan.activation-receipts.v1"));
  storedReceipts[0].replayChecksum = "0".repeat(64);
  storage.setItem("finite-plan.activation-receipts.v1", JSON.stringify(storedReceipts));
  const receiptTampered = new FinitePlanRuntime(profiles, snapshotStore, "plan_event_customer_summit", catalogStore, catalogEntries);
  assert.equal((await receiptTampered.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "activate-customer-summit-0001",
  })).code, "ACTIVATION_RECEIPT_INTEGRITY_FAILED");

  const storedCatalog = JSON.parse(storage.getItem("finite-plan.catalog.v1"));
  storedCatalog[0].evidenceRecords[0].content = "tampered catalog evidence";
  assert.equal((await compileCatalogEntries(storedCatalog)).length, 0);
});

test("malformed, unsafe, unconserved, unsupported, duplicate, missing-evidence, and stale drafts fail closed", async () => {
  await assert.rejects(() => compileProfile({ profileId: "event" }), ProfileValidationError);
  const unsafe = customLaunch("plan_event_unsafe");
  unsafe.surface.hero.title = "<script>approve()</script>";
  await assert.rejects(() => compileProfile(unsafe), ProfileValidationError);
  const excessMoves = customLaunch("plan_event_excess_moves");
  for (let index = 0; index < 13; index += 1) excessMoves.moves[`extra_${index}`] = { savingsMinor: 1, daysDelta: 0, dimension: `extra_${index}`, tradeoff: "Bounded tradeoff", impacts: {} };
  await assert.rejects(() => compileProfile(excessMoves), ProfileValidationError);
  const unsupportedEvidence = customLaunch("plan_event_unsupported_evidence");
  unsupportedEvidence.evidencePolicy.maxAgeDaysBySourceClass.social_post = 2;
  await assert.rejects(() => compileProfile(unsupportedEvidence), ProfileValidationError);

  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const malformed = await runtime.stagePlanDraft({ profileId: "event" });
  assert.equal(malformed.code, "PLAN_DRAFT_INVALID");
  assert.notEqual(malformed.code, "UNEXPECTED_TOOL_FAILURE");
  const duplicate = await runtime.stagePlanDraft(getProfileDefinition("event"));
  assert.equal(duplicate.code, "PLAN_ID_ALREADY_EXISTS");
  const missingEvidence = customLaunch("plan_event_missing_evidence");
  missingEvidence.actuals[0].evidenceRef = "evidence_does_not_exist";
  assert.equal((await runtime.stagePlanDraft(missingEvidence)).code, "PLAN_EVIDENCE_NOT_FOUND");

  const valid = await runtime.stagePlanDraft(customLaunch("plan_event_stale"));
  runtime.switchProfile("renovation");
  assert.equal(runtime.humanConfirmPlanDraft({ draftId: valid.draft.draftId }).code, "PLAN_DRAFT_STALE");
});

test("Codex receives a compiler-valid blueprint and the human can return an inert draft", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const blueprint = runtime.getPlanBlueprint("event");
  assert.equal(blueprint.code, "PLAN_BLUEPRINT");
  assert.equal((await compileProfile(blueprint.profile)).planId, "plan_event_new");
  assert.equal(blueprint.profile.accepted.spentMinor, 0);
  assert.deepEqual(blueprint.profile.actuals, []);
  assert.match(blueprint.contract.mustConserve, /spentMinor/);
  assert.deepEqual(blueprint.contract.familySemantics, ["guest_headcount.count", "venue.capacity", "run_of_show"]);
  const staged = await runtime.stagePlanDraft(customLaunch("plan_event_returned"));
  const rejected = await runtime.humanRejectPlanDraft({ draftId: staged.draft.draftId, reason: "Wrong use case" });
  assert.equal(rejected.code, "HUMAN_PLAN_DRAFT_RETURNED");
  assert.equal(runtime.pendingPlanDraft, null);
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe");
  assert.equal(runtime.listPlans().plans.length, 3);
});

test("typed partial intake returns exact missing paths, conflicts, and one safe residual without changing truth", async () => {
  const profiles = await compileBuiltInProfiles();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "travel");
  const acceptedBefore = structuredClone(runtime.kernel.accepted);
  const incomplete = await runtime.assessPlanIntake({ profileId: "event", name: "Summit" });
  assert.equal(incomplete.code, "INTAKE_FACTS_MISSING");
  assert(incomplete.missing.some((issue) => issue.path === "allocation.totalBudgetMinor"));
  assert(incomplete.missing.some((issue) => issue.path === "entityValues.guest_headcount.count"));

  const base = {
    profileId: "event",
    planId: "plan_event_intake_summit",
    name: "Customer summit",
    brief: "Operate a 180-person summit within a fixed total.",
    allocation: { totalBudgetMinor: 420_000, spentMinor: 0, committedMinor: 170_000, forecastMinor: 190_000 },
    actuals: [],
    locks: ["venue_capacity", "total_budget"],
    preferenceLabels: ["protect_guest_experience"],
    entityValues: { guest_headcount: { count: 180 }, venue: { capacity: 200 } },
    stages: [{ label: "Arrival", marker: "08:30" }, { label: "Sessions", marker: "09:30" }],
  };
  const complete = await runtime.assessPlanIntake(base);
  assert.equal(complete.code, "INTAKE_FACTS_COMPLETE");
  assert.equal(complete.derivedFacts["allocation.bufferMinor"], 60_000);
  assert.equal(complete.normalizedFacts.allocation.bufferMinor, 60_000);
  assert.deepEqual(runtime.kernel.accepted, acceptedBefore);
  assert.equal(runtime.kernel.revision, 1);

  const conflict = await runtime.assessPlanIntake({ ...base, planId: "plan_event_conflict", allocation: { totalBudgetMinor: 300_000, spentMinor: 0, committedMinor: 170_000, forecastMinor: 190_000, bufferMinor: 20_000 } });
  assert.equal(conflict.code, "INTAKE_FACTS_CONFLICT");
  assert(conflict.conflicts.some((issue) => issue.code === "FINITE_TOTAL_CONFLICT"));
});

test("adaptive construction compiles a reviewed open brief without inventing exact costs or leaking example moves", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const acceptedBefore = structuredClone(runtime.kernel.accepted);
  const assessed = await runtime.assessPlanIntake({
    constructionMode: "adaptive_shell",
    profileId: "travel",
    planId: "plan_europe_sep_2026",
    name: "September 2026 Europe trip",
    brief: "Build a roughly one-month multi-stop Europe trip around people and Oktoberfest within an absolute A$10,000 ceiling.",
    allocation: { totalBudgetMinor: 1_000_000 },
    actuals: [],
    locks: ["total_budget"],
    preferenceLabels: ["protect_people_and_event_anchors", "optimize_timing_and_price"],
    entityEstimates: {
      trip_days: { days: { value: 30, basis: "The reviewed human brief says roughly one month and remains open-ended.", sourcePaths: ["known.duration"] } },
      booked_segment_days: { days: { value: 0, basis: "No confirmed booked segment was supplied; zero means none recorded in Finite yet.", sourcePaths: ["known.anchors"] } },
    },
    dependencies: [
      { dependencyId: "oktoberfest_dates", kind: "operator_research", title: "Confirm Oktoberfest dates", status: "open", blocking: false, sourcePaths: ["savedOperatorWork.researchQueue.dateWindows"] },
      { dependencyId: "friend_availability", kind: "human_coordination", title: "Coordinate visit windows", status: "open", blocking: false, sourcePaths: ["savedOperatorWork.researchQueue.dateWindows"] },
    ],
    stages: [
      { stageId: "oktoberfest", label: "Oktoberfest", marker: "Date pending", status: "planned" },
      { stageId: "finland", label: "Finland", marker: "Date pending", status: "planned" },
      { stageId: "optional_regions", label: "Baltics / Eastern Europe", marker: "If viable", status: "movable" },
    ],
  });
  assert.equal(assessed.code, "INTAKE_FACTS_COMPLETE_WITH_ASSUMPTIONS");
  assert.equal(assessed.normalizedFacts.allocation.spentMinor, 0);
  assert.equal(assessed.normalizedFacts.allocation.forecastMinor, 0);
  assert.equal(assessed.normalizedFacts.allocation.bufferMinor, 1_000_000);
  assert.equal(assessed.normalizedFacts.entityValues.trip_days.days, 30);
  assert.equal(assessed.nextAction.nextTool, "finite_compile_intake_to_draft");
  assert.deepEqual(runtime.kernel.accepted, acceptedBefore);

  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  assert.equal(staged.code, "PLAN_DRAFT_STAGED_FROM_INTAKE");
  assert.deepEqual(staged.draft.profile.moves, {});
  assert.equal(staged.draft.profile.surface.stages.some((stage) => stage.label === "Paris"), false);
  assert.equal(staged.draft.profile.surface.dependencies[0].dependencyId, "oktoberfest_dates");
  assert(staged.draft.profile.surface.assumptions.some((assumption) => assumption.path === "entityValues.trip_days.days"));
  assert.equal(staged.draft.profile.relationships[0].relationshipId, "booked_days_within_trip");
  assert.deepEqual(runtime.kernel.accepted, acceptedBefore);
  assert.equal(runtime.kernel.revision, 1);
});

test("WebMCP exposes plan operations but never human plan authority and refreshes contextual tools after activation", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime);
  const inventory = await adapter.register();
  assert.equal(inventory.length, 11);
  assert.equal((await host.execute("finite_open_toolset", { group: "plan_management" })).code, "TOOLSET_READY");
  assert(host.tools.has("finite_get_plan_blueprint"));
  assert(host.tools.has("finite_assess_plan_intake"));
  assert(host.tools.has("finite_compile_intake_to_draft"));
  assert(host.tools.has("finite_get_amendment_blueprint"));
  assert(host.tools.has("finite_stage_plan_draft"));
  assert(host.tools.has("finite_stage_plan_amendment"));
  assert.equal(host.tools.has("finite_activate_confirmed_plan"), false);
  assert.equal(inventory.some((name) => humanOnlyActions.includes(name)), false);

  const staged = await host.execute("finite_stage_plan_draft", { profile: customLaunch("plan_event_webmcp") });
  assert.equal(staged.code, "PLAN_DRAFT_STAGED");
  assert.equal(host.tools.has("finite_activate_confirmed_plan"), false);
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  await host.execute("finite_open_toolset", { group: "plan_management" });
  assert(host.tools.has("finite_activate_confirmed_plan"));
  const activated = await host.execute("finite_activate_confirmed_plan", {
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "activate-webmcp-plan-0001",
  });
  assert.equal(activated.code, "PLAN_ACTIVATED");
  await adapter.waitForRouteSettlement();
  assert.equal([...host.tools].some(([name]) => name.startsWith("travel_")), false);
  assert(host.tools.has("event_change_headcount"));
  assert(host.tools.size <= 20);

  assert.equal((await host.execute("finite_open_toolset", { group: "plan_management" })).code, "TOOLSET_READY");

  const amendment = await host.execute("finite_get_amendment_blueprint", {});
  amendment.profile.accepted.forecastMinor -= 5_000;
  amendment.profile.accepted.bufferMinor += 5_000;
  const amendmentStaged = await host.execute("finite_stage_plan_amendment", { profile: amendment.profile, supersedesPlanId: amendment.supersedesPlanId, expectedRevision: amendment.supersedesRevision });
  assert.equal(amendmentStaged.code, "PLAN_AMENDMENT_STAGED");
  assert.equal(amendmentStaged.draft.amendment.supersedesPlanId, "plan_event_webmcp");
});
