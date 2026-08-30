import test from "node:test";
import assert from "node:assert/strict";
import { ClickActivationTimer } from "../dist-test/src/activation-sequence-timing.js";

test("click activation timing reports only bounded phase metrics", async () => {
  let clock = 100;
  const timer = new ClickActivationTimer(() => clock);
  await timer.measure("draftPreparation", async () => { clock += 12.34; });
  timer.measureSync("localConfirmation", () => { clock += 0.26; });
  clock += 2.4;
  const receipt = timer.finish("ready", {
    measurementVersion: "finite-plan-activation-sequence-timing.v1",
    challenge: null,
    initialize: null,
  });

  assert.deepEqual(receipt, {
    measurementVersion: "finite-click-activation-timing.v1",
    outcome: "ready",
    totalMs: 15,
    phaseTotalMs: 12.6,
    unattributedMs: 2.4,
    phases: { draftPreparation: 12.3, localConfirmation: 0.3 },
    guarded: {
      measurementVersion: "finite-plan-activation-sequence-timing.v1",
      challenge: null,
      initialize: null,
    },
  });
  assert.doesNotMatch(JSON.stringify(receipt), /planId|arrival|user|scope|hash|content/i);
});
