CREATE TABLE `class_bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`class_id` int NOT NULL,
	`member_id` int NOT NULL,
	`status` enum('CONFIRMED','CANCELLED','ATTENDED','NO_SHOW') NOT NULL DEFAULT 'CONFIRMED',
	`booked_at` timestamp DEFAULT (now()),
	`cancelled_at` timestamp,
	CONSTRAINT `class_bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_bookings_class_member_unique` UNIQUE(`class_id`,`member_id`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainer_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`category` enum('YOGA','ZUMBA','SPINNING','STRENGTH','OTHER') NOT NULL,
	`room` varchar(100) NOT NULL,
	`class_date` date NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`capacity` int NOT NULL,
	`status` enum('SCHEDULED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'SCHEDULED',
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `classes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trainers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100) NOT NULL,
	`specialty` varchar(160) NOT NULL,
	`phone` varchar(20),
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trainers_id` PRIMARY KEY(`id`),
	CONSTRAINT `trainers_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `class_bookings` ADD CONSTRAINT `class_bookings_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_bookings` ADD CONSTRAINT `class_bookings_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_trainer_id_trainers_id_fk` FOREIGN KEY (`trainer_id`) REFERENCES `trainers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `class_bookings_class_status_idx` ON `class_bookings` (`class_id`,`status`);--> statement-breakpoint
CREATE INDEX `class_bookings_member_idx` ON `class_bookings` (`member_id`);--> statement-breakpoint
CREATE INDEX `classes_trainer_date_idx` ON `classes` (`trainer_id`,`class_date`);--> statement-breakpoint
CREATE INDEX `classes_status_date_idx` ON `classes` (`status`,`class_date`);--> statement-breakpoint
CREATE INDEX `trainers_status_idx` ON `trainers` (`status`);