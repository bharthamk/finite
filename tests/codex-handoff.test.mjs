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

test("current-plan guide adapts to canonical lifecycle state and remains read-only", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: false,
    guidedWalkthrough: true,
    guideCurrentPlan: true,
    guidePlanSurface: true,
    entryIntent: "continue_current",
    order: null,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 7, snapshotHash: "c".repeat(64) },
  });
  assert.match(handoff.detail, /this exact plan/i);
  assert.match(handoff.detail, /leave every plan value unchanged/i);
  assert.match(handoff.prompt, /live, read-only walkthrough of this exact current plan/i);
  assert.match(handoff.prompt, /https:\/\/finite\.example\/\?start=plan-guide-active&plan=1/i);
  assert.match(handoff.prompt, /Adapt the route to the plan's current lifecycle/i);
  assert.match(handoff.prompt, /Planning, Managing, or Wrap-up surface/i);
  assert.match(handoff.prompt, /pauseForNext true/i);
  assert.match(handoff.prompt, /GUIDE_WAITING_FOR_PERSON/);
  assert.match(handoff.prompt, /GUIDE_PAUSED_FOR_QUESTION/);
  assert.match(handoff.prompt, /leave plan data unchanged/i);
  assert.doesNotMatch(handoff.prompt, /three-night Hobart trip/i);
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
  assert.match(handoff.prompt, /Run six prepared chapters/i);
  assert.match(handoff.prompt, /Demo mode · Local only/i);
  assert.match(handoff.prompt, /start_managing target/i);
  assert.match(handoff.prompt, /Planning is where the draft takes shape/i);
  assert.match(handoff.prompt, /The plan is now in Managing/i);
  assert.match(handoff.prompt, /This is where a real-world change belongs/i);
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
  assert.match(handoff.prompt, /useful orientation without turning into an exhaustive feature tour/i);
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
  assert.match(handoff.prompt, /updates target with pauseForNext true/i);
  assert.match(handoff.prompt, /start_managing target with pauseForNext true/i);
  assert.match(handoff.prompt, /Planning is where the draft takes shape\. Start managing turns that draft into the live plan you use day to day/i);
  assert.match(handoff.prompt, /visible 'Demo mode · Local only' badge is still present/i);
  assert.match(handoff.prompt, /normal visible control labelled 'Start managing'/i);
  assert.match(handoff.prompt, /exact stage that contains the flexible nature day/i);
  assert.match(handoff.prompt, /This is where a real-world change belongs: on the live stage it affects, after the plan has started\./i);
  assert.match(handoff.prompt, /Heavy rain is forecast for Saturday/i);
  assert.match(handoff.prompt, /Save to plan/i);
  assert.match(handoff.prompt, /open the exact saved plan information for that stage, so the rainy-day text itself is visible/i);
  assert.ok(handoff.prompt.indexOf("Save to plan") < handoff.prompt.indexOf("open the exact saved plan information"));
  assert.match(handoff.prompt, /Do not approve, start managing, compile away from/i);
  assert.match(handoff.prompt, /plan_summary target/i);
  assert.match(handoff.prompt, /keep every workspace section collapsed/i);
  assert.match(handoff.prompt, /This is your plan at a glance\. Dates, budget, remaining money, and open work stay visible here/i);
  assert.match(handoff.prompt, /section_headers target/i);
  assert.match(handoff.prompt, /Each section keeps one part of the plan together\. Its header shows what belongs there, how many items and open questions it contains, and whether Codex is currently working there\./i);
  assert.match(handoff.prompt, /open only the real Calendar section/i);
  assert.match(handoff.prompt, /priority target with sectionId itinerary and pauseForNext true/i);
  assert.match(handoff.prompt, /Calendar shows how dates, places and activities connect/i);
  assert.match(handoff.prompt, /Do not tour every section/i);
  assert.doesNotMatch(handoff.prompt, /priority target with sectionId people/i);
  assert.ok(handoff.prompt.indexOf("section_headers target") < handoff.prompt.indexOf("budget_editor target"));
  assert.ok(handoff.prompt.indexOf("sectionId itinerary") < handoff.prompt.indexOf("budget_editor target"));
  assert.match(handoff.prompt, /budget_editor target/i);
  assert.match(handoff.prompt, /budget_editor target with pauseForNext true/i);
  assert.match(handoff.prompt, /Budgets change\. Edit the total or base currency here, and Finite updates the rest of the plan around it\. Next I’ll change both so you can see that happen\./i);
  assert.match(handoff.prompt, /Amount from 2400 to 2600 and Base currency from AUD to NZD/i);
  assert.match(handoff.prompt, /does not perform a live exchange conversion/i);
  assert.match(handoff.prompt, /NZD 2,600 total, NZD 2,400 allocated, 92% assigned, and NZD 200 still available/i);
  assert.doesNotMatch(handoff.prompt, /Use finite_guide_view on the priority target to explain the plan-at-a-glance summary/i);
  assert.match(handoff.prompt, /Do not approve, start managing, compile away from, or otherwise leave this editable workspace/i);
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

test("spotlight demo proves the native change-to-authority-to-receipt loop", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: false,
    guidedWalkthrough: true,
    demoPlayback: true,
    demoDepth: "spotlight",
    entryIntent: "continue_current",
    order: null,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 1, snapshotHash: null },
  });
  assert.match(handoff.detail, /one real plan change/i);
  assert.match(handoff.prompt, /start=spotlight-active&tour=spotlight&plan=1&fresh=1/);
  assert.match(handoff.prompt, /real already-active 18-day Europe plan/i);
  assert.match(handoff.prompt, /finite_record_change_event/i);
  assert.match(handoff.prompt, /Add three nights in Paris/i);
  assert.match(handoff.prompt, /costDeltaMinor = 66000/i);
  assert.match(handoff.prompt, /evidenceRefs = \[evidence_current\]/i);
  assert.match(handoff.prompt, /field: days, delta: 3/i);
  assert.match(handoff.prompt, /Use delta, never value/i);
  assert.match(handoff.prompt, /finite_compare_options/i);
  assert.match(handoff.prompt, /Use this option/i);
  assert.match(handoff.prompt, /Confirm and update plan/i);
  assert.match(handoff.prompt, /Do not click either control/i);
  assert.match(handoff.prompt, /human authority is present/i);
  assert.match(handoff.prompt, /finite_apply_approved_option/i);
  assert.match(handoff.prompt, /finite_get_effort_receipt/i);
  assert.match(handoff.prompt, /exactly one product decision/i);
  assert.equal(handoff.copiedPayload.entryIntent, "continue_current");
  assert.equal(handoff.copiedPayload.journeyIntent, "spotlight");
  assert.equal(handoff.copiedPayload.expectedPlanId, "plan_travel_europe");
  assert.match(handoff.prompt, /"journeyIntent":"spotlight"/);
  assert.doesNotMatch(handoff.prompt, /Run six prepared chapters/i);
  assert.doesNotMatch(handoff.prompt, /synthetic rainy-day change/i);
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

test("standard demo proves the product loop without touring every section", () => {
  const handoff = createCodexHandoff({
    siteOrigin: "https://finite.example",
    inline: false,
    guidedWalkthrough: true,
    demoPlayback: true,
    demoDepth: "standard",
    order: null,
    plan: { planId: "plan_travel_europe", profileId: "travel", profileHash: "b".repeat(64), revision: 1, snapshotHash: null },
  });
  assert.match(handoff.prompt, /useful orientation without turning into an exhaustive feature tour/i);
  assert.match(handoff.prompt, /open only the real Calendar section/i);
  assert.match(handoff.prompt, /continue directly to the budget change/i);
  assert.match(handoff.prompt, /Do not tour every section/i);
  assert.doesNotMatch(handoff.prompt, /continue through stays, transport, money, requirements and tasks/i);
  assert.match(handoff.prompt, /Start managing/i);
  assert.match(handoff.prompt, /rainy-day change/i);
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
  assert.match(handoff.prompt, /Run eight prepared chapters/i);
  assert.match(handoff.prompt, /click the separate 'Customise workspace' control/i);
  assert.match(handoff.prompt, /Do not click or focus 'Start managing'/i);
  assert.match(handoff.prompt, /workspace_customisation target with pauseForNext true/i);
  assert.match(handoff.prompt, /Every plan starts with the useful standard sections\. Customise workspace lets you add a specialist tracker only when this particular plan needs one\./i);
  assert.ok(handoff.prompt.indexOf("workspace_customisation target") < handoff.prompt.indexOf("budget_editor target"));
  assert.match(handoff.prompt, /finite_save_workspace_module/i);
  assert.match(handoff.prompt, /custom_weather_watch/i);
  assert.match(handoff.prompt, /finite_save_workspace_option/i);
  assert.match(handoff.prompt, /outside plan maths and commitments/i);
  assert.ok(handoff.prompt.indexOf("finite_save_workspace_option") < handoff.prompt.indexOf("start_managing target"));
  assert.match(handoff.prompt, /Full tour complete/i);
});
