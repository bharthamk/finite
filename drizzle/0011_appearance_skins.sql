CREATE TABLE `tenant_skins` (
	`scope_id` text NOT NULL,
	`skin_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`recipe_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `skin_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_skins_scope_updated` ON `tenant_skins` (`scope_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `tenant_skin_preferences` (
	`scope_id` text PRIMARY KEY NOT NULL,
	`active_skin_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenant_skin_receipts` (
	`scope_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`receipt_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_skin_receipts_scope_created` ON `tenant_skin_receipts` (`scope_id`,`created_at`);
