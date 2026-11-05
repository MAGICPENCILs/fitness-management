CREATE TABLE `branch_receipt_settings` (
	`branch_id` int NOT NULL,
	`legal_name` varchar(200) NOT NULL,
	`tax_id` varchar(13),
	`branch_number` varchar(5) NOT NULL DEFAULT '00000',
	`address` text NOT NULL,
	`phone` varchar(20),
	`vat_registered` boolean NOT NULL DEFAULT false,
	`vat_rate` decimal(5,2) NOT NULL DEFAULT '7.00',
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branch_receipt_settings_branch_id` PRIMARY KEY(`branch_id`)
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payment_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`issued_by_staff_id` int NOT NULL,
	`receipt_number` varchar(30) NOT NULL,
	`document_type` enum('RECEIPT','TAX_INVOICE') NOT NULL,
	`issued_at` timestamp NOT NULL,
	`seller_name` varchar(200) NOT NULL,
	`seller_tax_id` varchar(13),
	`seller_branch_number` varchar(5),
	`seller_address` text,
	`seller_phone` varchar(20),
	`buyer_name` varchar(200) NOT NULL,
	`buyer_tax_id` varchar(13),
	`buyer_address` text,
	`item_description` text NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`subtotal_ex_vat` decimal(10,2) NOT NULL,
	`vat_rate` decimal(5,2) NOT NULL,
	`vat_amount` decimal(10,2) NOT NULL,
	`total_amount` decimal(10,2) NOT NULL,
	`payment_method` enum('CASH','QR_PROMPTPAY','TRANSFER','CREDIT_CARD') NOT NULL,
	CONSTRAINT `receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `receipts_payment_id_unique` UNIQUE(`payment_id`),
	CONSTRAINT `receipts_receipt_number_unique` UNIQUE(`receipt_number`)
);
--> statement-breakpoint
ALTER TABLE `branch_receipt_settings` ADD CONSTRAINT `branch_receipt_settings_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_issued_by_staff_id_staff_id_fk` FOREIGN KEY (`issued_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;