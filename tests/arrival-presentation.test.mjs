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

test("a complete brief always yields a lightweight human-usable starter plan without model construction", () => {
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
      known: { budget: "A$10,000" },
      inferred: {},
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
  assert.equal(starter.title, "Travel starter plan");
  assert.equal(starter.stages.length, 5);
  assert.match(starter.stages[0].label, /Protect the fixed parts/);
  assert.deepEqual(starter.openItems, ["Friend visit dates are still open."]);
  assert.equal(starter.interpretationIsCurrent, true);
  assert.deepEqual(starter.laterHumanInputs, []);
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
      { inputId: "arrival_input_arrival_starter_2_7", kind: "correction", payload: { text: "Make it twelve guests, not ten." }, sourceSurface: "site", createdAt: "2026-08-28T00:03:00.000Z" },
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
  assert.equal(starter.title, "Event starter plan");
  assert.equal(starter.interpretationIsCurrent, false);
  assert.equal(starter.laterHumanInputs[0].payload.text, "Make it twelve guests, not ten.");
});
