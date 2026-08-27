CREATE TABLE `plan_checklist_items` (
  `scope_id` text NOT NULL,
  `item_id` text NOT NULL,
  `plan_id` text NOT NULL,
  `plan_revision` integer NOT NULL,
  `section` text NOT NULL,
  `context_id` text,
  `context_label` text,
  `label` text NOT NULL,
  `origin` text NOT NULL,
  `source_ref` text,
  `status` text DEFAULT 'open' NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL,
  `completed_at` text,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`scope_id`, `item_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_plan_checklist_scope_plan_source` ON `plan_checklist_items` (`scope_id`,`plan_id`,`source_ref`);
--> statement-breakpoint
CREATE INDEX `idx_plan_checklist_scope_plan_position` ON `plan_checklist_items` (`scope_id`,`plan_id`,`position`,`created_at`);
--> statement-breakpoint
CREATE TABLE `plan_attachments` (
  `scope_id` text NOT NULL,
  `attachment_id` text NOT NULL,
  `plan_id` text NOT NULL,
  `plan_revision` integer NOT NULL,
  `section` text NOT NULL,
  `context_id` text,
  `context_label` text,
  `kind` text NOT NULL,
  `label` text NOT NULL,
  `note_text` text,
  `link_url` text,
  `object_key` text,
  `file_name` text,
  `content_type` text,
  `size_bytes` integer,
  `source_surface` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text NOT NULL,
  `removed_at` text,
  PRIMARY KEY(`scope_id`, `attachment_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_attachments_scope_plan_status_created` ON `plan_attachments` (`scope_id`,`plan_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `plan_work_receipts` (
  `scope_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `receipt_json` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY(`scope_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_plan_work_receipts_scope_created` ON `plan_work_receipts` (`scope_id`,`created_at`);
