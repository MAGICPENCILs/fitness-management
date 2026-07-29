CREATE TABLE `equipment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(30) NOT NULL,
	`name` varchar(120) NOT NULL,
	`category` enum('CARDIO','STRENGTH','FREE_WEIGHT','ACCESSORY','OTHER') NOT NULL,
	`location` varchar(100) NOT NULL,
	`serial_number` varchar(100),
	`status` enum('OPERATIONAL','MAINTENANCE','OUT_OF_SERVICE') NOT NULL DEFAULT 'OPERATIONAL',
	`purchase_date` date,
	`warranty_end_date` date,
	`current_usage_hours` int NOT NULL DEFAULT 0,
	`maintenance_interval_hours` int,
	`next_maintenance_hours` int,
	`next_maintenance_date` date,
	`last_maintenance_date` date,
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipment_id` PRIMARY KEY(`id`),
	CONSTRAINT `equipment_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipment_id` int NOT NULL,
	`type` enum('INSPECTION','PREVENTIVE','REPAIR') NOT NULL,
	`status` enum('SCHEDULED','IN_PROGRESS','COMPLETED') NOT NULL,
	`scheduled_date` date NOT NULL,
	`completed_date` date,
	`usage_hours_at_service` int,
	`cost` decimal(10,2) NOT NULL DEFAULT '0.00',
	`technician` varchar(120),
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `maintenance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `maintenance_records` ADD CONSTRAINT `maintenance_records_equipment_id_equipment_id_fk` FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `equipment_status_idx` ON `equipment` (`status`);--> statement-breakpoint
CREATE INDEX `equipment_category_idx` ON `equipment` (`category`);--> statement-breakpoint
CREATE INDEX `equipment_next_maintenance_date_idx` ON `equipment` (`next_maintenance_date`);--> statement-breakpoint
CREATE INDEX `maintenance_equipment_id_idx` ON `maintenance_records` (`equipment_id`);--> statement-breakpoint
CREATE INDEX `maintenance_status_idx` ON `maintenance_records` (`status`);--> statement-breakpoint
CREATE INDEX `maintenance_scheduled_date_idx` ON `maintenance_records` (`scheduled_date`);