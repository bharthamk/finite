CREATE TABLE `plan_collaboration_updates` (
	`scope_id` text NOT NULL,
	`update_id` text NOT NULL,
	`invite_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`actor_scope_id` text NOT NULL,
	`kind` text NOT NULL,
	`section` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	PRIMARY KEY(`scope_id`, `update_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_collaboration_owner_plan_created` ON `plan_collaboration_updates` (`scope_id`,`plan_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_plan_collaboration_actor_plan_created` ON `plan_collaboration_updates` (`actor_scope_id`,`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_invitations` (
	`scope_id` text NOT NULL,
	`invite_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`plan_id` text NOT NULL,
	`role` text NOT NULL,
	`sections_json` text DEFAULT '["overview"]' NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`accepted_scope_id` text,
	`accepted_at` text,
	PRIMARY KEY(`scope_id`, `invite_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plan_invitations_token_hash` ON `plan_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_plan_invitations_owner_plan_created` ON `plan_invitations` (`scope_id`,`plan_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_plan_invitations_accepted_plan` ON `plan_invitations` (`accepted_scope_id`,`plan_id`);