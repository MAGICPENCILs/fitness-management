CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branch_id` int NOT NULL,
	`actor_staff_id` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(60) NOT NULL,
	`entity_id` int,
	`result` enum('SUCCESS','DENIED','FAILED') NOT NULL,
	`metadata` json,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staff_code` varchar(20) NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`home_branch_id` int NOT NULL,
	`role` enum('OWNER','MANAGER','COUNTER','TRAINER') NOT NULL,
	`phone` varchar(20),
	`email` varchar(100),
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_staff_code_unique` UNIQUE(`staff_code`)
);
--> statement-breakpoint
INSERT INTO `staff`
	(`id`, `staff_code`, `first_name`, `last_name`, `home_branch_id`, `role`, `status`)
VALUES
	(1, 'OWNER001', 'ผู้ดูแล', 'ระบบ', 1, 'OWNER', 'ACTIVE');
--> statement-breakpoint
CREATE TABLE `consent_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`recorded_by_staff_id` int NOT NULL,
	`consent_type` enum('SERVICE_PRIVACY','MARKETING','PHOTO') NOT NULL,
	`action` enum('GRANTED','WITHDRAWN') NOT NULL,
	`policy_version` varchar(30) NOT NULL,
	`source` enum('FRONT_DESK','MIGRATION','PRIVACY_REQUEST') NOT NULL,
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `consent_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `privacy_file_cleanups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`privacy_request_id` int,
	`source` enum('PHOTO_CONSENT_WITHDRAWAL','ANONYMIZATION') NOT NULL,
	`quarantine_token` varchar(64) NOT NULL,
	`status` enum('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
	`error_code` varchar(100),
	`created_at` timestamp DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `privacy_file_cleanups_id` PRIMARY KEY(`id`),
	CONSTRAINT `privacy_cleanup_token_unique` UNIQUE(`quarantine_token`)
);
--> statement-breakpoint
CREATE TABLE `privacy_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`request_type` enum('ANONYMIZATION') NOT NULL,
	`status` enum('PENDING','APPROVED','COMPLETED','REJECTED') NOT NULL DEFAULT 'PENDING',
	`open_request_key` varchar(30),
	`reason` text NOT NULL,
	`requested_by_staff_id` int NOT NULL,
	`requested_at` timestamp DEFAULT (now()),
	`reviewed_by_staff_id` int,
	`reviewed_at` timestamp,
	`review_note` text,
	`completed_at` timestamp,
	`file_cleanup_status` enum('NOT_REQUIRED','PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'NOT_REQUIRED',
	`file_cleanup_error` varchar(100),
	CONSTRAINT `privacy_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `privacy_member_open_unique` UNIQUE(`member_id`,`open_request_key`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_staff_id_staff_id_fk` FOREIGN KEY (`actor_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff` ADD CONSTRAINT `staff_home_branch_id_branches_id_fk` FOREIGN KEY (`home_branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_events` ADD CONSTRAINT `consent_events_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_events` ADD CONSTRAINT `consent_events_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_events` ADD CONSTRAINT `consent_events_recorded_by_staff_id_staff_id_fk` FOREIGN KEY (`recorded_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_file_cleanups` ADD CONSTRAINT `privacy_file_cleanups_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_file_cleanups` ADD CONSTRAINT `privacy_file_cleanups_privacy_request_id_privacy_requests_id_fk` FOREIGN KEY (`privacy_request_id`) REFERENCES `privacy_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_requests` ADD CONSTRAINT `privacy_requests_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_requests` ADD CONSTRAINT `privacy_requests_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_requests` ADD CONSTRAINT `privacy_requests_requested_by_staff_id_staff_id_fk` FOREIGN KEY (`requested_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_requests` ADD CONSTRAINT `privacy_requests_reviewed_by_staff_id_staff_id_fk` FOREIGN KEY (`reviewed_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_branch_created_idx` ON `audit_logs` (`branch_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_actor_created_idx` ON `audit_logs` (`actor_staff_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `staff_branch_status_idx` ON `staff` (`home_branch_id`,`status`);--> statement-breakpoint
CREATE INDEX `consent_member_type_created_idx` ON `consent_events` (`member_id`,`consent_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `privacy_cleanup_status_idx` ON `privacy_file_cleanups` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `privacy_branch_status_idx` ON `privacy_requests` (`branch_id`,`status`);
