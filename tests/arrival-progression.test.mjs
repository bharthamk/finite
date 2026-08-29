import test from "node:test";
import assert from "node:assert/strict";
import { arrivalProgressionFromStarter } from "../dist-test/src/arrival-progression.js";
import { compileBuiltInProfiles } from "../dist-test/src/profiles.js";
import { MemoryStorage, PlanCatalogStore, PlanSnapshotStore } from "../dist-test/src/persistence.js";
import { FinitePlanRuntime } from "../dist-test/src/runtime.js";

const order = {
  orderVersion: "finite-arrival-order.v1", orderId: "arrival_dinner_progress_01", version: 19, status: "interpretation_confirmed",
  rawOutcome: "Plan a dinner party at home for 10 people on Saturday 17 October 2026 with an AUD 500 budget.",
  structured: {}, attachments: [], inputs: [], pendingClarification: null,
  interpretation: {
    basedOnVersion: 19, inferredFamily: "event", summary: "A prepared-at-home dinner for ten.",
    known: { guestCount: 10 }, inferred: {}, missing: [], contradictions: [], dependencies: [], savedOperatorWork: {}, complete: true,
    stagedAt: "2026-08-30T00:00:00.000Z",
  },
  lastOperatorCheckpoint: 19, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", checksum: "a".repeat(64),
};

const item = (itemId, label, fields, source = "human") => ({ itemId, label, fields, source });
const section = (sectionId, label, variant, items, fields = []) => ({ sectionId, label, description: label, emptyLabel: "Empty", variant, fields, items, options: [], comments: [], openQuestions: [], answers: [] });
const starter = {
  family: "event", familyLabel: "Event", title: "Saturday dinner for ten", brief: "Serve a nut-safe dinner for ten within A$500, with most preparation finished before 6pm.",
  overview: {
    start: "2026-10-17", end: "2026-10-17", datesProvisional: false, singleDay: true, includeTime: true,
    startTime: "18:00", endTime: "23:00", timeZone: "Australia/Sydney", totalBudget: "500", currency: "AUD", budgetProvisional: false,
    categories: [item("food", "Food", { title: "Food", amount: "250", moneyRole: "cost" }), item("drink", "Drinks", { title: "Drinks", amount: "150", moneyRole: "cost" }), item("buffer", "Buffer", { title: "Buffer", amount: "100", moneyRole: "cost" })],
    categoryAllocated: 500, categoryPercent: 100,
  },
  sections: [
    section("schedule", "Calendar", "calendar", [item("arrive", "Guests arrive", { title: "Guests arrive", start: "2026-10-17", startTime: "18:00", notes: "Welcome drinks." })], [{ fieldId: "title", label: "Item", inputType: "text" }, { fieldId: "start", label: "Start", inputType: "date" }, { fieldId: "startTime", label: "Time", inputType: "time" }, { fieldId: "notes", label: "Notes", inputType: "textarea" }]),
    section("scope", "Guests & venue", "cards", [item("guests", "Guest group", { title: "Guest group", headcount: "10", location: "Home" })], [{ fieldId: "title", label: "Item", inputType: "text" }, { fieldId: "headcount", label: "People", inputType: "number" }, { fieldId: "location", label: "Location", inputType: "text" }]),
    section("requirements", "Requirements & commitments", "requirements", [item("allergy", "Nut-allergy controls", { title: "Nut-allergy controls", status: "ready", notes: "Avoid nuts; trace exposure is acceptable." })], [{ fieldId: "title", label: "Requirement", inputType: "text" }, { fieldId: "status", label: "Status", inputType: "select" }, { fieldId: "notes", label: "Notes", inputType: "textarea" }]),
    section("money", "Budget & costs", "money", [item("limit", "Total budget", { title: "Total budget", amount: "500", moneyRole: "limit" })], [{ fieldId: "title", label: "Budget item", inputType: "text" }, { fieldId: "amount", label: "Amount", inputType: "number" }]),
    section("tasks", "To-do list", "checklist", [item("shop", "Buy groceries", { title: "Buy groceries", done: false }), item("table", "Set the table", { title: "Set the table", done: true })]),
  ],
  laterHumanInputs: [], interpretationIsCurrent: true,
};

test("a complete editable workspace becomes one compiler-valid adaptive plan without Codex authority", async () => {
  const progression = arrivalProgressionFromStarter(order, starter);
  assert.equal(progression.intake.profileId, "event");
  assert.equal(progression.intake.allocation.totalBudgetMinor, 50_000);
  assert.equal(progression.intake.allocation.forecastMinor, 50_000);
  assert.equal(progression.intake.allocation.bufferMinor, 0);
  assert.equal(progression.intake.entityValues.guest_headcount.count, 10);
  assert.equal(progression.intake.entityValues.venue.capacity, 10);
  assert.deepEqual(progression.tasks, [{ label: "Buy groceries", done: false }, { label: "Set the table", done: true }]);
  assert(progression.inputs.some((entry) => entry.section === "boundaries" && entry.message.includes("Nut-allergy controls")));
  assert(progression.inputs.every((entry) => Array.from(entry.message).length <= 1_950));

  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const assessed = await runtime.assessPlanIntake(progression.intake);
  assert.match(assessed.code, /^INTAKE_FACTS_COMPLETE/);
  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  assert.equal(staged.code, "PLAN_DRAFT_STAGED_FROM_INTAKE", JSON.stringify(staged));
  assert.equal(staged.draft.profile.name, "Saturday dinner for ten");
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe");
});

test("manual progression compiles every built-in planning family", async () => {
  for (const family of ["travel", "renovation"]) {
    const candidate = structuredClone(starter);
    candidate.family = family;
    candidate.title = `${family} progression`;
    candidate.overview.end = family === "travel" ? "2026-10-20" : "2026-11-17";
    const candidateOrder = { ...order, orderId: `arrival_${family}_progress_01`, rawOutcome: candidate.title, interpretation: { ...order.interpretation, inferredFamily: family } };
    const progression = arrivalProgressionFromStarter(candidateOrder, candidate);
    const profiles = await compileBuiltInProfiles();
    const storage = new MemoryStorage();
    const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "event", new PlanCatalogStore(storage));
    const assessed = await runtime.assessPlanIntake(progression.intake);
    assert.match(assessed.code, /^INTAKE_FACTS_COMPLETE/, `${family}: ${JSON.stringify(assessed)}`);
    const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
    assert.equal(staged.code, "PLAN_DRAFT_STAGED_FROM_INTAKE", `${family}: ${JSON.stringify(staged)}`);
  }
});
