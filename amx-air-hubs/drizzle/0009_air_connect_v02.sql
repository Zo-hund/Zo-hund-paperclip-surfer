CREATE TABLE IF NOT EXISTS connectivity_providers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  account_reference TEXT,
  service_type TEXT NOT NULL,
  contract_start TEXT,
  contract_end TEXT,
  download_mbps INTEGER NOT NULL,
  upload_mbps INTEGER NOT NULL,
  data_cap_mb INTEGER NOT NULL,
  monthly_cost_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  multi_user_allowed INTEGER NOT NULL DEFAULT 0,
  commercial_use_allowed INTEGER NOT NULL DEFAULT 0,
  resale_allowed INTEGER NOT NULL DEFAULT 0,
  guest_access_allowed INTEGER NOT NULL DEFAULT 0,
  public_access_allowed INTEGER NOT NULL DEFAULT 0,
  multi_tenant_allowed INTEGER NOT NULL DEFAULT 0,
  data_pooling_allowed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectivity_providers_tenant_idx ON connectivity_providers (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS connectivity_pool_profiles (
  pool_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  download_capacity_mbps INTEGER NOT NULL,
  upload_capacity_mbps INTEGER NOT NULL,
  billing_period_start TEXT,
  billing_period_end TEXT,
  upstream_cost_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  resale_allowed INTEGER NOT NULL DEFAULT 0,
  community_access_allowed INTEGER NOT NULL DEFAULT 0,
  guest_access_allowed INTEGER NOT NULL DEFAULT 0,
  public_access_allowed INTEGER NOT NULL DEFAULT 0,
  multi_tenant_allowed INTEGER NOT NULL DEFAULT 0,
  data_pooling_allowed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectivity_pool_profiles_tenant_idx ON connectivity_pool_profiles (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS network_nodes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  adapter_type TEXT NOT NULL,
  status TEXT NOT NULL,
  last_heartbeat_at TEXT,
  capabilities TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS network_nodes_tenant_idx ON network_nodes (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS network_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  applied_at TEXT,
  removed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS network_policies_runtime_idx ON network_policies (tenant_id, runtime_id, version);

CREATE TABLE IF NOT EXISTS connectivity_container_profiles (
  runtime_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  event_id TEXT,
  program_id TEXT,
  reserved_mb INTEGER NOT NULL DEFAULT 0,
  download_limit_mbps INTEGER NOT NULL,
  upload_limit_mbps INTEGER NOT NULL,
  min_guaranteed_mbps INTEGER NOT NULL,
  burst_limit_mbps INTEGER NOT NULL,
  max_users INTEGER NOT NULL,
  max_devices INTEGER NOT NULL,
  priority_class TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  auto_return_unused INTEGER NOT NULL DEFAULT 1,
  network_policy_id TEXT,
  edge_node_id TEXT,
  policy_version INTEGER NOT NULL DEFAULT 0,
  admissions_open INTEGER NOT NULL DEFAULT 0,
  cost_payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectivity_container_profiles_tenant_idx ON connectivity_container_profiles (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS network_edge_commands (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  runtime_id TEXT,
  policy_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  nonce TEXT NOT NULL,
  payload TEXT NOT NULL,
  signature TEXT NOT NULL,
  signature_algorithm TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledgement_payload TEXT
);
CREATE INDEX IF NOT EXISTS network_edge_commands_node_idx ON network_edge_commands (tenant_id, node_id, status, issued_at);

CREATE TABLE IF NOT EXISTS network_usage_samples (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  user_id TEXT,
  device_id TEXT,
  bytes_down INTEGER NOT NULL,
  bytes_up INTEGER NOT NULL,
  download_mbps REAL NOT NULL,
  upload_mbps REAL NOT NULL,
  latency_ms REAL NOT NULL,
  jitter_ms REAL NOT NULL,
  packet_loss REAL NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS network_usage_samples_runtime_idx ON network_usage_samples (tenant_id, runtime_id, recorded_at);

CREATE TABLE IF NOT EXISTS network_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  user_id TEXT,
  device_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  disconnected_at TEXT,
  bytes_down INTEGER NOT NULL DEFAULT 0,
  bytes_up INTEGER NOT NULL DEFAULT 0,
  total_mb INTEGER NOT NULL DEFAULT 0,
  termination_reason TEXT
);
CREATE INDEX IF NOT EXISTS network_sessions_runtime_idx ON network_sessions (tenant_id, runtime_id, connected_at);

CREATE TABLE IF NOT EXISTS allocation_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  rule_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS network_alerts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  runtime_id TEXT,
  node_id TEXT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS network_alerts_tenant_idx ON network_alerts (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS connectivity_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL UNIQUE,
  event_id TEXT,
  program_id TEXT,
  report_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectivity_reports_tenant_idx ON connectivity_reports (tenant_id, generated_at);
