CREATE TABLE `arrival_events` (
	`scope_id` text NOT NULL,
	`order_id` text NOT NULL,
	`version` integer NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor` text NOT NULL,
	`source_surface` text NOT NULL,
	`payload_json` text NOT NULL,
	`event_hash` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `order_id`, `version`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_arrival_events_scope_event` ON `arrival_events` (`scope_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_arrival_events_scope_order_version` ON `arrival_events` (`scope_id`,`order_id`,`version`);--> statement-breakpoint
CREATE TABLE `arrival_orders` (
	`scope_id` text NOT NULL,
	`order_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`raw_outcome` text NOT NULL,
	`structured_json` text NOT NULL,
	`attachments_json` text NOT NULL,
	`inputs_json` text NOT NULL,
	`pending_clarification_json` text,
	`interpretation_json` text,
	`last_operator_checkpoint` integer NOT NULL,
	`packet_checksum` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope_id`, `order_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_arrival_orders_scope_idempotency` ON `arrival_orders` (`scope_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_arrival_orders_scope_status_updated` ON `arrival_orders` (`scope_id`,`status`,`updated_at`);