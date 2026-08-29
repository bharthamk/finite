import test from "node:test";
import assert from "node:assert/strict";
import { createCodexHandoff } from "../dist-test/src/codex-handoff.js";

const order = {
  orderId: "arrival_0123456789abcdef",
  version: 7,
  status: "waiting_for_codex",
  lastOperatorCheckpoint: 4,
  checksum: "a".repeat(64),
  rawOutcome: "SECRET PLAN CONTENT",
  attachments: [{ token: "SECRET_ATTACHMENT" }],
};

test("Codex handoff copies a safe bootstrap pointer rather than plan or authentication data", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example/private/plan?token=SECRET_URL_TOKEN",
    inline: false,
    order,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 3, snapshotHash: "c".repeat(64) },
    email: "private@example.test",
    credential: "SECRET_CREDENTIAL",
  });

  assert.equal(handoff.buttonLabel, "Hand off to Codex");
  assert.equal(handoff.copiedPayload.siteOrigin, "https://finite.example");
  assert.equal(handoff.copiedPayload.entryTool, "finite_enter_kitchen");
  assert.equal(handoff.copiedPayload.entryIntent, "resume_handoff");
  assert.equal(handoff.copiedPayload.expectedPlanId, "plan_travel_europe");
  assert.equal(handoff.copiedPayload.expectedProfileHash, "b".repeat(64));
  assert.equal(handoff.copiedPayload.expectedSnapshotHash, "c".repeat(64));
  assert.match(handoff.prompt, /finite_enter_kitchen/);
  assert.match(handoff.prompt, /arrival_0123456789abcdef/);
  assert.match(handoff.prompt, /no authentication, credentials, plan contents, or human authority/i);
  assert.match(handoff.prompt, /operatorPacket\.preMutationGate/);
  assert.match(handoff.prompt, /knownArgsComplete is false/);
  assert.match(handoff.prompt, /action-time confirmation/i);
  assert.match(handoff.prompt, /sensitive plan content through WebMCP/i);
  assert.match(handoff.prompt, /Do not ask permission merely to read and analyse canonical Site state/i);
  assert.match(handoff.prompt, /concrete save boundary/i);
  for (const secret of ["SECRET PLAN CONTENT", "SECRET_ATTACHMENT", "SECRET_URL_TOKEN", "private@example.test", "SECRET_CREDENTIAL"]) {
    assert.equal(handoff.prompt.includes(secret), false);
  }
});

test("Codex handoff remains useful before an arrival exists and adapts inside the inline browser", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: true,
    order: null,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 1, snapshotHash: null },
  });
  assert.equal(handoff.buttonLabel, "Hand off to Codex");
  assert.equal(handoff.title, "Start this with Codex.");
  assert.equal(handoff.copiedPayload.orderId, null);
  assert.equal(handoff.copiedPayload.entryIntent, "start_new");
  assert.equal(handoff.copiedPayload.expectedPlanId, null);
  assert.equal(handoff.copiedPayload.expectedPlanRevision, null);
  assert.equal(handoff.copiedPayload.expectedProfileHash, null);
  assert.equal(handoff.copiedPayload.expectedSnapshotHash, null);
  assert.match(handoff.prompt, /"entryIntent":"start_new"/);
  assert.equal(handoff.prompt.includes("expectedPlanId"), false);
  assert.equal(handoff.prompt.includes("orderId"), false);
  assert.match(handoff.detail, /this Codex task/i);
});

test("a custom agentic name changes presentation without rewriting the Codex operator protocol", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: false,
    agenticName: "Ari",
    order,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 3, snapshotHash: "c".repeat(64) },
  });
  assert.equal(handoff.buttonLabel, "Hand off to Ari");
  assert.equal(handoff.title, "Bring Ari into this plan.");
  assert.doesNotMatch(handoff.detail, /display name/i);
  assert.doesNotMatch(handoff.detail, /Ari/);
  assert.match(handoff.prompt, /Codex operator/);
  assert.doesNotMatch(handoff.prompt, /Ari/);
});
