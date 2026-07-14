CREATE TABLE IF NOT EXISTS data_center_telemetry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  source_system TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS data_center_telemetry_tenant_idx
  ON data_center_telemetry (tenant_id, observed_at);
