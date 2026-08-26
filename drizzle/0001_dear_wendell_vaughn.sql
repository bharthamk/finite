CREATE TABLE `authority_challenges` (
	`scope_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`profile_hash` text NOT NULL,
	`revision` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`command_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `challenge_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_authority_challenges_scope_plan_revision` ON `authority_challenges` (`scope_id`,`plan_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_authority_challenges_scope_expiry` ON `authority_challenges` (`scope_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `challenge_consumptions` (
	`scope_id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`consumed_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `challenge_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_challenge_consumptions_scope_receipt` ON `challenge_consumptions` (`scope_id`,`receipt_id`);--> statement-breakpoint
CREATE TABLE `operator_sessions` (
	`scope_id` text NOT NULL,
	`session_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`plan_id` text NOT NULL,
	`profile_hash` text NOT NULL,
	`base_revision` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`closed_at` text,
	PRIMARY KEY(`scope_id`, `session_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operator_sessions_scope_idempotency` ON `operator_sessions` (`scope_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_operator_sessions_scope_status_expiry` ON `operator_sessions` (`scope_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_operator_sessions_scope_plan_revision` ON `operator_sessions` (`scope_id`,`plan_id`,`base_revision`);--> statement-breakpoint
CREATE TABLE `tenant_accounts` (
	`scope_id` text PRIMARY KEY NOT NULL,
	`user_id_hash` text NOT NULL,
	`legacy_scope_adopted` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tenant_accounts_user_hash` ON `tenant_accounts` (`user_id_hash`);
--> statement-breakpoint
PRAGMA optimize;
