CREATE TABLE `plan_shares` (
	`scope_id` text NOT NULL,
	`share_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`plan_id` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`scope_id`, `share_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plan_shares_token_hash` ON `plan_shares` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_plan_shares_scope_plan_created` ON `plan_shares` (`scope_id`,`plan_id`,`created_at`);
