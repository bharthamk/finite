import { clone, sha256 } from "./crypto.js";
import type { FinitePlanKernel } from "./kernel.js";
import type {
  CompiledProfile,
  StateSelector,
  SurfaceComponentType,
  SurfaceFieldBinding,
  SurfaceIntent,
  SurfaceManifest,
  SurfaceZone,
} from "./types.js";

type AcceptedCopyChange = { factId: string; format: string; before: number; after: number };

const escapePattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const smallNumberWords = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
] as const;

const preserveWordCase = (before: string, after: string): string => before === before.toUpperCase()
  ? after.toUpperCase()
  : before[0] === before[0]?.toUpperCase() ? `${after[0]?.toUpperCase() ?? ""}${after.slice(1)}` : after;

const projectMoneyCopy = (text: string, beforeMinor: number, afterMinor: number): string => {
  const beforeMajor = beforeMinor / 100;
  const afterMajor = afterMinor / 100;
  const before = new Intl.NumberFormat("en-AU", { minimumFractionDigits: Number.isInteger(beforeMajor) ? 0 : 2, maximumFractionDigits: 2 }).format(beforeMajor);
  const after = new Intl.NumberFormat("en-AU", { minimumFractionDigits: Number.isInteger(afterMajor) ? 0 : 2, maximumFractionDigits: 2 }).format(afterMajor);
  return text.replace(new RegExp(`((?:A\\$|\\$)\\s*)${escapePattern(before)}(?:\\.00)?(?![\\d.])`, "g"), `$1${after}`);
};

const projectNumberCopy = (text: string, before: number, after: number): string => {
  let projected = text.replace(new RegExp(`(?<![\\d.])${escapePattern(String(before))}(?![\\d.])`, "g"), String(after));
  const beforeWord = smallNumberWords[before];
  if (!beforeWord) return projected;
  const afterWord = smallNumberWords[after] ?? String(after);
  projected = projected.replace(new RegExp(`\\b${beforeWord}\\b`, "gi"), (match) => preserveWordCase(match, afterWord));
  return projected;
};

const acceptedCopyChanges = (kernel: FinitePlanKernel): AcceptedCopyChange[] => kernel.receipts
  .filter((receipt) => receipt.receiptType === "plan_fact_change")
  .flatMap((receipt) => {
    const change = receipt.payload.planFactChange;
    if (!change || typeof change !== "object" || !("changes" in change) || !Array.isArray(change.changes)) return [];
    return change.changes.flatMap((candidate): AcceptedCopyChange[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const record = candidate as Record<string, unknown>;
      return typeof record.factId === "string" && typeof record.format === "string" && typeof record.before === "number" && typeof record.after === "number"
        ? [{ factId: record.factId, format: record.format, before: record.before, after: record.after }]
        : [];
    });
  });

export const projectAcceptedPlanCopy = (text: string, kernel: FinitePlanKernel): string => acceptedCopyChanges(kernel)
  .reduce((projected, change) => change.factId === "allocations.forecastMinor" ? projected : change.format === "money"
    ? projectMoneyCopy(projected, change.before, change.after)
    : projectNumberCopy(projected, change.before, change.after), text);

const supportedComponents = new Set<SurfaceComponentType>([
  "finite_summary", "pressure_meter", "timeline_lane", "phase_lane", "run_of_show", "entity_table",
  "commitment_stack", "actual_forecast", "constraint_panel", "change_tray", "option_compare", "approval_panel",
]);

const coreActions = [
  "finite_get_capabilities", "finite_open_kitchen", "finite_enter_kitchen", "finite_get_chef_menu", "finite_open_toolset", "finite_create_arrival_order", "finite_append_arrival_input", "finite_open_arrival", "finite_reconcile_arrival", "finite_checkpoint_arrival", "finite_stage_clarification", "finite_stage_interpretation", "finite_list_plans", "finite_get_plan_blueprint", "finite_assess_plan_intake", "finite_compile_intake_to_draft", "finite_get_construction_packet", "finite_resume_build_packet", "finite_discard_build_packet", "finite_get_amendment_blueprint", "finite_get_plan_state", "finite_get_movable_set", "finite_record_change_event",
  "finite_simulate_reallocation", "finite_compare_options", "finite_record_feedback",
  "finite_list_plan_facts", "finite_stage_plan_facts", "finite_apply_plan_facts",
  "finite_stage_preference_change", "finite_apply_confirmed_preference_change", "finite_stage_actual_correction",
  "finite_apply_confirmed_actual_correction", "finite_stage_option", "finite_reject_staged_option",
  "finite_apply_approved_option", "finite_read_evidence", "finite_get_evidence_policy", "finite_export_plan_receipt",
  "finite_stage_plan_draft", "finite_stage_plan_amendment", "finite_activate_confirmed_plan", "finite_switch_plan", "finite_switch_profile", "finite_get_reset_preview", "finite_reset_kitchen",
  "finite_list_plan_inputs", "finite_add_plan_input", "finite_update_plan_input", "finite_resolve_plan_input",
  "finite_list_themes", "finite_get_theme_schema", "finite_preview_theme", "finite_save_custom_theme", "finite_set_theme", "finite_delete_custom_theme",
  "finite_list_skins", "finite_get_skin_schema", "finite_preview_skin", "finite_save_custom_skin", "finite_set_skin", "finite_delete_custom_skin",
] as const;

const zoneContract: Record<SurfaceComponentType, { title: string; selectors: StateSelector[]; required?: boolean }> = {
  finite_summary: { title: "Money", selectors: ["identity", "allocations"], required: true },
  pressure_meter: { title: "Room to move", selectors: ["allocations", "constraints"], required: true },
  timeline_lane: { title: "Plan timeline", selectors: ["entities", "constraints"] },
  phase_lane: { title: "Plan timeline", selectors: ["entities", "constraints"] },
  run_of_show: { title: "Plan timeline", selectors: ["entities", "constraints"] },
  entity_table: { title: "Operating measures", selectors: ["entities", "allocations"] },
  commitment_stack: { title: "Already true", selectors: ["actuals", "constraints", "allocations"] },
  actual_forecast: { title: "Actual and forecast", selectors: ["actuals", "allocations"] },
  constraint_panel: { title: "Boundaries", selectors: ["constraints", "preferences"], required: true },
  change_tray: { title: "Changes", selectors: ["pending", "lineage"] },
  option_compare: { title: "Decisions", selectors: ["allocations", "preferences", "pending"] },
  approval_panel: { title: "Exact approval", selectors: ["allocations", "pending", "lineage"] },
};

const unsafeText = (value: string): boolean => /<\/?(?:script|style|iframe)|javascript:|data:text\/html|\{\{|\}\}/i.test(value);

export class SurfaceValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid surface intent:\n- ${issues.join("\n- ")}`);
    this.name = "SurfaceValidationError";
  }
}

const bindingsFor = (component: SurfaceComponentType, profile: CompiledProfile): SurfaceFieldBinding[] => {
  if (["finite_summary", "pressure_meter", "entity_table"].includes(component)) return clone(profile.surface.primaryMeasures);
  return [];
};

const unique = <T>(values: T[]): T[] => [...new Set(values)];

export const compileSurfaceManifest = async (
  profile: CompiledProfile,
  kernel: FinitePlanKernel,
  intent?: SurfaceIntent,
): Promise<SurfaceManifest> => {
  const issues: string[] = [];
  if (profile.profileId !== kernel.profile.profileId || profile.profileHash !== kernel.profile.profileHash) issues.push("profile does not match active kernel");
  if (intent?.planRevision !== undefined && intent.planRevision !== kernel.revision) issues.push(`stale plan revision ${intent.planRevision}; current revision is ${kernel.revision}`);
  if (intent && [intent.decisionFocus, intent.rationale, ...intent.emphasizedMeasures].some(unsafeText)) issues.push("surface intent contains executable or template syntax");
  const requested = intent?.requestedZones ?? [];
  for (const component of requested) if (!supportedComponents.has(component)) issues.push(`unknown component ${String(component)}`);

  const candidatesAvailable = [...kernel.candidates.values()].some((candidate) => candidate.baseRevision === kernel.revision);
  const components = unique<SurfaceComponentType>([
    ...profile.surface.preferredComponents,
    "constraint_panel",
    ...(candidatesAvailable ? ["option_compare" as const] : []),
    ...(kernel.stagedCandidate ? ["approval_panel" as const] : []),
    ...requested,
  ]);
  const collapsed = new Set(intent?.collapsedZones ?? []);
  for (const component of components) {
    const contract = zoneContract[component];
    if (collapsed.has(component) && contract.required) issues.push(`required component ${component} cannot be collapsed`);
    if (collapsed.has(component) && component === "approval_panel" && kernel.stagedCandidate) issues.push("approval_panel cannot be collapsed while a decision is staged");
  }
  if (issues.length) throw new SurfaceValidationError(issues);

  const zones: SurfaceZone[] = components.map((component) => {
    const contract = zoneContract[component];
    return {
      zoneId: component,
      component,
      title: contract.title,
      selectors: clone(contract.selectors),
      bindings: bindingsFor(component, profile),
      required: Boolean(contract.required || (component === "approval_panel" && kernel.stagedCandidate)),
      collapsed: collapsed.has(component),
    };
  });
  const latestEvent = [...kernel.events].reverse().find((event) => event.baseRevision === kernel.revision);
  const base = {
    schemaVersion: "finite-plan-surface.v1" as const,
    planId: profile.planId,
    planRevision: kernel.revision,
    profileId: profile.profileId,
    profileVersion: profile.surface.version,
    timeModel: profile.surface.timeModel,
    title: projectAcceptedPlanCopy(profile.surface.hero.title, kernel),
    brief: projectAcceptedPlanCopy(profile.surface.hero.brief, kernel),
    nouns: clone(profile.surface.nouns),
    summaryFields: clone(profile.surface.primaryMeasures),
    stages: profile.surface.stages.map((stage) => ({
      ...clone(stage),
      label: projectAcceptedPlanCopy(stage.label, kernel),
      detail: projectAcceptedPlanCopy(stage.detail, kernel),
      marker: projectAcceptedPlanCopy(stage.marker, kernel),
    })),
    ...(profile.surface.dependencies?.length ? { dependencies: clone(profile.surface.dependencies) } : {}),
    ...(profile.surface.assumptions?.length ? { assumptions: clone(profile.surface.assumptions) } : {}),
    zones,
    availableActions: [...coreActions, ...profile.contextualCapabilities].sort(),
    decisionFocus: intent?.decisionFocus || latestEvent?.title || null,
  };
  return { ...base, manifestHash: await sha256(base) };
};

export const resolveSurfaceBinding = (kernel: FinitePlanKernel, binding: SurfaceFieldBinding): unknown => {
  const result = kernel.getState([binding.selector]);
  let value: unknown = (result.state as Record<string, unknown>)[binding.selector];
  for (const segment of binding.path) {
    if (value === null || typeof value !== "object" || !(segment in value)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return clone(value);
};
