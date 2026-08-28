import test from "node:test";
import assert from "node:assert/strict";
import { hasInterpretationDetail, humanLabel, inputKindLabel, inputSurfaceLabel, interpretationNeedsForDisplay, interpretationSourcesForDisplay, renderHumanValue, renderTextList, starterPlanForArrival } from "../dist-test/src/arrival-presentation.js";

test("arrival interpretation renders consumer language without raw JSON or internal paths", () => {
  const rendered = renderHumanValue({
    budget: { maximumMinor: 1_000_000, currencyCode: "AUD", coverage: "unspecified", source: "human_order.structured.finiteLimit" },
    departure: { originCountry: "Australia", dayOfMonthApproximate: 15, month: null, year: null, source: "human_order.structured.deadline" },
    anchors: [{ place: "Oktoberfest", commitment: "likely" }, { place: "Finland", purpose: "visit friends" }],
    outcome: { kind: "multi_stop_europe_trip", source: "human_order" },
  });
  assert.match(rendered, /What|Budget|Maximum/);
  assert.match(rendered, /A\$10,000|\$10,000/);
  assert.match(rendered, /Oktoberfest/);
  assert.match(rendered, /From your original order/);
  assert.match(rendered, /Not supplied yet/);
  assert.equal(rendered.includes("human_order"), false);
  assert.equal(rendered.includes("maximumMinor"), false);
  assert.equal(rendered.includes("multi_stop_europe_trip"), false);
  assert.equal(rendered.includes("{"), false);
  assert.equal(rendered.includes("}"), false);
});

test("recent human updates hide protocol identifiers and keep the answer readable", () => {
  const rendered = renderHumanValue({ questionId: "arrival_question_internal_4", value: "Its open ended, but im thinking one month or so" });
  assert.match(rendered, /one month or so/);
  assert.equal(rendered.includes("questionId"), false);
  assert.equal(rendered.includes("arrival_question_internal_4"), false);
  assert.equal(inputKindLabel("answer"), "Answer");
  assert.equal(inputSurfaceLabel("inline"), "added on this page");
});

test("interpretation labels and missing lists remain generic across plan families", () => {
  assert.equal(humanLabel("custom_relocation"), "Custom relocation");
  const list = renderTextList(["Departure month and year", "Australian departure airport"], "Nothing currently blocking");
  assert.match(list, /Departure month and year/);
  assert.match(list, /Australian departure airport/);
  assert.equal(list.includes("["), false);
});

test("long nested and mixed-language arrival input remains consumer text rather than protocol", () => {
  const hostile = {
    plan_family: "旅行_renovación",
    notes: "Nous voulons protéger la famille — でも予算は有限です. ".repeat(120),
    nested: Array.from({ length: 20 }, (_, index) => ({ internal_path: `facts.secret.${index}`, value: `<script>${index}</script>`, source: "operator.internal" })),
  };
  const rendered = renderHumanValue(hostile);
  assert.match(rendered, /protéger la famille/);
  assert.equal(rendered.includes("operator.internal"), false);
  assert.equal(rendered.includes("facts.secret"), false);
  assert.equal(rendered.includes("{"), false);
  assert.equal(rendered.includes("}"), false);
});

test("an incomplete interpretation falls back to supplied arrival facts and the active question", () => {
  const sources = interpretationSourcesForDisplay({
    rawOutcome: "Create a dinner for some friends.",
    structured: {
      deadline: "A Monday night in the next few months",
      finiteLimit: "$20 per head or $200 total",
      hardConstraint: "It must be on a Monday night",
    },
  }, {});
  assert.deepEqual(sources, {
    outcome: "Create a dinner for some friends.",
    when: "A Monday night in the next few months",
    whatIsLimited: "$20 per head or $200 total",
    mustNotChange: "It must be on a Monday night",
  });
  assert.equal(hasInterpretationDetail(sources), true);
  assert.equal(hasInterpretationDetail({}), false);
  assert.deepEqual(interpretationNeedsForDisplay([], {
    questionId: "q1",
    prompt: "Roughly how many people should Finite plan dinner for?",
    answerKind: "text",
    fieldPaths: [],
    choices: [],
    stagedAt: "2026-08-28T00:00:00.000Z",
  }), ["Roughly how many people should Finite plan dinner for?"]);
});

test("a complete travel brief yields an actual domain plan with destinations, travel, dates, money, commitments and open decisions", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1",
    orderId: "arrival_starter_1",
    version: 6,
    status: "interpretation_confirmed",
    rawOutcome: "Plan a flexible Europe trip around fixed people and an event.",
    structured: { finiteLimit: "A$10,000" },
    attachments: [],
    inputs: [
      { inputId: "arrival_input_arrival_starter_1_3", kind: "answer", payload: { value: "Around one month" }, sourceSurface: "site", createdAt: "2026-08-28T00:00:00.000Z" },
    ],
    pendingClarification: null,
    interpretation: {
      basedOnVersion: 4,
      inferredFamily: "travel",
      summary: "A flexible Europe plan that protects the fixed visits, event, and A$10,000 ceiling.",
      known: { destinations: ["London", "Paris"], fixedFlight: "QF9 to London", departureDate: "~15th September 2026", budget: "A$10,000", confirmedEvent: "Wedding in Lyon" },
      inferred: { optionalRegion: "Northern Italy" },
      missing: [],
      contradictions: [],
      dependencies: [{ dependencyId: "friend_dates", kind: "human_coordination", title: "Confirm friend visit dates", status: "open", blocking: false, detail: "Friend visit dates are still open.", sourcePaths: ["known.visits"] }],
      savedOperatorWork: {},
      complete: true,
      stagedAt: "2026-08-28T00:01:00.000Z",
    },
    lastOperatorCheckpoint: 4,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:02:00.000Z",
    checksum: "a".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.equal(starter.title, "Travel rough plan");
  assert.deepEqual(starter.sections.map((section) => section.label), ["Calendar", "Where you’re staying", "Flights & transport", "Money", "Visa, insurance & fixed items", "To-do list"]);
  assert.deepEqual(starter.sections.find((section) => section.sectionId === "itinerary").items.map((item) => item.fields.title), ["London", "Paris", "Northern Italy"]);
  assert.equal(starter.sections.find((section) => section.sectionId === "itinerary").items.find((item) => item.fields.title === "London").fields.start, "2026-09-15");
  assert.ok(starter.sections.find((section) => section.sectionId === "itinerary").fields.some((field) => field.fieldId === "kind" && field.inputType === "select"));
  assert.ok(starter.sections.find((section) => section.sectionId === "itinerary").fields.some((field) => field.fieldId === "reference" && field.inputType === "url"));
  assert.ok(starter.sections.find((section) => section.sectionId === "stays").fields.some((field) => field.fieldId === "website" && field.inputType === "url"));
  assert.ok(starter.sections.find((section) => section.sectionId === "stays").fields.some((field) => field.fieldId === "bookingStatus"));
  assert.ok(starter.sections.find((section) => section.sectionId === "stays").fields.some((field) => field.fieldId === "totalBudget"));
  assert.ok(starter.sections.find((section) => section.sectionId === "transport").fields.some((field) => field.fieldId === "endTime"));
  assert.equal(starter.sections.find((section) => section.sectionId === "transport").items[0].fields.title, "QF9 to London");
  assert.ok(starter.sections.find((section) => section.sectionId === "money").items.some((item) => item.fields.amount === "10000" && item.fields.moneyRole === "limit"));
  assert.equal(starter.overview.start, "2026-09-15");
  assert.equal(starter.overview.end, "2026-10-15");
  assert.equal(starter.overview.datesProvisional, true);
  assert.equal(starter.overview.totalBudget, "10000");
  assert.equal(starter.overview.currency, "AUD");
  assert.equal(starter.overview.budgetProvisional, false);
  assert.deepEqual(starter.overview.categories.map((item) => item.fields.title), ["Flights & transport", "Accommodation", "Food & daily spending", "Insurance, visas & admin", "Experiences & flexible buffer"]);
  assert.equal(starter.sections.find((section) => section.sectionId === "requirements").items[0].fields.notes, "Wedding in Lyon");
  assert.ok(starter.sections.find((section) => section.sectionId === "tasks").items.some((item) => item.fields.title === "Friend visit dates are still open."));
  assert.equal(starter.interpretationIsCurrent, true);
  assert.deepEqual(starter.laterHumanInputs, []);
});

test("real-plan sentence dates and shorthand money produce the intended editable overview", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1",
    orderId: "arrival_real_language",
    version: 6,
    status: "interpretation_confirmed",
    rawOutcome: "I want to take a trip to Europe from Australia, possibly leaving around the 15th of September this year. I am thinking one month or so and the dates are not set in stone.",
    structured: {
      deadline: "Possibly leaving Australia around the 15th of September this year, but it is not set in stone.",
      finiteLimit: "10k aud absolute max spend.",
    },
    attachments: [],
    inputs: [],
    pendingClarification: null,
    interpretation: {
      basedOnVersion: 4,
      inferredFamily: "travel",
      summary: "A roughly one-month Europe trip from 15 September 2026 with an AUD 10,000 ceiling.",
      known: { destinations: ["Budapest", "Poland", "Finland"] },
      inferred: { event: "Oktoberfest" },
      missing: [], contradictions: [], dependencies: [], savedOperatorWork: {}, complete: true,
      stagedAt: "2026-08-28T00:01:00.000Z",
    },
    lastOperatorCheckpoint: 4,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:02:00.000Z",
    checksum: "f".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.equal(starter.overview.start, "2026-09-15");
  assert.equal(starter.overview.end, "2026-10-15");
  assert.equal(starter.overview.datesProvisional, true);
  assert.equal(starter.overview.totalBudget, "10000");
  assert.equal(starter.overview.currency, "AUD");
  assert.equal(starter.overview.budgetProvisional, false);
  assert.ok(starter.overview.categoryPercent <= 100);
});

test("plan overview settings support a timed single-day event and category allocations above 100 percent", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_overview", version: 5, status: "waiting_for_codex", rawOutcome: "Plan a one-day event.", structured: { planningMode: "manual" }, attachments: [], pendingClarification: null,
    inputs: [
      { inputId: "arrival_input_arrival_overview_2", kind: "correction", payload: { workspaceOperation: "overview", moduleId: "overview", fields: { start: "2026-10-03", end: "2026-10-04", singleDay: true, includeTime: true, startTime: "09:00", endTime: "23:30", timeZone: "Australia/Sydney", totalBudget: "1000", currency: "aud" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:00.000Z" },
      { inputId: "arrival_input_arrival_overview_3", kind: "detail", payload: { workspaceOperation: "add", moduleId: "money", recordId: "category_venue", label: "Venue", fields: { title: "Venue", amount: "750", currency: "AUD", moneyRole: "cost" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:01.000Z" },
      { inputId: "arrival_input_arrival_overview_4", kind: "detail", payload: { workspaceOperation: "add", moduleId: "money", recordId: "category_food", label: "Food", fields: { title: "Food", amount: "500", currency: "AUD", moneyRole: "cost" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:02.000Z" },
    ],
    interpretation: null, lastOperatorCheckpoint: 0, createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:02.000Z", checksum: "e".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.deepEqual(starter.overview, {
    start: "2026-10-03", end: "2026-10-03", datesProvisional: false, singleDay: true, includeTime: true, startTime: "09:00", endTime: "23:30", timeZone: "Australia/Sydney", totalBudget: "1000", currency: "AUD", budgetProvisional: false,
    categories: starter.overview.categories, categoryAllocated: 1250, categoryPercent: 125,
  });
});

test("human draft edits remain visible and mark the starter interpretation for reconciliation", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1",
    orderId: "arrival_starter_2",
    version: 7,
    status: "waiting_for_codex",
    rawOutcome: "Plan a dinner.",
    structured: {},
    attachments: [],
    inputs: [
      { inputId: "arrival_input_arrival_starter_2_7", kind: "correction", payload: { draftSection: "people", label: "Guest count", detail: "Twelve guests, not ten.", operation: "correct" }, sourceSurface: "site", createdAt: "2026-08-28T00:03:00.000Z" },
    ],
    pendingClarification: null,
    interpretation: {
      basedOnVersion: 5,
      inferredFamily: "event",
      summary: "A dinner plan for ten guests.",
      known: {}, inferred: {}, missing: [], contradictions: [], dependencies: [], savedOperatorWork: {}, complete: true,
      stagedAt: "2026-08-28T00:01:00.000Z",
    },
    lastOperatorCheckpoint: 5,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:03:00.000Z",
    checksum: "b".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.equal(starter.title, "Event rough plan");
  assert.equal(starter.interpretationIsCurrent, false);
  assert.equal(starter.laterHumanInputs[0].payload.detail, "Twelve guests, not ten.");
  assert.deepEqual(starter.sections.find((section) => section.sectionId === "scope").items[0], {
    itemId: "human_0", label: "Guest count", fields: { title: "Guest count", notes: "Twelve guests, not ten." }, source: "human",
  });
});

test("manual workspace operations add, edit, reorder, complete and remove records without model construction", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_workspace", version: 12, status: "waiting_for_codex", rawOutcome: "Plan a trip.", structured: {}, attachments: [], pendingClarification: null,
    inputs: [
      { inputId: "arrival_input_arrival_workspace_7", kind: "detail", payload: { workspaceOperation: "add", moduleId: "itinerary", recordId: "manual_a", label: "Berlin", fields: { title: "Berlin", location: "Berlin" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:00.000Z" },
      { inputId: "arrival_input_arrival_workspace_8", kind: "detail", payload: { workspaceOperation: "add", moduleId: "itinerary", recordId: "manual_b", label: "Munich", fields: { title: "Munich", location: "Munich" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:01.000Z" },
      { inputId: "arrival_input_arrival_workspace_9", kind: "correction", payload: { workspaceOperation: "update", moduleId: "itinerary", recordId: "manual_b", fields: { start: "2026-09-15" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:02.000Z" },
      { inputId: "arrival_input_arrival_workspace_10", kind: "correction", payload: { workspaceOperation: "reorder", moduleId: "itinerary", recordOrder: ["manual_b", "manual_a"] }, sourceSurface: "site", createdAt: "2026-08-28T00:00:03.000Z" },
      { inputId: "arrival_input_arrival_workspace_11", kind: "detail", payload: { workspaceOperation: "add", moduleId: "tasks", recordId: "task_a", label: "Insurance", fields: { title: "Buy insurance", done: false } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:04.000Z" },
      { inputId: "arrival_input_arrival_workspace_12", kind: "detail", payload: { workspaceOperation: "toggle", moduleId: "tasks", recordId: "task_a", done: true }, sourceSurface: "site", createdAt: "2026-08-28T00:00:05.000Z" },
    ],
    interpretation: { basedOnVersion: 6, inferredFamily: "travel", summary: "A trip.", known: {}, inferred: {}, missing: [], contradictions: [], dependencies: [], savedOperatorWork: {}, complete: true, stagedAt: "2026-08-28T00:00:00.000Z" },
    lastOperatorCheckpoint: 6, createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:05.000Z", checksum: "c".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.deepEqual(starter.sections.find((section) => section.sectionId === "itinerary").items.filter((item) => item.itemId.startsWith("manual_")).map((item) => item.itemId), ["manual_b", "manual_a"]);
  assert.equal(starter.sections.find((section) => section.sectionId === "itinerary").items[0].fields.start, "2026-09-15");
  assert.equal(starter.sections.find((section) => section.sectionId === "tasks").items.find((item) => item.itemId === "task_a").fields.done, true);
});

test("manual mode opens the full workspace without an interpretation and keeps section notes and Codex requests", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_manual", version: 4, status: "waiting_for_codex", rawOutcome: "Plan a flexible Europe trip.", structured: { planningMode: "manual" }, attachments: [], pendingClarification: null,
    inputs: [
      { inputId: "arrival_input_arrival_manual_2", kind: "detail", payload: { workspaceOperation: "add", moduleId: "itinerary", recordId: "manual_berlin", label: "Berlin", fields: { title: "Berlin", location: "Berlin" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:00.000Z" },
      { inputId: "arrival_input_arrival_manual_3", kind: "detail", payload: { workspaceOperation: "note", moduleId: "itinerary", recordId: "comment_1", comment: "Move this after Munich", forCodex: false }, sourceSurface: "site", createdAt: "2026-08-28T00:00:01.000Z" },
      { inputId: "arrival_input_arrival_manual_4", kind: "detail", payload: { workspaceOperation: "note", moduleId: "money", recordId: "comment_2", comment: "Research a safer daily allowance", forCodex: true }, sourceSurface: "site", createdAt: "2026-08-28T00:00:02.000Z" },
    ],
    interpretation: null, lastOperatorCheckpoint: 0, createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:02.000Z", checksum: "d".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.equal(starter.title, "Travel rough plan");
  assert.equal(starter.sections.length, 6);
  assert.equal(starter.sections.find((section) => section.sectionId === "itinerary").items[0].fields.location, "Berlin");
  assert.deepEqual(starter.sections.find((section) => section.sectionId === "itinerary").comments, [{ commentId: "comment_1", text: "Move this after Munich", forCodex: false }]);
  assert.deepEqual(starter.sections.find((section) => section.sectionId === "money").comments, [{ commentId: "comment_2", text: "Research a safer daily allowance", forCodex: true }]);
});
