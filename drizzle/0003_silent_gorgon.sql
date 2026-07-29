CREATE TABLE `locker_rentals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locker_id` int NOT NULL,
	`member_id` int NOT NULL,
	`rental_type` enum('USAGE','MONTHLY') NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date,
	`price` decimal(10,2) NOT NULL DEFAULT '0.00',
	`status` enum('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
	`note` text,
	`checked_out_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `locker_rentals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lockers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`zone` varchar(50) NOT NULL,
	`status` enum('AVAILABLE','OCCUPIED') NOT NULL DEFAULT 'AVAILABLE',
	`monthly_rate` decimal(10,2),
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lockers_id` PRIMARY KEY(`id`),
	CONSTRAINT `lockers_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `locker_rentals` ADD CONSTRAINT `locker_rentals_locker_id_lockers_id_fk` FOREIGN KEY (`locker_id`) REFERENCES `lockers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `locker_rentals` ADD CONSTRAINT `locker_rentals_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `locker_rentals_locker_id_idx` ON `locker_rentals` (`locker_id`);--> statement-breakpoint
CREATE INDEX `locker_rentals_member_id_idx` ON `locker_rentals` (`member_id`);--> statement-breakpoint
CREATE INDEX `locker_rentals_status_idx` ON `locker_rentals` (`status`);