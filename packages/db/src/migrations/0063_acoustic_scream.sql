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
	"linked_parent_user_id" text,
	"linked_learner_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
ALTER TABLE "lms_ai_agent_roles" ADD CONSTRAINT "lms_ai_agent_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_badge_definitions" ADD CONSTRAINT "lms_badge_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_community_activity" ADD CONSTRAINT "lms_community_activity_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_interventions" ADD CONSTRAINT "lms_interventions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_learner_badges" ADD CONSTRAINT "lms_learner_badges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_learner_badges" ADD CONSTRAINT "lms_learner_badges_badge_definition_id_lms_badge_definitions_id_fk" FOREIGN KEY ("badge_definition_id") REFERENCES "public"."lms_badge_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "lms_workforce_profiles" ADD CONSTRAINT "lms_workforce_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_xr_sessions" ADD CONSTRAINT "lms_xr_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lms_ai_agent_role_company_idx" ON "lms_ai_agent_roles" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lms_badge_def_company_idx" ON "lms_badge_definitions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lms_community_activity_member_idx" ON "lms_community_activity" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_intervention_member_company_idx" ON "lms_interventions" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_intervention_company_created_idx" ON "lms_interventions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "lms_learner_badge_member_idx" ON "lms_learner_badges" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_learner_badge_def_idx" ON "lms_learner_badges" USING btree ("badge_definition_id");--> statement-breakpoint
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
CREATE INDEX "lms_xr_session_member_company_idx" ON "lms_xr_sessions" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_xr_session_recorded_at_idx" ON "lms_xr_sessions" USING btree ("company_id","recorded_at");