CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`company_name` text NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'started',
	`generated_resume_url` text NOT NULL,
	`cover-letter` text NOT NULL,
	`application_form` text NOT NULL,
	`cost` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`base_resume_md` text NOT NULL,
	`personal_info_md` text NOT NULL
);
