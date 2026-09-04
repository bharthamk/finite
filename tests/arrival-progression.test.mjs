import test from "node:test";
import assert from "node:assert/strict";
import { arrivalBudgetOverageMinor, arrivalContinuityTasks, arrivalProgressionFromStarter } from "../dist-test/src/arrival-progression.js";
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
  assert.equal(progression.intake.currencyCode, "AUD");
  assert.equal(progression.intake.allocation.totalBudgetMinor, 50_000);
  assert.equal(progression.intake.allocation.forecastMinor, 50_000);
  assert.equal(progression.intake.allocation.bufferMinor, 0);
  assert.equal(progression.intake.entityValues.guest_headcount.count, 10);
  assert.equal(progression.intake.entityValues.venue.capacity, 10);
  assert.deepEqual(progression.tasks, [{ label: "Buy groceries", done: false }, { label: "Set the table", done: true }]);
  assert.deepEqual(arrivalContinuityTasks(progression, progression.intake.stages.map((stage) => stage.label)), progression.tasks);
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
  assert.equal(staged.draft.profile.currencyCode, "AUD");
  assert.equal(runtime.kernel.profile.planId, "plan_travel_europe");
});

test("the editable base currency becomes the immutable managed-plan currency", async () => {
  const candidate = structuredClone(starter);
  candidate.family = "travel";
  candidate.familyLabel = "Travel";
  candidate.overview.currency = "NZD";
  candidate.overview.start = "2026-10-16";
  candidate.overview.end = "2026-10-19";
  const progression = arrivalProgressionFromStarter({ ...order, orderId: "arrival_nzd_progress_01" }, candidate);
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const assessed = await runtime.assessPlanIntake(progression.intake);
  const staged = await runtime.compileIntakeToDraft({ packetId: assessed.constructionPacket.packetId, expectedChecksum: assessed.constructionPacket.checksum });
  assert.equal(staged.draft.profile.currencyCode, "NZD");
  assert.equal(staged.draft.profile.entities.trip_days.values.days, 4);
  assert.equal(staged.draft.profile.entities.booked_segment_days.values.days, 4);
});

test("an unknown total carries category forecast into a finite valid allocation", () => {
  const candidate = structuredClone(starter);
  candidate.family = "travel";
  candidate.overview.start = "2026-10-09";
  candidate.overview.end = "2026-10-11";
  candidate.overview.totalBudget = "";
  candidate.overview.moneyState = "unknown";
  candidate.overview.categories = [item("stay", "Stay", { title: "Stay", amount: "600", moneyRole: "cost" }), item("food", "Food", { title: "Food", amount: "300", moneyRole: "cost" })];
  const progression = arrivalProgressionFromStarter({ ...order, orderId: "arrival_unknown_total_01" }, candidate);
  assert.deepEqual(progression.intake.allocation, { totalBudgetMinor: 90_000, spentMinor: 0, committedMinor: 0, forecastMinor: 90_000, bufferMinor: 0 });
  assert.deepEqual(progression.intake.entityValues.trip_days, { days: 3 });
  assert.deepEqual(progression.intake.entityValues.booked_segment_days, { days: 3 });
  assert.equal(progression.intake.dependencies.some((dependency) => dependency.dependencyId === "budget_overallocated"), false);
});

test("an over-allocated draft remains a blocking intake conflict instead of entering Managing", async () => {
  const candidate = structuredClone(starter);
  candidate.overview.totalBudget = "650";
  candidate.overview.moneyState = "positive";
  candidate.overview.categories = [
    item("venue", "Venue", { title: "Venue", amount: "163", moneyRole: "cost" }),
    item("food", "Food", { title: "Food", amount: "228", moneyRole: "cost" }),
    item("production", "Production", { title: "Production", amount: "163", moneyRole: "cost" }),
    item("contingency", "Contingency", { title: "Contingency", amount: "98", moneyRole: "cost" }),
  ];
  assert.equal(arrivalBudgetOverageMinor(candidate), 200);
  const progression = arrivalProgressionFromStarter({ ...order, orderId: "arrival_overallocated_01" }, candidate);
  assert.equal(progression.intake.dependencies.find((dependency) => dependency.dependencyId === "budget_overallocated")?.blocking, true);
  const profiles = await compileBuiltInProfiles();
  const storage = new MemoryStorage();
  const runtime = new FinitePlanRuntime(profiles, new PlanSnapshotStore(storage), "travel", new PlanCatalogStore(storage));
  const assessed = await runtime.assessPlanIntake(progression.intake);
  assert.equal(assessed.code, "INTAKE_FACTS_CONFLICT");
  assert(assessed.conflicts.some((conflict) => conflict.code === "FINITE_TOTAL_CONFLICT"));
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
    }, {
      inputId: "arrival_input_stale_event_requirement_3",
      kind: "detail",
      sourceSurface: "codex",
      createdAt: "2026-08-30T00:00:02.000Z",
      payload: {
        workspaceOperation: "record_add",
        moduleId: "requirements",
        recordId: "stale_event_requirement",
        recordSource: "codex",
        label: "Venue and supplier commitments",
        fields: { title: "Venue and supplier commitments", status: "open", notes: "Event placeholder." },
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
  assert.equal(interviewStarter.sections.find((entry) => entry.sectionId === "custom_interview_evidence")?.items.length, 4);
  assert.equal(interviewStarter.sections.some((entry) => /guest|venue|supplier/i.test(entry.label)), false);
  assert.deepEqual(
    interviewStarter.sections.find((entry) => entry.sectionId === "schedule")?.items.map((entry) => entry.fields.start),
    ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-18"],
  );
  const interviewTasks = interviewStarter.sections.find((entry) => entry.sectionId === "tasks")?.items.map((entry) => entry.label) ?? [];
  assert.equal(interviewTasks.length, 7);
  assert(interviewTasks.some((entry) => /Research Northstar AI, the COO/i.test(entry)));
  assert(interviewTasks.some((entry) => /evidence stories/i.test(entry)));
  assert(interviewTasks.some((entry) => /video setup/i.test(entry)));
  assert(interviewTasks.some((entry) => /follow-up note/i.test(entry)));

  const progression = arrivalProgressionFromStarter(interviewOrder, interviewStarter);
  assert.equal(progression.intake.profileId, "general");
  assert.equal(progression.intake.planningDimensions.money, "zero");
  assert.deepEqual(progression.intake.allocation, { totalBudgetMinor: 0, spentMinor: 0, committedMinor: 0, forecastMinor: 0, bufferMinor: 0 });
  assert.deepEqual(Object.keys(progression.intake.entityValues).sort(), ["open_dependencies", "plan_items"]);
  assert.equal(progression.intake.stages.length <= 12, true);
  assert.equal(progression.intake.locks.some((entry) => /venue|supplier/.test(entry)), false);
  assert.equal(progression.intake.stages.some((entry) => /known costs/.test(entry.label)), false);
  assert.match(progression.intake.stages[0].label, /^Research Northstar AI/);
  assert.equal(progression.tasks.length, 7);
  assert.equal(arrivalContinuityTasks(progression, progression.intake.stages.map((stage) => stage.label)).length, 0);
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

test("a recurring learning request becomes a useful zero-cost general plan", async () => {
  const learningOrder = {
    ...structuredClone(order),
    orderId: "arrival_learning_canary_01",
    version: 1,
    status: "waiting_for_codex",
    rawOutcome: "I want to learn basic conversational Italian over six weeks, starting Monday 21 September 2026. I can study three evenings a week for 30 minutes, want to focus on greetings, ordering food, directions and listening practice, and do not want to buy anything.",
    structured: { planningMode: "codex" },
    inputs: [],
    interpretation: null,
    checksum: "c".repeat(64),
  };

  const learningStarter = starterPlanForArrival(learningOrder);
  assert.equal(learningStarter.family, "general");
  assert.equal(learningStarter.title, "Conversational Italian practice · 21 Sept 2026");
  assert.deepEqual([learningStarter.overview.start, learningStarter.overview.end], ["2026-09-21", "2026-11-02"]);
  assert.equal(learningStarter.overview.moneyState, "zero");
  assert.equal(learningStarter.overview.totalBudget, "");
  assert.equal(learningStarter.sections.some((entry) => entry.sectionId === "custom_practice_log"), true);
  assert.equal(learningStarter.sections.find((entry) => entry.sectionId === "schedule")?.items.length, 6);
  assert.equal(learningStarter.sections.find((entry) => entry.sectionId === "tasks")?.items.length, 7);
  assert.equal(learningStarter.sections.some((entry) => /guest|venue|contractor|material/i.test(entry.label)), false);
  assert.equal(learningStarter.sections.find((entry) => entry.sectionId === "money")?.openQuestions.length, 0);

  const progression = arrivalProgressionFromStarter(learningOrder, learningStarter);
  assert.equal(progression.intake.profileId, "general");
  assert.equal(progression.intake.planningDimensions.money, "zero");
  assert.equal(progression.intake.stages.length, 7);
  assert.match(progression.intake.stages[0].label, /^Choose 3 repeatable weekly study slots/);
  assert.equal(arrivalContinuityTasks(progression, progression.intake.stages.map((stage) => stage.label)).length, 0);
  assert(progression.inputs.some((entry) => entry.message.includes("Practice log")));
});

test("an explicit home-office renovation overrides a generic interpretation and keeps dates, budget, scope and licensed work", () => {
  const renovationOrder = {
    ...structuredClone(order),
    orderId: "arrival_home_office_canary_01",
    version: 1,
    status: "interpretation_confirmed",
    rawOutcome: "I want to renovate my small home office from Monday 5 October to Friday 16 October 2026. Budget AUD 4,000. I need painting, better lighting, storage, and a standing desk. I will do painting myself on weekends, but electrical work must be done by a licensed electrician. Nothing is booked or purchased.",
    structured: { planningMode: "codex" },
    inputs: [],
    interpretation: {
      basedOnVersion: 1,
      inferredFamily: "general",
      summary: "A home office makeover with painting, lighting, storage and furniture work.",
      known: {}, inferred: {}, missing: [], contradictions: [], dependencies: [], savedOperatorWork: {}, complete: true,
      stagedAt: "2026-08-30T00:00:00.000Z",
    },
    checksum: "e".repeat(64),
  };

  const renovation = starterPlanForArrival(renovationOrder);
  assert.equal(renovation.family, "renovation");
  assert.equal(renovation.title, "Home office makeover · 5 Oct 2026");
  assert.deepEqual([renovation.overview.start, renovation.overview.end], ["2026-10-05", "2026-10-16"]);
  assert.equal(renovation.overview.totalBudget, "4000");
  assert.equal(renovation.overview.moneyState, "positive");
  assert.equal(renovation.overview.categoryPercent, 100);
  assert.equal(renovation.sections.find((entry) => entry.sectionId === "schedule")?.items.length, 6);
  assert.deepEqual(renovation.sections.find((entry) => entry.sectionId === "scope")?.items.map((entry) => entry.label), [
    "Prepare and paint the room", "Improve lighting and electrical fit", "Add useful storage", "Add a standing desk",
  ]);
  assert(renovation.sections.find((entry) => entry.sectionId === "resources")?.items.some((entry) => entry.label === "Licensed electrician" && entry.fields.bookingStatus === "idea"));
  assert(renovation.sections.find((entry) => entry.sectionId === "requirements")?.items.some((entry) => /licensed electrician/i.test(entry.label)));
  assert.equal(renovation.sections.find((entry) => entry.sectionId === "tasks")?.items.length, 7);

  const progression = arrivalProgressionFromStarter(renovationOrder, renovation);
  assert.equal(progression.intake.profileId, "renovation");
  assert.equal(progression.intake.allocation.totalBudgetMinor, 400_000);
  assert.equal(progression.intake.stages.length, 6);
  assert.match(progression.intake.stages[0].label, /^Measure/);
});

test("manual learning intake does not turn build or minutes into renovation money", async () => {
  const manualLearningOrder = {
    ...structuredClone(order),
    orderId: "arrival_manual_learning_canary_01",
    version: 1,
    status: "arrived",
    rawOutcome: "Build basic conversational Italian over six weeks",
    structured: {
      planningMode: "manual",
      deadline: "21 September to 2 November 2026, three evenings per week, 30 minutes each",
      finiteLimit: "No paid budget and no more than 90 minutes per week",
      hardConstraint: "Focus on greetings, ordering food, directions and listening practice; keep every part manually editable",
    },
    inputs: [],
    interpretation: null,
    checksum: "d".repeat(64),
  };

  const starter = starterPlanForArrival(manualLearningOrder);
  assert.equal(starter.family, "general");
  assert.equal(starter.title, "Basic conversational Italian · 21 Sept 2026");
  assert.deepEqual([starter.overview.start, starter.overview.end], ["2026-09-21", "2026-11-02"]);
  assert.equal(starter.overview.moneyState, "zero");
  assert.equal(starter.overview.totalBudget, "");
  assert.equal(starter.overview.categories.length, 0);
  assert.equal(starter.sections.find((entry) => entry.sectionId === "money")?.items.some((entry) => entry.fields.amount === "90"), false);
  assert.equal(starter.sections.find((entry) => entry.sectionId === "schedule")?.items.length, 6);
  assert.equal(starter.sections.find((entry) => entry.sectionId === "tasks")?.items.length, 7);
  assert.equal(starter.sections.some((entry) => /contractor|material|approval|permit/i.test(entry.label)), false);
});
