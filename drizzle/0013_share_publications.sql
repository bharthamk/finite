ALTER TABLE `plan_shares` ADD COLUMN `mode` text NOT NULL DEFAULT 'frozen';
--> statement-breakpoint
ALTER TABLE `plan_shares` ADD COLUMN `sections_json` text NOT NULL DEFAULT '["overview"]';
--> statement-breakpoint
ALTER TABLE `plan_shares` ADD COLUMN `frozen_projection_json` text;
--> statement-breakpoint
ALTER TABLE `plan_shares` ADD COLUMN `label` text NOT NULL DEFAULT 'Shared plan';
