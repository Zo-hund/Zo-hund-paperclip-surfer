ALTER TABLE "meetings" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "calendar_provider" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "calendar_event_id" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "pod_key" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "last_active_context" jsonb;--> statement-breakpoint
CREATE INDEX "meetings_company_pod_key_idx" ON "meetings" USING btree ("company_id","pod_key");