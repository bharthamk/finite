import type { FinitePlanKernel } from "./kernel.js";

export type KitchenRoute = {
  stage: string;
  nextTool: string | null;
  targetId?: string | null;
  humanAction?: string;
  authorityPresent: boolean;
};

export type OperatorInput = {
  argument: string;
  source: "canonical" | "derived" | "research" | "human" | "human_or_research";
  reason: string;
  question?: string;
};

export type ChefMenuItem = {
  menuItemId: string;
  rank: number;
  kind: "suggested_route" | "operator_action" | "validated_option" | "human_decision";
  title: string;
  offer: string;
  whyNow: string;
  status: "ready" | "input_required" | "research_required" | "human_choice_required" | "blocked";
  viability: "not_yet_tested" | "constraint_validated" | "blocked";
  nextTool: string | null;
  knownArgs: Record<string, unknown>;
  missingInputs: OperatorInput[];
  tradeoffs: string[];
  evidence: { status: "not_required" | "required" | "available"; refs: string[] };
  candidateId?: string;
};

const readyMenus: Record<string, ChefMenuItem[]> = {
  plan_travel_europe: [
    {
      menuItemId: "travel_research_paris_stays", rank: 1, kind: "suggested_route",
      title: "Bring back three current Paris stays",
      offer: "I can research three accommodation choices that preserve the fixed flights and at least A$500 of freedom, then show the real trade-offs.",
      whyNow: "The destination, extension length, fixed flights, and buffer floor are known; the live accommodation cost is not.",
      status: "research_required", viability: "not_yet_tested", nextTool: "finite_register_evidence",
      knownArgs: { destination: "Paris", nights: 3, minimumBufferMinor: 50_000, currencyCode: "AUD", minorUnit: 100 },
      missingInputs: [{ argument: "accommodation_quote", source: "research", reason: "A current price is needed before the extension can be tested." }],
      tradeoffs: ["Research takes longer than using a supplied cap", "No booking or purchase is made"],
      evidence: { status: "required", refs: [] },
    },
    {
      menuItemId: "travel_use_human_cap", rank: 2, kind: "human_decision",
      title: "Work to a nightly or three-night cap",
      offer: "Give me a nightly ceiling or total and I will test the Paris extension immediately.",
      whyNow: "One price boundary is the only missing argument for the typed stay-extension change.",
      status: "input_required", viability: "not_yet_tested", nextTool: "travel_extend_stay",
      knownArgs: { destination: "Paris", nights: 3, minimumBufferMinor: 50_000, currencyCode: "AUD", minorUnit: 100 },
      missingInputs: [{ argument: "nightlyMinor", source: "human", reason: "Accommodation spend is a consumer choice, not an operator inference.", question: "What nightly rate or three-night total should I use, in AUD?" }],
      tradeoffs: ["Fastest route", "The result is only as realistic as the supplied cap"],
      evidence: { status: "not_required", refs: [] },
    },
    {
      menuItemId: "travel_show_flex", rank: 3, kind: "suggested_route",
      title: "Show what else could flex",
      offer: "I can map which unlocked parts of the trip could fund more Paris while protecting comfort or preserving more buffer.",
      whyNow: "Finite already knows the legal and locked move set, so Codex can explain the available compromises before a price is chosen.",
      status: "ready", viability: "not_yet_tested", nextTool: "finite_get_movable_set",
      knownArgs: {}, missingInputs: [],
      tradeoffs: ["Explores compromise before price certainty", "Does not yet produce a commit-ready option"],
      evidence: { status: "not_required", refs: [] },
    },
  ],
  plan_renovation_kitchen: [
    {
      menuItemId: "renovation_source_substitute", rank: 1, kind: "suggested_route",
      title: "Source a local finish that protects handover",
      offer: "I can research a local replacement, compare its quote and lead time, and test it without moving the committed completion date.",
      whyNow: "The completion date and contingency are protected; replacement price and timing are not yet canonical.",
      status: "research_required", viability: "not_yet_tested", nextTool: "finite_register_evidence",
      knownArgs: { material: "imported tile", currencyCode: "AUD", minorUnit: 100 },
      missingInputs: [
        { argument: "replacement_quote", source: "research", reason: "A current supplier quote is required." },
        { argument: "replacement_lead_time", source: "research", reason: "The schedule effect must be evidenced." },
      ],
      tradeoffs: ["May change the preferred finish", "Protects the locked handover if a valid substitute exists"],
      evidence: { status: "required", refs: [] },
    },
    {
      menuItemId: "renovation_protect_finish", rank: 2, kind: "human_decision",
      title: "Protect the original finish",
      offer: "I can price acceleration or resequencing while keeping the preferred tile.",
      whyNow: "The profile values the original finish, but schedule protection has the higher accepted weight.",
      status: "input_required", viability: "not_yet_tested", nextTool: "renovation_shift_phase",
      knownArgs: { phase: "finishes", currencyCode: "AUD", minorUnit: 100 },
      missingInputs: [{ argument: "acceleration_or_resequence_choice", source: "human", reason: "This is a taste-versus-cost decision.", question: "Should I first protect the original finish, or protect contingency with a substitute?" }],
      tradeoffs: ["Likely consumes contingency", "Preserves the preferred finish if the schedule remains viable"],
      evidence: { status: "required", refs: [] },
    },
    {
      menuItemId: "renovation_refresh_quote", rank: 3, kind: "operator_action",
      title: "Update the delayed supplier facts first",
      offer: "I can replace assumptions with one current quote and lead-time receipt before suggesting a recovery plan.",
      whyNow: "The safest plan depends on whether the supplier delay and cost are still current.",
      status: "research_required", viability: "not_yet_tested", nextTool: "renovation_update_quote",
      knownArgs: { currencyCode: "AUD", minorUnit: 100 },
      missingInputs: [{ argument: "current_supplier_quote", source: "human_or_research", reason: "The existing supplier position must be refreshed." }],
      tradeoffs: ["Defers option generation", "Reduces the risk of optimizing against stale facts"],
      evidence: { status: "required", refs: [] },
    },
  ],
  plan_event_launch: [
    {
      menuItemId: "event_price_headcount", rank: 1, kind: "human_decision",
      title: "Price the additional guests",
      offer: "Tell me the target headcount and I will test the per-person cost against venue capacity and contingency.",
      whyNow: "Capacity is known, but the desired increase and current per-person price are not.",
      status: "input_required", viability: "not_yet_tested", nextTool: "event_change_headcount",
      knownArgs: { venueCapacity: 120, currencyCode: "AUD", minorUnit: 100 },
      missingInputs: [
        { argument: "delta", source: "human", reason: "The desired guest count is a consumer decision.", question: "How many additional guests should I plan for?" },
        { argument: "perPersonMinor", source: "human_or_research", reason: "The current marginal guest cost is not in accepted truth." },
      ],
      tradeoffs: ["Directly tests the requested outcome", "May require service or menu compromises"],
      evidence: { status: "required", refs: [] },
    },
    {
      menuItemId: "event_protect_experience", rank: 2, kind: "suggested_route",
      title: "Protect the guest experience first",
      offer: "I can research a vendor or service change that absorbs more guests with the smallest experience loss.",
      whyNow: "Guest experience is the strongest accepted preference and venue capacity is locked.",
      status: "research_required", viability: "not_yet_tested", nextTool: "event_replace_vendor",
      knownArgs: { currencyCode: "AUD", minorUnit: 100 },
      missingInputs: [{ argument: "replacement_vendor_quote", source: "research", reason: "A current alternative is needed before comparison." }],
      tradeoffs: ["May change a vendor", "Prioritizes experience over the cheapest route"],
      evidence: { status: "required", refs: [] },
    },
    {
      menuItemId: "event_protect_contingency", rank: 3, kind: "suggested_route",
      title: "Protect contingency with show changes",
      offer: "I can show which movable service, menu, or run-of-show choices create room without exceeding capacity.",
      whyNow: "Finite already knows the unlocked production moves and their experience impacts.",
      status: "ready", viability: "not_yet_tested", nextTool: "finite_get_movable_set",
      knownArgs: {}, missingInputs: [],
      tradeoffs: ["May simplify the experience", "Avoids assuming a larger budget"],
      evidence: { status: "not_required", refs: [] },
    },
  ],
};

const genericReadyMenu = (kernel: FinitePlanKernel): ChefMenuItem[] => {
  const noun = kernel.profile.surface.nouns.plan;
  const contextualTool = kernel.profile.contextualCapabilities[0] ?? "finite_record_change_event";
  return [
    {
      menuItemId: "generic_describe_change", rank: 1, kind: "human_decision",
      title: "Tell me what changed", offer: `Describe the new reality and I will translate it into a typed change against this ${noun}.`,
      whyNow: "Accepted truth is current and no change order is active.", status: "input_required", viability: "not_yet_tested", nextTool: contextualTool,
      knownArgs: { expectedRevision: kernel.revision },
      missingInputs: [{ argument: "change_detail", source: "human", reason: "The changed reality must come from the human or admitted evidence.", question: "What changed, and what outcome should the plan protect?" }],
      tradeoffs: ["The exact trade-offs depend on the supplied change"], evidence: { status: "not_required", refs: [] },
    },
    {
      menuItemId: "generic_show_flex", rank: 2, kind: "operator_action",
      title: "Show what can and cannot move", offer: "I can explain the live locks, legal moves, and preference impacts before we choose a direction.",
      whyNow: "Finite has a compiled move space for the active plan.", status: "ready", viability: "not_yet_tested", nextTool: "finite_get_movable_set",
      knownArgs: {}, missingInputs: [], tradeoffs: ["Explains room to move but does not create an option"], evidence: { status: "not_required", refs: [] },
    },
    {
      menuItemId: "generic_check_evidence", rank: 3, kind: "operator_action",
      title: "Check what evidence the kitchen needs", offer: "I can identify which live facts need current quotes, receipts, or human confirmation before planning.",
      whyNow: "Evidence requirements are compiled into the active plan.", status: "ready", viability: "not_yet_tested", nextTool: "finite_get_evidence_policy",
      knownArgs: {}, missingInputs: [], tradeoffs: ["Adds certainty before speed"], evidence: { status: "not_required", refs: [] },
    },
  ];
};

const candidateMenu = (kernel: FinitePlanKernel): ChefMenuItem[] => [...kernel.candidates.values()]
  .filter((candidate) => candidate.baseRevision === kernel.revision)
  .sort((a, b) => Number(b.valid) - Number(a.valid) || b.preferenceScore - a.preferenceScore)
  .slice(0, 3)
  .map((candidate, index) => ({
    menuItemId: `candidate_${candidate.candidateId}`,
    rank: index + 1,
    kind: "validated_option" as const,
    title: candidate.objective.replaceAll("_", " "),
    offer: candidate.valid
      ? `Serve this constraint-validated ${kernel.profile.surface.nouns.option} for human comparison.`
      : "Keep this refused route visible so the human can see why it cannot be served.",
    whyNow: `It was generated from the active change at plan revision ${kernel.revision}.`,
    status: candidate.valid ? "human_choice_required" as const : "blocked" as const,
    viability: candidate.valid ? "constraint_validated" as const : "blocked" as const,
    nextTool: candidate.valid ? "finite_stage_option" : null,
    knownArgs: candidate.valid ? { candidateId: candidate.candidateId, expectedRevision: kernel.revision } : {},
    missingInputs: candidate.valid ? [{ argument: "candidate_choice", source: "human" as const, reason: "Codex may recommend, but the human chooses which outcome to stage.", question: "Which of these outcomes should I prepare for exact approval?" }] : [],
    tradeoffs: candidate.selectedMoves.map((move) => move.tradeoff),
    evidence: { status: candidate.evidenceBindings.length ? "available" as const : "not_required" as const, refs: candidate.evidenceBindings.map((binding) => binding.evidenceId) },
    candidateId: candidate.candidateId,
  }));

export const buildChefMenu = (kernel: FinitePlanKernel, route: KitchenRoute): { menuVersion: "finite-chef-menu.v1"; basis: Record<string, unknown>; items: ChefMenuItem[] } => {
  let items: ChefMenuItem[];
  if (kernel.pendingLifecycleChange && kernel.lifecycleConfirmation) {
    const change = kernel.pendingLifecycleChange;
    items = [{
      menuItemId: `lifecycle_apply_${change.lifecycleChangeId}`, rank: 1, kind: "operator_action",
      title: `Apply ${change.after} status`, offer: `Record this plan as ${change.after} and return an immutable receipt.`,
      whyNow: "The human confirmation matches the exact lifecycle change and current revision.", status: "ready", viability: "constraint_validated",
      nextTool: "finite_apply_confirmed_plan_lifecycle", knownArgs: { lifecycleChangeId: change.lifecycleChangeId, confirmationId: kernel.lifecycleConfirmation.confirmationId, expectedRevision: kernel.revision },
      missingInputs: [{ argument: "idempotencyKey", source: "derived", reason: "Codex must supply one stable retry identity for this exact command." }],
      tradeoffs: [change.reason], evidence: { status: "not_required", refs: [] },
    }];
  } else if (kernel.pendingLifecycleChange) {
    const change = kernel.pendingLifecycleChange;
    items = [{
      menuItemId: `lifecycle_review_${change.lifecycleChangeId}`, rank: 1, kind: "human_decision",
      title: `Mark this plan ${change.after}?`, offer: change.reason, whyNow: "A lifecycle conclusion is staged but has no human authority.",
      status: "human_choice_required", viability: "constraint_validated", nextTool: null,
      knownArgs: { lifecycleChangeId: change.lifecycleChangeId, expectedRevision: kernel.revision },
      missingInputs: [{ argument: "human_decision", source: "human", reason: "Only the human can conclude, pause, abandon, or reopen a plan.", question: `Should I mark this plan ${change.after}?` }],
      tradeoffs: ["Accepted planning work is preserved and remains auditable"], evidence: { status: "not_required", refs: [] },
    }];
  } else if (kernel.lifecycleStatus !== "active") {
    items = [{
      menuItemId: "lifecycle_reopen", rank: 1, kind: "human_decision", title: "Reopen this plan", offer: "Return the plan to active work without losing its accepted history.",
      whyNow: `The plan is ${kernel.lifecycleStatus}; new change events are intentionally blocked.`, status: "input_required", viability: "not_yet_tested", nextTool: "finite_stage_plan_lifecycle",
      knownArgs: { status: "active", expectedRevision: kernel.revision }, missingInputs: [{ argument: "reason", source: "human", reason: "The reason for reopening belongs to the human.", question: "What changed that makes this plan active again?" }],
      tradeoffs: ["Reopening creates a new accepted revision"], evidence: { status: "not_required", refs: [] },
    }];
  } else if (route.stage === "human_approved" && kernel.stagedCandidate && kernel.approval) {
    const candidate = kernel.stagedCandidate;
    items = [{
      menuItemId: `approved_${candidate.candidateId}`, rank: 1, kind: "operator_action",
      title: "Serve the approved option", offer: "Apply exactly the approved, constraint-validated option and return its receipt.",
      whyNow: "The human authority matches the staged candidate and current revision.",
      status: "ready", viability: "constraint_validated", nextTool: "finite_apply_approved_option",
      knownArgs: { candidateId: candidate.candidateId, approvalId: kernel.approval.approvalId, expectedRevision: kernel.revision },
      missingInputs: [{ argument: "idempotencyKey", source: "derived", reason: "Codex must supply one stable retry identity for this exact command." }],
      tradeoffs: candidate.selectedMoves.map((move) => move.tradeoff),
      evidence: { status: candidate.evidenceBindings.length ? "available" : "not_required", refs: candidate.evidenceBindings.map((binding) => binding.evidenceId) },
      candidateId: candidate.candidateId,
    }];
  } else if (route.stage === "awaiting_human" && kernel.stagedCandidate) {
    const candidate = kernel.stagedCandidate;
    items = [{
      menuItemId: `staged_${candidate.candidateId}`, rank: 1, kind: "human_decision",
      title: "Taste the prepared option", offer: "Review this exact staged outcome, return it, or approve it on the human surface.",
      whyNow: "Finite has frozen one constraint-validated option but no human authority is present.",
      status: "human_choice_required", viability: "constraint_validated", nextTool: null,
      knownArgs: { candidateId: candidate.candidateId, expectedRevision: kernel.revision },
      missingInputs: [{ argument: "human_decision", source: "human", reason: "Approval authority never comes from Codex.", question: "Approve this exact option, return it, or tell me what should change?" }],
      tradeoffs: candidate.selectedMoves.map((move) => move.tradeoff),
      evidence: { status: candidate.evidenceBindings.length ? "available" : "not_required", refs: candidate.evidenceBindings.map((binding) => binding.evidenceId) },
      candidateId: candidate.candidateId,
    }];
  } else if (kernel.candidates.size) items = candidateMenu(kernel);
  else if (route.stage === "change_recorded" && kernel.activeEventId) {
    items = [{
      menuItemId: "generate_constraint_validated_options", rank: 1, kind: "operator_action",
      title: "Cook three viable routes", offer: "I can search every bounded legal move and return three distinct outcomes for comparison.",
      whyNow: "The change is recorded against current accepted truth; options have not yet been generated.",
      status: "ready", viability: "not_yet_tested", nextTool: "finite_compare_options",
      knownArgs: { eventId: kernel.activeEventId, generate: true }, missingInputs: [],
      tradeoffs: ["Search is bounded by the compiled move policy", "No option is staged or approved automatically"],
      evidence: { status: "not_required", refs: [] },
    }];
  } else items = readyMenus[kernel.profile.planId] ?? genericReadyMenu(kernel);

  return {
    menuVersion: "finite-chef-menu.v1",
    basis: {
      planId: kernel.profile.planId,
      profileId: kernel.profile.profileId,
      profileHash: kernel.profile.profileHash,
      revision: kernel.revision,
      lifecycleStatus: kernel.lifecycleStatus,
      routeStage: route.stage,
      activeEventId: kernel.activeEventId,
      authorityPresent: route.authorityPresent,
      currencyCode: "AUD",
      minorUnit: 100,
      law: "Suggested routes are not viable candidates. Only constraint-validated options may be presented as viable, and only the human may choose or authorize one.",
    },
    items,
  };
};
