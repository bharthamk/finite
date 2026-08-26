import type { ToolResult } from "./types.js";

export const currencyContract = {
  code: "AUD",
  minorUnit: 100,
  scope: "This release operates one AUD ledger per plan. A different currency requires a new immutable plan version; conversion is never inferred.",
} as const;

export const externalActionStatuses = ["researched", "quoted", "held", "booked", "paid", "verified", "cancelled"] as const;
export type ExternalActionStatus = typeof externalActionStatuses[number];

export const humanRealityPolicy = [
  { auditId: 31, signal: "sentimental_value", action: "Preserve the named meaning as a preference or lock; do not repeatedly optimize it away." },
  { auditId: 32, signal: "post_approval_reversal", action: "Record a new event and preserve the prior approval in lineage." },
  { auditId: 33, signal: "hidden_or_changed_limit", action: "Clarify coverage and create an immutable scope version." },
  { auditId: 34, signal: "buffer_loss_aversion", action: "Show both the cost of spending buffer and the cost of protecting it." },
  { auditId: 35, signal: "social_friction_cost", action: "Treat coordination burden as a preference, never as fabricated money." },
  { auditId: 36, signal: "social_scope_pressure", action: "Enforce hard safety and capacity; require an explicit compensating sacrifice." },
  { auditId: 37, signal: "unsure", action: "Offer a reversible default, research route, or bounded experiment and label every assumption." },
  { auditId: 38, signal: "cross_surface_conflict", action: "Show the contradiction and reconcile the latest explicit human input; never silently merge." },
  { auditId: 39, signal: "silence_as_agreement", action: "Keep the item as open human coordination; silence is never commitment." },
  { auditId: 40, signal: "quote_as_booking", action: "Use the external-state ladder; quoted is not held, booked, paid, or verified." },
  { auditId: 41, signal: "sunk_cost", action: "Compare forward value and cost while acknowledging the emotional loss." },
  { auditId: 42, signal: "correct_but_rejected_plating", action: "Replate the same truth around sequence, people, and outcome without changing accepted numbers." },
  { auditId: 43, signal: "impossible_all_at_once", action: "Return the exact constraint collision and ask which value wins at the margin." },
  { auditId: 44, signal: "panic", action: "Offer the smallest reversible stabilizing action first and retain authority boundaries." },
  { auditId: 45, signal: "concealed_commitment", action: "Make correction blame-free and append-only; optimize from current reality." },
  { auditId: 46, signal: "capacity_optimism", action: "Treat time, energy, and labour as finite and offer pause or abandon before crisis." },
  { auditId: 47, signal: "salient_luxury", action: "Optimize for lived value when hard constraints still hold." },
  { auditId: 48, signal: "post_completion_detail", action: "Ask whether this is reconciliation, reopening, or a new plan; do not infer." },
  { auditId: 49, signal: "indirect_abandonment", action: "Offer pause and abandonment neutrally without forcing false completion." },
  { auditId: 50, signal: "post_hoc_story", action: "Preserve factual lineage; challenge the story only when safety or authority depends on it." },
  { auditId: 51, signal: "convenience_over_value", action: "Surface the conflict and require confirmation of the changed preference." },
  { auditId: 52, signal: "option_avoidance", action: "Cap the menu, explain distinctions, and recommend one route with reasons." },
  { auditId: 53, signal: "plan_mistaken_for_execution", action: "Name planned, staged, authorized, externally executed, and verified separately." },
  { auditId: 54, signal: "group_preference_conflict", action: "Preserve named disagreements and require a human decision protocol; never average people away." },
] as const;

export const humanRealityContract = {
  contractVersion: "finite-human-reality.v1",
  rules: humanRealityPolicy,
  law: "Human inconsistency is input to reconcile, not noise to erase. Codex may recommend a reversible route; only explicit human input changes preference or authority.",
} as const;

export const groupDecisionContract = {
  contractVersion: "finite-group-decision.v1",
  law: "A group is not one averaged consumer. Preserve named positions, unresolved disagreements, and the human-selected decision protocol.",
  allowedProtocols: ["named_decider", "consensus", "unanimous_for_locks", "explicit_compromise"] as const,
  requiredBeforeAuthority: ["participants", "named_positions", "unresolved_conflicts", "selected_protocol"] as const,
} as const;

export const assessExternalAction = (input: Record<string, unknown>, evidenceExists: (evidenceId: string) => boolean): ToolResult => {
  const actionId = typeof input.actionId === "string" ? input.actionId.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const status = String(input.status ?? "") as ExternalActionStatus;
  const evidenceRef = typeof input.evidenceRef === "string" ? input.evidenceRef.trim() : "";
  const humanAttested = input.humanAttested === true;
  if (!actionId || !label || !externalActionStatuses.includes(status)) return { ok: false, code: "EXTERNAL_ACTION_INPUT_INVALID", acceptedStateChanged: false };
  const evidenceRequired = ["quoted", "held", "booked", "paid", "verified"].includes(status);
  const humanRequired = ["booked", "paid", "verified", "cancelled"].includes(status);
  const missingInputs: Array<Record<string, unknown>> = [];
  if (evidenceRequired && (!evidenceRef || !evidenceExists(evidenceRef))) missingInputs.push({ argument: "evidenceRef", source: "evidence", allowedSource: ["canonical_evidence"], reason: `${status} requires an admitted evidence record.` });
  if (humanRequired && !humanAttested) missingInputs.push({ argument: "humanAttested", source: "human", allowedSource: ["human_action"], reason: `${status} cannot be inferred from research, a quote, or silence.` });
  const supported = missingInputs.length === 0;
  return {
    ok: supported,
    code: supported ? "EXTERNAL_ACTION_STATE_SUPPORTED" : "EXTERNAL_ACTION_STATE_UNPROVEN",
    action: { actionId, label, status, evidenceRef: evidenceRef || null, humanAttested },
    stateLadder: externalActionStatuses,
    missingInputs,
    exactQuestion: missingInputs.some((item) => item.source === "human") ? `Has ${label} actually been ${status}, and do you want that recorded as human-attested reality?` : null,
    acceptedStateChanged: false,
    next: supported ? "Use this classification as evidence-bound context. It does not itself change accepted plan truth or perform the external action." : "Obtain only the named evidence or human attestation. Do not promote the action state by inference.",
  };
};
