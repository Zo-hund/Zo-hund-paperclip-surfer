CREATE TABLE "agent_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"hypothesis" text NOT NULL,
	"approach_a" text NOT NULL,
	"approach_b" text NOT NULL,
	"task_type" text,
	"status" text NOT NULL,
	"winning_approach" text,
	"runs_a" integer DEFAULT 0 NOT NULL,
	"runs_b" integer DEFAULT 0 NOT NULL,
	"kpi_results_a" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kpi_results_b" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"concluded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_kpi_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"metadata_key" text NOT NULL,
	"target_value" real,
	"direction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_kpi_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"observer_type" text NOT NULL,
	"observer_agent_id" uuid,
	"observer_user_id" uuid,
	"observation" text NOT NULL,
	"agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_taken" boolean DEFAULT false NOT NULL,
	"action_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"run_id" uuid,
	"task_completed" boolean,
	"self_assessment_score" real,
	"tokens_used" bigint,
	"cost_cents" integer,
	"duration_seconds" integer,
	"errors_encountered" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"project_id" uuid,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_project_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"adapter_type" text NOT NULL,
	"project_id" uuid,
	"session_id" text,
	"session_params" jsonb,
	"session_display_id" text,
	"last_run_id" uuid,
	"run_count" integer DEFAULT 0 NOT NULL,
	"total_input_tokens" bigint DEFAULT 0 NOT NULL,
	"total_output_tokens" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "amx_global_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_type" text DEFAULT 'user' NOT NULL,
	"principal_id" text NOT NULL,
	"credit_balance" integer DEFAULT 0 NOT NULL,
	"token_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "amx_dispatch_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"evidence_id" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"capability" text NOT NULL,
	"risk_level" text NOT NULL,
	"command_summary" text NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_sha256" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amx_dispatch_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"requested_by_type" text NOT NULL,
	"requested_by_id" text,
	"capability" text NOT NULL,
	"risk_level" text DEFAULT 'read' NOT NULL,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"command_summary" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_decision" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lease_token_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amx_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'local_desktop' NOT NULL,
	"status" text DEFAULT 'enrolling' NOT NULL,
	"trust_tier" text DEFAULT 'paired' NOT NULL,
	"connection_mode" text DEFAULT 'outbound_websocket' NOT NULL,
	"public_key" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"posture" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"load" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"network" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"auditor_agent_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_label" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verdict" text,
	"findings" jsonb DEFAULT '[]'::jsonb,
	"certificate_footprint" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"time_range" text,
	"age_range" text,
	"description" text,
	"flyer_asset_id" uuid,
	"registration_url" text,
	"qr_code_asset_id" uuid,
	"is_published" boolean DEFAULT true NOT NULL,
	"event_type" text DEFAULT 'general' NOT NULL,
	"source_booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_mcp_exclusions" (
	"agent_id" uuid NOT NULL,
	"mcp_server_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"command" text NOT NULL,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transport_type" text NOT NULL,
	"transport_url" text,
	"source" text NOT NULL,
	"claude_code_config_path" text,
	"scope" text NOT NULL,
	"agent_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"photo_asset_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" integer,
	"response_body" text,
	"error" text,
	"duration_ms" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "harnesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"adapter_type" text DEFAULT 'openrouter' NOT NULL,
	"model" text DEFAULT 'openrouter/auto' NOT NULL,
	"toolbelt_id" uuid,
	"guardrails" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_ai_agent_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"code_name" text NOT NULL,
	"primary_domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_badge_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"criteria" jsonb,
	"icon_url" text,
	"category" text DEFAULT 'achievement' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_community_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"activity_type" text NOT NULL,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"description" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "lms_interventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"created_by_agent_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_learner_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"badge_definition_id" uuid NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_by_user_id" text,
	"awarded_by_agent_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "lms_marketplace_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"client_member_id" text NOT NULL,
	"project_title" text NOT NULL,
	"description" text,
	"budget_sims" integer DEFAULT 0 NOT NULL,
	"phase" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_start_at" timestamp with time zone,
	"scheduled_end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lms_marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"display_name" text NOT NULL,
	"title" text NOT NULL,
	"bio" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hourly_rate_sims" integer DEFAULT 50 NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"projects_completed" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_member_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"member_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team_assignment" text,
	"phone" text,
	"organization" text,
	"cohort" text,
	"learning_style" text,
	"career_interest" text,
	"engagement_score" integer DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'green' NOT NULL,
	"progression_stage" text DEFAULT 'explorer' NOT NULL,
	"linked_parent_user_id" text,
	"linked_learner_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"partner_status" text,
	"ambassador_status" text,
	"marketplace_revenue" integer DEFAULT 0 NOT NULL,
	"donation_amount" integer DEFAULT 0 NOT NULL,
	"sponsorship_tier" text,
	"is_public_profile" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_module_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"module_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"total_seconds" integer,
	"completed_at" timestamp with time zone,
	"quiz_score" integer,
	"quiz_attempts" integer DEFAULT 0 NOT NULL,
	"last_watched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lms_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"content_type" text DEFAULT 'video_embed' NOT NULL,
	"content_url" text,
	"content_text" text,
	"ai_narration_url" text,
	"duration_seconds" integer,
	"quiz_data" jsonb,
	"unlock_condition" text DEFAULT 'immediate' NOT NULL,
	"prerequisite_module_id" uuid,
	"unlock_delay_hours" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_session_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_out_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lms_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workshop_id" uuid,
	"instructor_user_id" text,
	"instructor_agent_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"format" text DEFAULT 'in_person' NOT NULL,
	"time_slot" text DEFAULT 'morning' NOT NULL,
	"scheduled_date" timestamp with time zone NOT NULL,
	"max_capacity" integer DEFAULT 30,
	"location" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "lms_workforce_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"resume_complete" integer DEFAULT 0 NOT NULL,
	"portfolio_score" integer DEFAULT 0 NOT NULL,
	"mock_interviews" integer DEFAULT 0 NOT NULL,
	"industry_certs" integer DEFAULT 0 NOT NULL,
	"employer_connections" integer DEFAULT 0 NOT NULL,
	"internship_ready" integer DEFAULT 0 NOT NULL,
	"job_applications" integer DEFAULT 0 NOT NULL,
	"placement_status" text DEFAULT 'not_started' NOT NULL,
	"placed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_workshops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'AI' NOT NULL,
	"level" text DEFAULT 'Beginner' NOT NULL,
	"credits_required" integer NOT NULL,
	"credits_awarded" integer NOT NULL,
	"format" text NOT NULL,
	"schedule" jsonb,
	"active_simulation_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_xr_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"session_duration_seconds" integer DEFAULT 0 NOT NULL,
	"world_visits" integer DEFAULT 0 NOT NULL,
	"simulations_completed" integer DEFAULT 0 NOT NULL,
	"object_interactions" integer DEFAULT 0 NOT NULL,
	"team_collaboration" integer DEFAULT 0 NOT NULL,
	"voice_activity_seconds" integer DEFAULT 0 NOT NULL,
	"hand_tracking_events" integer DEFAULT 0 NOT NULL,
	"assessment_completion" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_guest_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"guest_label" text,
	"created_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
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
	"agent_id" uuid,
	"user_id" text,
	"guest_invite_id" uuid,
	"guest_name" text,
	"status" text DEFAULT 'invited' NOT NULL,
	"last_action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"text" text NOT NULL,
	"timestamp_offset" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'standup' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"recording_path" text,
	"duration_seconds" integer,
	"ended_at" timestamp with time zone,
	"issue_id" uuid,
	"calendar_provider" text,
	"calendar_event_id" text,
	"pod_key" text,
	"last_active_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"review_status" text DEFAULT 'not_submitted' NOT NULL,
	"run_number" integer,
	"run_batch_id" text,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opprrc_deliveries_category_check" CHECK ("opprrc_deliveries"."category" IN ('01_organizations', '02_programs', '03_projects', '04_resources', '05_reports', '06_certificates')),
	CONSTRAINT "opprrc_deliveries_audience_check" CHECK ("opprrc_deliveries"."audience" IN ('BOARD-INTERNAL', 'CLIENTS-EXTERNAL')),
	CONSTRAINT "opprrc_deliveries_review_status_check" CHECK ("opprrc_deliveries"."review_status" IN ('not_submitted', 'pending_review', 'approved', 'revision_requested', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"company_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_key" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
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
	"issue_id" uuid,
	"lifecycle_stage" text DEFAULT 'pre_production' NOT NULL,
	"is_simulation" boolean DEFAULT true NOT NULL,
	"credit_cost" integer DEFAULT 0 NOT NULL,
	"token_cost" integer DEFAULT 0 NOT NULL,
	"simulation_status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"change_notes" text,
	"previous_content" text,
	"new_content" text,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tier_name" text NOT NULL,
	"stripe_product_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"amount" integer NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"tier_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toolbelts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"tool_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "require_board_approval_for_new_agents" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "schedule_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "cron_expression" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "schedule_timezone" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "next_scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "is_public_profile" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "harness_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "deployment_target" text DEFAULT 'cloud' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "company_memberships" ADD COLUMN "credential_id" text;--> statement-breakpoint
ALTER TABLE "company_memberships" ADD COLUMN "credential_data" jsonb;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "run_mode" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "swarm_batch_id" text;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "promoted_from_run_id" uuid;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "lifecycle_stage" text;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_experiments" ADD CONSTRAINT "agent_experiments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_experiments" ADD CONSTRAINT "agent_experiments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpi_definitions" ADD CONSTRAINT "agent_kpi_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpi_definitions" ADD CONSTRAINT "agent_kpi_definitions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpi_observations" ADD CONSTRAINT "agent_kpi_observations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpi_observations" ADD CONSTRAINT "agent_kpi_observations_observer_agent_id_agents_id_fk" FOREIGN KEY ("observer_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpis" ADD CONSTRAINT "agent_kpis_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpis" ADD CONSTRAINT "agent_kpis_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpis" ADD CONSTRAINT "agent_kpis_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpis" ADD CONSTRAINT "agent_kpis_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_sessions" ADD CONSTRAINT "agent_project_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_sessions" ADD CONSTRAINT "agent_project_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_sessions" ADD CONSTRAINT "agent_project_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_sessions" ADD CONSTRAINT "agent_project_sessions_last_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_certificates" ADD CONSTRAINT "amx_certificates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_chain_events" ADD CONSTRAINT "amx_chain_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_ledger" ADD CONSTRAINT "amx_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_transactions" ADD CONSTRAINT "amx_transactions_from_company_id_companies_id_fk" FOREIGN KEY ("from_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_transactions" ADD CONSTRAINT "amx_transactions_to_company_id_companies_id_fk" FOREIGN KEY ("to_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_dispatch_evidence" ADD CONSTRAINT "amx_dispatch_evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_dispatch_evidence" ADD CONSTRAINT "amx_dispatch_evidence_node_id_amx_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."amx_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_dispatch_evidence" ADD CONSTRAINT "amx_dispatch_evidence_lease_id_amx_dispatch_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."amx_dispatch_leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_dispatch_leases" ADD CONSTRAINT "amx_dispatch_leases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_dispatch_leases" ADD CONSTRAINT "amx_dispatch_leases_node_id_amx_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."amx_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_nodes" ADD CONSTRAINT "amx_nodes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_verifications" ADD CONSTRAINT "audit_verifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_verifications" ADD CONSTRAINT "audit_verifications_auditor_agent_id_agents_id_fk" FOREIGN KEY ("auditor_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_flyer_asset_id_assets_id_fk" FOREIGN KEY ("flyer_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_events" ADD CONSTRAINT "company_events_qr_code_asset_id_assets_id_fk" FOREIGN KEY ("qr_code_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_exclusions" ADD CONSTRAINT "agent_mcp_exclusions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_exclusions" ADD CONSTRAINT "agent_mcp_exclusions_mcp_server_id_company_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."company_mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_mcp_servers" ADD CONSTRAINT "company_mcp_servers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_mcp_servers" ADD CONSTRAINT "company_mcp_servers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_staff" ADD CONSTRAINT "company_staff_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_staff" ADD CONSTRAINT "company_staff_photo_asset_id_assets_id_fk" FOREIGN KEY ("photo_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_webhook_deliveries" ADD CONSTRAINT "company_webhook_deliveries_webhook_id_company_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."company_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_webhooks" ADD CONSTRAINT "company_webhooks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_collaborations" ADD CONSTRAINT "board_collaborations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_collaborations" ADD CONSTRAINT "board_collaborations_collective_id_collectives_id_fk" FOREIGN KEY ("collective_id") REFERENCES "public"."collectives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_collaborations" ADD CONSTRAINT "board_collaborations_elective_id_electives_id_fk" FOREIGN KEY ("elective_id") REFERENCES "public"."electives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_collaborations" ADD CONSTRAINT "board_collaborations_community_board_id_community_boards_id_fk" FOREIGN KEY ("community_board_id") REFERENCES "public"."community_boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectives" ADD CONSTRAINT "collectives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_boards" ADD CONSTRAINT "community_boards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electives" ADD CONSTRAINT "electives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harnesses" ADD CONSTRAINT "harnesses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harnesses" ADD CONSTRAINT "harnesses_toolbelt_id_toolbelts_id_fk" FOREIGN KEY ("toolbelt_id") REFERENCES "public"."toolbelts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_ai_agent_roles" ADD CONSTRAINT "lms_ai_agent_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_badge_definitions" ADD CONSTRAINT "lms_badge_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_community_activity" ADD CONSTRAINT "lms_community_activity_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_enrollments" ADD CONSTRAINT "lms_enrollments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_enrollments" ADD CONSTRAINT "lms_enrollments_workshop_id_lms_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."lms_workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_interventions" ADD CONSTRAINT "lms_interventions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_learner_badges" ADD CONSTRAINT "lms_learner_badges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_learner_badges" ADD CONSTRAINT "lms_learner_badges_badge_definition_id_lms_badge_definitions_id_fk" FOREIGN KEY ("badge_definition_id") REFERENCES "public"."lms_badge_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_marketplace_bookings" ADD CONSTRAINT "lms_marketplace_bookings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_marketplace_bookings" ADD CONSTRAINT "lms_marketplace_bookings_listing_id_lms_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."lms_marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_marketplace_listings" ADD CONSTRAINT "lms_marketplace_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_member_profiles" ADD CONSTRAINT "lms_member_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_module_progress" ADD CONSTRAINT "lms_module_progress_module_id_lms_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."lms_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_module_progress" ADD CONSTRAINT "lms_module_progress_enrollment_id_lms_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."lms_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_modules" ADD CONSTRAINT "lms_modules_workshop_id_lms_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."lms_workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_modules" ADD CONSTRAINT "lms_modules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_session_attendance" ADD CONSTRAINT "lms_session_attendance_session_id_lms_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."lms_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_session_attendance" ADD CONSTRAINT "lms_session_attendance_member_id_lms_member_profiles_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."lms_member_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_session_attendance" ADD CONSTRAINT "lms_session_attendance_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_sessions" ADD CONSTRAINT "lms_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_sessions" ADD CONSTRAINT "lms_sessions_workshop_id_lms_workshops_id_fk" FOREIGN KEY ("workshop_id") REFERENCES "public"."lms_workshops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_simulations" ADD CONSTRAINT "lms_simulations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_workforce_profiles" ADD CONSTRAINT "lms_workforce_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_workshops" ADD CONSTRAINT "lms_workshops_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_xr_sessions" ADD CONSTRAINT "lms_xr_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_guest_invites" ADD CONSTRAINT "meeting_guest_invites_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_guest_invites" ADD CONSTRAINT "meeting_guest_invites_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_outcomes" ADD CONSTRAINT "meeting_outcomes_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_outcomes" ADD CONSTRAINT "meeting_outcomes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_guest_invite_id_meeting_guest_invites_id_fk" FOREIGN KEY ("guest_invite_id") REFERENCES "public"."meeting_guest_invites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_transcripts" ADD CONSTRAINT "meeting_transcripts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_backup_jobs" ADD CONSTRAINT "opprrc_backup_jobs_delivery_id_opprrc_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."opprrc_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_deliveries" ADD CONSTRAINT "opprrc_deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_deliveries" ADD CONSTRAINT "opprrc_deliveries_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_deliveries" ADD CONSTRAINT "opprrc_deliveries_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opprrc_deliveries" ADD CONSTRAINT "opprrc_deliveries_delivered_by_agent_id_agents_id_fk" FOREIGN KEY ("delivered_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rq_agent_configs" ADD CONSTRAINT "rq_agent_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD CONSTRAINT "rq_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rq_submissions" ADD CONSTRAINT "rq_submissions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_change_log" ADD CONSTRAINT "skill_change_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_change_log" ADD CONSTRAINT "skill_change_log_skill_id_company_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."company_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_change_log" ADD CONSTRAINT "skill_change_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_change_log" ADD CONSTRAINT "skill_change_log_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_prices" ADD CONSTRAINT "stripe_prices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD CONSTRAINT "stripe_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toolbelts" ADD CONSTRAINT "toolbelts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_chat_messages_agent_created_idx" ON "agent_chat_messages" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_chat_messages_company_idx" ON "agent_chat_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_experiments_agent_idx" ON "agent_experiments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_experiments_company_idx" ON "agent_experiments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_kpi_definitions_company_idx" ON "agent_kpi_definitions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_kpi_observations_company_idx" ON "agent_kpi_observations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_kpis_agent_idx" ON "agent_kpis" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_kpis_company_idx" ON "agent_kpis" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_kpis_agent_created_idx" ON "agent_kpis" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_memories_agent_scope_idx" ON "agent_memories" USING btree ("agent_id","scope");--> statement-breakpoint
CREATE INDEX "agent_memories_agent_project_idx" ON "agent_memories" USING btree ("agent_id","project_id");--> statement-breakpoint
CREATE INDEX "agent_memories_company_idx" ON "agent_memories" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_project_sessions_agent_adapter_project_uniq" ON "agent_project_sessions" USING btree ("agent_id","adapter_type","project_id");--> statement-breakpoint
CREATE INDEX "agent_project_sessions_company_agent_idx" ON "agent_project_sessions" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "amx_cert_company_issue_idx" ON "amx_certificates" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amx_cert_footprint_idx" ON "amx_certificates" USING btree ("certificate_footprint");--> statement-breakpoint
CREATE INDEX "amx_chain_company_action_idx" ON "amx_chain_events" USING btree ("company_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "amx_global_ledger_principal_idx" ON "amx_global_ledger" USING btree ("principal_type","principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "amx_ledger_principal_idx" ON "amx_ledger" USING btree ("company_id","principal_type","principal_id");--> statement-breakpoint
CREATE INDEX "amx_tx_from_idx" ON "amx_transactions" USING btree ("from_principal_id");--> statement-breakpoint
CREATE INDEX "amx_tx_to_idx" ON "amx_transactions" USING btree ("to_principal_id");--> statement-breakpoint
CREATE INDEX "amx_tx_currency_idx" ON "amx_transactions" USING btree ("currency");--> statement-breakpoint
CREATE INDEX "amx_dispatch_evidence_company_received_idx" ON "amx_dispatch_evidence" USING btree ("company_id","received_at");--> statement-breakpoint
CREATE INDEX "amx_dispatch_evidence_lease_idx" ON "amx_dispatch_evidence" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "amx_dispatch_evidence_node_received_idx" ON "amx_dispatch_evidence" USING btree ("node_id","received_at");--> statement-breakpoint
CREATE INDEX "amx_dispatch_leases_company_status_idx" ON "amx_dispatch_leases" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "amx_dispatch_leases_node_status_idx" ON "amx_dispatch_leases" USING btree ("node_id","status");--> statement-breakpoint
CREATE INDEX "amx_dispatch_leases_company_expires_idx" ON "amx_dispatch_leases" USING btree ("company_id","expires_at");--> statement-breakpoint
CREATE INDEX "amx_nodes_company_status_idx" ON "amx_nodes" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "amx_nodes_company_trust_idx" ON "amx_nodes" USING btree ("company_id","trust_tier");--> statement-breakpoint
CREATE INDEX "amx_nodes_company_last_seen_idx" ON "amx_nodes" USING btree ("company_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "audit_verif_company_target_idx" ON "audit_verifications" USING btree ("company_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_verif_company_status_idx" ON "audit_verifications" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "audit_verif_auditor_idx" ON "audit_verifications" USING btree ("auditor_agent_id");--> statement-breakpoint
CREATE INDEX "company_events_company_start_idx" ON "company_events" USING btree ("company_id","start_date");--> statement-breakpoint
CREATE INDEX "agent_mcp_exclusions_agent_mcp_idx" ON "agent_mcp_exclusions" USING btree ("agent_id","mcp_server_id");--> statement-breakpoint
CREATE INDEX "company_mcp_servers_company_idx" ON "company_mcp_servers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_mcp_servers_company_agent_idx" ON "company_mcp_servers" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "company_staff_company_sort_idx" ON "company_staff" USING btree ("company_id","sort_order");--> statement-breakpoint
CREATE INDEX "company_webhook_deliveries_webhook_idx" ON "company_webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "company_webhook_deliveries_company_idx" ON "company_webhook_deliveries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_webhooks_company_idx" ON "company_webhooks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_webhooks_enabled_idx" ON "company_webhooks" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "collectives_company_domain_idx" ON "collectives" USING btree ("company_id","knowledge_domain");--> statement-breakpoint
CREATE INDEX "comm_board_company_loc_idx" ON "community_boards" USING btree ("company_id","location");--> statement-breakpoint
CREATE INDEX "electives_company_industry_idx" ON "electives" USING btree ("company_id","industry");--> statement-breakpoint
CREATE UNIQUE INDEX "harnesses_company_key_idx" ON "harnesses" USING btree ("company_id","key");--> statement-breakpoint
CREATE INDEX "harnesses_category_idx" ON "harnesses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "lms_ai_agent_role_company_idx" ON "lms_ai_agent_roles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lms_badge_def_company_idx" ON "lms_badge_definitions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lms_community_activity_member_idx" ON "lms_community_activity" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_enrollment_user_idx" ON "lms_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lms_enrollment_user_workshop_idx" ON "lms_enrollments" USING btree ("user_id","workshop_id");--> statement-breakpoint
CREATE INDEX "lms_intervention_member_company_idx" ON "lms_interventions" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_intervention_company_created_idx" ON "lms_interventions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "lms_learner_badge_member_idx" ON "lms_learner_badges" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_learner_badge_def_idx" ON "lms_learner_badges" USING btree ("badge_definition_id");--> statement-breakpoint
CREATE INDEX "lms_marketplace_booking_listing_idx" ON "lms_marketplace_bookings" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "lms_marketplace_booking_client_idx" ON "lms_marketplace_bookings" USING btree ("client_member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_marketplace_booking_status_idx" ON "lms_marketplace_bookings" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "lms_marketplace_listing_member_idx" ON "lms_marketplace_listings" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_marketplace_listing_company_active_idx" ON "lms_marketplace_listings" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "lms_member_profile_company_user_idx" ON "lms_member_profiles" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "lms_member_profile_risk_idx" ON "lms_member_profiles" USING btree ("company_id","risk_level");--> statement-breakpoint
CREATE INDEX "lms_module_progress_member_module_idx" ON "lms_module_progress" USING btree ("member_id","module_id");--> statement-breakpoint
CREATE INDEX "lms_module_progress_module_idx" ON "lms_module_progress" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "lms_module_workshop_order_idx" ON "lms_modules" USING btree ("workshop_id","order_index");--> statement-breakpoint
CREATE INDEX "lms_module_company_idx" ON "lms_modules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lms_attendance_session_member_idx" ON "lms_session_attendance" USING btree ("session_id","member_id");--> statement-breakpoint
CREATE INDEX "lms_attendance_member_idx" ON "lms_session_attendance" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "lms_session_company_date_idx" ON "lms_sessions" USING btree ("company_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "lms_session_status_idx" ON "lms_sessions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "lms_workforce_profile_member_idx" ON "lms_workforce_profiles" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_workforce_profile_company_idx" ON "lms_workforce_profiles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lms_workshop_company_status_idx" ON "lms_workshops" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "lms_xr_session_member_company_idx" ON "lms_xr_sessions" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_xr_session_recorded_at_idx" ON "lms_xr_sessions" USING btree ("company_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_guest_invites_token_hash_unique_idx" ON "meeting_guest_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "meeting_guest_invites_meeting_id_idx" ON "meeting_guest_invites" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_company_pod_key_idx" ON "meetings" USING btree ("company_id","pod_key");--> statement-breakpoint
CREATE INDEX "opprrc_backup_jobs_status_idx" ON "opprrc_backup_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opprrc_backup_jobs_delivery_idx" ON "opprrc_backup_jobs" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "opprrc_deliveries_company_issue_idx" ON "opprrc_deliveries" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE INDEX "opprrc_deliveries_company_batch_idx" ON "opprrc_deliveries" USING btree ("company_id","run_batch_id");--> statement-breakpoint
CREATE INDEX "opprrc_deliveries_backup_status_idx" ON "opprrc_deliveries" USING btree ("backup_status");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_company_idx" ON "push_subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "rq_company_status_idx" ON "rq_submissions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "rq_company_lifecycle_idx" ON "rq_submissions" USING btree ("company_id","lifecycle_stage");--> statement-breakpoint
CREATE INDEX "skill_change_log_skill_idx" ON "skill_change_log" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_change_log_agent_idx" ON "skill_change_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "skill_change_log_company_idx" ON "skill_change_log" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_price_id_unique_idx" ON "stripe_prices" USING btree ("stripe_price_id");--> statement-breakpoint
CREATE INDEX "stripe_price_company_tier_idx" ON "stripe_prices" USING btree ("company_id","tier_name");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_sub_subscription_id_idx" ON "stripe_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_company_user_idx" ON "stripe_subscriptions" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_customer_idx" ON "stripe_subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "toolbelts_company_key_idx" ON "toolbelts" USING btree ("company_id","key");--> statement-breakpoint
CREATE INDEX "toolbelts_category_idx" ON "toolbelts" USING btree ("category");--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_promoted_from_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("promoted_from_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_schedule_idx" ON "agents" USING btree ("schedule_enabled","next_scheduled_at");