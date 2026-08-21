ALTER TABLE `equipment` MODIFY COLUMN `status` enum('OPERATIONAL','MAINTENANCE','OUT_OF_SERVICE','RETIRED') NOT NULL DEFAULT 'OPERATIONAL';--> statement-breakpoint
ALTER TABLE `equipment` ADD `retired_at` timestamp;--> statement-breakpoint
ALTER TABLE `equipment` ADD `retired_reason` varchar(500);--> statement-breakpoint
ALTER TABLE `equipment` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `equipment_branch_status_idx` ON `equipment` (`branch_id`,`status`);--> statement-breakpoint
CREATE INDEX `equipment_branch_category_idx` ON `equipment` (`branch_id`,`category`);--> statement-breakpoint
CREATE INDEX `equipment_branch_next_maintenance_date_idx` ON `equipment` (`branch_id`,`next_maintenance_date`);