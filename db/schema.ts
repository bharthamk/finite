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
