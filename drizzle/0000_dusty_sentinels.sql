CREATE TABLE `activation_receipts` (
	`scope_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`receipt_id` text NOT NULL,
	`from_plan_id` text NOT NULL,
	`to_plan_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`receipt_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activation_receipts_scope_receipt` ON `activation_receipts` (`scope_id`,`receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_activation_receipts_scope_target` ON `activation_receipts` (`scope_id`,`to_plan_id`);--> statement-breakpoint
CREATE TABLE `domain_events` (
	`scope_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`event_type` text NOT NULL,
	`from_revision` integer NOT NULL,
	`to_revision` integer NOT NULL,
	`event_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `event_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_domain_events_scope_receipt` ON `domain_events` (`scope_id`,`receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_domain_events_scope_plan_revision` ON `domain_events` (`scope_id`,`plan_id`,`to_revision`);--> statement-breakpoint
CREATE TABLE `evidence_records` (
	`scope_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`record_hash` text NOT NULL,
	`content_hash` text NOT NULL,
	`accepted_revision` integer NOT NULL,
	`record_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `plan_id`, `evidence_id`, `record_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_evidence_scope_plan_revision` ON `evidence_records` (`scope_id`,`plan_id`,`accepted_revision`);--> statement-breakpoint
CREATE TABLE `operation_log` (
	`scope_id` text NOT NULL,
	`operation_hash` text NOT NULL,
	`plan_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`result_code` text NOT NULL,
	`before_revision` integer NOT NULL,
	`after_revision` integer NOT NULL,
	`proof_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `operation_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_operation_log_scope_plan_created` ON `operation_log` (`scope_id`,`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_heads` (
	`scope_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`profile_hash` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_hash` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `plan_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_heads_scope_updated` ON `plan_heads` (`scope_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `plan_revisions` (
	`scope_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`revision` integer NOT NULL,
	`profile_id` text NOT NULL,
	`profile_hash` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`previous_snapshot_hash` text,
	`receipt_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `plan_id`, `revision`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plan_revisions_scope_hash` ON `plan_revisions` (`scope_id`,`plan_id`,`snapshot_hash`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`scope_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`receipt_id` text NOT NULL,
	`receipt_type` text NOT NULL,
	`from_revision` integer NOT NULL,
	`to_revision` integer NOT NULL,
	`replay_checksum` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `plan_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_scope_receipt` ON `receipts` (`scope_id`,`receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_receipts_scope_plan_revision` ON `receipts` (`scope_id`,`plan_id`,`to_revision`);--> statement-breakpoint
PRAGMA optimize;
