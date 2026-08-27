CREATE TABLE `tenant_themes` (
	`scope_id` text NOT NULL,
	`theme_id` text NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`tokens_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `theme_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_themes_scope_updated` ON `tenant_themes` (`scope_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `tenant_theme_preferences` (
	`scope_id` text PRIMARY KEY NOT NULL,
	`active_theme_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenant_theme_receipts` (
	`scope_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`receipt_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_theme_receipts_scope_created` ON `tenant_theme_receipts` (`scope_id`,`created_at`);
