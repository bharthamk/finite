CREATE TABLE `plan_catalog` (
	`scope_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`profile_hash` text NOT NULL,
	`definition_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`lineage_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `plan_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_catalog_scope_profile` ON `plan_catalog` (`scope_id`,`profile_id`);--> statement-breakpoint
CREATE INDEX `idx_plan_catalog_scope_updated` ON `plan_catalog` (`scope_id`,`updated_at`);