CREATE TABLE "amx_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid,
	"task_id" text,
	"responsible_principal_id" text NOT NULL,
	"commit_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"task_logs_summary" text,
	"completion_time_ms" integer NOT NULL,
	"final_cost_tokens" integer NOT NULL,
	"projects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"certificate_footprint" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "amx_chain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amx_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" text NOT NULL,
	"token_balance" integer DEFAULT 0 NOT NULL,
	"credit_balance" integer DEFAULT 0 NOT NULL,
	"wallet_address" text,
	"auto_top_up_enabled" boolean DEFAULT false NOT NULL,
	"spending_limit_tokens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amx_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_company_id" uuid,
	"to_company_id" uuid,
	"from_principal_type" text NOT NULL,
	"from_principal_id" text NOT NULL,
	"to_principal_type" text NOT NULL,
	"to_principal_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'AMX' NOT NULL,
	"transaction_type" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"proof_of_work_certificate_id" uuid,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_collaborations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"collective_id" uuid NOT NULL,
	"elective_id" uuid NOT NULL,
	"community_board_id" uuid,
	"project_id" uuid,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"knowledge_domain" text NOT NULL,
	"skill_providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"active_needs" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "electives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"industry" text NOT NULL,
	"authorized_principals" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"workshop_id" uuid NOT NULL,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"score" integer,
	"certificates_awarded" jsonb DEFAULT '[]'::jsonb,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lms_simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scenario" text NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"credits_required" integer NOT NULL,
	"credits_awarded" integer NOT NULL,
	"format" text NOT NULL,
	"schedule" jsonb,
	"active_simulation_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"agent_id" uuid,
	"status" text DEFAULT 'unresolved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"last_action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rq_agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"default_adapter_override" text,
	"config" jsonb
);
--> statement-breakpoint
CREATE TABLE "rq_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"tier" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"context_data" jsonb NOT NULL,
	"deployment_mode" text DEFAULT 'online' NOT NULL,
	"agent_swarm_ids" jsonb DEFAULT '[]'::jsonb,
	"amount_paid_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amx_tx_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amx_certificates" ADD CONSTRAINT "amx_certificates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_chain_events" ADD CONSTRAINT "amx_chain_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_ledger" ADD CONSTRAINT "amx_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_transactions" ADD CONSTRAINT "amx_transactions_from_company_id_companies_id_fk" FOREIGN KEY ("from_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_transactions" ADD CONSTRAINT "amx_transactions_to_company_id_companies_id_fk" FOREIGN KEY ("to_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_collaborations" ADD CONSTRAINT "board_collaborations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_collaborations" ADD CONSTRAINT "board_collaborations_collective_id_collectives_id_fk" FOREIGN KEY ("collective_id") REFERENCES "public"."collectives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_collaborations" ADD CONSTRAINT "board_collaborations_elective_id_electives_id_fk" FOREIGN KEY ("elective_id") REFERENCES "public"."electives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_collaborations" ADD CONSTRAINT "board_collaborations_community_board_id_community_boards_id_fk" FOREIGN KEY ("community_board_id") REFERENCES "public"."community_boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectives" ADD CONSTRAINT "collectives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_boards" ADD CONSTRAINT "community_boards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electives" ADD CONSTRAINT "electives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_enrollments" ADD CONSTRAINT "lms_enrollments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_enrollments" ADD CONSTRAINT "lms_enrollments_workshop_id_lms_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."lms_workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_simulations" ADD CONSTRAINT "lms_simulations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_workshops" ADD CONSTRAINT "lms_workshops_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_outcomes" ADD CONSTRAINT "meeting_outcomes_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_outcomes" ADD CONSTRAINT "meeting_outcomes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rq_agent_configs" ADD CONSTRAINT "rq_agent_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD CONSTRAINT "rq_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amx_cert_company_issue_idx" ON "amx_certificates" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amx_cert_footprint_idx" ON "amx_certificates" USING btree ("certificate_footprint");--> statement-breakpoint
CREATE INDEX "amx_chain_company_action_idx" ON "amx_chain_events" USING btree ("company_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "amx_ledger_principal_idx" ON "amx_ledger" USING btree ("company_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "amx_tx_from_idx" ON "amx_transactions" USING btree ("from_principal_id");--> statement-breakpoint
CREATE INDEX "amx_tx_to_idx" ON "amx_transactions" USING btree ("to_principal_id");--> statement-breakpoint
CREATE INDEX "amx_tx_currency_idx" ON "amx_transactions" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "collectives_company_domain_idx" ON "collectives" USING btree ("company_id","knowledge_domain");--> statement-breakpoint
CREATE INDEX "comm_board_company_loc_idx" ON "community_boards" USING btree ("company_id","location");--> statement-breakpoint
CREATE INDEX "electives_company_industry_idx" ON "electives" USING btree ("company_id","industry");--> statement-breakpoint
CREATE INDEX "lms_enrollment_user_idx" ON "lms_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lms_enrollment_user_workshop_idx" ON "lms_enrollments" USING btree ("user_id","workshop_id");--> statement-breakpoint
CREATE INDEX "lms_workshop_company_status_idx" ON "lms_workshops" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "rq_company_status_idx" ON "rq_submissions" USING btree ("company_id","status");