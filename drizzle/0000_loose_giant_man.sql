CREATE TABLE `reader_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`goal` text DEFAULT '读懂故事' NOT NULL,
	`level` text DEFAULT '平时会读一些' NOT NULL,
	`likes` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shelf_books` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`file_key` text,
	`content_type` text,
	`size` integer DEFAULT 0 NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT '已导入' NOT NULL,
	`created_at` integer NOT NULL
);
