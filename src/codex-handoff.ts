import type { ArrivalOrder } from "./arrival.js";

export interface CodexHandoffContext {
  siteOrigin: string;
  inline: boolean;
  agenticName?: string;
  guidedWalkthrough?: boolean;
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
    `Finite at ${siteOrigin} is the live plan surface. Operate the application for the person while keeping their preferences, decisions, and approval with them.`,
    ...(guidedWalkthrough ? [
      "",
      "This is a live guided walkthrough of the real product, not an autoplay or a simulated demo. After entering Finite, use finite_guide_view to move through one meaningful area at a time. Supply a short, plain-language message with each guide call so the person can follow the glow and typed guidance overlay. Pause after each step. Never type into a human field, choose an option, or approve on the person's behalf. Start by showing the starting point, then help them create or adapt a rough plan, inspect its structure, make one useful change, and reach an actual human decision boundary.",
    ] : []),
    "",
    "Open the Finite Site in Codex's built-in browser. Discover its page tools. If finite_enter_kitchen is not visible but finite_webmcp_status is, call the status tool, wait for WEBMCP_READY, refresh discovery, then make this your first Finite call:",
    `finite_enter_kitchen(${JSON.stringify(toolInput)})`,
    "",
    "Treat the response as the canonical recipe book, current order rail, and work queue. Read its one authoritative nextAction and chefMenu before acting. Offer the menu in human language; never describe a suggested route as constraint-validated. If the handoff receipt is older than the live state, continue from the newer canonical state returned by Finite.",
    "",
    "Before any state-changing call, obey operatorPacket.preMutationGate. knownArgs are not an executable call when nextAction.knownArgsComplete is false: supply every required derivedArg from canonical Site state. Do not ask permission merely to read and analyse canonical Site state or use read-only planning tools. Immediately before transmitting specific sensitive plan content through WebMCP, obtain one action-time confirmation at the concrete save boundary and name both the data and Finite as the destination. The handoff is not human plan authority or external-execution authority.",
    "",
    "Do not reconstruct the plan from this prompt, ask the human to explain the application, or infer missing facts or human authority. Work through Finite and return to the human only when their judgment, preference, approval, or the concrete save-time sensitive-transmission gate is genuinely needed. Bring them a useful draft before that gate whenever possible.",
    "",
    "This prompt contains no authentication, credentials, plan contents, or human authority. The Site establishes its own access boundary when opened.",
  ].join("\n");

  return {
    handoffVersion: "finite-codex-handoff.v1",
    buttonLabel: `Hand off to ${agenticName}`,
    title: order ? `Bring ${agenticName} into this plan.` : `Start this with ${agenticName}.`,
    detail: guidedWalkthrough
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
