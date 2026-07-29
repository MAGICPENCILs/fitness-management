CREATE TABLE `notification_settings` (
	`id` int NOT NULL,
	`reminder_days` varchar(50) NOT NULL DEFAULT '7,3,1',
	`inactivity_days` int NOT NULL DEFAULT 30,
	`enable_in_app` boolean NOT NULL DEFAULT true,
	`enable_sms` boolean NOT NULL DEFAULT false,
	`enable_line` boolean NOT NULL DEFAULT false,
	`enable_email` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`member_package_id` int,
	`type` enum('EXPIRY_REMINDER','INACTIVITY','SCAN_WARNING') NOT NULL,
	`channel` enum('IN_APP','SMS','LINE','EMAIL') NOT NULL,
	`status` enum('QUEUED','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'QUEUED',
	`recipient` varchar(191),
	`title` varchar(150) NOT NULL,
	`message` text NOT NULL,
	`scheduled_for` date NOT NULL,
	`dedupe_key` varchar(191) NOT NULL,
	`error_message` varchar(255),
	`sent_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_dedupe_key_unique` UNIQUE(`dedupe_key`)
);
--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_member_package_id_member_packages_id_fk` FOREIGN KEY (`member_package_id`) REFERENCES `member_packages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notifications_member_id_idx` ON `notifications` (`member_id`);--> statement-breakpoint
CREATE INDEX `notifications_status_idx` ON `notifications` (`status`);--> statement-breakpoint
CREATE INDEX `notifications_scheduled_for_idx` ON `notifications` (`scheduled_for`);