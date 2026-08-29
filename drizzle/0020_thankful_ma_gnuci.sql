CREATE TABLE `plan_learning_receipts` (
	`scope_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`receipt_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_learning_receipts_scope_created` ON `plan_learning_receipts` (`scope_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_retrospectives` (
	`scope_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_revision` integer NOT NULL,
	`worked` text DEFAULT '' NOT NULL,
	`changed` text DEFAULT '' NOT NULL,
	`next_time` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `plan_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_retrospectives_scope_updated` ON `plan_retrospectives` (`scope_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `profile_memories` (
	`scope_id` text NOT NULL,
	`memory_id` text NOT NULL,
	`family` text NOT NULL,
	`kind` text NOT NULL,
	`statement` text NOT NULL,
	`evidence` text NOT NULL,
	`source_plan_id` text NOT NULL,
	`source_surface` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`decided_at` text,
	PRIMARY KEY(`scope_id`, `memory_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_profile_memories_scope_status_updated` ON `profile_memories` (`scope_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_profile_memories_scope_family_status` ON `profile_memories` (`scope_id`,`family`,`status`);
--> statement-breakpoint
PRAGMA optimize;
