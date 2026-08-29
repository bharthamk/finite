ALTER TABLE `plan_attachments` ADD `attachment_role` text DEFAULT 'source' NOT NULL;
--> statement-breakpoint
ALTER TABLE `plan_attachments` ADD `processing_status` text DEFAULT 'needs_review' NOT NULL;
--> statement-breakpoint
ALTER TABLE `plan_attachments` ADD `processing_summary` text;
--> statement-breakpoint
ALTER TABLE `plan_attachments` ADD `derived_refs_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `plan_attachments` ADD `processed_by` text;
--> statement-breakpoint
ALTER TABLE `plan_attachments` ADD `processed_at` text;
--> statement-breakpoint
ALTER TABLE `plan_attachments` ADD `updated_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `plan_attachments` SET `updated_at` = `created_at` WHERE `updated_at` = '';
--> statement-breakpoint
PRAGMA optimize;
