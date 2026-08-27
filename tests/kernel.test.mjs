import test from "node:test";
import assert from "node:assert/strict";
import { FinitePlanKernel } from "../dist-test/src/kernel.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";

const setup = async (profileId = "travel", storage = new MemoryStorage()) => {
  const profiles = await compileBuiltInProfiles();
  const profile = profiles.get(profileId);
  assert(profile);
  return { profile, storage, store: new PlanSnapshotStore(storage), kernel: new FinitePlanKernel(profile, new PlanSnapshotStore(storage)) };
};

const total = (allocation) => allocation.spentMinor + allocation.committedMinor + allocation.forecastMinor + allocation.bufferMinor;

test("compact selectors return only requested semantic state", async () => {
  const { kernel } = await setup();
  const result = kernel.getState(["identity", "pending"]);
  assert.deepEqual(result.selectors, ["identity", "pending"]);
  assert.deepEqual(Object.keys(result.state), ["identity", "pending"]);
  assert.equal("allocations" in result.state, false);
});

test("novel plan flow enforces consent, persists, reloads, and verifies export", async () => {
  const { kernel, profile, store } = await setup();
  const event = kernel.recordChangeEvent({ type: "intent_change", title: "Paris extension", costDeltaMinor: 76_000, daysDelta: 3, minimumBufferMinor: 50_000, evidenceRefs: ["evidence_current"], expectedRevision: 1 });
  const simulation = await kernel.simulateReallocation({ eventId: event.event.eventId, moveIds: ["cancel_flexible_tour", "reduce_meal_forecast", "release_rail_allowance"], objective: "novel" });
  assert.equal(simulation.candidate.valid, true);
  const staged = await kernel.stageOption({ candidateId: simulation.candidate.candidateId, expectedRevision: 1 });
  const refused = await kernel.applyApprovedOption({ candidateId: staged.staged.candidateId, approvalId: "agent_fabricated", expectedRevision: 1, idempotencyKey: "production-option-0001" });
  assert.equal(refused.code, "CONSENT_MISSING_OR_MISMATCHED");
  const approved = await kernel.humanApprove({ candidateId: staged.staged.candidateId });
  const applied = await kernel.applyApprovedOption({ candidateId: staged.staged.candidateId, approvalId: approved.approval.approvalId, expectedRevision: 1, idempotencyKey: "production-option-0001" });
  assert.equal(applied.code, "OPTION_APPLIED");
  assert.equal(kernel.revision, 2);
  assert.equal(total(kernel.accepted), kernel.accepted.totalBudgetMinor);
  const replay = await kernel.applyApprovedOption({ candidateId: staged.staged.candidateId, approvalId: approved.approval.approvalId, expectedRevision: 1, idempotencyKey: "production-option-0001" });
  assert.equal(replay.code, "IDEMPOTENT_REPLAY");
  const reloaded = new FinitePlanKernel(profile, store);
  assert.equal(reloaded.revision, 2);
  assert.equal(reloaded.receipts.length, 1);
  assert.deepEqual(reloaded.accepted, kernel.accepted);
  const replayAfterReload = await reloaded.applyApprovedOption({ candidateId: staged.staged.candidateId, approvalId: approved.approval.approvalId, expectedRevision: 1, idempotencyKey: "production-option-0001" });
  assert.equal(replayAfterReload.code, "IDEMPOTENT_REPLAY");
  assert.equal(reloaded.revision, 2);
  const mismatchedReplay = await reloaded.applyApprovedOption({ candidateId: "different_candidate", approvalId: approved.approval.approvalId, expectedRevision: 1, idempotencyKey: "production-option-0001" });
  assert.equal(mismatchedReplay.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(reloaded.revision, 2);
  const exported = await reloaded.exportReceipt({ receiptId: reloaded.receipts[0].receiptId });
  assert.equal(await reloaded.verifyExport(exported.portable), true);
});

test("correction and preference authority remain human-confirmed after production promotion", async () => {
  const { kernel } = await setup();
  const stagedCorrection = await kernel.stageActualCorrection({ actualId: "actual_travel_food", correctedAmountMinor: 45_000, reason: "Duplicate line", evidenceRef: "evidence_actual", expectedRevision: 1 });
  const fakeCorrection = await kernel.applyConfirmedActualCorrection({ correctionId: stagedCorrection.correction.correctionId, confirmationId: "fake", expectedRevision: 1, idempotencyKey: "production-correction-0001" });
  assert.equal(fakeCorrection.code, "CONFIRMATION_MISSING_OR_MISMATCHED");
  const correctionConfirmation = kernel.humanConfirmActualCorrection({ correctionId: stagedCorrection.correction.correctionId });
  const corrected = await kernel.applyConfirmedActualCorrection({ correctionId: stagedCorrection.correction.correctionId, confirmationId: correctionConfirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "production-correction-0001" });
  assert.equal(corrected.code, "ACTUAL_CORRECTION_APPLIED");
  assert.equal(kernel.getState(["actuals"]).state.actuals.find((actual) => actual.actualId === "actual_travel_food").currentAmountMinor, 45_000);

  const staleFeedback = kernel.recordConsumerFeedback({ message: "Use the old plan", kind: "taste", expectedRevision: 1 });
  assert.equal(staleFeedback.code, "STALE_REVISION");
  const feedback = kernel.recordConsumerFeedback({ message: "Comfort matters most", kind: "taste", expectedRevision: 2, attribution: "operator_attributed_unverified" });
  assert.equal(feedback.provenance.humanVerified, false);
  const stagedPreference = await kernel.stagePreferenceChange({ feedbackId: feedback.feedback.feedbackId, changes: { comfort: 98 }, expectedRevision: 2 });
  const fakePreference = await kernel.applyConfirmedPreferenceChange({ preferenceChangeId: stagedPreference.preferenceChange.preferenceChangeId, confirmationId: "fake", expectedRevision: 2, idempotencyKey: "production-preference-0001" });
  assert.equal(fakePreference.code, "CONFIRMATION_MISSING_OR_MISMATCHED");
  const preferenceConfirmation = kernel.humanConfirmPreferenceChange({ preferenceChangeId: stagedPreference.preferenceChange.preferenceChangeId });
  const preferred = await kernel.applyConfirmedPreferenceChange({ preferenceChangeId: stagedPreference.preferenceChange.preferenceChangeId, confirmationId: preferenceConfirmation.confirmation.confirmationId, expectedRevision: 2, idempotencyKey: "production-preference-0001" });
  assert.equal(preferred.code, "PREFERENCE_CHANGE_APPLIED");
  assert.equal(kernel.preferenceWeights.comfort, 98);
  assert.equal(kernel.revision, 3);
});

test("plan lifecycle conclusion is human-confirmed, receipted, reload-safe, and blocks accidental work", async () => {
  const { kernel, profile, store } = await setup();
  const staged = await kernel.stagePlanLifecycle({ status: "completed", reason: "The trip is home and reconciled.", expectedRevision: 1 });
  assert.equal(staged.code, "PLAN_LIFECYCLE_STAGED");
  assert.equal(kernel.lifecycleStatus, "active");
  assert.equal((await kernel.applyConfirmedPlanLifecycle({ lifecycleChangeId: staged.lifecycleChange.lifecycleChangeId, confirmationId: "fabricated", expectedRevision: 1, idempotencyKey: "lifecycle-complete-0001" })).code, "CONFIRMATION_MISSING_OR_MISMATCHED");
  const confirmation = kernel.humanConfirmPlanLifecycle({ lifecycleChangeId: staged.lifecycleChange.lifecycleChangeId });
  const applied = await kernel.applyConfirmedPlanLifecycle({ lifecycleChangeId: staged.lifecycleChange.lifecycleChangeId, confirmationId: confirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "lifecycle-complete-0001" });
  assert.equal(applied.code, "PLAN_LIFECYCLE_APPLIED");
  assert.equal(kernel.lifecycleStatus, "completed");
  assert.equal(kernel.revision, 2);
  assert.equal(kernel.recordChangeEvent({ type: "late_change", title: "One more idea", costDeltaMinor: 0, minimumBufferMinor: 0, expectedRevision: 2 }).code, "PLAN_NOT_ACTIVE");
  const reloaded = new FinitePlanKernel(profile, store);
  assert.equal(reloaded.lifecycleStatus, "completed");
  assert.equal(reloaded.lifecycleEvents.length, 1);
  assert.equal((await reloaded.applyConfirmedPlanLifecycle({ lifecycleChangeId: staged.lifecycleChange.lifecycleChangeId, confirmationId: confirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "lifecycle-complete-0001" })).code, "IDEMPOTENT_REPLAY");
  const reopen = await reloaded.stagePlanLifecycle({ status: "active", reason: "A delayed refund still needs handling.", expectedRevision: 2 });
  const reopenConfirmation = reloaded.humanConfirmPlanLifecycle({ lifecycleChangeId: reopen.lifecycleChange.lifecycleChangeId });
  assert.equal((await reloaded.applyConfirmedPlanLifecycle({ lifecycleChangeId: reopen.lifecycleChange.lifecycleChangeId, confirmationId: reopenConfirmation.confirmation.confirmationId, expectedRevision: 2, idempotencyKey: "lifecycle-reopen-0001" })).code, "PLAN_LIFECYCLE_APPLIED");
  assert.equal(reloaded.lifecycleStatus, "active");
});

test("material evidence and typed relationship constraints are executable", async () => {
  const travel = (await setup()).kernel;
  const stale = travel.recordChangeEvent({ type: "quote_change", title: "Old quote", costDeltaMinor: 76_000, minimumBufferMinor: 0, evidenceRefs: ["evidence_stale"], expectedRevision: 1 });
  const staleCandidate = await travel.simulateReallocation({ eventId: stale.event.eventId, moveIds: ["shorten_netherlands", "increase_hostel_mix"], objective: "balanced" });
  assert.equal(staleCandidate.candidate.valid, false);
  assert(staleCandidate.candidate.violations.some((violation) => violation.code === "MATERIAL_EVIDENCE_EXPIRED"));

  const eventKernel = (await setup("event")).kernel;
  const atCapacity = eventKernel.recordChangeEvent({ type: "headcount_change", title: "+20", costDeltaMinor: 20_000, minimumBufferMinor: 0, evidenceRefs: ["evidence_current"], entityChanges: [{ entityId: "guest_headcount", field: "count", delta: 20 }], expectedRevision: 1 });
  const valid = await eventKernel.simulateReallocation({ eventId: atCapacity.event.eventId, moveIds: [], objective: "custom" });
  assert.equal(valid.candidate.valid, true);
  const overCapacity = eventKernel.recordChangeEvent({ type: "headcount_change", title: "+21", costDeltaMinor: 21_000, minimumBufferMinor: 0, evidenceRefs: ["evidence_current"], entityChanges: [{ entityId: "guest_headcount", field: "count", delta: 21 }], expectedRevision: 1 });
  const invalid = await eventKernel.simulateReallocation({ eventId: overCapacity.event.eventId, moveIds: [], objective: "custom" });
  assert(invalid.candidate.violations.some((violation) => violation.code === "VENUE_CAPACITY_EXCEEDED"));
});
