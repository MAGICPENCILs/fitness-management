CREATE TABLE `member_line_links` (
	`member_id` int NOT NULL,
	`line_user_id` varchar(33),
	`challenge_hash` char(64),
	`challenge_expires_at` timestamp,
	`initiated_by_staff_id` int,
	`branch_id` int NOT NULL,
	`linked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_line_links_member_id` PRIMARY KEY(`member_id`),
	CONSTRAINT `member_line_links_line_user_id_unique` UNIQUE(`line_user_id`),
	CONSTRAINT `member_line_links_challenge_hash_unique` UNIQUE(`challenge_hash`)
);
--> statement-breakpoint
ALTER TABLE `member_line_links` ADD CONSTRAINT `member_line_links_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_line_links` ADD CONSTRAINT `member_line_links_initiated_by_staff_id_staff_id_fk` FOREIGN KEY (`initiated_by_staff_id`) REFERENCES `staff`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_line_links` ADD CONSTRAINT `member_line_links_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;