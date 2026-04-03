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
ALTER TABLE "audit_verifications" ADD CONSTRAINT "audit_verifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_verifications" ADD CONSTRAINT "audit_verifications_auditor_agent_id_agents_id_fk" FOREIGN KEY ("auditor_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_verif_company_target_idx" ON "audit_verifications" USING btree ("company_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_verif_company_status_idx" ON "audit_verifications" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "audit_verif_auditor_idx" ON "audit_verifications" USING btree ("auditor_agent_id");