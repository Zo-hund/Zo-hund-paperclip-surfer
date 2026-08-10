CREATE TABLE IF NOT EXISTS amx_payment_providers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  mode TEXT NOT NULL DEFAULT 'simulation',
  capabilities TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, provider_type)
);

CREATE TABLE IF NOT EXISTS amx_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  order_id TEXT,
  service_id TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payment_rail TEXT NOT NULL,
  provider_id TEXT,
  provider_transaction_id TEXT,
  status TEXT NOT NULL,
  settlement_status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS amx_transactions_tenant_idx ON amx_transactions (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS amx_transactions_provider_idx ON amx_transactions (provider_id, provider_transaction_id);

CREATE TABLE IF NOT EXISTS amx_wearables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_id TEXT,
  owner_id TEXT,
  replacement_for_id TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'DESIGN',
  public_visibility TEXT NOT NULL DEFAULT 'product_only',
  ar_experience_id TEXT,
  digital_twin_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS amx_wearables_tenant_idx ON amx_wearables (tenant_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS amx_wearables_owner_idx ON amx_wearables (tenant_id, owner_id);

CREATE TABLE IF NOT EXISTS amx_wearable_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  wearable_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  execution_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS amx_wearable_events_idx ON amx_wearable_events (tenant_id, wearable_id, created_at);

CREATE TABLE IF NOT EXISTS amx_agent_wallets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance_minor INTEGER NOT NULL DEFAULT 0,
  per_transaction_limit_minor INTEGER NOT NULL DEFAULT 0,
  daily_limit_minor INTEGER NOT NULL DEFAULT 0,
  approval_threshold_minor INTEGER NOT NULL DEFAULT 0,
  allowed_vendors TEXT NOT NULL DEFAULT '[]',
  allowed_categories TEXT NOT NULL DEFAULT '[]',
  allowed_services TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'inactive',
  policy_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, agent_id, currency)
);

CREATE TABLE IF NOT EXISTS amx_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS amx_audit_events_tenant_idx ON amx_audit_events (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS amx_audit_events_execution_idx ON amx_audit_events (execution_id, created_at);
