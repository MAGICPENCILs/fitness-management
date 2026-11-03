ALTER TABLE `notifications` MODIFY COLUMN `status` enum('QUEUED','PROCESSING','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'QUEUED';--> statement-breakpoint
ALTER TABLE `notifications` ADD `failure_kind` enum('RETRYABLE','PERMANENT','CONFIG');--> statement-breakpoint
ALTER TABLE `notifications` ADD `attempt_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `last_attempt_at` timestamp;