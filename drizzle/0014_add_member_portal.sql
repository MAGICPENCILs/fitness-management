CREATE TABLE `member_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`email` varchar(191) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_accounts_member_id_unique` UNIQUE(`member_id`),
	CONSTRAINT `member_accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `member_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branch_id` int NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`email` varchar(191) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`service_privacy_consent` boolean NOT NULL,
	`marketing_consent` boolean NOT NULL DEFAULT false,
	`policy_version` varchar(30) NOT NULL,
	`status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
	`review_note` text,
	`reviewed_by_staff_id` int,
	`reviewed_at` timestamp,
	`member_id` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `member_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_applications_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_account_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL,
	CONSTRAINT `member_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `member_accounts` ADD CONSTRAINT `member_accounts_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_applications` ADD CONSTRAINT `member_applications_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_applications` ADD CONSTRAINT `member_applications_reviewed_by_staff_id_staff_id_fk` FOREIGN KEY (`reviewed_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_applications` ADD CONSTRAINT `member_applications_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_sessions` ADD CONSTRAINT `member_sessions_member_account_id_member_accounts_id_fk` FOREIGN KEY (`member_account_id`) REFERENCES `member_accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `member_applications_branch_status_idx` ON `member_applications` (`branch_id`,`status`);--> statement-breakpoint
CREATE INDEX `member_sessions_account_expiry_idx` ON `member_sessions` (`member_account_id`,`expires_at`,`revoked_at`);