CREATE TABLE `pt_packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`trainer_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`total_sessions` int NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`status` enum('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pt_packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pt_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`package_id` int NOT NULL,
	`scheduled_date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`status` enum('SCHEDULED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
	`weight_kg` decimal(6,2),
	`bmi` decimal(5,2),
	`waist_cm` decimal(6,2),
	`workout_summary` text,
	`trainer_note` text,
	`completed_at` timestamp,
	`cancelled_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pt_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pt_packages` ADD CONSTRAINT `pt_packages_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pt_packages` ADD CONSTRAINT `pt_packages_trainer_id_trainers_id_fk` FOREIGN KEY (`trainer_id`) REFERENCES `trainers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pt_sessions` ADD CONSTRAINT `pt_sessions_package_id_pt_packages_id_fk` FOREIGN KEY (`package_id`) REFERENCES `pt_packages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pt_packages_member_status_idx` ON `pt_packages` (`member_id`,`status`);--> statement-breakpoint
CREATE INDEX `pt_packages_trainer_status_idx` ON `pt_packages` (`trainer_id`,`status`);--> statement-breakpoint
CREATE INDEX `pt_packages_end_date_idx` ON `pt_packages` (`end_date`);--> statement-breakpoint
CREATE INDEX `pt_sessions_package_status_idx` ON `pt_sessions` (`package_id`,`status`);--> statement-breakpoint
CREATE INDEX `pt_sessions_schedule_idx` ON `pt_sessions` (`scheduled_date`,`start_time`);