import test from "node:test";
import assert from "node:assert/strict";
import { FinitePlanKernel } from "../dist-test/src/kernel.js";
import { compileBuiltInProfiles, compileProfile, getProfileDefinition, ProfileValidationError } from "../dist-test/src/profiles.js";

const eventInputs = {
  travel: {
    type: "intent_change", title: "Add three Paris nights", costDeltaMinor: 66_000, daysDelta: 3,
    minimumBufferMinor: 50_000, evidenceRefs: ["evidence_current"],
    entityChanges: [
      { entityId: "trip_days", field: "days", delta: 3 },
      { entityId: "booked_segment_days", field: "days", delta: 3 },
    ],
    expectedRevision: 1,
  },
  renovation: {
    type: "supplier_change", title: "Imported tile delayed", costDeltaMinor: 80_000, daysDelta: 10,
    minimumBufferMinor: 60_000, evidenceRefs: ["evidence_current"], expectedRevision: 1,
  },
  event: {
    type: "headcount_change", title: "Welcome fifteen more guests", costDeltaMinor: 15_000, daysDelta: 0,
    minimumBufferMinor: 20_000, evidenceRefs: ["evidence_current"],
    entityChanges: [{ entityId: "guest_headcount", field: "count", delta: 15 }], expectedRevision: 1,
  },
};

const allocationTotal = (allocation) => allocation.spentMinor + allocation.committedMinor + allocation.forecastMinor + allocation.bufferMinor;

test("bounded search returns every distinct viable objective route without a fixed suggestion count", async () => {
  const profiles = await compileBuiltInProfiles();
  const expectedCombinationCounts = { travel: 26, renovation: 15, event: 15 };
  const expectedSuggestionCounts = { travel: 5, renovation: 5, event: 5 };
  for (const [profileId, profile] of profiles) {
    if (profileId === "general") {
      assert.deepEqual(profile.moves, {});
      assert.equal(profile.searchPolicy.maxMovesPerOption, 0);
      continue;
    }
    const kernel = new FinitePlanKernel(profile);
    const capabilities = kernel.getCapabilities();
    assert.equal(capabilities.optionSearch.strategy, "bounded_legal_move_enumeration");
    assert.deepEqual(capabilities.optionSearch.objectives, profile.searchPolicy.objectives);
    const recorded = kernel.recordChangeEvent(eventInputs[profileId]);
    const first = await kernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
    assert.equal(first.code, "OPTIONS_AVAILABLE");
    assert.equal(first.search.strategy, "bounded_legal_move_enumeration");
    assert.equal(first.search.exploredCombinationCount, expectedCombinationCounts[profileId]);
    assert.equal(first.search.truncated, false);
    assert.equal(first.options.length, expectedSuggestionCounts[profileId]);
    assert.deepEqual(first.options.map((option) => option.objective), profile.searchPolicy.objectives);
    assert.equal(new Set(first.options.map((option) => option.moveIds.join("|"))).size, first.options.length);
    for (const option of first.options) {
      assert.equal(option.source, "bounded_search");
      assert.equal(option.valid, true);
      assert(option.moveIds.length <= profile.searchPolicy.maxMovesPerOption);
      assert.equal(option.moveIds.some((moveId) => profile.locks.includes(profile.moves[moveId].dimension)), false);
    }
    const firstIds = first.options.map((option) => option.candidateId);
    const second = await kernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
    assert.deepEqual(second.options.map((option) => option.candidateId), firstIds);
    assert.equal(kernel.candidates.size, first.options.length);
    const chosen = second.options[0];
    const staged = await kernel.stageOption({ candidateId: chosen.candidateId, expectedRevision: 1 });
    const approved = await kernel.humanApprove({ candidateId: staged.staged.candidateId });
    const applied = await kernel.applyApprovedOption({
      candidateId: staged.staged.candidateId,
      approvalId: approved.approval.approvalId,
      expectedRevision: 1,
      idempotencyKey: `bounded-${profileId}-0001`,
    });
    assert.equal(applied.code, "OPTION_APPLIED");
    assert.equal(kernel.revision, 2);
    assert.equal(allocationTotal(kernel.accepted), kernel.accepted.totalBudgetMinor);
  }
});

test("profile compiler refuses malformed search policy and preference impacts", async () => {
  const invalid = getProfileDefinition("travel");
  invalid.searchPolicy.objectives = ["balanced", "unsafe", "balanced"];
  invalid.searchPolicy.maxMovesPerOption = 99;
  invalid.searchPolicy.maxCombinations = 0;
  invalid.moves.reduce_meal_forecast.impacts.experience = 101;
  await assert.rejects(
    () => compileProfile(invalid),
    (error) => error instanceof ProfileValidationError
      && error.issues.some((issue) => issue.includes("objectives"))
      && error.issues.some((issue) => issue.includes("unsupported objective"))
      && error.issues.some((issue) => issue.includes("maxMovesPerOption"))
      && error.issues.some((issue) => issue.includes("maxCombinations"))
      && error.issues.some((issue) => issue.includes("impact experience")),
  );
});

test("search stops at the compiled combination cap", async () => {
  const definition = getProfileDefinition("travel");
  definition.searchPolicy.maxCombinations = 3;
  const profile = await compileProfile(definition);
  const kernel = new FinitePlanKernel(profile);
  const recorded = kernel.recordChangeEvent(eventInputs.travel);
  const compared = await kernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
  assert.equal(compared.search.exploredCombinationCount, 3);
  assert.equal(compared.search.maxCombinations, 3);
  assert.equal(compared.search.truncated, true);
  assert(kernel.candidates.size <= profile.searchPolicy.objectives.length);
});

test("search returns one suggestion when every objective resolves to the same workable plan", async () => {
  const definition = getProfileDefinition("travel");
  definition.searchPolicy.maxMovesPerOption = 0;
  const profile = await compileProfile(definition);
  const kernel = new FinitePlanKernel(profile);
  const recorded = kernel.recordChangeEvent({ ...eventInputs.travel, costDeltaMinor: 10_000 });
  const compared = await kernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
  assert.equal(compared.code, "OPTIONS_AVAILABLE");
  assert.equal(compared.options.length, 1);
  assert.equal(compared.search.generatedOptionCount, 1);
  assert.equal(compared.search.validOptionCount, 1);
});

test("candidate fields cannot be mutated before staging", async () => {
  const profile = (await compileBuiltInProfiles()).get("travel");
  assert(profile);
  const kernel = new FinitePlanKernel(profile);
  const recorded = kernel.recordChangeEvent(eventInputs.travel);
  const simulated = await kernel.simulateReallocation({
    eventId: recorded.event.eventId,
    moveIds: ["shorten_netherlands", "reduce_meal_forecast"],
    objective: "custom",
  });
  const stored = kernel.candidates.get(simulated.candidate.candidateId);
  assert(stored);
  stored.netForecastDeltaMinor -= 50_000;
  stored.resultingBufferMinor += 50_000;
  const before = structuredClone(kernel.accepted);
  const staged = await kernel.stageOption({ candidateId: stored.candidateId, expectedRevision: 1 });
  assert.equal(staged.code, "CANDIDATE_INTEGRITY_FAILED");
  assert.deepEqual(kernel.accepted, before);
  assert.equal(kernel.revision, 1);
});

test("staged candidate and approval mutation are refused at the consequential boundary", async () => {
  const profile = (await compileBuiltInProfiles()).get("event");
  assert(profile);

  const stageApproved = async () => {
    const kernel = new FinitePlanKernel(profile);
    const recorded = kernel.recordChangeEvent(eventInputs.event);
    const compared = await kernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
    const candidate = compared.options.find((option) => option.valid);
    assert(candidate);
    const staged = await kernel.stageOption({ candidateId: candidate.candidateId, expectedRevision: 1 });
    const approved = await kernel.humanApprove({ candidateId: staged.staged.candidateId });
    return { kernel, staged, approved };
  };

  const candidateCase = await stageApproved();
  candidateCase.kernel.stagedCandidate.resultingBufferMinor += 100_000;
  const before = structuredClone(candidateCase.kernel.accepted);
  const candidateRefusal = await candidateCase.kernel.applyApprovedOption({
    candidateId: candidateCase.staged.staged.candidateId,
    approvalId: candidateCase.approved.approval.approvalId,
    expectedRevision: 1,
    idempotencyKey: "mutated-candidate-0001",
  });
  assert.equal(candidateRefusal.code, "STAGED_CANDIDATE_INTEGRITY_FAILED");
  assert.deepEqual(candidateCase.kernel.accepted, before);
  assert.equal(candidateCase.kernel.revision, 1);

  const approvalCase = await stageApproved();
  approvalCase.kernel.approval.planId = "different_plan";
  const approvalRefusal = await approvalCase.kernel.applyApprovedOption({
    candidateId: approvalCase.staged.staged.candidateId,
    approvalId: approvalCase.approved.approval.approvalId,
    expectedRevision: 1,
    idempotencyKey: "mutated-approval-0001",
  });
  assert.equal(approvalRefusal.code, "CONSENT_MISSING_OR_MISMATCHED");
  assert.equal(approvalCase.kernel.revision, 1);
  assert.equal(allocationTotal(approvalCase.kernel.accepted), approvalCase.kernel.accepted.totalBudgetMinor);
});

test("locked, stale, and impossible search paths fail closed without accepted-state mutation", async () => {
  const profiles = await compileBuiltInProfiles();
  const travel = new FinitePlanKernel(profiles.get("travel"));
  const travelEvent = travel.recordChangeEvent(eventInputs.travel);
  const locked = await travel.simulateReallocation({ eventId: travelEvent.event.eventId, moveIds: ["change_international_flights"], objective: "custom" });
  assert.equal(locked.code, "LOCKED_MOVE");
  assert.equal(travel.candidates.size, 0);

  const correction = await travel.stageActualCorrection({ actualId: "actual_travel_food", correctedAmountMinor: 45_000, reason: "Duplicate line", evidenceRef: "evidence_actual", expectedRevision: 1 });
  const confirmation = travel.humanConfirmActualCorrection({ correctionId: correction.correction.correctionId });
  await travel.applyConfirmedActualCorrection({ correctionId: correction.correction.correctionId, confirmationId: confirmation.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "search-stale-0001" });
  const stale = await travel.compareOptions({ eventId: travelEvent.event.eventId, generate: true });
  assert.equal(stale.code, "STALE_EVENT");

  const eventKernel = new FinitePlanKernel(profiles.get("event"));
  const impossibleEvent = eventKernel.recordChangeEvent({
    ...eventInputs.event,
    title: "Exceed venue capacity",
    entityChanges: [{ entityId: "guest_headcount", field: "count", delta: 21 }],
  });
  const impossible = await eventKernel.compareOptions({ eventId: impossibleEvent.event.eventId, generate: true });
  assert.equal(impossible.code, "NO_VALID_OPTION");
  assert.equal(impossible.options.length, 0);
  const before = structuredClone(eventKernel.accepted);
  const refusedStage = await eventKernel.stageOption({ candidateId: "candidate_missing", expectedRevision: 1 });
  assert.equal(refusedStage.code, "CANDIDATE_NOT_FOUND");
  assert.deepEqual(eventKernel.accepted, before);
  assert.equal(eventKernel.revision, 1);
});

test("malformed events and material changes without evidence never become viable candidates", async () => {
  const profile = (await compileBuiltInProfiles()).get("travel");
  assert(profile);
  const kernel = new FinitePlanKernel(profile);
  const malformed = kernel.recordChangeEvent({
    type: "intent_change", title: "Fractional money", costDeltaMinor: 1.5, daysDelta: 0,
    minimumBufferMinor: 0, expectedRevision: 1,
  });
  assert.equal(malformed.code, "INVALID_CHANGE_EVENT");
  const malformedEntity = kernel.recordChangeEvent({
    type: "intent_change", title: "Ambiguous entity change", costDeltaMinor: 1_000, daysDelta: 0,
    minimumBufferMinor: 0, entityChanges: [{ entityId: "trip_days", field: "days", delta: 1, value: 19 }], expectedRevision: 1,
  });
  assert.equal(malformedEntity.code, "INVALID_ENTITY_CHANGE");
  assert.equal(kernel.events.length, 0);

  const material = kernel.recordChangeEvent({
    type: "quote_change", title: "Unsubstantiated material quote", costDeltaMinor: 60_000, daysDelta: 0,
    minimumBufferMinor: 0, evidenceRefs: [], expectedRevision: 1,
  });
  const compared = await kernel.compareOptions({ eventId: material.event.eventId, generate: true });
  assert.equal(compared.code, "NO_VALID_OPTION");
  assert.equal(compared.options.length, 0);
  assert.equal(compared.search.validOptionCount, 0);
  assert.equal(kernel.revision, 1);
  assert.equal(allocationTotal(kernel.accepted), kernel.accepted.totalBudgetMinor);
});

test("unsafe money and changes that would make forecast negative fail closed", async () => {
  const profile = (await compileBuiltInProfiles()).get("travel");
  assert(profile);
  const kernel = new FinitePlanKernel(profile);
  const unsafe = kernel.recordChangeEvent({
    type: "intent_change", title: "Unsafe money", costDeltaMinor: Number.MAX_SAFE_INTEGER + 1, daysDelta: 0,
    minimumBufferMinor: 0, expectedRevision: 1,
  });
  assert.equal(unsafe.code, "INVALID_CHANGE_EVENT");

  const negative = kernel.recordChangeEvent({
    type: "intent_change", title: "Refund beyond the whole forecast", costDeltaMinor: -(kernel.accepted.forecastMinor + 1), daysDelta: 0,
    minimumBufferMinor: 0, evidenceRefs: [], expectedRevision: 1,
  });
  const compared = await kernel.compareOptions({ eventId: negative.event.eventId, generate: true });
  assert.equal(compared.code, "NO_VALID_OPTION");
  assert.equal(compared.options.length, 0);
  assert.equal(compared.search.validOptionCount, 0);
  const refused = await kernel.stageOption({ candidateId: "candidate_missing", expectedRevision: 1 });
  assert.equal(refused.code, "CANDIDATE_NOT_FOUND");
  assert.equal(kernel.revision, 1);
  assert.equal(allocationTotal(kernel.accepted), kernel.accepted.totalBudgetMinor);
});
