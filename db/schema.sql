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

CREATE TABLE IF NOT EXISTS pod_invites (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  owner_token_hash TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  tenant_color TEXT NOT NULL,
  pod_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  host_name TEXT NOT NULL,
  guest_role TEXT NOT NULL,
  max_uses INTEGER NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pod_invites_lookup_idx ON pod_invites (token, status, expires_at);
CREATE INDEX IF NOT EXISTS pod_invites_pod_idx ON pod_invites (tenant_id, pod_id, created_at);

CREATE TABLE IF NOT EXISTS media_objects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS media_tenant_idx ON media_objects (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  transport TEXT NOT NULL,
  content_kind TEXT NOT NULL,
  attachment_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_runs_tenant_idx ON agent_runs (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS geo_anchors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS geo_anchors_room_idx ON geo_anchors (tenant_id, room_code, updated_at);

CREATE TABLE IF NOT EXISTS digital_twin_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  twin_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS digital_twin_room_idx ON digital_twin_events (tenant_id, room_code, created_at);

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

CREATE TABLE IF NOT EXISTS merch_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  checkout_url TEXT,
  printful_order_id TEXT,
  tracking_url TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS merch_orders_member_idx ON merch_orders (tenant_id, member_id, created_at);

CREATE TABLE IF NOT EXISTS merch_revenue_allocations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  beneficiary_type TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  share_basis_points INTEGER NOT NULL,
  amount_cents INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS merch_allocations_order_idx ON merch_revenue_allocations (tenant_id, order_id);

CREATE TABLE IF NOT EXISTS merch_webhook_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  store_id TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS merch_webhook_order_idx ON merch_webhook_events (order_id, created_at);

CREATE TABLE IF NOT EXISTS merch_payout_profiles (
  tenant_id TEXT NOT NULL,
  beneficiary_type TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  contact_email TEXT,
  stripe_account_id TEXT NOT NULL UNIQUE,
  onboarding_status TEXT NOT NULL,
  details_submitted INTEGER NOT NULL DEFAULT 0,
  charges_enabled INTEGER NOT NULL DEFAULT 0,
  payouts_enabled INTEGER NOT NULL DEFAULT 0,
  requirements_due TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, beneficiary_type, beneficiary_id)
);

CREATE INDEX IF NOT EXISTS merch_payout_profiles_tenant_idx ON merch_payout_profiles (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS merch_payout_transfers (
  id TEXT PRIMARY KEY,
  allocation_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  beneficiary_type TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  stripe_account_id TEXT NOT NULL,
  stripe_transfer_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS merch_payout_transfers_tenant_idx ON merch_payout_transfers (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS merch_connect_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  stripe_object_id TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS air_resource_pools (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  total_units INTEGER NOT NULL,
  available_units INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS air_resource_pools_tenant_idx ON air_resource_pools (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS air_room_runtimes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  name TEXT NOT NULL,
  allocation_units INTEGER NOT NULL,
  consumed_units INTEGER NOT NULL DEFAULT 0,
  learner_count INTEGER NOT NULL,
  trainer_count INTEGER NOT NULL,
  agent_count INTEGER NOT NULL DEFAULT 1,
  learner_ids TEXT NOT NULL DEFAULT '[]',
  bandwidth_mbps INTEGER NOT NULL,
  video_profile TEXT NOT NULL,
  livekit_room TEXT NOT NULL,
  livekit_dispatch TEXT,
  status TEXT NOT NULL,
  report_payload TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS air_room_runtimes_tenant_idx ON air_room_runtimes (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS air_room_runtimes_pool_idx ON air_room_runtimes (pool_id, status);

CREATE TABLE IF NOT EXISTS air_resource_wallets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  available_units INTEGER NOT NULL DEFAULT 0,
  reserved_units INTEGER NOT NULL DEFAULT 0,
  consumed_units INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, owner_type, owner_id, resource_type)
);

CREATE INDEX IF NOT EXISTS air_resource_wallets_tenant_idx ON air_resource_wallets (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS air_resource_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  pool_id TEXT,
  runtime_id TEXT,
  wallet_id TEXT,
  transaction_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  amount_units INTEGER NOT NULL,
  balance_after INTEGER,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS air_resource_transactions_tenant_idx ON air_resource_transactions (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS air_resource_transactions_runtime_idx ON air_resource_transactions (runtime_id, created_at);

-- AIR Connect v0.2 companion tables. The v0.1 pool/runtime ledger remains the
-- source of allocation truth while these records add provider and edge context.
CREATE TABLE IF NOT EXISTS connectivity_providers (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, provider_type TEXT NOT NULL,
  account_reference TEXT, service_type TEXT NOT NULL, contract_start TEXT, contract_end TEXT,
  download_mbps INTEGER NOT NULL, upload_mbps INTEGER NOT NULL, data_cap_mb INTEGER NOT NULL,
  monthly_cost_cents INTEGER NOT NULL, currency TEXT NOT NULL, multi_user_allowed INTEGER NOT NULL DEFAULT 0,
  commercial_use_allowed INTEGER NOT NULL DEFAULT 0, resale_allowed INTEGER NOT NULL DEFAULT 0,
  guest_access_allowed INTEGER NOT NULL DEFAULT 0, public_access_allowed INTEGER NOT NULL DEFAULT 0,
  multi_tenant_allowed INTEGER NOT NULL DEFAULT 0, data_pooling_allowed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectivity_providers_tenant_idx ON connectivity_providers (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS connectivity_pool_profiles (
  pool_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, provider_id TEXT NOT NULL, location_id TEXT NOT NULL,
  download_capacity_mbps INTEGER NOT NULL, upload_capacity_mbps INTEGER NOT NULL,
  billing_period_start TEXT, billing_period_end TEXT, upstream_cost_cents INTEGER NOT NULL,
  currency TEXT NOT NULL, contract_type TEXT NOT NULL, resale_allowed INTEGER NOT NULL DEFAULT 0,
  community_access_allowed INTEGER NOT NULL DEFAULT 0, guest_access_allowed INTEGER NOT NULL DEFAULT 0,
  public_access_allowed INTEGER NOT NULL DEFAULT 0, multi_tenant_allowed INTEGER NOT NULL DEFAULT 0,
  data_pooling_allowed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectivity_pool_profiles_tenant_idx ON connectivity_pool_profiles (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS network_nodes (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, location_id TEXT NOT NULL, name TEXT NOT NULL,
  adapter_type TEXT NOT NULL, status TEXT NOT NULL, last_heartbeat_at TEXT, capabilities TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS network_nodes_tenant_idx ON network_nodes (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS network_policies (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT NOT NULL, room_id TEXT NOT NULL,
  version INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, applied_at TEXT, removed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS network_policies_runtime_idx ON network_policies (tenant_id, runtime_id, version);

CREATE TABLE IF NOT EXISTS connectivity_container_profiles (
  runtime_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, room_id TEXT NOT NULL, event_id TEXT, program_id TEXT,
  reserved_mb INTEGER NOT NULL DEFAULT 0, download_limit_mbps INTEGER NOT NULL,
  upload_limit_mbps INTEGER NOT NULL, min_guaranteed_mbps INTEGER NOT NULL, burst_limit_mbps INTEGER NOT NULL,
  max_users INTEGER NOT NULL, max_devices INTEGER NOT NULL, priority_class TEXT NOT NULL,
  starts_at TEXT, ends_at TEXT, auto_return_unused INTEGER NOT NULL DEFAULT 1, network_policy_id TEXT,
  edge_node_id TEXT, policy_version INTEGER NOT NULL DEFAULT 0, admissions_open INTEGER NOT NULL DEFAULT 0,
  cost_payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectivity_container_profiles_tenant_idx ON connectivity_container_profiles (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS network_edge_commands (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, node_id TEXT NOT NULL, runtime_id TEXT, policy_id TEXT,
  action TEXT NOT NULL, status TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  nonce TEXT NOT NULL, payload TEXT NOT NULL, signature TEXT NOT NULL, signature_algorithm TEXT NOT NULL,
  acknowledged_at TEXT, acknowledgement_payload TEXT
);
CREATE INDEX IF NOT EXISTS network_edge_commands_node_idx ON network_edge_commands (tenant_id, node_id, status, issued_at);

CREATE TABLE IF NOT EXISTS network_usage_samples (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT NOT NULL, room_id TEXT NOT NULL,
  user_id TEXT, device_id TEXT, bytes_down INTEGER NOT NULL, bytes_up INTEGER NOT NULL,
  download_mbps REAL NOT NULL, upload_mbps REAL NOT NULL, latency_ms REAL NOT NULL,
  jitter_ms REAL NOT NULL, packet_loss REAL NOT NULL, recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS network_usage_samples_runtime_idx ON network_usage_samples (tenant_id, runtime_id, recorded_at);

CREATE TABLE IF NOT EXISTS network_sessions (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT NOT NULL, user_id TEXT, device_id TEXT NOT NULL,
  room_id TEXT NOT NULL, connected_at TEXT NOT NULL, disconnected_at TEXT, bytes_down INTEGER NOT NULL DEFAULT 0,
  bytes_up INTEGER NOT NULL DEFAULT 0, total_mb INTEGER NOT NULL DEFAULT 0, termination_reason TEXT
);
CREATE INDEX IF NOT EXISTS network_sessions_runtime_idx ON network_sessions (tenant_id, runtime_id, connected_at);

CREATE TABLE IF NOT EXISTS allocation_rules (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
  rule_payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS network_alerts (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT, node_id TEXT, alert_type TEXT NOT NULL,
  severity TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL, payload TEXT NOT NULL,
  created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS network_alerts_tenant_idx ON network_alerts (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS connectivity_reports (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT NOT NULL UNIQUE, event_id TEXT,
  program_id TEXT, report_type TEXT NOT NULL, payload TEXT NOT NULL, generated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS connectivity_reports_tenant_idx ON connectivity_reports (tenant_id, generated_at);
