CREATE TABLE `crm_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`channel` enum('NOTE','PHONE','LINE','SMS','EMAIL','IN_PERSON') NOT NULL,
	`summary` varchar(1000) NOT NULL,
	`follow_up_date` date,
	`status` enum('OPEN','COMPLETED') NOT NULL DEFAULT 'OPEN',
	`completed_at` timestamp,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `crm_interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`member_id` int NOT NULL,
	`type` enum('EARN','REDEEM') NOT NULL,
	`points` int NOT NULL,
	`source` varchar(120) NOT NULL,
	`note` varchar(500),
	`reward_id` int,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `loyalty_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`description` text,
	`points_required` int NOT NULL,
	`stock` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loyalty_rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `member_crm_profiles` (
	`member_id` int NOT NULL,
	`interests` varchar(500),
	`fitness_goals` varchar(500),
	`preferred_contact` enum('PHONE','LINE','SMS','EMAIL','NONE') NOT NULL DEFAULT 'PHONE',
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_crm_profiles_member_id` PRIMARY KEY(`member_id`)
);
--> statement-breakpoint
ALTER TABLE `crm_interactions` ADD CONSTRAINT `crm_interactions_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_points` ADD CONSTRAINT `loyalty_points_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loyalty_points` ADD CONSTRAINT `loyalty_points_reward_id_loyalty_rewards_id_fk` FOREIGN KEY (`reward_id`) REFERENCES `loyalty_rewards`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `member_crm_profiles` ADD CONSTRAINT `member_crm_profiles_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE no action ON UPDATE no action;