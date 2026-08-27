import assert from "node:assert/strict";
import test from "node:test";

import { reconcileScopedSurfaceMessage } from "../dist-test/src/surface-message.js";

test("surface messages remain attached to the state that produced them", () => {
  const current = { message: "Human confirmation recorded.", scope: "plan-a:r3:external-confirmed" };
  assert.deepEqual(reconcileScopedSurfaceMessage(current, current.scope), current);
});

test("surface messages are cleared when accepted or pending truth moves", () => {
  assert.deepEqual(
    reconcileScopedSurfaceMessage(
      { message: "Human confirmation recorded.", scope: "plan-a:r3:external-confirmed" },
      "plan-a:r4:settled",
    ),
    { message: "", scope: "plan-a:r4:settled" },
  );
});

test("an empty message adopts the live scope without inventing copy", () => {
  assert.deepEqual(
    reconcileScopedSurfaceMessage({ message: "", scope: "old" }, "new"),
    { message: "", scope: "new" },
  );
});
