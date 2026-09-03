import test from "node:test";
import assert from "node:assert/strict";
import { candidateTradeoffLines, floorRelationship, objectiveLabelForProfile } from "../dist-test/src/option-presentation.js";

test("zero-move option copy distinguishes viable and blocked routes", () => {
  assert.deepEqual(candidateTradeoffLines({ valid: true, selectedMoves: [] }), [
    "No additional compromise is required.",
  ]);
  assert.deepEqual(candidateTradeoffLines({ valid: false, selectedMoves: [] }), [
    "No available adjustment resolves all current limits.",
  ]);
});

test("named move tradeoffs remain the option explanation", () => {
  assert.deepEqual(candidateTradeoffLines({
    valid: false,
    selectedMoves: [{ tradeoff: "Use the backup room" }, { tradeoff: "Reduce the menu" }],
  }), ["Use the backup room", "Reduce the menu"]);
});

test("option objectives speak in the current plan family's language", () => {
  assert.equal(objectiveLabelForProfile("preserve_experience", "travel"), "Protect the experience");
  assert.equal(objectiveLabelForProfile("preserve_schedule", "travel"), "Protect the route");
  assert.equal(objectiveLabelForProfile("preserve_experience", "event"), "Protect the guest experience");
  assert.equal(objectiveLabelForProfile("preserve_schedule", "renovation"), "Protect the handover");
  assert.equal(objectiveLabelForProfile("preserve_experience", "general"), "Protect the outcome");
});

test("floor relationship copy distinguishes equality from a real surplus", () => {
  assert.equal(floorRelationship(499, 500), "below");
  assert.equal(floorRelationship(500, 500), "meets");
  assert.equal(floorRelationship(501, 500), "above");
});
