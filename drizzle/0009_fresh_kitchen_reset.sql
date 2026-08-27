CREATE TABLE `tenant_reset_receipts` (
	`scope_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`receipt_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_reset_receipts_scope_created` ON `tenant_reset_receipts` (`scope_id`,`created_at`);
