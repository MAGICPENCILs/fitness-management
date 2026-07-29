ALTER TABLE `payments`
  ADD COLUMN `promotion_id` int NULL AFTER `member_id`,
  ADD COLUMN `original_amount` decimal(10,2) NULL AFTER `promotion_id`,
  ADD COLUMN `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00' AFTER `original_amount`;
--> statement-breakpoint
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_promotion_id_promotions_id_fk`
  FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`)
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `coupon_codes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `promotion_id` int NOT NULL,
  `code` varchar(32) NOT NULL,
  `max_uses` int,
  `used_count` int NOT NULL DEFAULT 0,
  `per_member_limit` int NOT NULL DEFAULT 1,
  `min_purchase` decimal(10,2) NOT NULL DEFAULT '0.00',
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp DEFAULT (now()),
  `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `coupon_codes_id` PRIMARY KEY(`id`),
  CONSTRAINT `coupon_codes_code_unique` UNIQUE(`code`),
  CONSTRAINT `coupon_codes_promotion_id_promotions_id_fk`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`)
    ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `coupon_codes_promotion_idx` ON `coupon_codes` (`promotion_id`);
--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `coupon_id` int NOT NULL,
  `member_id` int NOT NULL,
  `payment_id` int NOT NULL,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `redeemed_at` timestamp DEFAULT (now()),
  CONSTRAINT `coupon_redemptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `coupon_redemptions_payment_unique` UNIQUE(`payment_id`),
  CONSTRAINT `coupon_redemptions_coupon_id_coupon_codes_id_fk`
    FOREIGN KEY (`coupon_id`) REFERENCES `coupon_codes`(`id`)
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT `coupon_redemptions_member_id_members_id_fk`
    FOREIGN KEY (`member_id`) REFERENCES `members`(`id`)
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT `coupon_redemptions_payment_id_payments_id_fk`
    FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`)
    ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `coupon_redemptions_member_coupon_idx`
  ON `coupon_redemptions` (`member_id`, `coupon_id`);
