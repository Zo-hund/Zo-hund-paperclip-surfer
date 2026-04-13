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
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_chat_messages_agent_created_idx" ON "agent_chat_messages" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_chat_messages_company_idx" ON "agent_chat_messages" USING btree ("company_id");