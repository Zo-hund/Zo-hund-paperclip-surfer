ALTER TABLE "lms_workshops" ADD COLUMN "category" text DEFAULT 'AI' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_workshops" ADD COLUMN "level" text DEFAULT 'Beginner' NOT NULL;