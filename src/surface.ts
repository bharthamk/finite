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

const supportedComponents = new Set<SurfaceComponentType>([
  "finite_summary", "pressure_meter", "timeline_lane", "phase_lane", "run_of_show", "entity_table",
  "commitment_stack", "actual_forecast", "constraint_panel", "change_tray", "option_compare", "approval_panel",
]);

const coreActions = [
  "finite_get_capabilities", "finite_list_plans", "finite_get_plan_blueprint", "finite_assess_plan_intake", "finite_get_amendment_blueprint", "finite_get_plan_state", "finite_get_movable_set", "finite_record_change_event",
  "finite_simulate_reallocation", "finite_compare_options", "finite_record_consumer_feedback",
  "finite_stage_preference_change", "finite_apply_confirmed_preference_change", "finite_stage_actual_correction",
  "finite_apply_confirmed_actual_correction", "finite_stage_option", "finite_reject_staged_option",
  "finite_apply_approved_option", "finite_read_evidence", "finite_get_evidence_policy", "finite_export_plan_receipt",
  "finite_stage_plan_draft", "finite_stage_plan_amendment", "finite_activate_confirmed_plan", "finite_switch_plan", "finite_switch_profile",
] as const;

const zoneContract: Record<SurfaceComponentType, { title: string; selectors: StateSelector[]; required?: boolean }> = {
  finite_summary: { title: "The finite plan", selectors: ["identity", "allocations"], required: true },
  pressure_meter: { title: "Room to move", selectors: ["allocations", "constraints"], required: true },
  timeline_lane: { title: "Trip shape", selectors: ["entities", "constraints"] },
  phase_lane: { title: "Critical path", selectors: ["entities", "constraints"] },
  run_of_show: { title: "Run of show", selectors: ["entities", "constraints"] },
  entity_table: { title: "Operating measures", selectors: ["entities", "allocations"] },
  commitment_stack: { title: "Already true", selectors: ["actuals", "constraints", "allocations"] },
  actual_forecast: { title: "Actual and forecast", selectors: ["actuals", "allocations"] },
  constraint_panel: { title: "What cannot move", selectors: ["constraints", "preferences"], required: true },
  change_tray: { title: "What changed", selectors: ["pending", "lineage"] },
  option_compare: { title: "Ways through", selectors: ["allocations", "preferences", "pending"] },
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
    title: profile.surface.hero.title,
    brief: profile.surface.hero.brief,
    nouns: clone(profile.surface.nouns),
    summaryFields: clone(profile.surface.primaryMeasures),
    stages: clone(profile.surface.stages),
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
