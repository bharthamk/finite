import type { ArrivalOrder } from "./arrival.js";

export interface CodexHandoffContext {
  siteOrigin: string;
  inline: boolean;
  order: Pick<ArrivalOrder, "orderId" | "version" | "status" | "lastOperatorCheckpoint" | "checksum"> | null;
  plan: { planId: string; profileId: string; revision: number };
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
    orderId: string | null;
    expectedOrderVersion: number | null;
    expectedOrderChecksum: string | null;
    expectedPlanId: string;
    expectedPlanRevision: number;
  };
}

const cleanOrigin = (value: string): string => {
  const parsed = new URL(value);
  return parsed.origin;
};

const buttonLabel = (context: CodexHandoffContext): string => {
  if (!context.order) return "Start with Codex";
  if (context.order.version > context.order.lastOperatorCheckpoint && context.order.lastOperatorCheckpoint > 0) return "Update Codex";
  if (context.order.lastOperatorCheckpoint > 0) return "Resume with Codex";
  return "Bring in Codex";
};

export const createCodexHandoff = (context: CodexHandoffContext): CodexHandoff => {
  const siteOrigin = cleanOrigin(context.siteOrigin);
  const order = context.order;
  const toolInput = {
    ...(order ? {
      orderId: order.orderId,
      expectedOrderVersion: order.version,
      expectedOrderChecksum: order.checksum,
    } : {}),
    expectedPlanId: context.plan.planId,
    expectedPlanRevision: context.plan.revision,
  };
  const prompt = [
    "Take over this Finite plan as the Codex operator.",
    "",
    `You are the chef. Finite at ${siteOrigin} is your kitchen. The human is the consumer: bring them in for preferences, decisions, and approval, not application operation.`,
    "",
    "Open the Finite Site in Codex's built-in browser. Discover its page tools, then make this your first call:",
    `finite_enter_kitchen(${JSON.stringify(toolInput)})`,
    "",
    "Treat the response as the canonical recipe book, current order rail, and work queue. Read any arrival delta before acting. If the handoff receipt is older than the live state, continue from the newer canonical state returned by Finite.",
    "",
    "Do not reconstruct the plan from this prompt, ask the human to explain the application, or infer missing facts or human authority. Work through Finite and return to the human only when their judgment, preference, or approval is genuinely needed.",
    "",
    "This prompt contains no authentication, credentials, plan contents, or human authority. The Site establishes its own access boundary when opened.",
  ].join("\n");

  return {
    handoffVersion: "finite-codex-handoff.v1",
    buttonLabel: buttonLabel(context),
    title: order ? "Bring Codex into the kitchen." : "Start this with Codex.",
    detail: context.inline
      ? "Copy the operator instruction into this Codex task. Finite will supply the live plan through its page tools."
      : "Copy one introduction into Codex. It points to the kitchen and the correct first tool; it does not copy your plan or sign anybody in.",
    prompt,
    copiedPayload: {
      siteOrigin,
      entryTool: "finite_enter_kitchen",
      orderId: order?.orderId ?? null,
      expectedOrderVersion: order?.version ?? null,
      expectedOrderChecksum: order?.checksum ?? null,
      expectedPlanId: context.plan.planId,
      expectedPlanRevision: context.plan.revision,
    },
  };
};
