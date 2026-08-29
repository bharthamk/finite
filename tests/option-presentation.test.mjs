import test from "node:test";
import assert from "node:assert/strict";
import { candidateTradeoffLines } from "../dist-test/src/option-presentation.js";

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
