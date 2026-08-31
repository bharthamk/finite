import type { ArrivalOrder } from "./arrival.js";

export type DemoDepth = "basics" | "standard" | "complete";

export interface CodexHandoffContext {
  siteOrigin: string;
  inline: boolean;
  agenticName?: string;
  guidedWalkthrough?: boolean;
  demoPlayback?: boolean;
  demoDepth?: DemoDepth;
  entryIntent?: "start_new" | "continue_current" | "resume_handoff";
  order: Pick<ArrivalOrder, "orderId" | "version" | "status" | "lastOperatorCheckpoint" | "checksum"> | null;
  plan: { planId: string; profileId: string; profileHash: string; revision: number; snapshotHash: string | null };
}

export interface CodexHandoff {
  handoffVersion: "finite-codex-handoff.v1";
  buttonLabel: string;
  title: string;
  detail: string;
  prompt: string;
  copiedPayload: {
    siteOrigin: string;
    entryTool: "finite_enter_kitchen";
    entryIntent: "start_new" | "continue_current" | "resume_handoff";
    orderId: string | null;
    expectedOrderVersion: number | null;
    expectedOrderChecksum: string | null;
    expectedPlanId: string | null;
    expectedPlanRevision: number | null;
    expectedProfileHash: string | null;
    expectedSnapshotHash: string | null;
  };
}

const cleanOrigin = (value: string): string => {
  const parsed = new URL(value);
  return parsed.origin;
};

export const createCodexHandoff = (context: CodexHandoffContext): CodexHandoff => {
  const siteOrigin = cleanOrigin(context.siteOrigin);
  const agenticName = context.agenticName?.trim() || "Codex";
  const order = context.order;
  const guidedWalkthrough = context.guidedWalkthrough === true;
  const demoPlayback = context.demoPlayback === true;
  const demoDepth: DemoDepth = context.demoDepth ?? "standard";
  const entryIntent = context.entryIntent ?? (order ? "resume_handoff" : "start_new");
  const toolInput = {
    entryIntent,
    ...(order ? {
      orderId: order.orderId,
      expectedOrderVersion: order.version,
      expectedOrderChecksum: order.checksum,
    } : {}),
    ...(entryIntent === "start_new" ? {} : {
      expectedPlanId: context.plan.planId,
      expectedPlanRevision: context.plan.revision,
      expectedProfileHash: context.plan.profileHash,
      ...(context.plan.snapshotHash ? { expectedSnapshotHash: context.plan.snapshotHash } : {}),
    }),
  };
  const prompt = [
    entryIntent === "start_new" ? "Start a new Finite plan as the Codex operator." : "Take over this Finite plan as the Codex operator.",
    "",
    "Your first interaction with the person must be this exact question, with no browser action or Finite action before it: Where would you like to watch me run Finite: in a controlled browser window, or in the Codex built-in browser? Wait for their explicit answer. Do not infer the choice from open tabs, ambient browser context, or the browser in which they copied this prompt.",
    "If they choose a controlled browser window, open or attach exactly one visible controlled browser instance at the Finite Site origin, bring it to the foreground, and keep using that same visible tab for the entire run. Do not also open or operate Finite in the Codex built-in browser.",
    "If they choose the Codex built-in browser, claim an already-open user-owned Finite tab when one exists; otherwise open exactly one Finite tab there. Keep the built-in browser visibly presented and use that same tab for the entire run. Do not also open or operate a background duplicate or a Chrome tab.",
    "Do not switch browser surfaces after the choice unless the person explicitly asks. Before discovering or calling any page tool, verify that the selected tab is visible to the person and is at the Finite Site origin. If the selected surface cannot be presented, stop without making any Finite call or page change and tell the person that their chosen browser is not visible.",
    "",
    demoPlayback
      ? `Finite at ${siteOrigin} is the live plan surface. Run the synthetic demonstration entirely for the person. They may click Next in Finite when ready for another chapter, or explicitly say next, proceed, or keep going in Codex and have you activate the visible Next control for them.`
      : `Finite at ${siteOrigin} is the live plan surface. Operate the application for the person while keeping their preferences, decisions, and approval with them.`,
    ...(demoPlayback ? [
      "",
      "Run Finite's live product demo using its real interface and a fully specified synthetic template: a three-night Hobart trip for two adults departing Sydney on 16 October 2026, with an AUD 2,400 total budget, an easy pace, and priorities of MONA, excellent local food, and one flexible nature day. Supply every example fact yourself, operate Finite through its normal visible interface and page tools, and never ask the person to type, choose, confirm, or operate the product. This guided demo is browser-local: the visible 'Demo mode · Local only' badge must be present before any write. Build real saved local state rather than a simulation. Planning may cross into Managing only at the prepared Start managing chapter after its visible Next gate; never enter booking, payment, confirmation, external action, or any other real-world consequential flow.",
      `${demoDepth === "basics" ? "Run two prepared chapters" : demoDepth === "complete" ? "Run eight prepared chapters" : "Run six prepared chapters"}. Chapter one must begin on Finite's ordinary blank starting screen headed 'What are you trying to make happen?', with no plan created and the first field labelled 'What do you want to plan?' visible. After entering Finite, call finite_guide_view on the arrival surface and top target with pauseForNext false so the selected browser shows that exact unsaved form. Use this exact overlay message: This is where every Finite plan begins. Start with an idea, describe what you want to make happen, or add the details yourself. Then call finite_guide_view on target plan_ideas with pauseForNext false using this exact overlay message: Templates give you a ready-made starting point. I’ll choose Weekend trip, then change it to fit this example. Use the normal visible interface to click the idea labelled 'Weekend trip'. Do not assign field values through the DOM.`,
      "Next call finite_guide_view on target planning_window with pauseForNext false using this exact overlay message: Now I’ll make the template specific: who is going, when, the budget, the pace, and what matters most. Focus the visible 'What do you want to plan?' field and visibly change the suggested sentence into this complete brief using normal keyboard input: Plan a three-night Hobart trip for two adults departing Sydney on 16 October 2026, with an AUD 2,400 total budget, an easy pace, MONA, excellent local food, and one flexible nature day. The person must see the template become their own plan inside the planning window.",
      "Next call finite_guide_view on target build_method with pauseForNext false using this exact overlay message: Of course, you can still build your plan manually. I’ll switch over and add the same trip step by step. Then click the visible tab labelled 'Build it myself'. Call finite_guide_view on target manual_details with pauseForNext false using this exact overlay message: Now I’ll add the same trip as a few simple details. Anything we didn’t know could be left blank. Then visibly fill every structured field through the normal interface: What are you planning? = Plan a three-night Hobart trip for two adults from Sydney; When? = Depart Sydney 16 October 2026 and return after three nights; What is limited? = AUD 2,400 total budget and an easy pace; What must not change? = Include MONA, excellent local food, and keep one nature day flexible for weather; Useful references = MONA visit: https://mona.net.au/visit · Hobart guide: https://www.discovertasmania.com.au/regions/hobart-and-south/hobart/ · Weather: https://www.bom.gov.au/tas/forecasts/. Do not call finite_create_arrival_order and do not submit either starting method yet.",
      "Once those structured details are visibly present but still unsubmitted, call finite_guide_view on target manual_details with pauseForNext true using this exact overlay message: That’s enough to open a useful first plan. Everything here can still be changed, and anything left blank can be added later. This is Chapter one's natural pause: the visible overlay must show Next and tell the person they may ask Codex questions. The person must experience the same ordinary first form as a new user before anything is saved.",
      "At any Next gate, the person may continue in either place. If they click Next in Finite, retry the intended finite_guide_view call with pauseForNext false until Finite releases it. If they explicitly say next, proceed, keep going, continue, or equivalent in Codex, treat that as the same continuation signal: use the normal visible interface to click Finite's visible Next control for them, then retry the intended guide call. Never make them switch screens merely to advance the demo, and never infer continuation from unrelated conversation. Only after the form gate releases, use the visible page control labelled 'Open my workspace' to submit the active manual form; the real interface must create the saved starting point.",
      ...(demoDepth === "basics" ? [
        "Chapter two begins by orienting the person without operating any header control. Use finite_guide_view on the top target with pauseForNext true and this exact overlay message: The top bar keeps the essentials close: switch or create plans, share or invite people, hand work to Codex, see whether Codex view is on, and open the menu. We’ll return to each when it matters. After that gate releases, keep every workspace section collapsed and use finite_guide_view on the plan_summary target with pauseForNext true and this exact overlay message: This is your plan at a glance. Dates, budget, remaining money, and open work stay visible here, so you can understand the shape of the plan before opening any section. After that gate releases, keep every workspace section collapsed and use finite_guide_view on the section_headers target with pauseForNext true and this exact overlay message: Each section keeps one part of the plan together. Its header shows what belongs there, how many items and open questions it contains, and whether Codex is currently working there. Open any section when you want the detail. Do not tour inside Calendar or another section yet. Do not alter the draft, approve it, start managing, create human authority, or enter any consequential flow. After that final Next gate releases, use finite_guide_view without a Next pause to say: Basics complete. You have seen a starting point become an editable plan. Ask me anything in Codex, or leave the demo when you are ready.",
      ] : [
        "Chapter two begins by orienting the person without operating any header control. Use finite_guide_view on the top target with pauseForNext true and this exact overlay message: The top bar keeps the essentials close: switch or create plans, share or invite people, hand work to Codex, see whether Codex view is on, and open the menu. We’ll return to each when it matters. After that gate releases, keep every workspace section collapsed and use finite_guide_view on the plan_summary target with pauseForNext true and this exact overlay message: This is your plan at a glance. Dates, budget, remaining money, and open work stay visible here, so you can understand the shape of the plan before opening any section. After that gate releases, keep every workspace section collapsed and use finite_guide_view on the section_headers target with pauseForNext true and this exact overlay message: Each section keeps one part of the plan together. Its header shows what belongs there, how many items and open questions it contains, and whether Codex is currently working there. Open any section when you want the detail. Do not tour inside Calendar or another section yet. After that gate releases, open the real Calendar section with its visible header, then call finite_guide_view on the priority target with sectionId itinerary and pauseForNext true using this exact overlay message: Calendar keeps the plan’s dates, places and activities together. Select any item to see or change its details; related stays and transport remain connected to the same working plan. Do not edit a Calendar item yet. After that gate releases, keep Calendar open and call finite_guide_view on the open_questions target with pauseForNext true using this exact overlay message: Anything Finite still needs is gathered here. Answer on the page or in Codex, and the answer becomes part of the working plan while the question clears. Do not answer an open question yet. After that gate releases, close Calendar, open the real People & commitments section with its visible header, and call finite_guide_view on the priority target with sectionId people and pauseForNext true using this exact overlay message: People & commitments keeps companions, hosts and fixed appointments tied to the dates or decisions they affect. Dependencies stay visible instead of getting buried in notes. Do not add or edit a person yet. After the People gate, continue through stays, transport, money, requirements and tasks in their visible on-page order before entering Chapter three. Give every section its own concise product explanation and pauseForNext true gate; keep only the section being explained open, and do not edit section data during this orientation tour. Do not approve, start managing, compile away from, or otherwise leave this editable workspace.",
        ...(demoDepth === "complete" ? [
          "After the To-do list gate releases, keep every workspace section collapsed and use the normal visible interface to click the separate 'Customise workspace' control. Do not click or focus 'Start managing'. Once the real custom-workspace dialog opens, call finite_guide_view on the workspace_customisation target with pauseForNext true using this exact overlay message: Every plan starts with the useful standard sections. Customise workspace lets you add a specialist tracker only when this particular plan needs one. Do not add or request a custom section yet. After that gate releases, close the dialog through its visible close control before entering Chapter three.",
        ] : []),
        "Chapter three shows one change flowing through the whole plan. After the Next gate releases, keep every workspace section collapsed and use the normal visible interface to click the Plan at a glance control labelled 'Edit total budget'. Once the real dialog is open, call finite_guide_view on the budget_editor target with pauseForNext true and this exact overlay message: Budgets change. Edit the total or base currency here, and Finite updates the rest of the plan around it. Next I’ll change both so you can see that happen. After that gate releases, use normal visible keyboard input to change Amount from 2400 to 2600 and Base currency from AUD to NZD, then click the visible 'Save budget' control. Do not assign fields through the DOM and do not change any category amount. Finite relabels the plan’s base unit; it does not perform a live exchange conversion. After the save rerenders the real workspace, keep every section collapsed and call finite_guide_view on the plan_summary target with pauseForNext true and this exact overlay message: That one edit has updated the whole overview: NZD 2,600 total, NZD 2,400 allocated, 92% assigned, and NZD 200 still available. Do not approve, start managing, compile away from, or otherwise leave this editable workspace.",
        ...(demoDepth === "complete" ? [
          "Chapter four demonstrates a plan-specific workspace while the plan is still being built. After the Next gate releases, read the exact canonical arrival identity, open the planning toolset when required, and use finite_save_workspace_module to add a provisional checklist section named Weather watch with stable moduleId custom_weather_watch and editable title, check time, forecast, decision, and notes fields. Then use finite_save_workspace_records to add two coherent synthetic checklist items: check the Saturday rain outlook the evening before, and make the final nature-day call by 7:00 am. Keep the new section outside accepted truth. Show the exact custom_weather_watch section with finite_guide_view on the priority target and pauseForNext true.",
          "Chapter five demonstrates comparison before the plan starts. After the Next gate releases, read the exact existing accommodation section and provisional parent record identity. Use finite_save_workspace_option to add two clearly synthetic, unresearched stay ideas using only fields allowed by the returned section schema; do not invent availability, booking status, prices, ratings, or source links. Explain that options remain outside plan maths and commitments until the person chooses one. Show that exact accommodation section with finite_guide_view on the priority target and pauseForNext true.",
        ] : []),
        "The next chapter closes Planning and begins Managing. After the Next gate releases, keep every planning section collapsed and call finite_guide_view on surface current and the start_managing target with pauseForNext true using this exact overlay message: Planning is where the draft takes shape. Start managing turns that draft into the live plan you use day to day; from then on, decisions, progress and real-world changes are recorded against it. Do not activate it yet. Only after that gate releases, verify the visible 'Demo mode · Local only' badge is still present, then use the normal visible control labelled 'Start managing'. This may create accepted plan state only inside the isolated browser-local demo workspace. Wait for the real Managing surface to load, then call finite_guide_view on the status target with pauseForNext true using this exact overlay message: The plan is now in Managing. The draft is no longer being designed; this is the working surface that tracks what happens next and absorbs changes as reality moves.",
        "The following chapter adds the synthetic rainy-day change after the plan is underway. After the Next gate releases, read the canonical Managing timeline and choose the exact stage that contains the flexible nature day. Use that stage's normal visible 'Add or change' control, then call finite_guide_view on the updates target with pauseForNext true using this exact overlay message: This is where a real-world change belongs: on the live stage it affects, after the plan has started. Next I’ll record the rain forecast and keep the rest of the trip intact. Do not save anything yet. After that gate releases, use normal visible keyboard input in the real dialog: What is this? = An update; Where does it belong? = Timeline; What should the plan say? = Heavy rain is forecast for Saturday. Move MONA and the local-food focus indoors on Saturday, and keep Sunday as the flexible nature day if conditions improve. Click the visible 'Save to plan' control. Do not assign fields through the DOM, do not use an arrival tool, and do not alter dates, budget, people or other constraints. Keep the Managing timeline open and use its normal visible disclosure to open the exact saved plan information for that stage, so the rainy-day text itself is visible. Only then show the updated Managing timeline with finite_guide_view on the stages target and pauseForNext true.",
        demoDepth === "complete"
          ? "Chapter eight shows the resulting live plan. After the Next gate releases, call finite_guide_view on the plan_summary target, explain the dates, total budget, browser-local Managing state, rainy-day update, custom Weather watch section, comparison ideas, and remaining work, then pauseForNext true. Do not book, buy, contact, confirm or enter any external action. After that final Next gate releases, use finite_guide_view without a Next pause to say: Full tour complete. Ask me anything about what you saw in Codex, or leave the demo when you are ready."
          : "Chapter six shows the resulting live plan. After the Next gate releases, call finite_guide_view on the plan_summary target, explain the dates, total budget, browser-local Managing state, rainy-day update, and remaining work, then pauseForNext true. Do not book, buy, contact, confirm or enter any external action. After that final Next gate releases, use finite_guide_view without a Next pause to say: Demo complete. Ask me anything about what you saw in Codex, or leave the demo when you are ready.",
      ]),
      "Do not begin any later chapter until Finite releases the intended guide call after its visible Next control is activated, either by the person in Finite or by Codex acting on their explicit continuation message; keep the Codex turn alive and retry only at modest intervals while it reports that it is waiting.",
      "Every Next gate is already a natural pause. Its overlay tells the person they may ask Codex a question or tell it to keep going. If they ask a question while a guide call returns GUIDE_WAITING_FOR_PERSON, make no Finite changes: answer from pausedAt together with canonical Finite state, then keep waiting at the same gate. If they instead give an explicit continuation message, activate the visible Next control for them and continue. The person may also click Pause demo at any time during a chapter. If a guide call returns GUIDE_PAUSED_FOR_QUESTION, make no Finite changes: use its pausedAt surface, target, targetLabel, and message together with canonical Finite state to answer questions in Codex. Retry the intended guide call only at modest intervals until the person resumes, then continue from the exact next chapter without restarting.",
    ] : guidedWalkthrough ? [
      "",
      "This is a live guided walkthrough of the real product, not an autoplay or a simulated demo. After entering Finite, use finite_guide_view to move through one meaningful area at a time. Supply a short, plain-language message with each guide call so the person can follow the glow and typed guidance overlay. Pause after each step. Never type into a human field, choose an option, or approve on the person's behalf. Start by showing the starting point, then help them create or adapt a rough plan, inspect its structure, make one useful change, and reach an actual human decision boundary.",
    ] : []),
    "",
    "Discover the selected tab's page tools. If finite_enter_kitchen is not visible but finite_webmcp_status is, call the status tool, wait for WEBMCP_READY, refresh discovery, then make this your first Finite call:",
    `finite_enter_kitchen(${JSON.stringify(toolInput)})`,
    "",
    demoPlayback
      ? "Treat the response as the canonical recipe book, current order rail, and work queue. Read its authoritative nextAction and chefMenu before acting. Choose and execute the safe synthetic demo route yourself. If a route would leave editable draft work or ask for human authority, do not enter it; continue demonstrating another real, non-consequential product capability instead."
      : "Treat the response as the canonical recipe book, current order rail, and work queue. Read its one authoritative nextAction and chefMenu before acting. Offer the menu in human language; never describe a suggested route as constraint-validated. If the handoff receipt is older than the live state, continue from the newer canonical state returned by Finite.",
    "",
    demoPlayback
      ? "Before any state-changing call, obey operatorPacket.preMutationGate. knownArgs are not an executable call when nextAction.knownArgsComplete is false: supply every required derivedArg from canonical Site state. Use only the public synthetic scenario, so no personal data or human preference is required."
      : "Before any state-changing call, obey operatorPacket.preMutationGate. knownArgs are not an executable call when nextAction.knownArgsComplete is false: supply every required derivedArg from canonical Site state. Do not ask permission merely to read and analyse canonical Site state or use read-only planning tools. Immediately before transmitting specific sensitive plan content through WebMCP, obtain one action-time confirmation at the concrete save boundary and name both the data and Finite as the destination. The handoff is not human plan authority or external-execution authority.",
    "",
    demoPlayback
      ? "Do not ask the person for missing facts or decisions. Fill the synthetic example coherently, keep running the prepared chapters after each Next click, and leave questions or deeper discussion for the Codex conversation after the demo."
      : "Do not reconstruct the plan from this prompt, ask the human to explain the application, or infer missing facts or human authority. Work through Finite and return to the human only when their judgment, preference, approval, or the concrete save-time sensitive-transmission gate is genuinely needed. Bring them a useful draft before that gate whenever possible.",
    "",
    "This prompt contains no authentication, credentials, plan contents, or human authority. The Site establishes its own access boundary when opened.",
  ].join("\n");

  return {
    handoffVersion: "finite-codex-handoff.v1",
    buttonLabel: `Hand off to ${agenticName}`,
    title: order ? `Bring ${agenticName} into this plan.` : `Start this with ${agenticName}.`,
    detail: demoPlayback
      ? "Copy one introduction into Codex. It will first ask where you want to watch, then run a real example in Finite and wait for your Next click between key chapters."
      : guidedWalkthrough
        ? "Copy one introduction into Codex. It will use Finite’s consented guide controls on the real page and pause for you at every human decision."
      : context.inline
        ? "Copy the operator instruction into this Codex task. Finite will supply the live plan through its page tools."
        : "Copy one introduction into Codex. It points to Finite and the correct first tool; it does not copy your plan or sign anybody in.",
    prompt,
    copiedPayload: {
      siteOrigin,
      entryTool: "finite_enter_kitchen",
      entryIntent,
      orderId: order?.orderId ?? null,
      expectedOrderVersion: order?.version ?? null,
      expectedOrderChecksum: order?.checksum ?? null,
      expectedPlanId: entryIntent === "start_new" ? null : context.plan.planId,
      expectedPlanRevision: entryIntent === "start_new" ? null : context.plan.revision,
      expectedProfileHash: entryIntent === "start_new" ? null : context.plan.profileHash,
      expectedSnapshotHash: entryIntent === "start_new" ? null : context.plan.snapshotHash,
    },
  };
};
