CREATE TABLE IF NOT EXISTS proof_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS proof_tenant_idx ON proof_records (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  mission_id TEXT,
  campaign_id TEXT,
  location_tag TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS analytics_tenant_idx ON analytics_events (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS skill_pods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
