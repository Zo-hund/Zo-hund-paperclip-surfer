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
ALTER TABLE "amx_dispatch_evidence" ADD CONSTRAINT "amx_dispatch_evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_dispatch_evidence" ADD CONSTRAINT "amx_dispatch_evidence_node_id_amx_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."amx_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amx_dispatch_evidence" ADD CONSTRAINT "amx_dispatch_evidence_lease_id_amx_dispatch_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."amx_dispatch_leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amx_dispatch_evidence_company_received_idx" ON "amx_dispatch_evidence" USING btree ("company_id","received_at");--> statement-breakpoint
CREATE INDEX "amx_dispatch_evidence_lease_idx" ON "amx_dispatch_evidence" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "amx_dispatch_evidence_node_received_idx" ON "amx_dispatch_evidence" USING btree ("node_id","received_at");