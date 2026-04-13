ALTER TABLE "rq_submissions" ADD COLUMN "lifecycle_stage" text DEFAULT 'pre_production' NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "is_simulation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "credit_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "token_cost" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD COLUMN "simulation_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
CREATE INDEX "rq_company_lifecycle_idx" ON "rq_submissions" USING btree ("company_id","lifecycle_stage");