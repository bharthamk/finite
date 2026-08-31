import test from "node:test";
import assert from "node:assert/strict";
import { arrivalInputIsWorkflowOnly, arrivalUsesCodexWaitingWorkspace, arrivalUsesManualWorkspace, hasInterpretationDetail, humanLabel, inputKindLabel, inputSurfaceLabel, interpretationNeedsForDisplay, interpretationSourcesForDisplay, renderHumanValue, renderTextList, starterPlanForArrival } from "../dist-test/src/arrival-presentation.js";
import { resolvePlanTitle } from "../dist-test/src/plan-title.js";

test("legacy generic accepted names project as useful plan names", () => {
  assert.equal(resolvePlanTitle({ proposed: "Event rough plan", brief: "A relaxed dinner party for ten friends." }), "Dinner party");
  assert.equal(resolvePlanTitle({ proposed: "Travel rough plan", brief: "Plan a weekend trip to Hobart for two people.", start: "2026-10-09" }), "Hobart weekend · 9 Oct 2026");
  assert.equal(resolvePlanTitle({ proposed: "Adaptive rough plan", brief: "I want to learn basic conversational Italian over six weeks.", start: "2026-09-21" }), "Conversational Italian practice · 21 Sept 2026");
  assert.equal(resolvePlanTitle({ proposed: "Adaptive rough plan", brief: "Build basic conversational Italian over six weeks.", start: "2026-09-21" }), "Basic conversational Italian · 21 Sept 2026");
  assert.equal(resolvePlanTitle({ proposed: "Quarterly launch", brief: "Ignored" }), "Quarterly launch");
});

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
  assert.equal(starter.title, "Europe trip · 15 Sept 2026");
  assert.deepEqual(starter.sections.map((section) => section.label), ["Calendar", "People & commitments", "Where you’re staying", "Flights & transport", "Money", "Visa, insurance & fixed items", "To-do list"]);
  assert.deepEqual(starter.sections.find((section) => section.sectionId === "itinerary").items.map((item) => item.fields.title), ["London", "Paris", "Northern Italy"]);
  assert.equal(starter.sections.find((section) => section.sectionId === "itinerary").items.find((item) => item.fields.title === "London").fields.start, "2026-09-15");
  assert.ok(starter.sections.find((section) => section.sectionId === "itinerary").fields.some((field) => field.fieldId === "kind" && field.inputType === "select"));
  assert.ok(starter.sections.find((section) => section.sectionId === "itinerary").fields.some((field) => field.fieldId === "reference" && field.inputType === "url"));
  assert.ok(starter.sections.find((section) => section.sectionId === "itinerary").fields.some((field) => field.fieldId === "timeZone"));
  assert.ok(starter.sections.find((section) => section.sectionId === "people").fields.some((field) => field.fieldId === "relatedTo"));
  assert.ok(starter.sections.find((section) => section.sectionId === "stays").fields.some((field) => field.fieldId === "website" && field.inputType === "url"));
  assert.ok(starter.sections.find((section) => section.sectionId === "stays").fields.some((field) => field.fieldId === "bookingStatus"));
  assert.ok(starter.sections.find((section) => section.sectionId === "stays").fields.some((field) => field.fieldId === "totalBudget"));
  assert.ok(starter.sections.find((section) => section.sectionId === "stays").fields.some((field) => field.fieldId === "priceState"));
  assert.ok(starter.sections.find((section) => section.sectionId === "transport").fields.some((field) => field.fieldId === "endTime"));
  assert.ok(starter.sections.find((section) => section.sectionId === "transport").fields.some((field) => field.fieldId === "arrivalTimeZone"));
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

test("a natural travel brief turns stated nights and base currency into real plan facts", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_hobart_nights", version: 1, status: "waiting_for_codex",
    rawOutcome: "Plan a three-night Hobart trip departing Sydney on 16 October 2026 with an NZD 2,600 total budget.", structured: { planningMode: "codex" }, attachments: [], inputs: [], pendingClarification: null, interpretation: null,
    lastOperatorCheckpoint: null, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z", checksum: "a".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.equal(starter.overview.start, "2026-10-16");
  assert.equal(starter.overview.end, "2026-10-19");
  assert.equal(starter.overview.totalBudget, "2600");
  assert.equal(starter.overview.currency, "NZD");
});

test("plan overview settings support a timed single-day event and category allocations above 100 percent", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_overview", version: 6, status: "waiting_for_codex", rawOutcome: "Plan a one-day event.", structured: { planningMode: "manual" }, attachments: [], pendingClarification: null,
    inputs: [
      { inputId: "arrival_input_arrival_overview_2", kind: "correction", payload: { workspaceOperation: "overview", moduleId: "overview", fields: { start: "2026-10-03", end: "2026-10-04", singleDay: true, includeTime: true, startTime: "09:00", endTime: "23:30", timeZone: "Australia/Sydney", totalBudget: "1000", currency: "aud" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:00.000Z" },
      { inputId: "arrival_input_arrival_overview_3", kind: "detail", payload: { workspaceOperation: "add", moduleId: "money", recordId: "category_venue", label: "Venue", fields: { title: "Venue", amount: "750", currency: "AUD", moneyRole: "cost" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:01.000Z" },
      { inputId: "arrival_input_arrival_overview_4", kind: "detail", payload: { workspaceOperation: "add", moduleId: "money", recordId: "category_food", label: "Food", fields: { title: "Food", amount: "500", currency: "AUD", moneyRole: "cost" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:02.000Z" },
      { inputId: "arrival_input_arrival_overview_5", kind: "correction", payload: { workspaceOperation: "overview", moduleId: "overview", fields: { totalBudget: "1000", currency: "nzd", moneyState: "positive" } }, sourceSurface: "site", createdAt: "2026-08-28T00:00:03.000Z" },
    ],
    interpretation: null, lastOperatorCheckpoint: 0, createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:02.000Z", checksum: "e".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.deepEqual(starter.overview, {
    start: "2026-10-03", end: "2026-10-03", datesProvisional: false, singleDay: true, includeTime: true, startTime: "09:00", endTime: "23:30", timeZone: "Australia/Sydney", totalBudget: "1000", currency: "NZD", moneyState: "positive", budgetProvisional: false,
    categories: starter.overview.categories, categoryAllocated: 1250, categoryPercent: 125,
  });
  assert.ok(starter.sections.flatMap((section) => section.items).filter((item) => item.fields.currency).every((item) => item.fields.currency === "NZD"));
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
  assert.equal(starter.title, "Dinner party");
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

test("workspace options stay outside plan maths and records until a person promotes one", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_options", version: 10, status: "proposed_plan_ready", rawOutcome: "Plan a flexible Europe trip.", structured: {}, attachments: [], pendingClarification: null,
    inputs: [
      { inputId: "arrival_option_arrival_options_7", kind: "detail", payload: { workspaceOperation: "option_add", moduleId: "transport", recordId: "option_munich", parentRecordId: "arrival_flight", optionSource: "codex", label: "Arrive Munich", fields: { title: "Arrive Munich", from: "Australia", to: "Munich", cost: "1400", currency: "AUD", provisional: true } }, sourceSurface: "codex", createdAt: "2026-08-29T00:00:00.000Z" },
      { inputId: "arrival_option_arrival_options_8", kind: "detail", payload: { workspaceOperation: "option_update", moduleId: "transport", recordId: "option_munich", optionSource: "codex", fields: { notes: "Closest to Oktoberfest." } }, sourceSurface: "codex", createdAt: "2026-08-29T00:00:01.000Z" },
      { inputId: "arrival_input_arrival_options_9", kind: "detail", payload: { workspaceOperation: "option_add", moduleId: "transport", recordId: "option_frankfurt", label: "Arrive Frankfurt", fields: { title: "Arrive Frankfurt", from: "Australia", to: "Frankfurt", cost: "1200", currency: "AUD", provisional: true } }, sourceSurface: "site", createdAt: "2026-08-29T00:00:02.000Z" },
      { inputId: "arrival_input_arrival_options_10", kind: "correction", payload: { workspaceOperation: "option_promote", moduleId: "transport", recordId: "option_frankfurt", targetRecordId: "manual_frankfurt" }, sourceSurface: "site", createdAt: "2026-08-29T00:00:03.000Z" },
    ],
    interpretation: { basedOnVersion: 6, inferredFamily: "travel", summary: "A flexible Europe arrival.", known: {}, inferred: {}, missing: [], contradictions: [], dependencies: [], savedOperatorWork: {}, complete: true, stagedAt: "2026-08-29T00:00:00.000Z" },
    lastOperatorCheckpoint: 6, createdAt: "2026-08-29T00:00:00.000Z", updatedAt: "2026-08-29T00:00:03.000Z", checksum: "e".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  const transport = starter.sections.find((section) => section.sectionId === "transport");
  assert.deepEqual(transport.options.map((option) => option.itemId), ["option_munich"]);
  assert.equal(transport.options[0].source, "working");
  assert.equal(transport.options[0].parentRecordId, "arrival_flight");
  assert.equal(transport.options[0].fields.notes, "Closest to Oktoberfest.");
  assert.equal(transport.items.find((item) => item.itemId === "manual_frankfurt").fields.to, "Frankfurt");
  assert.equal(transport.items.find((item) => item.itemId === "manual_frankfurt").source, "human");
  assert.equal(starter.overview.categoryAllocated, 4100);
  assert.equal(starter.laterHumanInputs.length, 2);
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
  assert.equal(starter.title, "Europe trip");
  assert.equal(starter.sections.length, 7);
  assert.equal(starter.sections.find((section) => section.sectionId === "itinerary").items[0].fields.location, "Berlin");
  assert.deepEqual(starter.sections.find((section) => section.sectionId === "itinerary").comments, [{ commentId: "comment_1", text: "Move this after Munich", forCodex: false }]);
  assert.deepEqual(starter.sections.find((section) => section.sectionId === "money").comments, [{ commentId: "comment_2", text: "Research a safer daily allowance", forCodex: true }]);
});

test("a Codex-first order can cross into the manual workspace without claiming Codex processed it", () => {
  const takeover = { inputId: "arrival_input_arrival_takeover_2", kind: "preference", payload: { workspaceOperation: "manual_takeover", planningMode: "manual" }, sourceSurface: "site", createdAt: "2026-08-29T00:00:01.000Z" };
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_takeover", version: 2, status: "waiting_for_codex", rawOutcome: "Plan a weekend trip to Hobart for two people.", structured: { planningMode: "codex" }, attachments: [], pendingClarification: null,
    inputs: [takeover], interpretation: null, lastOperatorCheckpoint: 0, createdAt: "2026-08-29T00:00:00.000Z", updatedAt: "2026-08-29T00:00:01.000Z", checksum: "f".repeat(64),
  };
  assert.equal(arrivalUsesManualWorkspace(order), true);
  assert.equal(arrivalInputIsWorkflowOnly(takeover), true);
  const starter = starterPlanForArrival(order);
  assert.equal(starter.family, "travel");
  assert.equal(order.interpretation, null);
  assert.equal(starter.interpretationIsCurrent, true);
  assert.equal(starter.laterHumanInputs.length, 0);
});

test("a copied Codex handoff can open a populated editable workspace without changing the plan to manual mode", () => {
  const waitingWorkspace = { inputId: "arrival_input_arrival_waiting_2", kind: "preference", payload: { workspaceOperation: "codex_handoff_workspace", planningMode: "codex" }, sourceSurface: "site", createdAt: "2026-08-30T00:00:01.000Z" };
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_waiting", version: 2, status: "waiting_for_codex", rawOutcome: "Plan a dinner party at home for 10 people on Saturday with a budget of AUD 500.", structured: { planningMode: "codex" }, attachments: [], pendingClarification: null,
    inputs: [waitingWorkspace], interpretation: null, lastOperatorCheckpoint: 0, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:01.000Z", checksum: "e".repeat(64),
  };
  assert.equal(arrivalUsesCodexWaitingWorkspace(order), true);
  assert.equal(arrivalUsesManualWorkspace(order), false);
  assert.equal(arrivalInputIsWorkflowOnly(waitingWorkspace), true);
  const starter = starterPlanForArrival(order);
  assert.equal(starter.family, "event");
  assert.ok(starter.sections.find((section) => section.sectionId === "schedule").items.length > 0);
  assert.ok(starter.sections.find((section) => section.sectionId === "tasks").items.length > 0);
  assert.equal(starter.laterHumanInputs.length, 0);
});

test("a Codex-first order exposes its populated rough plan immediately without a workflow marker", () => {
  const order = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_codex_immediate", version: 1, status: "waiting_for_codex", rawOutcome: "Plan a dinner party at home for 10 people on Saturday with an AUD 500 budget.", structured: { planningMode: "codex" }, attachments: [], pendingClarification: null,
    inputs: [], interpretation: null, lastOperatorCheckpoint: 0, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", checksum: "a".repeat(64),
  };
  const starter = starterPlanForArrival(order);
  assert.equal(starter.family, "event");
  assert.ok(starter.sections.find((section) => section.sectionId === "schedule").items.length > 0);
  assert.ok(starter.sections.find((section) => section.sectionId === "tasks").items.length > 0);
});

test("a dinner handoff opens as a detailed editable draft with section questions and human answers", () => {
  const base = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_dinner_draft", version: 1, status: "waiting_for_codex", rawOutcome: "Plan a dinner party at home for 10 people on Saturday 17 October 2026 with an AUD 500 budget. Two guests are vegetarian, one has a nut allergy, and most preparation should be done before guests arrive.", structured: { planningMode: "codex" }, attachments: [], pendingClarification: null,
    inputs: [], interpretation: null, lastOperatorCheckpoint: 0, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", checksum: "b".repeat(64),
  };
  const starter = starterPlanForArrival(base);
  assert.equal(starter.overview.start, "2026-10-17");
  assert.equal(starter.overview.end, "2026-10-17");
  assert.equal(starter.overview.totalBudget, "500");
  assert.equal(starter.overview.currency, "AUD");
  assert.equal(starter.sections.find((section) => section.sectionId === "schedule").items.length, 7);
  assert.equal(starter.sections.find((section) => section.sectionId === "scope").items.length, 2);
  assert.equal(starter.sections.find((section) => section.sectionId === "custom_menu_dietary").items.length, 3);
  assert.equal(starter.sections.find((section) => section.sectionId === "resources").items.length, 3);
  assert.equal(starter.sections.find((section) => section.sectionId === "requirements").items.length, 3);
  assert.equal(starter.sections.find((section) => section.sectionId === "tasks").items.length, 7);
  assert.equal(starter.sections.find((section) => section.sectionId === "money").items.filter((item) => item.fields.moneyRole === "cost").length, 4);
  const safety = starter.sections.find((section) => section.sectionId === "requirements");
  assert.match(safety.openQuestions[0].prompt, /allergy/i);

  const answered = starterPlanForArrival({ ...base, version: 2, inputs: [{ inputId: "arrival_input_arrival_dinner_draft_2", kind: "answer", payload: { workspaceOperation: "question_answer", moduleId: "requirements", questionId: "requirements_question_1", question: safety.openQuestions[0].prompt, answer: "Avoid trace cross-contact and may-contain ingredients." }, sourceSurface: "site", createdAt: "2026-08-30T00:00:01.000Z" }] });
  const answeredSafety = answered.sections.find((section) => section.sectionId === "requirements");
  assert.equal(answeredSafety.openQuestions.length, 0);
  assert.equal(answeredSafety.answers[0].answer, "Avoid trace cross-contact and may-contain ingredients.");
});

test("custom sections survive human and Codex creation, accept normal records, and can be removed", () => {
  const base = {
    orderVersion: "finite-arrival-order.v1", orderId: "arrival_custom_workspace", version: 5, status: "waiting_for_codex", rawOutcome: "Prepare for a job interview.", structured: { planningMode: "manual" }, attachments: [], pendingClarification: null,
    inputs: [
      { inputId: "arrival_input_arrival_custom_workspace_2", kind: "detail", payload: { workspaceOperation: "module_add", moduleId: "custom_interview_evidence", moduleSource: "human", label: "Interview evidence", description: "Connect competencies to proof.", variant: "cards", fields: [{ fieldId: "title", label: "Competency", inputType: "text" }, { fieldId: "example", label: "Example", inputType: "textarea" }, { fieldId: "result", label: "Result", inputType: "textarea" }] }, sourceSurface: "site", createdAt: "2026-08-29T00:00:00.000Z" },
      { inputId: "arrival_input_arrival_custom_workspace_3", kind: "detail", payload: { workspaceOperation: "add", moduleId: "custom_interview_evidence", recordId: "manual_story", label: "Prioritisation", fields: { title: "Prioritisation", example: "Replanned a live launch.", result: "Shipped without missing the customer deadline." } }, sourceSurface: "site", createdAt: "2026-08-29T00:00:01.000Z" },
      { inputId: "arrival_operator_arrival_custom_workspace_4", kind: "operator_work", payload: { workspaceOperation: "module_add", moduleId: "custom_questions", moduleSource: "codex", label: "Questions & signals", description: "Track questions and the evidence to listen for.", variant: "checklist", fields: [{ fieldId: "title", label: "Question", inputType: "text" }, { fieldId: "notes", label: "Signals", inputType: "textarea" }] }, sourceSurface: "codex", createdAt: "2026-08-29T00:00:02.000Z" },
    ],
    interpretation: null, lastOperatorCheckpoint: 0, createdAt: "2026-08-29T00:00:00.000Z", updatedAt: "2026-08-29T00:00:02.000Z", checksum: "1".repeat(64),
  };
  const starter = starterPlanForArrival(base);
  const evidence = starter.sections.find((section) => section.sectionId === "custom_interview_evidence");
  assert.equal(evidence.custom, true);
  assert.equal(evidence.customSource, "human");
  assert.deepEqual(evidence.fields.map((field) => field.fieldId), ["title", "example", "result"]);
  assert.equal(evidence.items[0].fields.result, "Shipped without missing the customer deadline.");
  assert.equal(starter.sections.find((section) => section.sectionId === "custom_questions").customSource, "working");

  const removed = starterPlanForArrival({ ...base, version: 6, inputs: [...base.inputs, { inputId: "arrival_input_arrival_custom_workspace_5", kind: "correction", payload: { workspaceOperation: "module_delete", moduleId: "custom_interview_evidence" }, sourceSurface: "site", createdAt: "2026-08-29T00:00:03.000Z" }] });
  assert.equal(removed.sections.some((section) => section.sectionId === "custom_interview_evidence"), false);
  assert.equal(removed.sections.some((section) => section.sectionId === "custom_questions"), true);
});
