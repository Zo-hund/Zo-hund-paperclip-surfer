ALTER TABLE "agents" ADD COLUMN "schedule_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "cron_expression" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "schedule_timezone" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "next_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "issue_id" uuid;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "lifecycle_stage" text DEFAULT 'pre_production' NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "is_simulation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "credit_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "token_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "simulation_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD CONSTRAINT "rq_submissions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_schedule_idx" ON "agents" USING btree ("schedule_enabled","next_scheduled_at");--> statement-breakpoint
CREATE INDEX "rq_company_lifecycle_idx" ON "rq_submissions" USING btree ("company_id","lifecycle_stage");