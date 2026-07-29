CREATE TABLE `cash_reconciliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reconciliation_date` date NOT NULL,
	`opening_cash` decimal(12,2) NOT NULL,
	`cash_income` decimal(12,2) NOT NULL,
	`cash_expenses` decimal(12,2) NOT NULL,
	`expected_cash` decimal(12,2) NOT NULL,
	`actual_cash` decimal(12,2) NOT NULL,
	`difference` decimal(12,2) NOT NULL,
	`status` enum('BALANCED','OVER','SHORT') NOT NULL,
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_reconciliations_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_reconciliations_reconciliation_date_unique` UNIQUE(`reconciliation_date`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`expense_date` date NOT NULL,
	`category` enum('WATER','ELECTRICITY','SALARY','REPAIR','SUPPLIES','OTHER') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`payment_method` enum('CASH','TRANSFER','CREDIT_CARD') NOT NULL,
	`description` varchar(255) NOT NULL,
	`reference_number` varchar(100),
	`note` text,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
