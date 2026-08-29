CREATE TABLE `plan_file_operations` (
	`scope_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`operation_kind` text NOT NULL,
	`attachment_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`object_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	PRIMARY KEY(`scope_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_file_operations_scope_status_updated` ON `plan_file_operations` (`scope_id`,`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `tenant_reset_jobs` (
	`scope_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`object_keys_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	PRIMARY KEY(`scope_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_reset_jobs_scope_status_updated` ON `tenant_reset_jobs` (`scope_id`,`status`,`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
