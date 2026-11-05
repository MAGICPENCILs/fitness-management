CREATE TABLE `freeze_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`member_package_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`requested_days` int NOT NULL,
	`freeze_year` int NOT NULL,
	`reason` text NOT NULL,
	`status` enum('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
	`active_key` varchar(16),
	`started_at` timestamp NOT NULL,
	`ended_at` timestamp,
	`created_by_staff_id` int NOT NULL,
	`ended_by_staff_id` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `freeze_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `freeze_records_member_active_unique` UNIQUE(`member_id`,`active_key`)
);
--> statement-breakpoint
CREATE TABLE `member_access_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`issued_by_staff_id` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `member_access_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_access_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `freeze_records` ADD CONSTRAINT `freeze_records_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `freeze_records` ADD CONSTRAINT `freeze_records_member_package_id_member_packages_id_fk` FOREIGN KEY (`member_package_id`) REFERENCES `member_packages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `freeze_records` ADD CONSTRAINT `freeze_records_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `freeze_records` ADD CONSTRAINT `freeze_records_created_by_staff_id_staff_id_fk` FOREIGN KEY (`created_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `freeze_records` ADD CONSTRAINT `freeze_records_ended_by_staff_id_staff_id_fk` FOREIGN KEY (`ended_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_access_tokens` ADD CONSTRAINT `member_access_tokens_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_access_tokens` ADD CONSTRAINT `member_access_tokens_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_access_tokens` ADD CONSTRAINT `member_access_tokens_issued_by_staff_id_staff_id_fk` FOREIGN KEY (`issued_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `freeze_records_member_year_idx` ON `freeze_records` (`member_id`,`freeze_year`);--> statement-breakpoint
CREATE INDEX `member_access_tokens_member_idx` ON `member_access_tokens` (`member_id`);--> statement-breakpoint
CREATE INDEX `member_access_tokens_expiry_idx` ON `member_access_tokens` (`expires_at`);