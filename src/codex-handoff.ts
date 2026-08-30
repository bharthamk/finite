import type { ArrivalOrder } from "./arrival.js";

export interface CodexHandoffContext {
  siteOrigin: string;
  inline: boolean;
  agenticName?: string;
  guidedWalkthrough?: boolean;
  demoPlayback?: boolean;
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
    demoPlayback
      ? `Finite at ${siteOrigin} is the live plan surface. Run the synthetic demonstration entirely for the person; their only in-product action is clicking Next when they are ready for another chapter.`
      : `Finite at ${siteOrigin} is the live plan surface. Operate the application for the person while keeping their preferences, decisions, and approval with them.`,
    ...(demoPlayback ? [
      "",
      "Run Finite's live product demo using its real interface and a fully specified synthetic template: a three-night Hobart trip for two adults departing Sydney on 16 October 2026, with an AUD 2,400 total budget, an easy pace, and priorities of MONA, excellent local food, and one flexible nature day. Supply every example fact yourself, operate Finite through its normal visible interface and page tools, and never ask the person to type, choose, confirm, or operate the product. Build real saved draft state rather than a simulation. Keep the entire run inside non-sensitive planning and editable draft work; do not enter activation, confirmation, external action, or any other consequential flow.",
      "Run four prepared chapters. Chapter one must begin on Finite's real blank starting screen, not on a saved starting point. Open the arrival surface with finite_guide_view using pauseForNext false, then use Codex's built-in browser to focus the first field labelled 'What do you want to plan?' and visibly type the complete synthetic Hobart brief into that field character by character. Do not use direct DOM assignment and do not call finite_create_arrival_order. Once the full brief is visibly present but still unsubmitted, call finite_guide_view on the starting point with a concise explanation and pauseForNext true. The person should be able to see exactly what Codex supplied before anything is saved.",
      "When the person clicks Next, retry an intended finite_guide_view call with pauseForNext false until Finite releases the gate. Their Next click is the complete continuation signal: do not ask them to type 'proceed', send another message, or operate any other control. Only after release, use the visible page control labelled 'Build my rough plan' to submit the first form; the real interface must create the saved starting point. Chapter two builds and shows the structured draft. Chapter three adds a synthetic rainy-day change and shows how the editable draft adapts. Chapter four shows the resulting plan summary and what remains editable. End chapters two, three, and four with finite_guide_view and pauseForNext true. Do not begin the next chapter until Finite releases the intended guide call after the visible Next click; keep the Codex turn alive and retry only at modest intervals while it reports that it is waiting.",
      "Every Next gate is already a natural pause. Its overlay tells the person they may ask Codex questions instead of continuing. If they ask while a guide call returns GUIDE_WAITING_FOR_PERSON, make no Finite changes: answer from pausedAt together with canonical Finite state, then keep waiting at the same gate. The person may also click Pause demo at any time during a chapter. If a guide call returns GUIDE_PAUSED_FOR_QUESTION, make no Finite changes: use its pausedAt surface, target, targetLabel, and message together with canonical Finite state to answer questions in Codex. Retry the intended guide call only at modest intervals until the person resumes, then continue from the exact next chapter without restarting. After the final chapter, use finite_guide_view without a Next pause to say: Demo complete. Ask me anything about what you saw in Codex, or leave the demo when you are ready.",
    ] : guidedWalkthrough ? [
      "",
      "This is a live guided walkthrough of the real product, not an autoplay or a simulated demo. After entering Finite, use finite_guide_view to move through one meaningful area at a time. Supply a short, plain-language message with each guide call so the person can follow the glow and typed guidance overlay. Pause after each step. Never type into a human field, choose an option, or approve on the person's behalf. Start by showing the starting point, then help them create or adapt a rough plan, inspect its structure, make one useful change, and reach an actual human decision boundary.",
    ] : []),
    "",
    "Open the Finite Site in Codex's built-in browser. Discover its page tools. If finite_enter_kitchen is not visible but finite_webmcp_status is, call the status tool, wait for WEBMCP_READY, refresh discovery, then make this your first Finite call:",
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
      ? "Copy one introduction into Codex. It will run a real example in Finite and wait for your Next click between key chapters."
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
