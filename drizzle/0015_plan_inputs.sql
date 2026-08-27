CREATE TABLE `plan_inputs` (
  `scope_id` text NOT NULL,
  `input_id` text NOT NULL,
  `plan_id` text NOT NULL,
  `plan_revision` integer NOT NULL,
  `kind` text NOT NULL,
  `section` text NOT NULL,
  `context_id` text,
  `context_label` text,
  `message` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `source_surface` text NOT NULL,
  `created_at` text NOT NULL,
  `handled_at` text,
  PRIMARY KEY (`scope_id`, `input_id`)
);

CREATE INDEX `idx_plan_inputs_scope_plan_status_created` ON `plan_inputs` (`scope_id`, `plan_id`, `status`, `created_at`);

CREATE TABLE `plan_input_receipts` (
  `scope_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `request_hash` text NOT NULL,
  `receipt_json` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`scope_id`, `idempotency_key`)
);

CREATE INDEX `idx_plan_input_receipts_scope_created` ON `plan_input_receipts` (`scope_id`, `created_at`);
