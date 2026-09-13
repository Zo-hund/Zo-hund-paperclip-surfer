CREATE TABLE IF NOT EXISTS amx_role_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  granted_by TEXT NOT NULL,
  grant_reason TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_by TEXT,
  revoked_at TEXT,
  revoke_reason TEXT,
  UNIQUE (tenant_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS amx_role_assignments_user_idx ON amx_role_assignments (user_id, tenant_id, status);
CREATE INDEX IF NOT EXISTS amx_role_assignments_tenant_idx ON amx_role_assignments (tenant_id, role, status);
