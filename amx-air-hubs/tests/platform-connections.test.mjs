import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260731220000_platform_connections.sql", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/connections.tsx", import.meta.url), "utf8");

test("connections are operator-gated and tenant-scoped by RLS", () => {
  assert.match(routes, /path="\/connections" element={<RequireMember roles=\{\["operator"\]\}>/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /can_manage_connection_tenant\(tenant_id\)/);
  assert.match(migration, /partner_memberships/);
});

test("credentials enter Supabase Vault without returning secret values", () => {
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /secret_configured boolean generated always/);
  assert.doesNotMatch(page, /secret_id|decrypted_secrets/);
});

test("connection registry covers platform tools and activation history", () => {
  for (const kind of ["api", "oauth", "mcp", "plugin", "skill", "webhook"]) assert.match(page, new RegExp(`kind: "${kind}"`));
  assert.match(page, /AUDIT HISTORY/);
  assert.match(migration, /platform_connection_history/);
});
