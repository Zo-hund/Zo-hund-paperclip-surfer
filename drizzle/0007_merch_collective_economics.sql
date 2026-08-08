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
