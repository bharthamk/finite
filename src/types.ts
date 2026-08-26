export type ProfileId = "travel" | "renovation" | "event";
export type PreferenceKey = "comfort" | "experience" | "buffer" | "schedule";
export type StateSelector =
  | "identity"
  | "allocations"
  | "actuals"
  | "constraints"
  | "entities"
  | "preferences"
  | "pending"
  | "lineage";

export type SurfaceComponentType =
  | "finite_summary"
  | "pressure_meter"
  | "timeline_lane"
  | "phase_lane"
  | "run_of_show"
  | "entity_table"
  | "commitment_stack"
  | "actual_forecast"
  | "constraint_panel"
  | "change_tray"
  | "option_compare"
  | "approval_panel";

export type SurfaceTimeModel = "calendar" | "phases" | "run_of_show";

export interface SurfaceFieldBinding {
  label: string;
  selector: StateSelector;
  path: string[];
  format: "money" | "number" | "days" | "percent" | "text";
}

export interface SurfaceStageDefinition {
  stageId: string;
  label: string;
  detail: string;
  marker: string;
  status: "complete" | "current" | "planned" | "movable" | "locked";
}

export interface SurfaceProfileDefinition {
  version: "surface-profile.v1";
  timeModel: SurfaceTimeModel;
  nouns: Record<string, string>;
  hero: {
    eyebrow: string;
    title: string;
    brief: string;
  };
  primaryMeasures: SurfaceFieldBinding[];
  preferredComponents: SurfaceComponentType[];
  stages: SurfaceStageDefinition[];
}

export interface SurfaceIntent {
  planRevision: number;
  decisionFocus: string;
  emphasizedMeasures: string[];
  requestedZones: SurfaceComponentType[];
  collapsedZones: string[];
  rationale: string;
}

export interface SurfaceZone {
  zoneId: string;
  component: SurfaceComponentType;
  title: string;
  selectors: StateSelector[];
  bindings: SurfaceFieldBinding[];
  required: boolean;
  collapsed: boolean;
}

export interface SurfaceManifest {
  schemaVersion: "finite-plan-surface.v1";
  planId: string;
  planRevision: number;
  profileId: ProfileId;
  profileVersion: string;
  timeModel: SurfaceTimeModel;
  title: string;
  brief: string;
  nouns: Record<string, string>;
  summaryFields: SurfaceFieldBinding[];
  stages: SurfaceStageDefinition[];
  zones: SurfaceZone[];
  availableActions: string[];
  decisionFocus: string | null;
  manifestHash: string;
}

export interface Allocation {
  totalBudgetMinor: number;
  spentMinor: number;
  committedMinor: number;
  forecastMinor: number;
  bufferMinor: number;
}

export interface ActualDefinition {
  actualId: string;
  label: string;
  originalAmountMinor: number;
  evidenceRef: string;
}

export interface CurrentActual extends ActualDefinition {
  currentAmountMinor: number;
  correctionCount: number;
  latestCorrectionId: string | null;
}

export interface EntityDefinition {
  entityId: string;
  kind: string;
  values: Record<string, number>;
}

export interface RelationshipEndpoint {
  entityId: string;
  field: string;
}

export interface RelationshipDefinition {
  relationshipId: string;
  type: "lte" | "equal";
  left: RelationshipEndpoint;
  right: RelationshipEndpoint;
  code: string;
}

export interface MoveDefinition {
  savingsMinor: number;
  daysDelta: number;
  dimension: string;
  tradeoff: string;
  impacts: Partial<Record<PreferenceKey, number>>;
}

export interface SearchPolicy {
  objectives: string[];
  optionCount: number;
  maxMovesPerOption: number;
  maxCombinations: number;
}

export interface EvidencePolicy {
  asOf: string;
  materialityMinor: number;
  maxAgeDaysBySourceClass: Record<string, number>;
}

export interface EvidenceRecord {
  evidenceId: string;
  source: string;
  sourceClass: string;
  observedAt: string;
  trust: "untrusted_external" | "human_supplied" | "trusted_internal";
  content: string;
  contentHash: string;
  recordHash: string;
  provenance: {
    sourceType: "url" | "document" | "connector" | "human_statement";
    locator: string;
    capturedAt: string;
    submittedBy: "codex_operator" | "human" | "system_fixture";
  };
}

export interface EvidenceRegistrationInput {
  source: string;
  sourceClass: string;
  observedAt: string;
  sourceType: EvidenceRecord["provenance"]["sourceType"];
  locator: string;
  content: string;
}

export interface ProfileDefinition {
  schemaVersion: "finite-plan-profile.v1";
  profileId: ProfileId;
  planId: string;
  name: string;
  accepted: Allocation;
  locks: string[];
  preferenceLabels: string[];
  preferenceWeights: Record<PreferenceKey, number>;
  actuals: ActualDefinition[];
  entities: Record<string, EntityDefinition>;
  relationships: RelationshipDefinition[];
  moves: Record<string, MoveDefinition>;
  searchPolicy: SearchPolicy;
  evidencePolicy: EvidencePolicy;
  contextualCapabilities: string[];
  surface: SurfaceProfileDefinition;
}

export interface CompiledProfile extends Readonly<ProfileDefinition> {
  readonly profileHash: string;
}

export interface EntityChange {
  entityId: string;
  field: string;
  delta?: number;
  value?: number;
}

export interface ChangeEventInput {
  type: string;
  title: string;
  costDeltaMinor: number;
  daysDelta?: number;
  minimumBufferMinor: number;
  evidenceRefs?: string[];
  assumptions?: string[];
  entityChanges?: EntityChange[];
  expectedRevision: number;
}

export interface ChangeEvent extends Required<Omit<ChangeEventInput, "expectedRevision">> {
  eventId: string;
  baseRevision: number;
}

export interface ConstraintViolation {
  code: string;
  [key: string]: unknown;
}

export interface EvidenceAssessment {
  evidenceId: string;
  sourceClass?: string;
  observedAt?: string;
  ageDays?: number;
  maxAgeDays?: number;
  material: boolean;
  expired?: boolean;
  valid: boolean;
  code: "EVIDENCE_NOT_FOUND" | "MATERIAL_EVIDENCE_EXPIRED" | "STALE_EVIDENCE" | "EVIDENCE_CURRENT";
}

export interface Candidate {
  candidateId: string;
  planId: string;
  profileId: ProfileId;
  profileHash: string;
  baseRevision: number;
  eventId: string;
  objective: string;
  source: "simulation" | "bounded_search";
  moveIds: string[];
  selectedMoves: Array<MoveDefinition & { moveId: string }>;
  tradeoffImpact: Record<PreferenceKey, number>;
  grossCostDeltaMinor: number;
  savingsMinor: number;
  netForecastDeltaMinor: number;
  resultingBufferMinor: number;
  resultingDaysDelta: number;
  resultingEntities: Record<string, EntityDefinition>;
  violations: ConstraintViolation[];
  evidenceAssessments: EvidenceAssessment[];
  evidenceBindings: Array<Pick<EvidenceRecord, "evidenceId" | "contentHash" | "recordHash">>;
  warnings: ConstraintViolation[];
  valid: boolean;
  preferenceScore: number;
  contentHash: string;
}

export interface HumanApproval {
  approvalId: string;
  candidateId: string;
  planId: string;
  revision: number;
  contentHash: string;
  warningsAcknowledged: string[];
  source: "human_action";
}

export interface Confirmation {
  confirmationId: string;
  targetId: string;
  revision: number;
  contentHash: string;
  source: "human_action";
}

export interface CorrectionEvent {
  eventType: "actual_correction";
  correctionId: string;
  actualId: string;
  originalAmountMinor: number;
  priorAmountMinor: number;
  correctedAmountMinor: number;
  deltaMinor: number;
  reason: string;
  evidenceRef: string;
  contentHash: string;
  confirmationId: string;
  fromRevision: number;
  toRevision: number;
}

export interface PreferenceEvent {
  eventType: "preference_change";
  preferenceChangeId: string;
  feedbackId: string;
  before: Record<PreferenceKey, number>;
  after: Record<PreferenceKey, number>;
  changes: Partial<Record<PreferenceKey, number>>;
  contentHash: string;
  confirmationId: string;
  fromRevision: number;
  toRevision: number;
}

export interface Receipt {
  receiptId: string;
  receiptType: "plan_option" | "actual_correction" | "preference_change";
  idempotencyKey: string;
  planId: string;
  fromRevision: number;
  toRevision: number;
  replayChecksum: string;
  payload: Record<string, unknown>;
}

export interface FeedbackEvent {
  feedbackId: string;
  message: string;
  kind: "adjustment" | "rejection" | "taste" | "constraint";
  stagedCandidateId: string | null;
}

export interface PlanSnapshot {
  snapshotVersion: "finite-plan-snapshot.v1";
  profileId: ProfileId;
  profileHash: string;
  planId: string;
  revision: number;
  accepted: Allocation;
  preferenceWeights: Record<PreferenceKey, number>;
  entities: Record<string, EntityDefinition>;
  events: ChangeEvent[];
  correctionEvents: CorrectionEvent[];
  preferenceEvents: PreferenceEvent[];
  feedback: FeedbackEvent[];
  evidenceRecords?: EvidenceRecord[];
  receipts: Receipt[];
}

export interface ToolResult {
  ok: boolean;
  code: string;
  acceptedStateChanged?: boolean;
  next?: string;
  [key: string]: unknown;
}

export interface WebMCPToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input?: unknown) => Promise<ToolResult>;
}

export interface WebMCPToolActivity {
  toolName: string;
  result: ToolResult;
}

export type WebMCPToolObserver = (activity: WebMCPToolActivity) =>
  void | Record<string, unknown> | Promise<void | Record<string, unknown>>;

export interface ModelContextHost {
  registerTool(tool: WebMCPToolDefinition, options?: { signal?: AbortSignal }): Promise<void> | void;
  getTools?(): Promise<Array<Omit<WebMCPToolDefinition, "execute">>>;
  executeTool?(tool: Omit<WebMCPToolDefinition, "execute">, input?: unknown): Promise<unknown>;
}
