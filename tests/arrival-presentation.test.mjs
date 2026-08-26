import test from "node:test";
import assert from "node:assert/strict";
import { humanLabel, inputKindLabel, inputSurfaceLabel, renderHumanValue, renderTextList } from "../dist-test/src/arrival-presentation.js";

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
