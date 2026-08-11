CREATE TABLE IF NOT EXISTS trust_passports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  system_type TEXT NOT NULL,
  owner TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  deployment_stage TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  data_classification TEXT NOT NULL,
  disclosure_status TEXT NOT NULL,
  evidence_status TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trust_passports_tenant_idx ON trust_passports (tenant_id, lifecycle_status, updated_at);

CREATE TABLE IF NOT EXISTS trust_agents (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  runtime TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  tool_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS trust_agents_tenant_idx ON trust_agents (tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS trust_reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  review_type TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  rationale TEXT,
  decided_by TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trust_reviews_queue_idx ON trust_reviews (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS trust_live_approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  passport_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS trust_live_approvals_idx ON trust_live_approvals (tenant_id, passport_id, created_at);

CREATE TABLE IF NOT EXISTS trust_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trust_audit_tenant_idx ON trust_audit_events (tenant_id, created_at);
