import { clone, deepFreeze, sha256 } from "./crypto.js";
import type { CompiledProfile, ProfileDefinition, ProfileId } from "./types.js";

const definitions: Record<ProfileId, ProfileDefinition> = {
  travel: {
    schemaVersion: "finite-plan-profile.v1",
    profileId: "travel",
    planId: "plan_travel_europe",
    name: "18-day Europe trip",
    accepted: { totalBudgetMinor: 650_000, spentMinor: 120_000, committedMinor: 265_000, forecastMinor: 190_000, bufferMinor: 75_000 },
    locks: ["international_flights", "total_budget"],
    preferenceLabels: ["one_excellent_hotel_night", "keep_paris_extension_if_viable"],
    preferenceWeights: { comfort: 60, experience: 75, buffer: 80, schedule: 55 },
    actuals: [
      { actualId: "actual_travel_lodging", label: "Paid lodging", originalAmountMinor: 40_000, evidenceRef: "evidence_current" },
      { actualId: "actual_travel_transit", label: "Paid local transit", originalAmountMinor: 30_000, evidenceRef: "evidence_current" },
      { actualId: "actual_travel_food", label: "Paid food", originalAmountMinor: 50_000, evidenceRef: "evidence_current" },
    ],
    entities: {
      trip_days: { entityId: "trip_days", kind: "duration", values: { days: 18 } },
      booked_segment_days: { entityId: "booked_segment_days", kind: "duration", values: { days: 18 } },
    },
    relationships: [
      { relationshipId: "travel_days_balance", type: "equal", left: { entityId: "trip_days", field: "days" }, right: { entityId: "booked_segment_days", field: "days" }, code: "TRIP_DAYS_UNALLOCATED" },
    ],
    moves: {
      shorten_netherlands: { savingsMinor: 32_000, daysDelta: -2, dimension: "netherlands_nights", tradeoff: "Two fewer Netherlands nights", impacts: { experience: 45, schedule: 15 } },
      increase_hostel_mix: { savingsMinor: 26_000, daysDelta: 0, dimension: "accommodation_mix", tradeoff: "Three additional hostel nights", impacts: { comfort: 55, experience: 10 } },
      reduce_meal_forecast: { savingsMinor: 18_000, daysDelta: 0, dimension: "meal_mix", tradeoff: "Four casual meals replace planned dining", impacts: { comfort: 10, experience: 35 } },
      cancel_flexible_tour: { savingsMinor: 24_000, daysDelta: 0, dimension: "flexible_tour", tradeoff: "One optional tour removed", impacts: { experience: 65 } },
      release_rail_allowance: { savingsMinor: 15_000, daysDelta: 0, dimension: "rail_flexibility", tradeoff: "Less ticket-change flexibility", impacts: { comfort: 15, schedule: 40 } },
      change_international_flights: { savingsMinor: 90_000, daysDelta: 0, dimension: "international_flights", tradeoff: "Changes locked flights", impacts: { comfort: 70, experience: 70, schedule: 80 } },
    },
    searchPolicy: { objectives: ["preserve_comfort", "balanced", "preserve_buffer"], optionCount: 3, maxMovesPerOption: 3, maxCombinations: 64 },
    evidencePolicy: { asOf: "2026-08-26", materialityMinor: 50_000, maxAgeDaysBySourceClass: { supplier_quote: 7, actual_receipt: 3650, user_statement: 30 } },
    contextualCapabilities: ["travel_extend_stay", "travel_change_comfort", "travel_move_segment"],
    surface: {
      version: "surface-profile.v1",
      timeModel: "calendar",
      nouns: { plan: "trip", commitment: "booking", buffer: "freedom", event: "change", option: "route" },
      hero: { eyebrow: "18 days · Europe", title: "More Paris, without losing the trip.", brief: "Add three nights in Paris. Keep the international flights fixed and preserve at least A$500 of breathing room." },
      primaryMeasures: [
        { label: "Trip length", selector: "entities", path: ["trip_days", "values", "days"], format: "days" },
        { label: "Booked days", selector: "entities", path: ["booked_segment_days", "values", "days"], format: "days" },
        { label: "Plan forecast", selector: "allocations", path: ["forecastMinor"], format: "money" },
        { label: "Freedom left", selector: "allocations", path: ["bufferMinor"], format: "money" },
      ],
      preferredComponents: ["finite_summary", "pressure_meter", "timeline_lane", "commitment_stack", "actual_forecast", "constraint_panel", "option_compare"],
      stages: [
        { stageId: "paris", label: "Paris", detail: "4 nights · one excellent hotel night protected", marker: "01–05", status: "current" },
        { stageId: "netherlands", label: "Netherlands", detail: "4 nights · two nights remain movable", marker: "06–09", status: "movable" },
        { stageId: "berlin", label: "Berlin", detail: "4 nights · accommodation mix flexible", marker: "10–13", status: "planned" },
        { stageId: "transit", label: "Travel days", detail: "Flights fixed · rail allowance flexible", marker: "14–18", status: "locked" },
      ],
    },
  },
  renovation: {
    schemaVersion: "finite-plan-profile.v1",
    profileId: "renovation",
    planId: "plan_renovation_kitchen",
    name: "Kitchen renovation",
    accepted: { totalBudgetMinor: 1_200_000, spentMinor: 280_000, committedMinor: 540_000, forecastMinor: 260_000, bufferMinor: 120_000 },
    locks: ["completion_date", "structural_scope", "total_budget"],
    preferenceLabels: ["protect_contingency", "prefer_original_tile_if_viable"],
    preferenceWeights: { comfort: 25, experience: 65, buffer: 85, schedule: 95 },
    actuals: [
      { actualId: "actual_renovation_demolition", label: "Demolition paid", originalAmountMinor: 120_000, evidenceRef: "evidence_current" },
      { actualId: "actual_renovation_services", label: "Services paid", originalAmountMinor: 160_000, evidenceRef: "evidence_current" },
    ],
    entities: {
      completion_day: { entityId: "completion_day", kind: "milestone", values: { day: 90 } },
      committed_completion_day: { entityId: "committed_completion_day", kind: "milestone", values: { day: 90 } },
    },
    relationships: [
      { relationshipId: "locked_completion", type: "lte", left: { entityId: "completion_day", field: "day" }, right: { entityId: "committed_completion_day", field: "day" }, code: "LOCKED_COMPLETION_DATE" },
    ],
    moves: {
      local_tile_substitution: { savingsMinor: 45_000, daysDelta: -10, dimension: "finish_material", tradeoff: "Local tile replaces preferred imported tile", impacts: { experience: 55 } },
      resequence_painting: { savingsMinor: 12_000, daysDelta: -4, dimension: "phase_sequence", tradeoff: "Painting moves before final cabinetry", impacts: { schedule: 15, experience: 10 } },
      weekend_labour: { savingsMinor: -20_000, daysDelta: -5, dimension: "labour_schedule", tradeoff: "One paid weekend shift", impacts: { comfort: 30, buffer: 45 } },
      simplify_splashback: { savingsMinor: 38_000, daysDelta: -2, dimension: "splashback_scope", tradeoff: "Simpler splashback pattern", impacts: { experience: 45 } },
      move_completion_date: { savingsMinor: 25_000, daysDelta: 14, dimension: "completion_date", tradeoff: "Changes locked completion date", impacts: { schedule: 100 } },
    },
    searchPolicy: { objectives: ["preserve_schedule", "balanced", "preserve_contingency"], optionCount: 3, maxMovesPerOption: 3, maxCombinations: 64 },
    evidencePolicy: { asOf: "2026-08-26", materialityMinor: 50_000, maxAgeDaysBySourceClass: { supplier_quote: 14, actual_receipt: 3650, user_statement: 30 } },
    contextualCapabilities: ["renovation_replace_material", "renovation_shift_phase", "renovation_update_quote"],
    surface: {
      version: "surface-profile.v1",
      timeModel: "phases",
      nouns: { plan: "build", commitment: "contract", buffer: "contingency", event: "change order", option: "recovery plan" },
      hero: { eyebrow: "90 days · Kitchen", title: "Protect the handover, not every finish.", brief: "Absorb a supplier delay without moving the committed completion date or consuming the contingency floor." },
      primaryMeasures: [
        { label: "Completion day", selector: "entities", path: ["completion_day", "values", "day"], format: "days" },
        { label: "Committed handover", selector: "entities", path: ["committed_completion_day", "values", "day"], format: "days" },
        { label: "Forecast at completion", selector: "allocations", path: ["forecastMinor"], format: "money" },
        { label: "Contingency", selector: "allocations", path: ["bufferMinor"], format: "money" },
      ],
      preferredComponents: ["finite_summary", "pressure_meter", "phase_lane", "commitment_stack", "entity_table", "change_tray", "option_compare"],
      stages: [
        { stageId: "stripout", label: "Strip-out", detail: "Demolition complete and paid", marker: "Days 1–12", status: "complete" },
        { stageId: "services", label: "Services", detail: "Electrical and plumbing committed", marker: "Days 13–35", status: "current" },
        { stageId: "cabinetry", label: "Cabinetry", detail: "Critical-path fabrication", marker: "Days 36–67", status: "locked" },
        { stageId: "finishes", label: "Finishes", detail: "Tile and splashback remain movable", marker: "Days 68–90", status: "movable" },
      ],
    },
  },
  event: {
    schemaVersion: "finite-plan-profile.v1",
    profileId: "event",
    planId: "plan_event_launch",
    name: "Product launch event",
    accepted: { totalBudgetMinor: 300_000, spentMinor: 60_000, committedMinor: 120_000, forecastMinor: 80_000, bufferMinor: 40_000 },
    locks: ["venue_capacity", "doors_time", "total_budget"],
    preferenceLabels: ["protect_guest_experience", "keep_headcount_if_viable"],
    preferenceWeights: { comfort: 45, experience: 90, buffer: 75, schedule: 80 },
    actuals: [
      { actualId: "actual_event_venue", label: "Venue deposit paid", originalAmountMinor: 40_000, evidenceRef: "evidence_current" },
      { actualId: "actual_event_permits", label: "Permits paid", originalAmountMinor: 20_000, evidenceRef: "evidence_current" },
    ],
    entities: {
      guest_headcount: { entityId: "guest_headcount", kind: "quantity", values: { count: 100 } },
      venue: { entityId: "venue", kind: "place", values: { capacity: 120 } },
    },
    relationships: [
      { relationshipId: "venue_capacity", type: "lte", left: { entityId: "guest_headcount", field: "count" }, right: { entityId: "venue", field: "capacity" }, code: "VENUE_CAPACITY_EXCEEDED" },
    ],
    moves: {
      simplify_service_level: { savingsMinor: 35_000, daysDelta: 0, dimension: "service_level", tradeoff: "Reduced roaming service", impacts: { comfort: 20, experience: 55 } },
      sponsor_av_package: { savingsMinor: 22_000, daysDelta: 0, dimension: "av_package", tradeoff: "Sponsor branding added to AV", impacts: { experience: 10 } },
      menu_substitution: { savingsMinor: 28_000, daysDelta: 0, dimension: "menu", tradeoff: "Shared plates replace canapes", impacts: { comfort: 15, experience: 30 } },
      shorten_program: { savingsMinor: 18_000, daysDelta: 0, dimension: "run_of_show", tradeoff: "Program shortened by twenty minutes", impacts: { experience: 40, schedule: 10 } },
      exceed_venue_capacity: { savingsMinor: 10_000, daysDelta: 0, dimension: "venue_capacity", tradeoff: "Exceeds locked venue capacity", impacts: { comfort: 80, experience: 80 } },
    },
    searchPolicy: { objectives: ["preserve_experience", "balanced", "preserve_buffer"], optionCount: 3, maxMovesPerOption: 3, maxCombinations: 64 },
    evidencePolicy: { asOf: "2026-08-26", materialityMinor: 30_000, maxAgeDaysBySourceClass: { supplier_quote: 14, actual_receipt: 3650, user_statement: 14 } },
    contextualCapabilities: ["event_change_headcount", "event_replace_vendor", "event_move_run_item"],
    surface: {
      version: "surface-profile.v1",
      timeModel: "run_of_show",
      nouns: { plan: "show", commitment: "deposit", buffer: "contingency", event: "production change", option: "show plan" },
      hero: { eyebrow: "120 capacity · Launch night", title: "Welcome more guests without breaking the room.", brief: "Increase headcount while protecting venue capacity, committed deposits, and the guest experience." },
      primaryMeasures: [
        { label: "Guest count", selector: "entities", path: ["guest_headcount", "values", "count"], format: "number" },
        { label: "Venue capacity", selector: "entities", path: ["venue", "values", "capacity"], format: "number" },
        { label: "Show forecast", selector: "allocations", path: ["forecastMinor"], format: "money" },
        { label: "Contingency", selector: "allocations", path: ["bufferMinor"], format: "money" },
      ],
      preferredComponents: ["finite_summary", "pressure_meter", "run_of_show", "commitment_stack", "entity_table", "change_tray", "option_compare"],
      stages: [
        { stageId: "doors", label: "Doors", detail: "Guest arrival and check-in", marker: "17:30", status: "locked" },
        { stageId: "welcome", label: "Welcome", detail: "Host opening and safety brief", marker: "18:00", status: "complete" },
        { stageId: "keynote", label: "Keynote", detail: "Product story and reveal", marker: "18:20", status: "current" },
        { stageId: "showcase", label: "Showcase", detail: "Demos, food and partner floor", marker: "19:00", status: "movable" },
        { stageId: "close", label: "Close", detail: "Final call and guest departure", marker: "20:15", status: "planned" },
      ],
    },
  },
};

const allocationTotal = (profile: ProfileDefinition): number => {
  const value = profile.accepted;
  return value.spentMinor + value.committedMinor + value.forecastMinor + value.bufferMinor;
};

const surfaceComponents = new Set([
  "finite_summary", "pressure_meter", "timeline_lane", "phase_lane", "run_of_show", "entity_table",
  "commitment_stack", "actual_forecast", "constraint_panel", "change_tray", "option_compare", "approval_panel",
]);
const searchObjectives = new Set(["preserve_comfort", "preserve_experience", "preserve_buffer", "preserve_contingency", "preserve_schedule", "balanced"]);

const unsafeSurfaceText = (value: string): boolean => /<\/?(?:script|style|iframe)|javascript:|data:text\/html|\{\{|\}\}/i.test(value);

export class ProfileValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid finite-plan profile:\n- ${issues.join("\n- ")}`);
    this.name = "ProfileValidationError";
  }
}

export const compileProfile = async (input: ProfileDefinition): Promise<CompiledProfile> => {
  const profile = clone(input);
  const issues: string[] = [];
  if (profile.schemaVersion !== "finite-plan-profile.v1") issues.push("unsupported schemaVersion");
  if (allocationTotal(profile) !== profile.accepted.totalBudgetMinor) issues.push("accepted allocations do not conserve totalBudgetMinor");
  if (profile.actuals.reduce((total, actual) => total + actual.originalAmountMinor, 0) !== profile.accepted.spentMinor) issues.push("actual ledger does not equal spentMinor");
  if (new Set(profile.actuals.map((actual) => actual.actualId)).size !== profile.actuals.length) issues.push("actualId values must be unique");
  for (const [key, weight] of Object.entries(profile.preferenceWeights)) {
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) issues.push(`preference weight ${key} must be an integer from 0 to 100`);
  }
  for (const [entityKey, entity] of Object.entries(profile.entities)) {
    if (entity.entityId !== entityKey) issues.push(`entity key ${entityKey} does not match entityId`);
    for (const [field, value] of Object.entries(entity.values)) if (!Number.isFinite(value)) issues.push(`entity ${entityKey}.${field} must be numeric`);
  }
  for (const relationship of profile.relationships) {
    for (const endpoint of [relationship.left, relationship.right]) {
      const entity = profile.entities[endpoint.entityId];
      if (!entity) issues.push(`relationship ${relationship.relationshipId} references missing entity ${endpoint.entityId}`);
      else if (!(endpoint.field in entity.values)) issues.push(`relationship ${relationship.relationshipId} references missing field ${endpoint.entityId}.${endpoint.field}`);
    }
  }
  for (const [moveId, move] of Object.entries(profile.moves)) {
    for (const [preference, impact] of Object.entries(move.impacts)) {
      if (!(preference in profile.preferenceWeights)) issues.push(`move ${moveId} references unknown preference ${preference}`);
      if (!Number.isInteger(impact) || impact < 0 || impact > 100) issues.push(`move ${moveId} impact ${preference} must be an integer from 0 to 100`);
    }
  }
  const legalMoveCount = Object.values(profile.moves).filter((move) => !profile.locks.includes(move.dimension)).length;
  if (!profile.searchPolicy.objectives.length || new Set(profile.searchPolicy.objectives).size !== profile.searchPolicy.objectives.length) issues.push("search objectives must be non-empty and unique");
  if (profile.searchPolicy.objectives.some((objective) => !searchObjectives.has(objective))) issues.push("search contains an unsupported objective");
  if (!Number.isInteger(profile.searchPolicy.optionCount) || profile.searchPolicy.optionCount < 1 || profile.searchPolicy.optionCount > profile.searchPolicy.objectives.length) issues.push("search optionCount must fit the objective count");
  if (!Number.isInteger(profile.searchPolicy.maxMovesPerOption) || profile.searchPolicy.maxMovesPerOption < 0 || profile.searchPolicy.maxMovesPerOption > legalMoveCount) issues.push("search maxMovesPerOption must fit the legal move count");
  if (!Number.isInteger(profile.searchPolicy.maxCombinations) || profile.searchPolicy.maxCombinations < profile.searchPolicy.optionCount || profile.searchPolicy.maxCombinations > 256) issues.push("search maxCombinations must be between optionCount and 256");
  if (profile.contextualCapabilities.some((name) => !name.startsWith(`${profile.profileId}_`))) issues.push("contextual capability prefix must match profileId");
  if (profile.surface.version !== "surface-profile.v1") issues.push("unsupported surface profile version");
  const expectedTimeModel = ({ travel: "calendar", renovation: "phases", event: "run_of_show" } as const)[profile.profileId];
  if (profile.surface.timeModel !== expectedTimeModel) issues.push(`surface time model for ${profile.profileId} must be ${expectedTimeModel}`);
  const expectedLane = ({ travel: "timeline_lane", renovation: "phase_lane", event: "run_of_show" } as const)[profile.profileId];
  if (!profile.surface.preferredComponents.includes(expectedLane)) issues.push(`surface for ${profile.profileId} must include ${expectedLane}`);
  if (profile.surface.preferredComponents.some((component) => !surfaceComponents.has(component))) issues.push("surface contains an unknown component");
  if (new Set(profile.surface.preferredComponents).size !== profile.surface.preferredComponents.length) issues.push("surface components must be unique");
  if (new Set(profile.surface.stages.map((stage) => stage.stageId)).size !== profile.surface.stages.length) issues.push("surface stage ids must be unique");
  const surfaceText = [profile.surface.hero.eyebrow, profile.surface.hero.title, profile.surface.hero.brief, ...Object.values(profile.surface.nouns), ...profile.surface.stages.flatMap((stage) => [stage.label, stage.detail, stage.marker])];
  if (surfaceText.some(unsafeSurfaceText)) issues.push("surface text contains executable or template syntax");
  for (const measure of profile.surface.primaryMeasures) {
    if (unsafeSurfaceText(measure.label)) issues.push(`surface measure ${measure.label} contains unsafe text`);
    if (measure.selector === "allocations") {
      if (measure.path.length !== 1 || !(measure.path[0]! in profile.accepted)) issues.push(`surface measure ${measure.label} references an unknown allocation`);
    } else if (measure.selector === "entities") {
      const [entityId, valuesKey, field, ...rest] = measure.path;
      if (rest.length || valuesKey !== "values" || !entityId || !field || !(field in (profile.entities[entityId]?.values ?? {}))) issues.push(`surface measure ${measure.label} references an unknown entity field`);
    } else {
      issues.push(`surface measure ${measure.label} uses unsupported selector ${measure.selector}`);
    }
  }
  if (!Number.isFinite(Date.parse(`${profile.evidencePolicy.asOf}T00:00:00Z`))) issues.push("evidencePolicy.asOf must be YYYY-MM-DD");
  if (profile.evidencePolicy.materialityMinor < 0) issues.push("evidence materiality must not be negative");
  for (const [sourceClass, days] of Object.entries(profile.evidencePolicy.maxAgeDaysBySourceClass)) if (!Number.isInteger(days) || days < 0) issues.push(`evidence max age for ${sourceClass} must be a non-negative integer`);
  if (issues.length) throw new ProfileValidationError(issues);
  const profileHash = await sha256(profile);
  return deepFreeze({ ...profile, profileHash }) as CompiledProfile;
};

export const compileBuiltInProfiles = async (): Promise<Map<ProfileId, CompiledProfile>> => {
  const entries = await Promise.all((Object.keys(definitions) as ProfileId[]).map(async (profileId) => [profileId, await compileProfile(definitions[profileId])] as const));
  return new Map(entries);
};

export const getProfileDefinition = (profileId: ProfileId): ProfileDefinition => clone(definitions[profileId]);
