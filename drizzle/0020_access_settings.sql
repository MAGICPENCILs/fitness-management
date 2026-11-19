CREATE TABLE `access_settings` (
	`id` int NOT NULL,
	`grace_days` int NOT NULL DEFAULT 3,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `access_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_settings_singleton` CHECK(`id` = 1),
	CONSTRAINT `access_settings_grace_days_range` CHECK(`grace_days` between 3 and 7)
);
