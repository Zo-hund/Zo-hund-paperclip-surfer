ALTER TABLE media_objects ADD COLUMN owner_user_id TEXT;
--> statement-breakpoint
ALTER TABLE media_objects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
--> statement-breakpoint
ALTER TABLE media_objects ADD COLUMN purpose TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS media_owner_idx ON media_objects (owner_user_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS api_rate_limits_expiry_idx ON api_rate_limits (expires_at);
