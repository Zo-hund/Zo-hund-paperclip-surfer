CREATE TABLE IF NOT EXISTS "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_user_id" text NOT NULL,
	"listing_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hourly_rate_tokens" integer NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"supported_run_phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payout_wallet" text,
	"location" text,
	"is_promoted" boolean DEFAULT false NOT NULL,
	"promoted_until" timestamp with time zone,
	"sponsor_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"headline" text,
	"bio" text,
	"location" text,
	"role_intent" text DEFAULT 'none' NOT NULL,
	"partner_status" text DEFAULT 'none' NOT NULL,
	"eligibility_status" text DEFAULT 'ineligible' NOT NULL,
	"review_reason" text,
	"application_submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"lms_credits" integer DEFAULT 500 NOT NULL,
	"amx_token_balance" integer DEFAULT 750 NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payout_wallet" text,
	"availability" text DEFAULT 'available' NOT NULL,
	"supported_run_phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guidance_completed_lessons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guidance_completed_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pit_stop_optimizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workspace_id" uuid,
	"notebook_id" uuid NOT NULL,
	"source_sim_run_id" uuid NOT NULL,
	"source_agent_id" uuid,
	"source_run_status" text NOT NULL,
	"status" text DEFAULT 'recommended' NOT NULL,
	"trigger_reason" text NOT NULL,
	"trigger_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_execution_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_runtime_requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_adapter_override" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommended_execution_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommended_runtime_requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommended_adapter_override" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"optimization_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explanation" text,
	"estimated_savings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"relaunch_eligible" boolean DEFAULT false NOT NULL,
	"launched_sim_run_id" uuid,
	"launched_at" timestamp with time zone,
	"manual_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pit_stop_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workspace_id" uuid,
	"notebook_id" uuid NOT NULL,
	"member_user_id" text NOT NULL,
	"scenario_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_sim_run_id" uuid,
	"notebook_section_key" text,
	"notebook_snapshot_markdown" text DEFAULT '' NOT NULL,
	"run_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"eval_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"coaching_notes" text,
	"mentor_notes" text,
	"sponsor_notes" text,
	"generated_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft_agent_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_agent_diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_live_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_track" text,
	"target_rail" text,
	"readiness_score" integer,
	"threshold_passed" boolean DEFAULT false NOT NULL,
	"blocking_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"live_recommendation" text,
	"approval_id" uuid,
	"approval_outcome" text,
	"approval_notes" text,
	"approval_reviewed_at" timestamp with time zone,
	"promoted_live_run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pit_stop_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"notebook_id" uuid NOT NULL,
	"member_user_id" text NOT NULL,
	"scenario_key" text NOT NULL,
	"latest_sim_run_id" uuid,
	"latest_notebook_section_key" text,
	"latest_run_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latest_eval_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"coaching_notes" text,
	"mentor_notes" text,
	"sponsor_notes" text,
	"generated_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft_agent_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_agent_diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_live_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_track" text,
	"target_rail" text,
	"readiness_score" integer,
	"threshold_passed" boolean DEFAULT false NOT NULL,
	"blocking_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"live_recommendation" text,
	"last_packaged_at" timestamp with time zone,
	"last_approval_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sim_notebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"member_user_id" text NOT NULL,
	"scenario_key" text NOT NULL,
	"scenario_label" text NOT NULL,
	"issue_id" uuid,
	"work_product_id" uuid,
	"last_source_run_id" uuid,
	"latest_section_key" text,
	"current_markdown" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "amx_ledger_principal_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "execution_workspaces_company_project_status_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "heartbeat_runs_company_agent_started_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "invites_company_invite_state_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "join_requests_company_status_type_created_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "workspace_operations_company_run_started_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "workspace_runtime_services_company_workspace_status_idx";
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "is_promoted" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "promoted_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "sponsor_tag" text;
--> statement-breakpoint
ALTER TABLE "agent_memories" ADD COLUMN IF NOT EXISTS "operating_environment" text DEFAULT 'live' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'live' NOT NULL;
--> statement-breakpoint
ALTER TABLE "amx_ledger" ADD COLUMN IF NOT EXISTS "operating_environment" text;
--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN IF NOT EXISTS "operating_environment" text DEFAULT 'live' NOT NULL;
--> statement-breakpoint
ALTER TABLE "finance_events" ADD COLUMN IF NOT EXISTS "operating_environment" text;
--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN IF NOT EXISTS "environment" text DEFAULT 'live' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "operating_environment" text DEFAULT 'simulation' NOT NULL;
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "runtime_requirements" jsonb;
--> statement-breakpoint
ALTER TABLE "join_requests" ADD COLUMN IF NOT EXISTS "operating_environment" text DEFAULT 'simulation' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_operations" ADD COLUMN IF NOT EXISTS "operating_environment" text DEFAULT 'live' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_runtime_services" ADD COLUMN IF NOT EXISTS "operating_environment" text DEFAULT 'live' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_optimizations" ADD CONSTRAINT "pit_stop_optimizations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_optimizations" ADD CONSTRAINT "pit_stop_optimizations_workspace_id_pit_stop_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."pit_stop_workspaces"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_optimizations" ADD CONSTRAINT "pit_stop_optimizations_notebook_id_sim_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."sim_notebooks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_optimizations" ADD CONSTRAINT "pit_stop_optimizations_source_sim_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("source_sim_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_optimizations" ADD CONSTRAINT "pit_stop_optimizations_source_agent_id_agents_id_fk" FOREIGN KEY ("source_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_optimizations" ADD CONSTRAINT "pit_stop_optimizations_launched_sim_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("launched_sim_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_packages" ADD CONSTRAINT "pit_stop_packages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_packages" ADD CONSTRAINT "pit_stop_packages_workspace_id_pit_stop_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."pit_stop_workspaces"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_packages" ADD CONSTRAINT "pit_stop_packages_notebook_id_sim_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."sim_notebooks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_packages" ADD CONSTRAINT "pit_stop_packages_source_sim_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("source_sim_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_packages" ADD CONSTRAINT "pit_stop_packages_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_workspaces" ADD CONSTRAINT "pit_stop_workspaces_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_workspaces" ADD CONSTRAINT "pit_stop_workspaces_notebook_id_sim_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."sim_notebooks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_workspaces" ADD CONSTRAINT "pit_stop_workspaces_latest_sim_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("latest_sim_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pit_stop_workspaces" ADD CONSTRAINT "pit_stop_workspaces_last_approval_id_approvals_id_fk" FOREIGN KEY ("last_approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "sim_notebooks" ADD CONSTRAINT "sim_notebooks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "sim_notebooks" ADD CONSTRAINT "sim_notebooks_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "sim_notebooks" ADD CONSTRAINT "sim_notebooks_work_product_id_issue_work_products_id_fk" FOREIGN KEY ("work_product_id") REFERENCES "public"."issue_work_products"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "sim_notebooks" ADD CONSTRAINT "sim_notebooks_last_source_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("last_source_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_listings_company_status_idx" ON "marketplace_listings" USING btree ("company_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_listings_provider_idx" ON "marketplace_listings" USING btree ("provider_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_listings_type_idx" ON "marketplace_listings" USING btree ("listing_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_listings_promoted_idx" ON "marketplace_listings" USING btree ("is_promoted");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_profiles_partner_status_idx" ON "marketplace_profiles" USING btree ("partner_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplace_profiles_role_intent_idx" ON "marketplace_profiles" USING btree ("role_intent");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pit_stop_optimizations_source_sim_run_uq" ON "pit_stop_optimizations" USING btree ("source_sim_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pit_stop_optimizations_workspace_status_idx" ON "pit_stop_optimizations" USING btree ("workspace_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pit_stop_optimizations_company_created_idx" ON "pit_stop_optimizations" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pit_stop_packages_notebook_version_uq" ON "pit_stop_packages" USING btree ("notebook_id","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pit_stop_packages_company_status_idx" ON "pit_stop_packages" USING btree ("company_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pit_stop_packages_approval_idx" ON "pit_stop_packages" USING btree ("approval_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pit_stop_workspaces_notebook_uq" ON "pit_stop_workspaces" USING btree ("notebook_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pit_stop_workspaces_company_member_scenario_idx" ON "pit_stop_workspaces" USING btree ("company_id","member_user_id","scenario_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sim_notebooks_company_member_scenario_uq" ON "sim_notebooks" USING btree ("company_id","member_user_id","scenario_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sim_notebooks_company_updated_idx" ON "sim_notebooks" USING btree ("company_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_memories_company_environment_idx" ON "agent_memories" USING btree ("company_id","operating_environment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_company_environment_status_idx" ON "agents" USING btree ("company_id","environment","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_events_company_environment_occurred_idx" ON "finance_events" USING btree ("company_id","operating_environment","occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "amx_ledger_principal_idx" ON "amx_ledger" USING btree ("company_id","principal_type","principal_id","operating_environment");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execution_workspaces_company_project_status_idx" ON "execution_workspaces" USING btree ("company_id","operating_environment","project_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_runs_company_agent_started_idx" ON "heartbeat_runs" USING btree ("company_id","environment","agent_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invites_company_invite_state_idx" ON "invites" USING btree ("company_id","operating_environment","invite_type","revoked_at","expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "join_requests_company_status_type_created_idx" ON "join_requests" USING btree ("company_id","operating_environment","status","request_type","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_operations_company_run_started_idx" ON "workspace_operations" USING btree ("company_id","operating_environment","heartbeat_run_id","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_runtime_services_company_workspace_status_idx" ON "workspace_runtime_services" USING btree ("company_id","operating_environment","project_workspace_id","status");
