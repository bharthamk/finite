import test from "node:test";
import assert from "node:assert/strict";
import { MemoryAcceptedTruthRepository } from "../dist-test/src/accepted-truth.js";
import { FinitePlanKernel } from "../dist-test/src/kernel.js";
import { MemoryStorage, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { editablePlanFacts, projectPlanFactChanges } from "../dist-test/src/plan-facts.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { compileProfile } from "../dist-test/src/profiles.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";
import { compileSurfaceManifest } from "../dist-test/src/surface.js";

const profiles = await compileBuiltInProfiles();

test("editable numeric facts are discovered from each plan profile", () => {
  const travel = profiles.get("travel");
  const renovation = profiles.get("renovation");
  const event = profiles.get("event");
  assert(travel && renovation && event);
  assert.deepEqual(editablePlanFacts(travel, travel.accepted, travel.entities).map((fact) => fact.label), ["Total limit", "Trip length", "Booked days"]);
  assert.deepEqual(editablePlanFacts(renovation, renovation.accepted, renovation.entities).map((fact) => fact.label), ["Total limit", "Completion day", "Committed handover"]);
  assert.deepEqual(editablePlanFacts(event, event.accepted, event.entities).map((fact) => fact.label), ["Total limit", "Guest count", "Venue capacity"]);
});

test("budget math and linked entity changes are projected atomically", () => {
  const event = profiles.get("event");
  assert(event);
  const projection = projectPlanFactChanges(event, event.accepted, event.entities, [
    { factId: "allocations.totalBudgetMinor", value: 350_000 },
    { factId: "entities.guest_headcount.count", value: 140 },
    { factId: "entities.venue.capacity", value: 150 },
  ]);
  assert.equal(projection.accepted.totalBudgetMinor, 350_000);
  assert.equal(projection.accepted.bufferMinor, 90_000);
  assert.equal(projection.entities.guest_headcount.values.count, 140);
  assert.equal(projection.entities.venue.values.capacity, 150);
  assert.equal(projection.changes.length, 3);
});

test("invalid totals and relationship-breaking values are refused", () => {
  const event = profiles.get("event");
  assert(event);
  assert.throws(() => projectPlanFactChanges(event, event.accepted, event.entities, [{ factId: "allocations.totalBudgetMinor", value: 200_000 }]), /at least 260000/);
  assert.throws(() => projectPlanFactChanges(event, event.accepted, event.entities, [{ factId: "entities.guest_headcount.count", value: 121 }]), /guest headcount cannot be greater than venue/);
});

test("one human save commits, receipts, replays and reloads schema-derived values", async () => {
  const event = profiles.get("event");
  assert(event);
  const repository = new MemoryAcceptedTruthRepository();
  const storage = new MemoryStorage();
  const store = new PlanSnapshotStore(storage);
  const runtime = new FinitePlanRuntime(profiles, store, "event", undefined, [], () => new Date("2026-08-28T00:00:00.000Z"), repository);
  const kernel = runtime.kernel;
  assert.equal((await runtime.hydrateAcceptedTruth()).ok, true);
  const staged = await kernel.stagePlanFactChanges({
    changes: [
      { factId: "allocations.totalBudgetMinor", value: 325_000 },
      { factId: "entities.guest_headcount.count", value: 110 },
    ],
    expectedRevision: 1,
  });
  assert.equal(staged.code, "PLAN_FACT_CHANGES_STAGED");
  const confirmed = kernel.humanConfirmPlanFactChanges({ planFactChangeId: staged.planFactChange.planFactChangeId });
  const command = {
    planFactChangeId: staged.planFactChange.planFactChangeId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedRevision: 1,
    idempotencyKey: "plan-facts-event-0001",
  };
  const applied = await kernel.applyConfirmedPlanFactChanges(command);
  assert.equal(applied.code, "PLAN_FACT_CHANGES_APPLIED");
  assert.equal(kernel.revision, 2);
  assert.equal(kernel.accepted.totalBudgetMinor, 325_000);
  assert.equal(kernel.accepted.bufferMinor, 65_000);
  assert.equal(kernel.entities.guest_headcount.values.count, 110);
  assert.equal(kernel.receipts.at(-1).receiptType, "plan_fact_change");
  assert.equal((await kernel.applyConfirmedPlanFactChanges(command)).code, "IDEMPOTENT_REPLAY");

  const reloadedRuntime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(new MemoryStorage()), "event", undefined, [], () => new Date("2026-08-28T00:00:00.000Z"), repository);
  assert.equal((await reloadedRuntime.hydrateAcceptedTruth()).ok, true);
  assert.equal(reloadedRuntime.kernel.revision, 2);
  assert.equal(reloadedRuntime.kernel.accepted.totalBudgetMinor, 325_000);
  assert.equal(reloadedRuntime.kernel.entities.guest_headcount.values.count, 110);
});

test("a stale numeric edit cannot overwrite a newer revision", async () => {
  const travel = profiles.get("travel");
  assert(travel);
  const kernel = new FinitePlanKernel(travel);
  const staged = await kernel.stagePlanFactChanges({ changes: [
    { factId: "entities.trip_days.days", value: 20 },
    { factId: "entities.booked_segment_days.days", value: 20 },
  ], expectedRevision: 1 });
  const confirmed = kernel.humanConfirmPlanFactChanges({ planFactChangeId: staged.planFactChange.planFactChangeId });
  await kernel.applyConfirmedPlanFactChanges({ planFactChangeId: staged.planFactChange.planFactChangeId, confirmationId: confirmed.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "plan-facts-travel-0001" });
  const stale = await kernel.stagePlanFactChanges({ changes: [{ factId: "allocations.totalBudgetMinor", value: 700_000 }], expectedRevision: 1 });
  assert.equal(stale.code, "STALE_REVISION");
});

test("accepted numeric edits propagate through human-facing plan copy", async () => {
  const source = profiles.get("event");
  assert(source);
  const { profileHash: _profileHash, ...definition } = structuredClone(source);
  definition.name = "Monday dinner for six";
  definition.accepted = { totalBudgetMinor: 20_000, spentMinor: 0, committedMinor: 0, forecastMinor: 0, bufferMinor: 20_000 };
  definition.actuals = [];
  definition.entities.guest_headcount.values.count = 6;
  definition.entities.venue.values.capacity = 6;
  definition.surface.hero = {
    eyebrow: "Monday dinner",
    title: "Monday dinner for six",
    brief: "Dinner for six friends, capped at $20 per person and $200 total.",
  };
  definition.surface.stages = [{ stageId: "shop", label: "Shop to the caps", detail: "Keep dinner below $20 per person and $200 total.", marker: "1–2 days before", status: "current" }];
  const profile = await compileProfile(definition);
  const kernel = new FinitePlanKernel(profile);
  const staged = await kernel.stagePlanFactChanges({ changes: [
    { factId: "allocations.totalBudgetMinor", value: 18_000 },
    { factId: "entities.guest_headcount.count", value: 7 },
    { factId: "entities.venue.capacity", value: 8 },
  ], expectedRevision: 1 });
  const confirmed = kernel.humanConfirmPlanFactChanges({ planFactChangeId: staged.planFactChange.planFactChangeId });
  await kernel.applyConfirmedPlanFactChanges({ planFactChangeId: staged.planFactChange.planFactChangeId, confirmationId: confirmed.confirmation.confirmationId, expectedRevision: 1, idempotencyKey: "plan-facts-copy-0001" });
  const manifest = await compileSurfaceManifest(profile, kernel);
  assert.equal(manifest.title, "Monday dinner for seven");
  assert.equal(manifest.brief, "Dinner for seven friends, capped at $20 per person and $180 total.");
  assert.equal(manifest.stages[0].detail, "Keep dinner below $20 per person and $180 total.");
});
