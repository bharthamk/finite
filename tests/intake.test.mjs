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

  const catalogEntries = await compileCatalogEntries(catalogStore.load());
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

test("WebMCP exposes plan operations but never human plan authority and refreshes contextual tools after activation", async () => {
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const host = new MemoryModelContext();
  const adapter = new FinitePlanWebMCPAdapter(host, runtime);
  const inventory = await adapter.register();
  assert.equal(inventory.length, 26);
  assert(host.tools.has("finite_stage_plan_draft"));
  assert(host.tools.has("finite_activate_confirmed_plan"));
  assert.equal(inventory.some((name) => humanOnlyActions.includes(name)), false);

  const staged = await host.execute("finite_stage_plan_draft", { profile: customLaunch("plan_event_webmcp") });
  assert.equal(staged.code, "PLAN_DRAFT_STAGED");
  const refused = await host.execute("finite_activate_confirmed_plan", {
    draftId: staged.draft.draftId,
    confirmationId: "fake",
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "activate-webmcp-plan-0001",
  });
  assert.equal(refused.code, "PLAN_ACTIVATION_CONFIRMATION_MISSING_OR_MISMATCHED");
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const activated = await host.execute("finite_activate_confirmed_plan", {
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: "plan_travel_europe",
    expectedRevision: 1,
    idempotencyKey: "activate-webmcp-plan-0001",
  });
  assert.equal(activated.code, "PLAN_ACTIVATED");
  assert.equal([...host.tools].some(([name]) => name.startsWith("travel_")), false);
  assert(host.tools.has("event_change_headcount"));
  assert.equal(host.tools.size, 26);
});
