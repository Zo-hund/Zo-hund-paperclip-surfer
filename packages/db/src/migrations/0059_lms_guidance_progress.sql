ALTER TABLE "marketplace_profiles"
ADD COLUMN "guidance_completed_lessons" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "marketplace_profiles"
ADD COLUMN "guidance_completed_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;
