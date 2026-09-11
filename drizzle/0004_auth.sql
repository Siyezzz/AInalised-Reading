CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);

CREATE TABLE `sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);
