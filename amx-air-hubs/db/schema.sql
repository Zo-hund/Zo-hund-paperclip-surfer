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
