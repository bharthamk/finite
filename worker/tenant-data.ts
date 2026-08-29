import type { D1Database, D1PreparedStatement } from "./accepted-truth.js";

/**
 * Every tenant-owned table that must disappear when a kitchen is reset or a
 * temporary demo expires. Infrastructure identity and reset recovery tables
 * are deliberately handled by the reset coordinator instead.
 */
export const tenantDataTables = [
  "plan_input_receipts",
  "plan_inputs",
  "plan_work_receipts",
  "plan_file_operations",
  "plan_checklist_items",
  "plan_attachments",
  "tenant_settings_receipts",
  "tenant_settings",
  "tenant_skin_receipts",
  "tenant_skin_preferences",
  "tenant_skins",
  "tenant_theme_receipts",
  "tenant_theme_preferences",
  "tenant_themes",
  "plan_shares",
  "arrival_events",
  "arrival_orders",
  "construction_return_reviews",
  "construction_packets",
  "challenge_consumptions",
  "authority_challenges",
  "operator_sessions",
  "operation_log",
  "evidence_records",
  "domain_events",
  "receipts",
  "activation_receipts",
  "plan_catalog",
  "plan_revisions",
  "plan_heads",
] as const;

export const tenantDeleteStatements = (db: D1Database, scopeId: string): D1PreparedStatement[] =>
  tenantDataTables.map((table) => db.prepare(`DELETE FROM ${table} WHERE scope_id = ?`).bind(scopeId));
