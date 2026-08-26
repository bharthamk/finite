CREATE TABLE `construction_return_reviews` (
	`scope_id` text PRIMARY KEY NOT NULL,
	`return_id` text NOT NULL,
	`packet_id` text NOT NULL,
	`packet_json` text NOT NULL,
	`draft_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`returned_at` text NOT NULL,
	`resolved_by_packet_id` text,
	`resolved_at` text,
	`updated_at` text NOT NULL
);
