CREATE TABLE `attendance_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendance_punch_id` int NOT NULL,
	`corrected_by_staff_id` int NOT NULL,
	`original_punched_at` timestamp NOT NULL,
	`corrected_punched_at` timestamp NOT NULL,
	`reason` text NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `attendance_corrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_punches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staff_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`punch_type` enum('IN','OUT') NOT NULL,
	`punched_at` timestamp NOT NULL,
	`source` enum('SELF','ADMIN_CORRECTION') NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `attendance_punches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commission_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staff_id` int NOT NULL,
	`payment_id` int NOT NULL,
	`sales_amount` decimal(12,2) NOT NULL,
	`commission_amount` decimal(12,2) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `commission_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `commission_payment_staff_unique` UNIQUE(`payment_id`,`staff_id`)
);
--> statement-breakpoint
CREATE TABLE `compensation_profiles` (
	`staff_id` int NOT NULL,
	`base_salary` decimal(12,2) NOT NULL DEFAULT '0.00',
	`commission_rate_basis_points` int NOT NULL DEFAULT 0,
	`updated_by_staff_id` int NOT NULL,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `compensation_profiles_staff_id` PRIMARY KEY(`staff_id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staff_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`base_salary` decimal(12,2) NOT NULL,
	`commission_amount` decimal(12,2) NOT NULL,
	`total_amount` decimal(12,2) NOT NULL,
	`status` enum('DRAFT','APPROVED') NOT NULL DEFAULT 'DRAFT',
	`approved_by_staff_id` int,
	`approved_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `payroll_summaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_staff_period_unique` UNIQUE(`staff_id`,`period_start`,`period_end`)
);
--> statement-breakpoint
CREATE TABLE `staff_totp` (
	`staff_id` int NOT NULL,
	`encrypted_secret` text NOT NULL,
	`status` enum('PENDING','ENABLED','DISABLED') NOT NULL DEFAULT 'PENDING',
	`last_used_step` bigint,
	`enabled_at` timestamp,
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_totp_staff_id` PRIMARY KEY(`staff_id`)
);
--> statement-breakpoint
CREATE TABLE `staff_totp_recovery_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staff_id` int NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `staff_totp_recovery_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_totp_recovery_codes_code_hash_unique` UNIQUE(`code_hash`)
);
--> statement-breakpoint
ALTER TABLE `attendance_corrections` ADD CONSTRAINT `attendance_corrections_attendance_punch_id_attendance_punches_id_fk` FOREIGN KEY (`attendance_punch_id`) REFERENCES `attendance_punches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_corrections` ADD CONSTRAINT `attendance_corrections_corrected_by_staff_id_staff_id_fk` FOREIGN KEY (`corrected_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_punches` ADD CONSTRAINT `attendance_punches_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_punches` ADD CONSTRAINT `attendance_punches_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commission_ledger` ADD CONSTRAINT `commission_ledger_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commission_ledger` ADD CONSTRAINT `commission_ledger_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `compensation_profiles` ADD CONSTRAINT `compensation_profiles_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `compensation_profiles` ADD CONSTRAINT `compensation_profiles_updated_by_staff_id_staff_id_fk` FOREIGN KEY (`updated_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_summaries` ADD CONSTRAINT `payroll_summaries_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_summaries` ADD CONSTRAINT `payroll_summaries_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payroll_summaries` ADD CONSTRAINT `payroll_summaries_approved_by_staff_id_staff_id_fk` FOREIGN KEY (`approved_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_totp` ADD CONSTRAINT `staff_totp_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_totp_recovery_codes` ADD CONSTRAINT `staff_totp_recovery_codes_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_staff_time_idx` ON `attendance_punches` (`staff_id`,`punched_at`);