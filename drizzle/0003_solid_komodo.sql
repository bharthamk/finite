CREATE TABLE `demo_sessions` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_demo_sessions_scope` ON `demo_sessions` (`scope_id`);--> statement-breakpoint
CREATE INDEX `idx_demo_sessions_expiry` ON `demo_sessions` (`expires_at`);