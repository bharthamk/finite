import test from "node:test";
import assert from "node:assert/strict";
import { arrivalProgressionFromStarter } from "../dist-test/src/arrival-progression.js";
import { starterPlanForArrival, workspaceInterpretationForConstruction } from "../dist-test/src/arrival-presentation.js";
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

test("a reviewed editable workspace round-trips into a compiler-valid plan", async () => {
  const waiting = {
    ...structuredClone(order),
    orderId: "arrival_dinner_round_trip_01",
    version: 12,
    status: "waiting_for_codex",
    rawOutcome: "Plan a dinner party at home for 10 people on Saturday 17 October 2026. Budget is AUD 500. Two guests are vegetarian, one has a nut allergy, and I want most preparation completed before guests arrive. Nothing is booked or settled yet.",
    structured: { planningMode: "codex" },
    interpretation: null,
    inputs: [],
  };
  const reviewedInterpretation = workspaceInterpretationForConstruction(waiting, waiting.version, "2026-08-30T00:00:00.000Z");
  const reviewed = { ...waiting, status: "interpretation_confirmed", interpretation: reviewedInterpretation };
  const reviewedStarter = starterPlanForArrival(reviewed);
  const progression = arrivalProgressionFromStarter(reviewed, reviewedStarter);
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const assessed = await runtime.assessPlanIntake(progression.intake);
  assert.match(assessed.code, /^INTAKE_FACTS_COMPLETE/, JSON.stringify(assessed));
  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  assert.equal(staged.code, "PLAN_DRAFT_STAGED_FROM_INTAKE", JSON.stringify({ reviewedStarter, intake: progression.intake, staged }));
});

test("a zero-budget job interview becomes an isolated general plan and activates without event semantics", async () => {
  const interviewOrder = {
    ...structuredClone(order),
    orderId: "arrival_job_interview_canary_01",
    version: 4,
    status: "interpretation_confirmed",
    rawOutcome: "I have a second-round interview on 18 September 2026 for a fictional Senior Strategy & Operations role at Northstar AI. It is a 60-minute video interview with the COO. I have three evenings to prepare and want a focused plan covering company research, role stories, likely questions, questions to ask, technology check, and follow-up. Assume no paid budget.",
    structured: { planningMode: "codex" },
    inputs: [{
      inputId: "arrival_input_interview_module",
      kind: "detail",
      sourceSurface: "codex",
      createdAt: "2026-08-30T00:00:00.000Z",
      payload: {
        workspaceOperation: "module_add",
        moduleId: "custom_interview_evidence",
        moduleSource: "codex",
        label: "Interview evidence bank",
        description: "Connect each competency to a concise example and result.",
        variant: "cards",
        fields: [
          { fieldId: "title", label: "Competency", inputType: "text" },
          { fieldId: "situation", label: "Situation", inputType: "textarea" },
          { fieldId: "action", label: "Action", inputType: "textarea" },
          { fieldId: "result", label: "Result", inputType: "textarea" },
          { fieldId: "proof", label: "Proof", inputType: "textarea" },
          { fieldId: "confidence", label: "Confidence", inputType: "text" },
        ],
      },
    }, {
      inputId: "arrival_input_stale_event_budget_2",
      kind: "detail",
      sourceSurface: "codex",
      createdAt: "2026-08-30T00:00:01.000Z",
      payload: {
        workspaceOperation: "record_add",
        moduleId: "money",
        recordId: "stale_event_venue",
        recordSource: "codex",
        label: "Venue",
        fields: { title: "Venue", amount: "0", currency: "AUD", moneyRole: "cost", notes: "25% first-pass event allocation." },
      },
    }],
    interpretation: {
      ...order.interpretation,
      basedOnVersion: 4,
      inferredFamily: "event",
      summary: "Prepare for a second-round strategy and operations interview with Northstar AI.",
      known: { interviewDate: "2026-09-18", interviewLengthMinutes: 60, interviewer: "COO", prepEvenings: 3, paidBudget: 0 },
    },
    checksum: "b".repeat(64),
  };

  const interviewStarter = starterPlanForArrival(interviewOrder);
  assert.equal(interviewStarter.family, "general");
  assert.match(interviewStarter.title, /^Northstar AI interview preparation/);
  assert.equal(interviewStarter.overview.moneyState, "zero");
  assert.equal(interviewStarter.overview.totalBudget, "0");
  assert.equal(interviewStarter.overview.categories.length, 0);
  assert.equal(interviewStarter.sections.find((entry) => entry.sectionId === "money")?.items.some((entry) => entry.label === "Venue"), false);
  assert(interviewStarter.sections.some((entry) => entry.sectionId === "custom_interview_evidence"));
  assert.equal(interviewStarter.sections.some((entry) => /guest|venue|supplier/i.test(entry.label)), false);

  const progression = arrivalProgressionFromStarter(interviewOrder, interviewStarter);
  assert.equal(progression.intake.profileId, "general");
  assert.equal(progression.intake.planningDimensions.money, "zero");
  assert.deepEqual(progression.intake.allocation, { totalBudgetMinor: 0, spentMinor: 0, committedMinor: 0, forecastMinor: 0, bufferMinor: 0 });
  assert.deepEqual(Object.keys(progression.intake.entityValues).sort(), ["open_dependencies", "plan_items"]);
  assert.equal(progression.intake.stages.length <= 12, true);
  assert(progression.inputs.some((entry) => entry.message.includes("Interview evidence bank")));

  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const catalog = new PlanCatalogStore(storage);
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "event", catalog);
  const acceptedBefore = runtime.kernel.profile.planId;
  const assessed = await runtime.assessPlanIntake(progression.intake);
  assert.match(assessed.code, /^INTAKE_FACTS_COMPLETE/, JSON.stringify(assessed));
  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  assert.equal(staged.code, "PLAN_DRAFT_STAGED_FROM_INTAKE", JSON.stringify(staged));
  assert.equal(staged.draft.profile.profileId, "general");
  assert.match(staged.draft.profile.name, /^Northstar AI interview preparation/);
  assert.equal(staged.draft.profile.planningDimensions.money, "zero");
  assert.equal(runtime.kernel.profile.planId, acceptedBefore);

  const confirmed = runtime.humanConfirmPlanDraft({ draftId: staged.draft.draftId });
  assert.equal(confirmed.code, "HUMAN_PLAN_ACTIVATION_CONFIRMED");
  const activated = await runtime.activateConfirmedPlanDraft({
    draftId: staged.draft.draftId,
    confirmationId: confirmed.confirmation.confirmationId,
    expectedPlanId: acceptedBefore,
    expectedRevision: 1,
    idempotencyKey: "activate-job-interview-canary-01",
  });
  assert.equal(activated.code, "PLAN_ACTIVATED", JSON.stringify(activated));
  assert.equal(runtime.kernel.profile.profileId, "general");
  assert.equal(runtime.kernel.accepted.totalBudgetMinor, 0);
  assert.equal(runtime.listPlans().plans.some((entry) => entry.planId === progression.intake.planId), true);
});
