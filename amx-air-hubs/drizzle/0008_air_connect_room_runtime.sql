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
