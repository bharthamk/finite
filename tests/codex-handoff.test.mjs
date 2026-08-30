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
  assert.match(handoff.detail, /first ask where you want to watch/i);
  assert.match(handoff.detail, /Next click/i);
  assert.match(handoff.prompt, /three-night Hobart trip/i);
  assert.match(handoff.prompt, /pauseForNext true/);
  assert.match(handoff.prompt, /fully specified synthetic template/i);
  assert.match(handoff.prompt, /Run five prepared chapters/i);
  assert.match(handoff.prompt, /ordinary blank starting screen headed 'What are you trying to make happen\?'/i);
  assert.match(handoff.prompt, /with no plan created/i);
  assert.match(handoff.prompt, /This is where every Finite plan begins\. Start with an idea, describe what you want to make happen, or add the details yourself\./i);
  assert.match(handoff.prompt, /same ordinary first form as a new user/i);
  assert.match(handoff.prompt, /What do you want to plan\?/i);
  assert.match(handoff.prompt, /idea labelled 'Weekend trip'/i);
  assert.match(handoff.prompt, /target plan_ideas/i);
  assert.match(handoff.prompt, /Templates give you a ready-made starting point\. I’ll choose Weekend trip, then change it to fit this example\./i);
  assert.match(handoff.prompt, /target planning_window/i);
  assert.match(handoff.prompt, /Now I’ll make the template specific: who is going, when, the budget, the pace, and what matters most\./i);
  assert.match(handoff.prompt, /visibly change the suggested sentence/i);
  assert.match(handoff.prompt, /target build_method/i);
  assert.match(handoff.prompt, /Of course, you can still build your plan manually\. I’ll switch over and add the same trip step by step\./i);
  assert.match(handoff.prompt, /click the visible tab labelled 'Build it myself'/i);
  assert.match(handoff.prompt, /target manual_details/i);
  assert.match(handoff.prompt, /Now I’ll add the same trip as a few simple details\. Anything we didn’t know could be left blank\./i);
  assert.match(handoff.prompt, /visibly fill every structured field/i);
  assert.match(handoff.prompt, /MONA visit: https:\/\/mona\.net\.au\/visit/i);
  assert.match(handoff.prompt, /Hobart guide: https:\/\/www\.discovertasmania\.com\.au\/regions\/hobart-and-south\/hobart\//i);
  assert.match(handoff.prompt, /Weather: https:\/\/www\.bom\.gov\.au\/tas\/forecasts\//i);
  assert.match(handoff.prompt, /do not call finite_create_arrival_order/i);
  assert.match(handoff.prompt, /do not submit either starting method yet/i);
  assert.match(handoff.prompt, /Open my workspace/i);
  assert.match(handoff.prompt, /structured details are visibly present but still unsubmitted/i);
  assert.match(handoff.prompt, /That’s enough to open a useful first plan\. Everything here can still be changed, and anything left blank can be added later\./i);
  assert.match(handoff.prompt, /The top bar keeps the essentials close: switch or create plans, share or invite people, hand work to Codex, see whether Codex view is on, and open the menu\. We’ll return to each when it matters\./i);
  assert.match(handoff.prompt, /orienting the person without operating any header control/i);
  assert.doesNotMatch(handoff.prompt, /four ordinary routes/i);
  assert.doesNotMatch(handoff.prompt, /route labelled 'Start fresh'/i);
  assert.match(handoff.prompt, /explicitly say next, proceed, keep going, continue, or equivalent in Codex/i);
  assert.match(handoff.prompt, /click Finite's visible Next control for them/i);
  assert.match(handoff.prompt, /Never make them switch screens merely to advance the demo/i);
  assert.match(handoff.prompt, /keep the Codex turn alive/i);
  assert.match(handoff.prompt, /Every Next gate is already a natural pause/i);
  assert.match(handoff.prompt, /ask Codex a question or tell it to keep going/i);
  assert.match(handoff.prompt, /GUIDE_WAITING_FOR_PERSON/i);
  assert.match(handoff.prompt, /synthetic rainy-day change/i);
  assert.match(handoff.prompt, /finite_save_workspace_records/i);
  assert.match(handoff.prompt, /operator-editable provisional record/i);
  assert.match(handoff.prompt, /Do not call finite_append_arrival_input/i);
  assert.match(handoff.prompt, /Do not use the human 'Add to request' form/i);
  assert.match(handoff.prompt, /Do not approve, start managing, compile away from/i);
  assert.match(handoff.prompt, /plan_summary target/i);
  assert.match(handoff.prompt, /keep every workspace section collapsed/i);
  assert.match(handoff.prompt, /This is your plan at a glance\. Dates, budget, remaining money, and open work stay visible here/i);
  assert.match(handoff.prompt, /budget_editor target/i);
  assert.match(handoff.prompt, /Amount from 2400 to 2600 and Base currency from AUD to NZD/i);
  assert.match(handoff.prompt, /does not pretend to perform a live exchange conversion/i);
  assert.match(handoff.prompt, /NZD 2,600 total, NZD 2,400 allocated, 92% assigned, and NZD 200 still available/i);
  assert.doesNotMatch(handoff.prompt, /Use finite_guide_view on the priority target to explain the plan-at-a-glance summary/i);
  assert.match(handoff.prompt, /Do not approve the plan, start managing, create human authority/i);
  assert.match(handoff.prompt, /Pause demo at any time/i);
  assert.match(handoff.prompt, /Your first interaction with the person must be this exact question, with no browser action or Finite action before it/i);
  assert.match(handoff.prompt, /Where would you like to watch me run Finite: in a controlled browser window, or in the Codex built-in browser\?/i);
  assert.match(handoff.prompt, /Wait for their explicit answer/i);
  assert.match(handoff.prompt, /Do not infer the choice from open tabs, ambient browser context/i);
  assert.ok(handoff.prompt.indexOf("Where would you like to watch me run Finite") < handoff.prompt.indexOf("Finite at https://finite.example is the live plan surface"));
  assert.match(handoff.prompt, /choose a controlled browser window/i);
  assert.match(handoff.prompt, /exactly one visible controlled browser instance/i);
  assert.match(handoff.prompt, /choose the Codex built-in browser/i);
  assert.match(handoff.prompt, /claim an already-open user-owned Finite tab when one exists/i);
  assert.match(handoff.prompt, /Do not switch browser surfaces after the choice/i);
  assert.match(handoff.prompt, /stop without making any Finite call or page change/i);
  assert.match(handoff.prompt, /GUIDE_PAUSED_FOR_QUESTION/);
  assert.match(handoff.prompt, /pausedAt surface, target, targetLabel, and message/i);
  assert.match(handoff.prompt, /continue from the exact next chapter without restarting/i);
  assert.match(handoff.prompt, /never ask the person to type, choose, confirm, or operate the product/i);
  assert.match(handoff.prompt, /Demo complete\. Ask me anything/i);
  assert.match(handoff.prompt, /Do not ask the person for missing facts or decisions/i);
  assert.doesNotMatch(handoff.prompt, /End at a real human decision boundary/i);
  assert.doesNotMatch(handoff.prompt, /return to the human only when their judgment/i);
});

test("basic demo stops after the editable plan appears", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: false,
    guidedWalkthrough: true,
    demoPlayback: true,
    demoDepth: "basics",
    order: null,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 1, snapshotHash: null },
  });
  assert.match(handoff.prompt, /Run two prepared chapters/i);
  assert.match(handoff.prompt, /Basics complete/i);
  assert.doesNotMatch(handoff.prompt, /synthetic rainy-day change/i);
  assert.doesNotMatch(handoff.prompt, /custom_weather_watch/i);
});

test("complete demo adds safe custom and comparison capabilities", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: false,
    guidedWalkthrough: true,
    demoPlayback: true,
    demoDepth: "complete",
    order: null,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 1, snapshotHash: null },
  });
  assert.match(handoff.prompt, /Run seven prepared chapters/i);
  assert.match(handoff.prompt, /finite_save_workspace_module/i);
  assert.match(handoff.prompt, /custom_weather_watch/i);
  assert.match(handoff.prompt, /finite_save_workspace_option/i);
  assert.match(handoff.prompt, /outside plan maths and commitments/i);
  assert.match(handoff.prompt, /Full tour complete/i);
});
