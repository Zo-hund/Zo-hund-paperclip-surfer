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
ALTER TABLE "amx_dispatch_leases" ADD CONSTRAINT "amx_dispatch_leases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_dispatch_leases" ADD CONSTRAINT "amx_dispatch_leases_node_id_amx_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."amx_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_nodes" ADD CONSTRAINT "amx_nodes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amx_dispatch_leases_company_status_idx" ON "amx_dispatch_leases" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "amx_dispatch_leases_node_status_idx" ON "amx_dispatch_leases" USING btree ("node_id","status");--> statement-breakpoint
CREATE INDEX "amx_dispatch_leases_company_expires_idx" ON "amx_dispatch_leases" USING btree ("company_id","expires_at");--> statement-breakpoint
CREATE INDEX "amx_nodes_company_status_idx" ON "amx_nodes" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "amx_nodes_company_trust_idx" ON "amx_nodes" USING btree ("company_id","trust_tier");--> statement-breakpoint
CREATE INDEX "amx_nodes_company_last_seen_idx" ON "amx_nodes" USING btree ("company_id","last_seen_at");