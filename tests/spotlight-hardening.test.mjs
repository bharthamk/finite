import test from "node:test";
import assert from "node:assert/strict";
import { FinitePlanKernel } from "../dist-test/src/kernel.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";

const profilesPromise = compileBuiltInProfiles();

const spotlightEvent = {
  type: "intent_change",
  title: "Add three nights in Paris",
  costDeltaMinor: 66_000,
  daysDelta: 3,
  minimumBufferMinor: 50_000,
  evidenceRefs: ["evidence_current"],
  entityChanges: [
    { entityId: "trip_days", field: "days", delta: 3 },
    { entityId: "booked_segment_days", field: "days", delta: 3 },
  ],
  expectedRevision: 1,
};

const allocationTotal = (allocation) => allocation.spentMinor + allocation.committedMinor + allocation.forecastMinor + allocation.bufferMinor;

test("Spotlight refuses an absolute duration replacement that contradicts its relative day change", async () => {
  const profiles = await profilesPromise;
  const profile = profiles.get("travel");
  assert(profile);
  const kernel = new FinitePlanKernel(profile, new PlanSnapshotStore(new MemoryStorage()));
  const refused = kernel.recordChangeEvent({
    ...spotlightEvent,
    entityChanges: [
      { entityId: "trip_days", field: "days", value: 3 },
      { entityId: "booked_segment_days", field: "days", value: 3 },
    ],
  });
  assert.equal(refused.code, "ENTITY_CHANGE_DELTA_MISMATCH");
  assert.equal(refused.acceptedStateChanged, false);
  assert.equal(kernel.revision, 1);
  assert.equal(kernel.events.length, 0);
});

for (let run = 1; run <= 20; run += 1) {
  test(`Spotlight hostile run ${String(run).padStart(2, "0")} stays bounded, human-authorized, replay-safe, and reloadable`, async () => {
    const profiles = await profilesPromise;
    const profile = profiles.get("travel");
    assert(profile);
    const storage = new MemoryStorage();
    const store = new PlanSnapshotStore(storage);
    const kernel = new FinitePlanKernel(profile, store);

    const recorded = kernel.recordChangeEvent(spotlightEvent);
    assert.equal(recorded.code, "CHANGE_RECORDED");
    assert.equal(kernel.revision, 1);
    const compared = await kernel.compareOptions({ eventId: recorded.event.eventId, generate: true });
    assert.equal(compared.code, "OPTIONS_AVAILABLE");
    assert.equal(compared.search.exploredCombinationCount, 26);
    assert.equal(compared.search.legalCombinationCount + compared.search.rejectedCombinationCount, 26);
    assert.equal(compared.search.generatedOptionCount, 5);
    assert.equal(compared.search.validOptionCount, 5);
    assert.deepEqual(kernel.lastOptionSearch, compared.search);

    const chosen = compared.options[(run - 1) % compared.options.length];
    assert(chosen.valid);
    assert(chosen.resultingBufferMinor >= spotlightEvent.minimumBufferMinor);
    assert.equal(chosen.moveIds.some((moveId) => profile.locks.includes(profile.moves[moveId].dimension)), false);

    if (run % 4 === 1) {
      const stale = await kernel.stageOption({ candidateId: chosen.candidateId, expectedRevision: 2 });
      assert.equal(stale.code, "STALE_REVISION");
    } else if (run % 4 === 2) {
      const missing = await kernel.stageOption({ candidateId: `missing_${run}`, expectedRevision: 1 });
      assert.equal(missing.code, "CANDIDATE_NOT_FOUND");
    }

    const staged = await kernel.stageOption({ candidateId: chosen.candidateId, expectedRevision: 1 });
    assert.equal(staged.code, "OPTION_STAGED");
    const before = structuredClone(kernel.accepted);
    const fabricated = await kernel.applyApprovedOption({ candidateId: chosen.candidateId, approvalId: `fabricated_${run}`, expectedRevision: 1, idempotencyKey: `hostile-fake-${run}` });
    assert.equal(fabricated.code, "CONSENT_MISSING_OR_MISMATCHED");
    assert.equal(kernel.revision, 1);
    assert.deepEqual(kernel.accepted, before);

    const approved = await kernel.humanApprove({ candidateId: chosen.candidateId, warningsAcknowledged: staged.staged.warnings.map((warning) => String(warning.code)) });
    assert.equal(approved.code, "HUMAN_APPROVAL_RECORDED");
    const command = { candidateId: chosen.candidateId, approvalId: approved.approval.approvalId, expectedRevision: 1, idempotencyKey: `spotlight-hostile-${run}` };
    const applied = await kernel.applyApprovedOption(command);
    assert.equal(applied.code, "OPTION_APPLIED");
    assert.equal(applied.receipt.fromRevision, 1);
    assert.equal(applied.receipt.toRevision, 2);
    assert.equal(applied.receipt.payload.changeEvent.title, spotlightEvent.title);
    assert.equal(applied.receipt.payload.objective, chosen.objective);
    assert.equal(applied.receipt.payload.search.exploredCombinationCount, 26);
    assert.equal(applied.receipt.payload.search.validOptionCount, 5);
    assert.equal(kernel.entities.trip_days.values.days, 21);
    assert.equal(kernel.entities.booked_segment_days.values.days, 21);
    assert.equal(allocationTotal(kernel.accepted), kernel.accepted.totalBudgetMinor);

    const replay = await kernel.applyApprovedOption(command);
    assert.equal(replay.code, "IDEMPOTENT_REPLAY");
    assert.equal(replay.acceptedStateChanged, false);
    assert.equal(kernel.revision, 2);
    const mismatchedReplay = await kernel.applyApprovedOption({ ...command, candidateId: `different_${run}` });
    assert.equal(mismatchedReplay.code, "IDEMPOTENCY_KEY_REUSED");
    assert.equal(kernel.revision, 2);

    const reloaded = new FinitePlanKernel(profile, store);
    assert.equal(reloaded.revision, 2);
    assert.deepEqual(reloaded.accepted, kernel.accepted);
    assert.deepEqual(reloaded.entities, kernel.entities);
    assert.equal(reloaded.receipts.length, 1);
    assert.equal(reloaded.receipts[0].receiptId, applied.receipt.receiptId);
  });
}
