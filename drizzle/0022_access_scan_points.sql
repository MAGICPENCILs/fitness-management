CREATE TABLE `access_scan_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branch_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	CONSTRAINT `access_scan_points_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_scan_points_branch_name_unique` UNIQUE(`branch_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `access_logs` ADD `scan_point_id` int;--> statement-breakpoint
ALTER TABLE `access_scan_points` ADD CONSTRAINT `access_scan_points_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_logs` ADD CONSTRAINT `access_logs_scan_point_id_access_scan_points_id_fk` FOREIGN KEY (`scan_point_id`) REFERENCES `access_scan_points`(`id`) ON DELETE no action ON UPDATE no action;