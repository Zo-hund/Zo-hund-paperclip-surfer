CREATE TABLE IF NOT EXISTS "pit_stop_optimizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "workspace_id" uuid REFERENCES "pit_stop_workspaces"("id") ON DELETE SET NULL,
  "notebook_id" uuid NOT NULL REFERENCES "sim_notebooks"("id") ON DELETE CASCADE,
  "source_sim_run_id" uuid NOT NULL REFERENCES "heartbeat_runs"("id") ON DELETE CASCADE,
  "source_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "source_run_status" text NOT NULL,
  "status" text NOT NULL DEFAULT 'recommended',
  "trigger_reason" text NOT NULL,
  "trigger_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "current_execution_plan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "current_runtime_requirements" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "current_adapter_override" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recommended_execution_plan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recommended_runtime_requirements" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recommended_adapter_override" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "optimization_actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "explanation" text,
  "estimated_savings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "relaunch_eligible" boolean NOT NULL DEFAULT false,
  "launched_sim_run_id" uuid REFERENCES "heartbeat_runs"("id") ON DELETE SET NULL,
  "launched_at" timestamptz,
  "manual_notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "pit_stop_optimizations_source_sim_run_uq"
  ON "pit_stop_optimizations" ("source_sim_run_id");

CREATE INDEX IF NOT EXISTS "pit_stop_optimizations_workspace_status_idx"
  ON "pit_stop_optimizations" ("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "pit_stop_optimizations_company_created_idx"
  ON "pit_stop_optimizations" ("company_id", "created_at");
