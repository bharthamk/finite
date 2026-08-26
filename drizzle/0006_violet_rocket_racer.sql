ALTER TABLE `construction_packets` ADD `disposition` text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE `construction_packets` ADD `return_reason_code` text;--> statement-breakpoint
ALTER TABLE `construction_packets` ADD `return_message` text;--> statement-breakpoint
ALTER TABLE `construction_packets` ADD `returned_at` text;