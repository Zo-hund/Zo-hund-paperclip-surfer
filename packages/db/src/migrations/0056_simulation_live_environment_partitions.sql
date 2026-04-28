ALTER TABLE "agents" ADD COLUMN "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
CREATE INDEX "agents_company_environment_status_idx" ON "agents" USING btree ("company_id","environment","status");--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "operating_environment" text DEFAULT 'simulation' NOT NULL;--> statement-breakpoint
DROP INDEX "invites_company_invite_state_idx";--> statement-breakpoint
CREATE INDEX "invites_company_invite_state_idx" ON "invites" USING btree ("company_id","operating_environment","invite_type","revoked_at","expires_at");--> statement-breakpoint
ALTER TABLE "join_requests" ADD COLUMN "operating_environment" text DEFAULT 'simulation' NOT NULL;--> statement-breakpoint
DROP INDEX "join_requests_company_status_type_created_idx";--> statement-breakpoint
CREATE INDEX "join_requests_company_status_type_created_idx" ON "join_requests" USING btree ("company_id","operating_environment","status","request_type","created_at");--> statement-breakpoint
ALTER TABLE "agent_memories" ADD COLUMN "operating_environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_memories_company_environment_idx" ON "agent_memories" USING btree ("company_id","operating_environment","created_at");--> statement-breakpoint
ALTER TABLE "amx_ledger" ADD COLUMN "operating_environment" text;--> statement-breakpoint
DROP INDEX IF EXISTS "amx_ledger_company_principal_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "amx_ledger_principal_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "amx_ledger_principal_idx" ON "amx_ledger" USING btree ("company_id","principal_type","principal_id","operating_environment");--> statement-breakpoint
ALTER TABLE "finance_events" ADD COLUMN "operating_environment" text;--> statement-breakpoint
CREATE INDEX "finance_events_company_environment_occurred_idx" ON "finance_events" USING btree ("company_id","operating_environment","occurred_at");--> statement-breakpoint
ALTER TABLE "execution_workspaces" ADD COLUMN "operating_environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
DROP INDEX "execution_workspaces_company_project_status_idx";--> statement-breakpoint
CREATE INDEX "execution_workspaces_company_project_status_idx" ON "execution_workspaces" USING btree ("company_id","operating_environment","project_id","status");--> statement-breakpoint
ALTER TABLE "workspace_operations" ADD COLUMN "operating_environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
DROP INDEX "workspace_operations_company_run_started_idx";--> statement-breakpoint
CREATE INDEX "workspace_operations_company_run_started_idx" ON "workspace_operations" USING btree ("company_id","operating_environment","heartbeat_run_id","started_at");--> statement-breakpoint
ALTER TABLE "workspace_runtime_services" ADD COLUMN "operating_environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
DROP INDEX "workspace_runtime_services_company_workspace_status_idx";--> statement-breakpoint
CREATE INDEX "workspace_runtime_services_company_workspace_status_idx" ON "workspace_runtime_services" USING btree ("company_id","operating_environment","project_workspace_id","status");--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
DROP INDEX "heartbeat_runs_company_agent_started_idx";--> statement-breakpoint
CREATE INDEX "heartbeat_runs_company_agent_started_idx" ON "heartbeat_runs" USING btree ("company_id","environment","agent_id","started_at");--> statement-breakpoint
