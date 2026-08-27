CREATE TABLE `tenant_settings` (
  `scope_id` text PRIMARY KEY NOT NULL,
  `agentic_name` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE `tenant_settings_receipts` (
  `scope_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `receipt_json` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`scope_id`, `idempotency_key`)
);

CREATE INDEX `idx_tenant_settings_receipts_scope_created` ON `tenant_settings_receipts` (`scope_id`, `created_at`);
