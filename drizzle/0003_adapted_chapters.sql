CREATE TABLE `adapted_chapters` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `title` text NOT NULL,
  `source_url` text NOT NULL,
  `profile_hash` text NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `idx_adapted_user_book_profile` ON `adapted_chapters` (`user_id`,`title`,`source_url`,`profile_hash`);
