CREATE TABLE "opprrc_backup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid,
	"company_id" uuid NOT NULL,
	"source_storage" text DEFAULT 'vps' NOT NULL,
	"target_storage" text DEFAULT 'google_drive' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opprrc_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"asset_id" uuid,
	"category" text NOT NULL,
	"audience" text DEFAULT 'CLIENTS-EXTERNAL' NOT NULL,
	"location_slug" text,
	"live_storage" text DEFAULT 'vps' NOT NULL,
	"vps_file_path" text,
	"vps_file_url" text,
	"vps_verified_at" timestamp with time zone,
	"backup_storage" text DEFAULT 'google_drive' NOT NULL,
	"google_drive_file_id" text,
	"google_drive_folder_id" text,
	"google_drive_file_url" text,
	"backup_status" text DEFAULT 'not_started' NOT NULL,
	"last_backup_at" timestamp with time zone,
	"run_number" integer,
	"run_batch_id" text,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opprrc_backup_jobs" ADD CONSTRAINT "opprrc_backup_jobs_delivery_id_opprrc_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."opprrc_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_deliveries" ADD CONSTRAINT "opprrc_deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_deliveries" ADD CONSTRAINT "opprrc_deliveries_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_deliveries" ADD CONSTRAINT "opprrc_deliveries_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_deliveries" ADD CONSTRAINT "opprrc_deliveries_delivered_by_agent_id_agents_id_fk" FOREIGN KEY ("delivered_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opprrc_backup_jobs_status_idx" ON "opprrc_backup_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opprrc_backup_jobs_delivery_idx" ON "opprrc_backup_jobs" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "opprrc_deliveries_company_issue_idx" ON "opprrc_deliveries" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE INDEX "opprrc_deliveries_company_batch_idx" ON "opprrc_deliveries" USING btree ("company_id","run_batch_id");--> statement-breakpoint
CREATE INDEX "opprrc_deliveries_backup_status_idx" ON "opprrc_deliveries" USING btree ("backup_status");