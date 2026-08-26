CREATE TABLE `construction_packets` (
	`scope_id` text PRIMARY KEY NOT NULL,
	`packet_id` text NOT NULL,
	`packet_json` text NOT NULL,
	`checksum` text NOT NULL,
	`base_plan_id` text NOT NULL,
	`base_profile_hash` text NOT NULL,
	`base_revision` integer NOT NULL,
	`kind` text NOT NULL,
	`source_order_id` text,
	`source_order_version` integer,
	`source_order_checksum` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`cleared_at` text,
	`updated_at` text NOT NULL
);
