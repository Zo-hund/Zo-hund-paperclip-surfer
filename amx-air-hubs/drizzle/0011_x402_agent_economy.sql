CREATE TABLE IF NOT EXISTS x402_payment_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS x402_payment_events_tenant_idx ON x402_payment_events (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS x402_payment_events_quote_idx ON x402_payment_events (tenant_id, quote_id, created_at);

CREATE TABLE IF NOT EXISTS x402_approval_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  quote_id TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS x402_approval_requests_tenant_idx ON x402_approval_requests (tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS x402_service_meter_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS x402_service_meter_events_tenant_idx ON x402_service_meter_events (tenant_id, created_at);
