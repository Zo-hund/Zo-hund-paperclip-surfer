CREATE TABLE IF NOT EXISTS stage_admission_events (
  event_id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  runtime_minutes INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stage_admission_reservations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  identity_type TEXT NOT NULL,
  member_id TEXT,
  partner_id TEXT,
  display_label TEXT NOT NULL,
  profile_path TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(event_id, seat_id)
);

CREATE INDEX IF NOT EXISTS stage_admission_event_idx ON stage_admission_reservations (event_id, status, updated_at);
