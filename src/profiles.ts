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
  general: {
    schemaVersion: "finite-plan-profile.v1",
    profileId: "general",
    planId: "plan_general_adaptive",
    name: "Adaptive plan",
    accepted: { totalBudgetMinor: 0, spentMinor: 0, committedMinor: 0, forecastMinor: 0, bufferMinor: 0 },
    locks: ["preserve_human_set_details"],
    preferenceLabels: ["keep_working_assumptions_visible"],
    preferenceWeights: { comfort: 50, experience: 50, buffer: 50, schedule: 50 },
    actuals: [],
    entities: {
      plan_items: { entityId: "plan_items", kind: "quantity", values: { count: 1 } },
      open_dependencies: { entityId: "open_dependencies", kind: "quantity", values: { count: 0 } },
    },
    relationships: [],
    moves: {},
    searchPolicy: { objectives: ["balanced"], optionCount: 1, maxMovesPerOption: 0, maxCombinations: 1 },
    evidencePolicy: { asOf: "2026-08-30", materialityMinor: 0, maxAgeDaysBySourceClass: { supplier_quote: 14, actual_receipt: 3650, user_statement: 30 } },
    contextualCapabilities: [],
    planningDimensions: { money: "unknown", location: "unknown", capacity: "unknown" },
    surface: {
      version: "surface-profile.v1",
      timeModel: "calendar",
      nouns: { plan: "plan", commitment: "commitment", buffer: "room to move", event: "change", option: "option" },
      hero: { eyebrow: "Adaptive plan", title: "A useful plan you can keep shaping.", brief: "Organise the outcome, sequence, tasks, evidence, decisions, and constraints without forcing irrelevant planning dimensions." },
      primaryMeasures: [
        { label: "Plan items", selector: "entities", path: ["plan_items", "values", "count"], format: "number" },
        { label: "Open dependencies", selector: "entities", path: ["open_dependencies", "values", "count"], format: "number" },
      ],
      preferredComponents: ["timeline_lane", "entity_table", "constraint_panel", "change_tray"],
      stages: [
        { stageId: "begin", label: "Begin the plan", detail: "Choose the first practical action.", marker: "Up next", status: "current" },
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
const evidenceSourceClasses = new Set(["supplier_quote", "actual_receipt", "user_statement"]);

const unsafeSurfaceText = (value: string): boolean => /<\/?(?:script|style|iframe)|javascript:|data:text\/html|\{\{|\}\}/i.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const safeBoundedText = (value: unknown, max = 200): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= max && !unsafeSurfaceText(value);
const boundedId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{2,63}$/.test(value);
const topLevelKeys = new Set(["schemaVersion", "profileId", "planId", "name", "currencyCode", "accepted", "locks", "preferenceLabels", "preferenceWeights", "actuals", "entities", "relationships", "moves", "searchPolicy", "evidencePolicy", "contextualCapabilities", "planningDimensions", "surface"]);

export class ProfileValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid finite-plan profile:\n- ${issues.join("\n- ")}`);
    this.name = "ProfileValidationError";
  }
}

const compileProfileUnchecked = async (input: ProfileDefinition): Promise<CompiledProfile> => {
  if (!isRecord(input)) throw new ProfileValidationError(["profile must be an object"]);
  if (JSON.stringify(input).length > 100_000) throw new ProfileValidationError(["profile definition exceeds 100,000 serialized characters"]);
  const raw = clone(input as unknown);
  if (!isRecord(raw)) throw new ProfileValidationError(["profile must be an object"]);
  const structuralIssues: string[] = [];
  if (!(raw.profileId === "travel" || raw.profileId === "renovation" || raw.profileId === "event" || raw.profileId === "general")) structuralIssues.push("profileId must be travel, renovation, event, or general");
  if (!isRecord(raw.accepted)) structuralIssues.push("accepted allocation is required");
  if (!Array.isArray(raw.actuals)) structuralIssues.push("actuals must be an array");
  if (!Array.isArray(raw.locks)) structuralIssues.push("locks must be an array");
  if (!Array.isArray(raw.preferenceLabels)) structuralIssues.push("preferenceLabels must be an array");
  if (!isRecord(raw.preferenceWeights)) structuralIssues.push("preferenceWeights are required");
  if (!isRecord(raw.entities)) structuralIssues.push("entities are required");
  if (!Array.isArray(raw.relationships)) structuralIssues.push("relationships must be an array");
  if (!isRecord(raw.moves)) structuralIssues.push("moves are required");
  if (!isRecord(raw.searchPolicy)) structuralIssues.push("searchPolicy is required");
  if (!isRecord(raw.evidencePolicy)) structuralIssues.push("evidencePolicy is required");
  if (!Array.isArray(raw.contextualCapabilities)) structuralIssues.push("contextualCapabilities must be an array");
  if (!isRecord(raw.surface)) structuralIssues.push("surface profile is required");
  if (structuralIssues.length) throw new ProfileValidationError(structuralIssues);
  const profile = raw as unknown as ProfileDefinition;
  const issues: string[] = [];
  for (const key of Object.keys(raw)) if (!topLevelKeys.has(key)) issues.push(`unknown top-level profile field ${key}`);
  if (profile.schemaVersion !== "finite-plan-profile.v1") issues.push("unsupported schemaVersion");
  if (!boundedId(profile.planId)) issues.push("planId must be a lowercase bounded identifier");
  if (!safeBoundedText(profile.name, 120)) issues.push("name must be safe text up to 120 characters");
  if (profile.currencyCode !== undefined && !/^[A-Z]{3}$/.test(profile.currencyCode)) issues.push("currencyCode must be a three-letter uppercase code");
  if (profile.locks.length > 30 || profile.locks.some((lock) => !boundedId(lock))) issues.push("locks must contain at most 30 bounded identifiers");
  if (new Set(profile.locks).size !== profile.locks.length) issues.push("locks must be unique");
  if (profile.preferenceLabels.length > 20 || profile.preferenceLabels.some((label) => !boundedId(label))) issues.push("preferenceLabels must contain at most 20 bounded identifiers");
  for (const [field, value] of Object.entries(profile.accepted)) if (!Number.isInteger(value) || value < 0) issues.push(`accepted ${field} must be a non-negative integer`);
  const moneyState = profile.planningDimensions?.money ?? "positive";
  const dimensionStates = new Set(["not_applicable", "unknown", "zero", "positive"]);
  if (profile.planningDimensions) {
    for (const dimension of ["money", "location", "capacity"] as const) if (!dimensionStates.has(profile.planningDimensions[dimension])) issues.push(`planning dimension ${dimension} has an unsupported state`);
  }
  if (moneyState === "positive" && profile.accepted.totalBudgetMinor <= 0) issues.push("totalBudgetMinor must be positive when the money dimension is positive");
  if ((moneyState === "zero" || moneyState === "not_applicable" || moneyState === "unknown") && profile.accepted.totalBudgetMinor !== 0) issues.push(`totalBudgetMinor must be zero when the money dimension is ${moneyState}`);
  if (allocationTotal(profile) !== profile.accepted.totalBudgetMinor) issues.push("accepted allocations do not conserve totalBudgetMinor");
  if (profile.actuals.length > 100) issues.push("actual ledger must contain at most 100 records");
  for (const actual of profile.actuals) {
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(actual.actualId)) issues.push("actualId must be a lowercase bounded identifier");
    if (!safeBoundedText(actual.label, 120)) issues.push(`actual ${actual.actualId} label must be safe bounded text`);
    if (!Number.isInteger(actual.originalAmountMinor) || actual.originalAmountMinor < 0) issues.push(`actual ${actual.actualId} amount must be a non-negative integer`);
    if (!safeBoundedText(actual.evidenceRef, 80)) issues.push(`actual ${actual.actualId} evidenceRef is required`);
  }
  if (profile.actuals.reduce((total, actual) => total + actual.originalAmountMinor, 0) !== profile.accepted.spentMinor) issues.push("actual ledger does not equal spentMinor");
  if (new Set(profile.actuals.map((actual) => actual.actualId)).size !== profile.actuals.length) issues.push("actualId values must be unique");
  for (const [key, weight] of Object.entries(profile.preferenceWeights)) {
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) issues.push(`preference weight ${key} must be an integer from 0 to 100`);
  }
  for (const [entityKey, entity] of Object.entries(profile.entities)) {
    if (!boundedId(entityKey)) issues.push(`entity key ${entityKey} must be a bounded identifier`);
    if (entity.entityId !== entityKey) issues.push(`entity key ${entityKey} does not match entityId`);
    if (!safeBoundedText(entity.kind, 80)) issues.push(`entity ${entityKey} kind must be safe bounded text`);
    if (!isRecord(entity.values) || Object.keys(entity.values).length > 20) issues.push(`entity ${entityKey} must contain at most 20 values`);
    else for (const [field, value] of Object.entries(entity.values)) {
      if (!boundedId(field)) issues.push(`entity ${entityKey} field ${field} must be a bounded identifier`);
      if (!Number.isSafeInteger(value)) issues.push(`entity ${entityKey}.${field} must be a safe integer`);
    }
  }
  if (Object.keys(profile.entities).length > 50) issues.push("profile must contain at most 50 entities");
  if (profile.relationships.length > 100) issues.push("profile must contain at most 100 relationships");
  if (new Set(profile.relationships.map((relationship) => relationship.relationshipId)).size !== profile.relationships.length) issues.push("relationship ids must be unique");
  for (const relationship of profile.relationships) {
    if (!boundedId(relationship.relationshipId) || !safeBoundedText(relationship.code, 100)) issues.push("relationship id and code must be bounded text");
    if (!(relationship.type === "lte" || relationship.type === "equal")) issues.push(`relationship ${relationship.relationshipId} has unsupported type`);
    for (const endpoint of [relationship.left, relationship.right]) {
      const entity = profile.entities[endpoint.entityId];
      if (!entity) issues.push(`relationship ${relationship.relationshipId} references missing entity ${endpoint.entityId}`);
      else if (!(endpoint.field in entity.values)) issues.push(`relationship ${relationship.relationshipId} references missing field ${endpoint.entityId}.${endpoint.field}`);
    }
  }
  for (const [moveId, move] of Object.entries(profile.moves)) {
    if (!boundedId(moveId)) issues.push(`move ${moveId} must be a bounded identifier`);
    if (!Number.isInteger(move.savingsMinor)) issues.push(`move ${moveId} savings must be an integer`);
    if (!Number.isInteger(move.daysDelta)) issues.push(`move ${moveId} daysDelta must be an integer`);
    if (!safeBoundedText(move.dimension, 80) || !safeBoundedText(move.tradeoff, 240)) issues.push(`move ${moveId} text must be safe and bounded`);
    for (const [preference, impact] of Object.entries(move.impacts)) {
      if (!(preference in profile.preferenceWeights)) issues.push(`move ${moveId} references unknown preference ${preference}`);
      if (!Number.isInteger(impact) || impact < 0 || impact > 100) issues.push(`move ${moveId} impact ${preference} must be an integer from 0 to 100`);
    }
  }
  if (Object.keys(profile.moves).length > 12) issues.push("profile must contain at most 12 moves");
  const legalMoveCount = Object.values(profile.moves).filter((move) => !profile.locks.includes(move.dimension)).length;
  if (!profile.searchPolicy.objectives.length || new Set(profile.searchPolicy.objectives).size !== profile.searchPolicy.objectives.length) issues.push("search objectives must be non-empty and unique");
  if (profile.searchPolicy.objectives.some((objective) => !searchObjectives.has(objective))) issues.push("search contains an unsupported objective");
  if (!Number.isInteger(profile.searchPolicy.optionCount) || profile.searchPolicy.optionCount < 1 || profile.searchPolicy.optionCount > profile.searchPolicy.objectives.length) issues.push("search optionCount must fit the objective count");
  if (!Number.isInteger(profile.searchPolicy.maxMovesPerOption) || profile.searchPolicy.maxMovesPerOption < 0 || profile.searchPolicy.maxMovesPerOption > legalMoveCount) issues.push("search maxMovesPerOption must fit the legal move count");
  if (!Number.isInteger(profile.searchPolicy.maxCombinations) || profile.searchPolicy.maxCombinations < profile.searchPolicy.optionCount || profile.searchPolicy.maxCombinations > 256) issues.push("search maxCombinations must be between optionCount and 256");
  const expectedCapabilities = definitions[profile.profileId].contextualCapabilities;
  if (profile.contextualCapabilities.some((name) => !name.startsWith(`${profile.profileId}_`))) issues.push("contextual capability prefix must match profileId");
  if (profile.contextualCapabilities.length !== expectedCapabilities.length || expectedCapabilities.some((name) => !profile.contextualCapabilities.includes(name))) issues.push("contextual capabilities must match the implemented profile tool set");
  if (profile.surface.version !== "surface-profile.v1") issues.push("unsupported surface profile version");
  const expectedTimeModel = ({ travel: "calendar", renovation: "phases", event: "run_of_show", general: "calendar" } as const)[profile.profileId];
  if (profile.surface.timeModel !== expectedTimeModel) issues.push(`surface time model for ${profile.profileId} must be ${expectedTimeModel}`);
  const expectedLane = ({ travel: "timeline_lane", renovation: "phase_lane", event: "run_of_show", general: "timeline_lane" } as const)[profile.profileId];
  if (!profile.surface.preferredComponents.includes(expectedLane)) issues.push(`surface for ${profile.profileId} must include ${expectedLane}`);
  if (profile.surface.preferredComponents.some((component) => !surfaceComponents.has(component))) issues.push("surface contains an unknown component");
  if (new Set(profile.surface.preferredComponents).size !== profile.surface.preferredComponents.length) issues.push("surface components must be unique");
  if (new Set(profile.surface.stages.map((stage) => stage.stageId)).size !== profile.surface.stages.length) issues.push("surface stage ids must be unique");
  if (profile.surface.stages.length < 1 || profile.surface.stages.length > 12) issues.push("surface must contain between one and twelve stages");
  const dependencies = profile.surface.dependencies ?? [];
  if (dependencies.length > 50 || new Set(dependencies.map((dependency) => dependency.dependencyId)).size !== dependencies.length) issues.push("surface dependencies must contain at most fifty unique ids");
  for (const dependency of dependencies) {
    if (!boundedId(dependency.dependencyId) || !safeBoundedText(dependency.title, 500)) issues.push("surface dependency id and title must be safe bounded text");
    if (!(dependency.kind === "operator_research" || dependency.kind === "human_coordination" || dependency.kind === "external_evidence" || dependency.kind === "human_decision")) issues.push(`surface dependency ${dependency.dependencyId} has unsupported kind`);
    if (!(dependency.status === "open" || dependency.status === "resolved" || dependency.status === "deferred")) issues.push(`surface dependency ${dependency.dependencyId} has unsupported status`);
    if (typeof dependency.blocking !== "boolean" || (dependency.detail !== undefined && !safeBoundedText(dependency.detail, 1000)) || dependency.sourcePaths.length > 20 || dependency.sourcePaths.some((path) => !safeBoundedText(path, 200))) issues.push(`surface dependency ${dependency.dependencyId} is malformed`);
  }
  const assumptions = profile.surface.assumptions ?? [];
  if (assumptions.length > 50) issues.push("surface must contain at most fifty planning assumptions");
  for (const assumption of assumptions) {
    if (!safeBoundedText(assumption.path, 200) || !Number.isSafeInteger(assumption.value) || !safeBoundedText(assumption.basis, 500)) issues.push("surface planning assumption is malformed");
    if (!(assumption.status === "working" || assumption.status === "human_confirmed") || assumption.sourcePaths.length > 20 || assumption.sourcePaths.some((path) => !safeBoundedText(path, 200))) issues.push(`surface planning assumption ${assumption.path} is malformed`);
  }
  if (profile.surface.primaryMeasures.length < 1 || profile.surface.primaryMeasures.length > 8) issues.push("surface must contain between one and eight primary measures");
  const surfaceText = [profile.surface.hero.eyebrow, profile.surface.hero.title, profile.surface.hero.brief, ...Object.values(profile.surface.nouns), ...profile.surface.stages.flatMap((stage) => [stage.label, stage.detail, stage.marker])];
  if (surfaceText.some((text) => !safeBoundedText(text, 500))) issues.push("surface text must be safe, non-empty, and at most 500 characters");
  for (const stage of profile.surface.stages) {
    if (!boundedId(stage.stageId)) issues.push(`surface stage ${stage.stageId} must use a bounded identifier`);
    if (!(["complete", "current", "planned", "movable", "locked"] as string[]).includes(stage.status)) issues.push(`surface stage ${stage.stageId} has unsupported status`);
  }
  for (const measure of profile.surface.primaryMeasures) {
    if (!safeBoundedText(measure.label, 100)) issues.push(`surface measure ${measure.label} must be safe bounded text`);
    if (measure.selector === "allocations") {
      if (measure.path.length !== 1 || !(measure.path[0]! in profile.accepted)) issues.push(`surface measure ${measure.label} references an unknown allocation`);
    } else if (measure.selector === "entities") {
      const [entityId, valuesKey, field, ...rest] = measure.path;
      if (rest.length || valuesKey !== "values" || !entityId || !field || !(field in (profile.entities[entityId]?.values ?? {}))) issues.push(`surface measure ${measure.label} references an unknown entity field`);
    } else {
      issues.push(`surface measure ${measure.label} uses unsupported selector ${measure.selector}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.evidencePolicy.asOf) || !Number.isFinite(Date.parse(`${profile.evidencePolicy.asOf}T00:00:00Z`))) issues.push("evidencePolicy.asOf must be YYYY-MM-DD");
  if (profile.evidencePolicy.materialityMinor < 0) issues.push("evidence materiality must not be negative");
  for (const [sourceClass, days] of Object.entries(profile.evidencePolicy.maxAgeDaysBySourceClass)) {
    if (!evidenceSourceClasses.has(sourceClass)) issues.push(`evidence source class ${sourceClass} is unsupported`);
    if (!Number.isInteger(days) || days < 0) issues.push(`evidence max age for ${sourceClass} must be a non-negative integer`);
  }
  for (const sourceClass of evidenceSourceClasses) if (!(sourceClass in profile.evidencePolicy.maxAgeDaysBySourceClass)) issues.push(`evidence policy must define ${sourceClass}`);
  const requiredFields = {
    travel: [["trip_days", "days"], ["booked_segment_days", "days"]],
    renovation: [["completion_day", "day"], ["committed_completion_day", "day"]],
    event: [["guest_headcount", "count"], ["venue", "capacity"]],
    general: [["plan_items", "count"], ["open_dependencies", "count"]],
  } as const;
  for (const [entityId, field] of requiredFields[profile.profileId]) if (!(field in (profile.entities[entityId]?.values ?? {}))) issues.push(`${profile.profileId} contextual tools require ${entityId}.${field}`);
  if (issues.length) throw new ProfileValidationError(issues);
  const profileHash = await sha256(profile);
  return deepFreeze({ ...profile, profileHash }) as CompiledProfile;
};

export const compileProfile = async (input: ProfileDefinition | unknown): Promise<CompiledProfile> => {
  try {
    return await compileProfileUnchecked(input as ProfileDefinition);
  } catch (error) {
    if (error instanceof ProfileValidationError) throw error;
    throw new ProfileValidationError([`malformed nested profile structure: ${error instanceof Error ? error.message : String(error)}`]);
  }
};

export const compileBuiltInProfiles = async (): Promise<Map<ProfileId, CompiledProfile>> => {
  const entries = await Promise.all((Object.keys(definitions) as ProfileId[]).map(async (profileId) => [profileId, await compileProfile(definitions[profileId])] as const));
  return new Map(entries);
};

export const getProfileDefinition = (profileId: ProfileId): ProfileDefinition => clone(definitions[profileId]);
