ALTER TABLE `access_logs` ADD `daily_use_date` date;--> statement-breakpoint
ALTER TABLE `access_logs` ADD CONSTRAINT `access_logs_member_daily_use_unique` UNIQUE(`member_id`,`daily_use_date`);