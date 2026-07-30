CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(20) NOT NULL,
	`name` varchar(150) NOT NULL,
	`phone` varchar(20),
	`address` text,
	`status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
	`is_main` boolean NOT NULL DEFAULT false,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
INSERT INTO `branches` (`id`, `code`, `name`, `status`, `is_main`)
VALUES (1, 'MAIN', 'Fitness Pro สาขาหลัก', 'ACTIVE', true);--> statement-breakpoint
ALTER TABLE `cash_reconciliations` DROP INDEX `cash_reconciliations_reconciliation_date_unique`;--> statement-breakpoint
ALTER TABLE `access_logs` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_reconciliations` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `card_pool` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `classes` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `trainers` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `home_branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `lockers` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `cash_reconciliations` ADD CONSTRAINT `cash_reconciliations_branch_date_unique` UNIQUE(`branch_id`,`reconciliation_date`);--> statement-breakpoint
ALTER TABLE `access_logs` ADD CONSTRAINT `access_logs_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cash_reconciliations` ADD CONSTRAINT `cash_reconciliations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `card_pool` ADD CONSTRAINT `card_pool_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trainers` ADD CONSTRAINT `trainers_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equipment` ADD CONSTRAINT `equipment_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `members` ADD CONSTRAINT `members_home_branch_id_branches_id_fk` FOREIGN KEY (`home_branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lockers` ADD CONSTRAINT `lockers_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
