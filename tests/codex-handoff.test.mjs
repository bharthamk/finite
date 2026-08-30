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

test("guided handoff walks the real product without taking human input or authority", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: false,
    guidedWalkthrough: true,
    order: null,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 1, snapshotHash: null },
  });
  assert.match(handoff.detail, /real page/i);
  assert.match(handoff.prompt, /live guided walkthrough of the real product/i);
  assert.match(handoff.prompt, /finite_guide_view/);
  assert.match(handoff.prompt, /short, plain-language message/);
  assert.match(handoff.prompt, /Never type into a human field/);
  assert.match(handoff.prompt, /Pause after each step/);
});

test("live demo handoff runs a real template and waits for the person's Next click", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: false,
    guidedWalkthrough: true,
    demoPlayback: true,
    order: null,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 1, snapshotHash: null },
  });
  assert.match(handoff.detail, /real example/i);
  assert.match(handoff.detail, /Next click/i);
  assert.match(handoff.prompt, /three-night Hobart trip/i);
  assert.match(handoff.prompt, /pauseForNext true/);
  assert.match(handoff.prompt, /fully specified synthetic template/i);
  assert.match(handoff.prompt, /Run four prepared chapters/i);
  assert.match(handoff.prompt, /actual first page headed 'How do you want to begin\?'/i);
  assert.match(handoff.prompt, /four ordinary routes/i);
  assert.match(handoff.prompt, /route labelled 'Start fresh'/i);
  assert.match(handoff.prompt, /experience both the true first page and the ordinary first form/i);
  assert.match(handoff.prompt, /What do you want to plan\?/i);
  assert.match(handoff.prompt, /visibly type/i);
  assert.match(handoff.prompt, /character by character/i);
  assert.match(handoff.prompt, /do not call finite_create_arrival_order/i);
  assert.match(handoff.prompt, /Build my rough plan/i);
  assert.match(handoff.prompt, /visibly present but still unsubmitted/i);
  assert.match(handoff.prompt, /Next click is the complete continuation signal/i);
  assert.match(handoff.prompt, /do not ask them to type 'proceed'/i);
  assert.match(handoff.prompt, /keep the Codex turn alive/i);
  assert.match(handoff.prompt, /Every Next gate is already a natural pause/i);
  assert.match(handoff.prompt, /GUIDE_WAITING_FOR_PERSON/i);
  assert.match(handoff.prompt, /synthetic rainy-day change/i);
  assert.match(handoff.prompt, /Pause demo at any time/i);
  assert.match(handoff.prompt, /GUIDE_PAUSED_FOR_QUESTION/);
  assert.match(handoff.prompt, /pausedAt surface, target, targetLabel, and message/i);
  assert.match(handoff.prompt, /continue from the exact next chapter without restarting/i);
  assert.match(handoff.prompt, /never ask the person to type, choose, confirm, or operate the product/i);
  assert.match(handoff.prompt, /Demo complete\. Ask me anything/i);
  assert.match(handoff.prompt, /Do not ask the person for missing facts or decisions/i);
  assert.doesNotMatch(handoff.prompt, /End at a real human decision boundary/i);
  assert.doesNotMatch(handoff.prompt, /return to the human only when their judgment/i);
});
