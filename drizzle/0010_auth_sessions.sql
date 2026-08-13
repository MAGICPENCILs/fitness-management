ALTER TABLE `staff` ADD `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `staff` ADD `password_changed_at` timestamp;--> statement-breakpoint
ALTER TABLE `staff` ADD `must_change_password` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE `auth_login_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` enum('ACCOUNT','IP') NOT NULL,
	`subject_hash` varchar(64) NOT NULL,
	`attempt_count` int NOT NULL DEFAULT 0,
	`window_started_at` timestamp NOT NULL,
	`locked_until` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auth_login_limits_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_limit_scope_subject_unique` UNIQUE(`scope`,`subject_hash`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staff_id` int NOT NULL,
	`session_token_hash` varchar(64) NOT NULL,
	`mode` enum('FULL','PASSWORD_CHANGE_REQUIRED') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL,
	`absolute_expires_at` timestamp NOT NULL,
	`idle_expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`revoked_reason` enum('LOGOUT','PASSWORD_CHANGED','PASSWORD_RESET','STAFF_UPDATED','ADMIN_REVOKED','EXPIRED'),
	`ip_fingerprint` varchar(64),
	`user_agent_category` varchar(50),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_session_token_hash_unique` UNIQUE(`session_token_hash`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_branch_id_branches_id_fk`;--> statement-breakpoint
ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_actor_staff_id_staff_id_fk`;--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `branch_id` int;--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `actor_staff_id` int;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_staff_id_staff_id_fk` FOREIGN KEY (`actor_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_limit_scope_locked_until_idx` ON `auth_login_limits` (`scope`,`locked_until`);--> statement-breakpoint
CREATE INDEX `auth_session_staff_status_expiry_idx` ON `auth_sessions` (`staff_id`,`revoked_at`,`absolute_expires_at`,`idle_expires_at`);
