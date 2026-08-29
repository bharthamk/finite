import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const planHeads = sqliteTable("plan_heads", {
  scopeId: text("scope_id").notNull(),
  planId: text("plan_id").notNull(),
  profileId: text("profile_id").notNull(),
  profileHash: text("profile_hash").notNull(),
  revision: integer("revision").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.planId] }),
  index("idx_plan_heads_scope_updated").on(table.scopeId, table.updatedAt),
]);

export const planRevisions = sqliteTable("plan_revisions", {
  scopeId: text("scope_id").notNull(),
  planId: text("plan_id").notNull(),
  revision: integer("revision").notNull(),
  profileId: text("profile_id").notNull(),
  profileHash: text("profile_hash").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  previousSnapshotHash: text("previous_snapshot_hash"),
  receiptId: text("receipt_id"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.planId, table.revision] }),
  uniqueIndex("idx_plan_revisions_scope_hash").on(table.scopeId, table.planId, table.snapshotHash),
]);

export const receipts = sqliteTable("receipts", {
  scopeId: text("scope_id").notNull(),
  planId: text("plan_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  receiptId: text("receipt_id").notNull(),
  receiptType: text("receipt_type").notNull(),
  fromRevision: integer("from_revision").notNull(),
  toRevision: integer("to_revision").notNull(),
  replayChecksum: text("replay_checksum").notNull(),
  requestHash: text("request_hash").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.planId, table.idempotencyKey] }),
  uniqueIndex("idx_receipts_scope_receipt").on(table.scopeId, table.receiptId),
  index("idx_receipts_scope_plan_revision").on(table.scopeId, table.planId, table.toRevision),
]);

export const domainEvents = sqliteTable("domain_events", {
  scopeId: text("scope_id").notNull(),
  eventId: text("event_id").notNull(),
  planId: text("plan_id").notNull(),
  receiptId: text("receipt_id").notNull(),
  eventType: text("event_type").notNull(),
  fromRevision: integer("from_revision").notNull(),
  toRevision: integer("to_revision").notNull(),
  eventJson: text("event_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.eventId] }),
  uniqueIndex("idx_domain_events_scope_receipt").on(table.scopeId, table.receiptId),
  index("idx_domain_events_scope_plan_revision").on(table.scopeId, table.planId, table.toRevision),
]);

export const evidenceRecords = sqliteTable("evidence_records", {
  scopeId: text("scope_id").notNull(),
  planId: text("plan_id").notNull(),
  evidenceId: text("evidence_id").notNull(),
  recordHash: text("record_hash").notNull(),
  contentHash: text("content_hash").notNull(),
  acceptedRevision: integer("accepted_revision").notNull(),
  recordJson: text("record_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.planId, table.evidenceId, table.recordHash] }),
  index("idx_evidence_scope_plan_revision").on(table.scopeId, table.planId, table.acceptedRevision),
]);

export const activationReceipts = sqliteTable("activation_receipts", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  receiptId: text("receipt_id").notNull(),
  fromPlanId: text("from_plan_id").notNull(),
  toPlanId: text("to_plan_id").notNull(),
  requestHash: text("request_hash").notNull(),
  receiptJson: text("receipt_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  uniqueIndex("idx_activation_receipts_scope_receipt").on(table.scopeId, table.receiptId),
  index("idx_activation_receipts_scope_target").on(table.scopeId, table.toPlanId),
]);

export const planCatalog = sqliteTable("plan_catalog", {
  scopeId: text("scope_id").notNull(),
  planId: text("plan_id").notNull(),
  profileId: text("profile_id").notNull(),
  profileHash: text("profile_hash").notNull(),
  definitionJson: text("definition_json").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  lineageJson: text("lineage_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.planId] }),
  index("idx_plan_catalog_scope_profile").on(table.scopeId, table.profileId),
  index("idx_plan_catalog_scope_updated").on(table.scopeId, table.updatedAt),
]);

export const operationLog = sqliteTable("operation_log", {
  scopeId: text("scope_id").notNull(),
  operationHash: text("operation_hash").notNull(),
  planId: text("plan_id").notNull(),
  toolName: text("tool_name").notNull(),
  resultCode: text("result_code").notNull(),
  beforeRevision: integer("before_revision").notNull(),
  afterRevision: integer("after_revision").notNull(),
  proofJson: text("proof_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.operationHash] }),
  index("idx_operation_log_scope_plan_created").on(table.scopeId, table.planId, table.createdAt),
]);

export const tenantAccounts = sqliteTable("tenant_accounts", {
  scopeId: text("scope_id").primaryKey(),
  userIdHash: text("user_id_hash").notNull(),
  legacyScopeAdopted: integer("legacy_scope_adopted", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_tenant_accounts_user_hash").on(table.userIdHash),
]);

export const demoSessions = sqliteTable("demo_sessions", {
  sessionHash: text("session_hash").primaryKey(),
  scopeId: text("scope_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [
  uniqueIndex("idx_demo_sessions_scope").on(table.scopeId),
  index("idx_demo_sessions_expiry").on(table.expiresAt),
]);

export const operatorSessions = sqliteTable("operator_sessions", {
  scopeId: text("scope_id").notNull(),
  sessionId: text("session_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  planId: text("plan_id").notNull(),
  profileHash: text("profile_hash").notNull(),
  baseRevision: integer("base_revision").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  payloadJson: text("payload_json").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  closedAt: text("closed_at"),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.sessionId] }),
  uniqueIndex("idx_operator_sessions_scope_idempotency").on(table.scopeId, table.idempotencyKey),
  index("idx_operator_sessions_scope_status_expiry").on(table.scopeId, table.status, table.expiresAt),
  index("idx_operator_sessions_scope_plan_revision").on(table.scopeId, table.planId, table.baseRevision),
]);

export const authorityChallenges = sqliteTable("authority_challenges", {
  scopeId: text("scope_id").notNull(),
  challengeId: text("challenge_id").notNull(),
  planId: text("plan_id").notNull(),
  profileHash: text("profile_hash").notNull(),
  revision: integer("revision").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  contentHash: text("content_hash").notNull(),
  authorityId: text("authority_id").notNull(),
  commandHash: text("command_hash").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.challengeId] }),
  index("idx_authority_challenges_scope_plan_revision").on(table.scopeId, table.planId, table.revision),
  index("idx_authority_challenges_scope_expiry").on(table.scopeId, table.expiresAt),
]);

export const challengeConsumptions = sqliteTable("challenge_consumptions", {
  scopeId: text("scope_id").notNull(),
  challengeId: text("challenge_id").notNull(),
  planId: text("plan_id").notNull(),
  receiptId: text("receipt_id").notNull(),
  requestHash: text("request_hash").notNull(),
  consumedAt: text("consumed_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.challengeId] }),
  uniqueIndex("idx_challenge_consumptions_scope_receipt").on(table.scopeId, table.receiptId),
]);

export const arrivalOrders = sqliteTable("arrival_orders", {
  scopeId: text("scope_id").notNull(),
  orderId: text("order_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull(),
  rawOutcome: text("raw_outcome").notNull(),
  structuredJson: text("structured_json").notNull(),
  attachmentsJson: text("attachments_json").notNull(),
  inputsJson: text("inputs_json").notNull(),
  pendingClarificationJson: text("pending_clarification_json"),
  interpretationJson: text("interpretation_json"),
  lastOperatorCheckpoint: integer("last_operator_checkpoint").notNull(),
  packetChecksum: text("packet_checksum").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.orderId] }),
  uniqueIndex("idx_arrival_orders_scope_idempotency").on(table.scopeId, table.idempotencyKey),
  index("idx_arrival_orders_scope_status_updated").on(table.scopeId, table.status, table.updatedAt),
]);

export const arrivalEvents = sqliteTable("arrival_events", {
  scopeId: text("scope_id").notNull(),
  orderId: text("order_id").notNull(),
  version: integer("version").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  sourceSurface: text("source_surface").notNull(),
  payloadJson: text("payload_json").notNull(),
  eventHash: text("event_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.orderId, table.version] }),
  uniqueIndex("idx_arrival_events_scope_event").on(table.scopeId, table.eventId),
  index("idx_arrival_events_scope_order_version").on(table.scopeId, table.orderId, table.version),
]);

export const constructionPackets = sqliteTable("construction_packets", {
  scopeId: text("scope_id").primaryKey(),
  packetId: text("packet_id").notNull(),
  packetJson: text("packet_json").notNull(),
  checksum: text("checksum").notNull(),
  basePlanId: text("base_plan_id").notNull(),
  baseProfileHash: text("base_profile_hash").notNull(),
  baseRevision: integer("base_revision").notNull(),
  kind: text("kind").notNull(),
  sourceOrderId: text("source_order_id"),
  sourceOrderVersion: integer("source_order_version"),
  sourceOrderChecksum: text("source_order_checksum"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  clearedAt: text("cleared_at"),
  disposition: text("disposition").default("current").notNull(),
  returnReasonCode: text("return_reason_code"),
  returnMessage: text("return_message"),
  returnedAt: text("returned_at"),
  updatedAt: text("updated_at").notNull(),
});

export const constructionReturnReviews = sqliteTable("construction_return_reviews", {
  scopeId: text("scope_id").primaryKey(),
  returnId: text("return_id").notNull(),
  packetId: text("packet_id").notNull(),
  packetJson: text("packet_json").notNull(),
  draftId: text("draft_id").notNull(),
  reasonCode: text("reason_code").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(),
  returnedAt: text("returned_at").notNull(),
  resolvedByPacketId: text("resolved_by_packet_id"),
  resolvedAt: text("resolved_at"),
  updatedAt: text("updated_at").notNull(),
});

export const tenantThemes = sqliteTable("tenant_themes", {
  scopeId: text("scope_id").notNull(),
  themeId: text("theme_id").notNull(),
  name: text("name").notNull(),
  mode: text("mode").notNull(),
  tokensJson: text("tokens_json").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.themeId] }),
  index("idx_tenant_themes_scope_updated").on(table.scopeId, table.updatedAt),
]);

export const tenantThemePreferences = sqliteTable("tenant_theme_preferences", {
  scopeId: text("scope_id").primaryKey(),
  activeThemeId: text("active_theme_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tenantThemeReceipts = sqliteTable("tenant_theme_receipts", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  receiptJson: text("receipt_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_tenant_theme_receipts_scope_created").on(table.scopeId, table.createdAt),
]);

export const tenantSkins = sqliteTable("tenant_skins", {
  scopeId: text("scope_id").notNull(),
  skinId: text("skin_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  recipeJson: text("recipe_json").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.skinId] }),
  index("idx_tenant_skins_scope_updated").on(table.scopeId, table.updatedAt),
]);

export const tenantSkinPreferences = sqliteTable("tenant_skin_preferences", {
  scopeId: text("scope_id").primaryKey(),
  activeSkinId: text("active_skin_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tenantSkinReceipts = sqliteTable("tenant_skin_receipts", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  receiptJson: text("receipt_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_tenant_skin_receipts_scope_created").on(table.scopeId, table.createdAt),
]);

export const planShares = sqliteTable("plan_shares", {
  scopeId: text("scope_id").notNull(),
  shareId: text("share_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  planId: text("plan_id").notNull(),
  mode: text("mode").default("frozen").notNull(),
  sectionsJson: text("sections_json").default('["overview"]').notNull(),
  frozenProjectionJson: text("frozen_projection_json"),
  label: text("label").default("Shared plan").notNull(),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.shareId] }),
  uniqueIndex("idx_plan_shares_token_hash").on(table.tokenHash),
  index("idx_plan_shares_scope_plan_created").on(table.scopeId, table.planId, table.createdAt),
]);

export const tenantSettings = sqliteTable("tenant_settings", {
  scopeId: text("scope_id").primaryKey(),
  agenticName: text("agentic_name").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tenantSettingsReceipts = sqliteTable("tenant_settings_receipts", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  receiptJson: text("receipt_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_tenant_settings_receipts_scope_created").on(table.scopeId, table.createdAt),
]);

export const planInputs = sqliteTable("plan_inputs", {
  scopeId: text("scope_id").notNull(),
  inputId: text("input_id").notNull(),
  planId: text("plan_id").notNull(),
  planRevision: integer("plan_revision").notNull(),
  kind: text("kind").notNull(),
  handlingMode: text("handling_mode").default("codex").notNull(),
  section: text("section").notNull(),
  contextId: text("context_id"),
  contextLabel: text("context_label"),
  message: text("message").notNull(),
  status: text("status").default("open").notNull(),
  sourceSurface: text("source_surface").notNull(),
  createdAt: text("created_at").notNull(),
  handledAt: text("handled_at"),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.inputId] }),
  index("idx_plan_inputs_scope_plan_status_created").on(table.scopeId, table.planId, table.status, table.createdAt),
]);

export const planInputReceipts = sqliteTable("plan_input_receipts", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  receiptJson: text("receipt_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_plan_input_receipts_scope_created").on(table.scopeId, table.createdAt),
]);

export const planChecklistItems = sqliteTable("plan_checklist_items", {
  scopeId: text("scope_id").notNull(),
  itemId: text("item_id").notNull(),
  planId: text("plan_id").notNull(),
  planRevision: integer("plan_revision").notNull(),
  section: text("section").notNull(),
  contextId: text("context_id"),
  contextLabel: text("context_label"),
  label: text("label").notNull(),
  origin: text("origin").notNull(),
  sourceRef: text("source_ref"),
  status: text("status").default("open").notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.itemId] }),
  uniqueIndex("idx_plan_checklist_scope_plan_source").on(table.scopeId, table.planId, table.sourceRef),
  index("idx_plan_checklist_scope_plan_position").on(table.scopeId, table.planId, table.position, table.createdAt),
]);

export const planAttachments = sqliteTable("plan_attachments", {
  scopeId: text("scope_id").notNull(),
  attachmentId: text("attachment_id").notNull(),
  planId: text("plan_id").notNull(),
  planRevision: integer("plan_revision").notNull(),
  section: text("section").notNull(),
  contextId: text("context_id"),
  contextLabel: text("context_label"),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  noteText: text("note_text"),
  linkUrl: text("link_url"),
  objectKey: text("object_key"),
  fileName: text("file_name"),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  sourceSurface: text("source_surface").notNull(),
  attachmentRole: text("attachment_role").default("source").notNull(),
  processingStatus: text("processing_status").default("needs_review").notNull(),
  processingSummary: text("processing_summary"),
  derivedRefsJson: text("derived_refs_json").default("[]").notNull(),
  processedBy: text("processed_by"),
  processedAt: text("processed_at"),
  status: text("status").default("active").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").default("").notNull(),
  removedAt: text("removed_at"),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.attachmentId] }),
  index("idx_plan_attachments_scope_plan_status_created").on(table.scopeId, table.planId, table.status, table.createdAt),
]);

export const planWorkReceipts = sqliteTable("plan_work_receipts", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  receiptJson: text("receipt_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_plan_work_receipts_scope_created").on(table.scopeId, table.createdAt),
]);

export const planFileOperations = sqliteTable("plan_file_operations", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  operationKind: text("operation_kind").notNull(),
  attachmentId: text("attachment_id").notNull(),
  planId: text("plan_id").notNull(),
  objectKey: text("object_key"),
  status: text("status").default("pending").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_plan_file_operations_scope_status_updated").on(table.scopeId, table.status, table.updatedAt),
]);

export const tenantResetReceipts = sqliteTable("tenant_reset_receipts", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  receiptJson: text("receipt_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_tenant_reset_receipts_scope_created").on(table.scopeId, table.createdAt),
]);

export const tenantResetJobs = sqliteTable("tenant_reset_jobs", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  objectKeysJson: text("object_keys_json").default("[]").notNull(),
  status: text("status").default("pending").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_tenant_reset_jobs_scope_status_updated").on(table.scopeId, table.status, table.updatedAt),
]);

export const planRetrospectives = sqliteTable("plan_retrospectives", {
  scopeId: text("scope_id").notNull(),
  planId: text("plan_id").notNull(),
  planRevision: integer("plan_revision").notNull(),
  worked: text("worked").default("").notNull(),
  changed: text("changed").default("").notNull(),
  nextTime: text("next_time").default("").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.planId] }),
  index("idx_plan_retrospectives_scope_updated").on(table.scopeId, table.updatedAt),
]);

export const profileMemories = sqliteTable("profile_memories", {
  scopeId: text("scope_id").notNull(),
  memoryId: text("memory_id").notNull(),
  family: text("family").notNull(),
  kind: text("kind").notNull(),
  statement: text("statement").notNull(),
  evidence: text("evidence").notNull(),
  sourcePlanId: text("source_plan_id").notNull(),
  sourceSurface: text("source_surface").notNull(),
  status: text("status").default("proposed").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  decidedAt: text("decided_at"),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.memoryId] }),
  index("idx_profile_memories_scope_status_updated").on(table.scopeId, table.status, table.updatedAt),
  index("idx_profile_memories_scope_family_status").on(table.scopeId, table.family, table.status),
]);

export const planLearningReceipts = sqliteTable("plan_learning_receipts", {
  scopeId: text("scope_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  receiptJson: text("receipt_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.scopeId, table.idempotencyKey] }),
  index("idx_plan_learning_receipts_scope_created").on(table.scopeId, table.createdAt),
]);
