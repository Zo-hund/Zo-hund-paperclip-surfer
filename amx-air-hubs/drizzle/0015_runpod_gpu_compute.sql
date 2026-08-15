CREATE TABLE IF NOT EXISTS gpu_tenant_policies (
  tenant_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active','paused')),
  monthly_budget_cents INTEGER NOT NULL CHECK (monthly_budget_cents >= 100),
  per_job_limit_cents INTEGER NOT NULL CHECK (per_job_limit_cents >= 25),
  allowed_workloads TEXT NOT NULL,
  allowed_gpus TEXT NOT NULL,
  max_concurrent_jobs INTEGER NOT NULL CHECK (max_concurrent_jobs BETWEEN 1 AND 20),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gpu_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  workload TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  provider_job_id TEXT UNIQUE,
  status TEXT NOT NULL,
  gpu_type TEXT NOT NULL,
  estimated_cents INTEGER NOT NULL,
  actual_cents INTEGER,
  duration_ms INTEGER,
  input_payload TEXT NOT NULL,
  output_payload TEXT NOT NULL DEFAULT '{}',
  output_url TEXT,
  output_content_type TEXT,
  media_object_id TEXT,
  delivery_target TEXT NOT NULL,
  stage_room TEXT,
  approved_by TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS gpu_jobs_tenant_idx ON gpu_jobs (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS gpu_jobs_provider_idx ON gpu_jobs (provider_job_id);

CREATE TABLE IF NOT EXISTS gpu_usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  workload TEXT NOT NULL,
  gpu_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  active_ms INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gpu_usage_events_tenant_idx ON gpu_usage_events (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS gpu_delivery_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('archive','stage','livekit')),
  room_code TEXT,
  source_url TEXT,
  content_type TEXT,
  status TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gpu_delivery_events_tenant_idx ON gpu_delivery_events (tenant_id, created_at);
