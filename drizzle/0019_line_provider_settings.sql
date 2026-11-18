CREATE TABLE `line_provider_settings` (
	`id` int NOT NULL,
	`access_token_encrypted` text,
	`channel_secret_encrypted` text,
	`destination` varchar(33) NOT NULL,
	`revision` int NOT NULL,
	`updated_by_staff_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `line_provider_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `line_provider_settings_singleton` CHECK(`id` = 1)
);
--> statement-breakpoint
ALTER TABLE `line_provider_settings` ADD CONSTRAINT `line_provider_settings_updated_by_staff_id_staff_id_fk` FOREIGN KEY (`updated_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;