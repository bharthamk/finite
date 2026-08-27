import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles, getProfileDefinition } from "../dist-test/src/profiles.js";
import { compileCatalogEntries, FinitePlanRuntime } from "../dist-test/src/runtime.js";

class FailingStorage extends MemoryStorage {
  failKey = null;
  armed = false;

  setItem(key, value) {
    if (this.armed && key === this.failKey) throw new Error(`Injected storage failure for ${key}`);
    super.setItem(key, value);
  }
}

const setup = async (storage = new MemoryStorage()) => {
  const profiles = await compileBuiltInProfiles();
  const snapshotStore = new PlanSnapshotStore(storage);
  const catalogStore = new PlanCatalogStore(storage);
  const runtime = new FinitePlanRuntime(profiles, snapshotStore, "travel", catalogStore);
  return { profiles, storage, snapshotStore, catalogStore, runtime };
};

const applyLiveTruth = async (runtime) => {
  const correction = await runtime.kernel.stageActualCorrection({ actualId: "actual_travel_food", correctedAmountMinor: 45_000, reason: "Duplicate line", evidenceRef: "evidence_actual", expectedRevision: 1 });
  const correctionConfirmation = runtime.kernel.humanConfirmActualCorrection({ correctionId: correction.correction.correctionId });
  assert.equal((await runtime.kernel.applyConfirmedActualCorrection({ correctionId: correction.correction.correctionId, confirmationId: correctionConfirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "amendment-correction-0001" })).code, "ACTUAL_CORRECTION_APPLIED");
  const feedback = runtime.kernel.recordConsumerFeedback({ message: "Comfort is now decisive", kind: "taste", expectedRevision: 2 });
  const preference = await runtime.kernel.stagePreferenceChange({ feedbackId: feedback.feedback.feedbackId, changes: { comfort: 98 }, expectedRevision: 2 });
  const preferenceConfirmation = runtime.kernel.humanConfirmPreferenceChange({ preferenceChangeId: preference.preferenceChange.preferenceChangeId });
  assert.equal((await runtime.kernel.applyConfirmedPreferenceChange({ preferenceChangeId: preference.preferenceChange.preferenceChangeId, confirmationId: preferenceConfirmation.confirmation.confirmationId, expectedRevision: 2, idempotencyKey: "amendment-preference-0001" })).code, "PREFERENCE_CHANGE_APPLIED");
};

test("amendment blueprint derives from live accepted truth and requires a material same-family diff", async () => {
  const { runtime } = await setup();
  await applyLiveTruth(runtime);
  const blueprint = runtime.getAmendmentBlueprint();
  assert.equal(blueprint.code, "PLAN_AMENDMENT_BLUEPRINT");
  assert.equal(blueprint.supersedesPlanId, "plan_travel_europe");
  assert.equal(blueprint.supersedesRevision, 3);
  assert.equal(blueprint.profile.planId, "plan_travel_europe_v2");
  assert.deepEqual(blueprint.profile.accepted, runtime.kernel.accepted);
  assert.deepEqual(blueprint.profile.preferenceWeights, runtime.kernel.preferenceWeights);
  assert.deepEqual(blueprint.profile.entities, runtime.kernel.entities);
  assert.equal(blueprint.profile.actuals.find((actual) => actual.actualId === "actual_travel_food").originalAmountMinor, 45_000);
  assert.equal((await runtime.stagePlanAmendment({ profile: blueprint.profile, supersedesPlanId: blueprint.supersedesPlanId, expectedRevision: blueprint.supersedesRevision })).code, "AMENDMENT_NO_MATERIAL_CHANGE");

  const metadataChange = structuredClone(blueprint.profile);
  metadataChange.entities.trip_days.label = "Total journey days";
  const metadataStaged = await runtime.stagePlanAmendment({ profile: metadataChange, supersedesPlanId: blueprint.supersedesPlanId, expectedRevision: blueprint.supersedesRevision });
  assert.equal(metadataStaged.code, "PLAN_AMENDMENT_STAGED");
  assert.deepEqual(metadataStaged.draft.amendment.diff.changedSections, ["entities"]);

  const wrongFamily = getProfileDefinition("renovation");
  wrongFamily.planId = "plan_renovation_wrong_family_v2";
  assert.equal((await runtime.stagePlanAmendment({ profile: wrongFamily, supersedesPlanId: blueprint.supersedesPlanId, expectedRevision: blueprint.supersedesRevision })).code, "AMENDMENT_FAMILY_MISMATCH");
  assert.equal((await runtime.stagePlanAmendment({ profile: blueprint.profile, supersedesPlanId: blueprint.supersedesPlanId, expectedRevision: 2 })).code, "AMENDMENT_BASE_STALE");
});

test("human-confirmed amendment activates exact lineage while both immutable versions remain switchable and replayable", async () => {
  const { profiles, snapshotStore, catalogStore, runtime } = await setup();
  await applyLiveTruth(runtime);
  const priorAccepted = structuredClone(runtime.kernel.accepted);
  const blueprint = runtime.getAmendmentBlueprint();
  blueprint.profile.accepted.forecastMinor -= 10_000;
  blueprint.profile.accepted.bufferMinor += 10_000;
  blueprint.profile.locks.push("protect_paris_workday");

  const staged = await runtime.stagePlanAmendment({ profile: blueprint.profile, supersedesPlanId: blueprint.supersedesPlanId, expectedRevision: blueprint.supersedesRevision });
  assert.equal(staged.code, "PLAN_AMENDMENT_STAGED");
  assert.deepEqual(staged.draft.amendment.diff.allocations, [
    { field: "forecastMinor", before: priorAccepted.forecastMinor, after: priorAccepted.forecastMinor - 10_000, delta: -10_000 },
    { field: "bufferMinor", before: priorAccepted.bufferMinor, after: priorAccepted.bufferMinor + 10_000, delta: 10_000 },
  ]);
  assert.deepEqual(staged.draft.amendment.diff.locks.added, ["protect_paris_workday"]);
  assert.deepEqual(staged.draft.amendment.diff.changedSections, ["allocations", "locks"]);
  assert.match(staged.draft.amendment.diffHash, /^[a-f0-9]{64}$/);
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe");
  assert.deepEqual(runtime.kernel.accepted, priorAccepted);

  const fake = await runtime.activateConfirmedPlanDraft({ draftId: staged.draft.draftId, confirmationId: "agent_fabricated", expectedPlanId: "plan_travel_europe", expectedRevision: 3, idempotencyKey: "activate-amendment-0001" });
  assert.equal(fake.code, "PLAN_ACTIVATION_CONFIRMATION_MISSING_OR_MISMATCHED");
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const activated = await runtime.activateConfirmedPlanDraft({ draftId: staged.draft.draftId, confirmationId: confirmed.confirmation.confirmationId, expectedPlanId: "plan_travel_europe", expectedRevision: 3, idempotencyKey: "activate-amendment-0001" });
  assert.equal(activated.code, "PLAN_AMENDMENT_ACTIVATED");
  assert.equal(activated.receipt.activationKind, "amendment");
  assert.equal(activated.receipt.supersedesPlanId, "plan_travel_europe");
  assert.equal(activated.receipt.diffHash, staged.draft.amendment.diffHash);
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe_v2");
  assert.equal(runtime.kernel.revision, 1);

  const catalog = runtime.listPlans();
  assert.equal(catalog.plans.find((plan) => plan.planId === "plan_travel_europe").supersededBy, "plan_travel_europe_v2");
  assert.equal(catalog.plans.find((plan) => plan.planId === "plan_travel_europe_v2").lineage.activationReceiptId, activated.receipt.receiptId);
  assert.equal(runtime.switchPlan("plan_travel_europe").code, "PLAN_SWITCHED");
  assert.equal(runtime.kernel.revision, 3);
  assert.deepEqual(runtime.kernel.accepted, priorAccepted);
  assert.equal(runtime.getAmendmentBlueprint().code, "PLAN_VERSION_SUPERSEDED");
  assert.equal(runtime.switchPlan("plan_travel_europe_v2").code, "PLAN_SWITCHED");
  assert.equal(runtime.kernel.accepted.bufferMinor, priorAccepted.bufferMinor + 10_000);

  const compiled = await compileCatalogEntries(catalogStore.load(), catalogStore.loadActivationReceipts());
  assert.equal(compiled.length, 1);
  const restored = new FinitePlanRuntime(profiles, snapshotStore, "plan_travel_europe_v2", catalogStore, compiled);
  assert.equal(restored.listPlans().plans.find((plan) => plan.planId === "plan_travel_europe_v2").lineage.diffHash, staged.draft.amendment.diffHash);
  const replay = await restored.activateConfirmedPlanDraft({ draftId: staged.draft.draftId, confirmationId: confirmed.confirmation.confirmationId, expectedPlanId: "plan_travel_europe", expectedRevision: 3, idempotencyKey: "activate-amendment-0001" });
  assert.equal(replay.code, "IDEMPOTENT_PLAN_ACTIVATION_REPLAY");

  const fabricatedLineage = structuredClone(catalogStore.load());
  fabricatedLineage[0].lineage.diffHash = "0".repeat(64);
  assert.equal((await compileCatalogEntries(fabricatedLineage, catalogStore.loadActivationReceipts())).length, 0);
});

test("activation storage failure rolls back snapshot, catalog, and active selection before exact retry", async () => {
  const storage = new FailingStorage();
  const { runtime, catalogStore } = await setup(storage);
  const blueprint = runtime.getAmendmentBlueprint();
  blueprint.profile.accepted.forecastMinor -= 5_000;
  blueprint.profile.accepted.bufferMinor += 5_000;
  const staged = await runtime.stagePlanAmendment({ profile: blueprint.profile, supersedesPlanId: blueprint.supersedesPlanId, expectedRevision: blueprint.supersedesRevision });
  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  const command = { draftId: staged.draft.draftId, confirmationId: confirmed.confirmation.confirmationId, expectedPlanId: "plan_travel_europe", expectedRevision: 1, idempotencyKey: "activate-amendment-storage-0001" };

  storage.failKey = "finite-plan.activation-receipts.v1";
  storage.armed = true;
  const failed = await runtime.activateConfirmedPlanDraft(command);
  assert.equal(failed.code, "PLAN_ACTIVATION_STORAGE_FAILED");
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe");
  assert.equal(runtime.listPlans().plans.length, 3);
  assert.equal(catalogStore.load().length, 0);
  assert.equal(storage.getItem(`finite-plan.v1:${blueprint.profile.planId}`), null);
  assert.equal(runtime.pendingPlanDraft.draftId, staged.draft.draftId);

  storage.armed = false;
  assert.equal((await runtime.activateConfirmedPlanDraft(command)).code, "PLAN_AMENDMENT_ACTIVATED");
  assert.equal(runtime.kernel.profile.planId, blueprint.profile.planId);
});
