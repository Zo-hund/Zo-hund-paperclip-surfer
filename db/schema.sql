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
