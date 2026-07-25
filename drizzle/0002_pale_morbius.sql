CREATE TABLE `daily_focus` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`slot` integer NOT NULL,
	`content` text,
	`project_id` text,
	`is_done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "daily_focus_slot_range" CHECK("daily_focus"."slot" between 1 and 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_focus_date_slot` ON `daily_focus` (`date`,`slot`);--> statement-breakpoint
CREATE TABLE `daily_focus_tasks` (
	`focus_id` text NOT NULL,
	`task_id` text NOT NULL,
	PRIMARY KEY(`focus_id`, `task_id`),
	FOREIGN KEY (`focus_id`) REFERENCES `daily_focus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`module_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`source` text DEFAULT 'timer' NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_time_task` ON `time_entries` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_time_started` ON `time_entries` (`started_at`);--> statement-breakpoint
CREATE TABLE `today_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`task_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_today_date` ON `today_entries` (`date`);--> statement-breakpoint
CREATE INDEX `idx_today_task` ON `today_entries` (`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `today_entries_date_task` ON `today_entries` (`date`,`task_id`);