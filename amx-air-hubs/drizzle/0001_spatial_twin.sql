CREATE TABLE IF NOT EXISTS geo_anchors (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS geo_anchors_room_idx ON geo_anchors (tenant_id, room_code, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS digital_twin_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  twin_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS digital_twin_room_idx ON digital_twin_events (tenant_id, room_code, created_at);
