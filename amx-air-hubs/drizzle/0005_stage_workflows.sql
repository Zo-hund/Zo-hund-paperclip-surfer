CREATE TABLE IF NOT EXISTS stage_workflows (
  tenant_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (tenant_id, room_code)
);

CREATE INDEX IF NOT EXISTS stage_workflows_updated_idx ON stage_workflows (tenant_id, updated_at);
