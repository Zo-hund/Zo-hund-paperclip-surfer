import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("architecture source of truth documents exist and identify real implementation status", () => {
  for (const file of [
    "docs/AMX-ARCHITECTURE.md",
    "docs/AMX-CODEX-IMPLEMENTATION-PLAN.md",
    "docs/AMX-SECURITY-MODEL.md",
    "docs/AMX-PAYMENT-ARCHITECTURE.md",
    "docs/AMX-WEARABLE-SPEC.md",
    "docs/AMX-AGENT-SYSTEM.md",
  ]) {
    const content = read(file);
    assert.ok(content.length > 700, `${file} must contain a substantive contract`);
  }
  const architecture = read("docs/AMX-ARCHITECTURE.md");
  assert.match(architecture, /Implemented/);
  assert.match(architecture, /Partial/);
  assert.match(architecture, /Pending/);
});

test("payment schema keeps AMX IDs and provider references separate", () => {
  const postgres = read("supabase/migrations/20260810230000_amx_platform_foundation.sql");
  assert.match(postgres, /create table if not exists public\.amx_transactions/);
  assert.match(postgres, /AMX-TX-/);
  assert.match(postgres, /provider_transaction_id text/);
  assert.match(postgres, /unique \(tenant_id, idempotency_key\)/);
  assert.doesNotMatch(postgres, /stripe_payment_intent_id text primary key/i);
});

test("wearables separate public identity from owner authorization", () => {
  const spec = read("docs/AMX-WEARABLE-SPEC.md");
  const security = read("docs/AMX-SECURITY-MODEL.md");
  const postgres = read("supabase/migrations/20260810230000_amx_platform_foundation.sql");
  assert.match(spec, /scan itself as proof of ownership/i);
  assert.match(security, /authenticity and scanner authorization are separate/i);
  assert.match(postgres, /public_visibility/);
  assert.match(postgres, /owner_id = auth\.uid\(\)/);
});

test("foundational Postgres entities use RLS and deny anonymous table access", () => {
  const sql = read("supabase/migrations/20260810230000_amx_platform_foundation.sql");
  for (const table of ["amx_payment_providers", "amx_transactions", "amx_wearables", "amx_wearable_events", "amx_agent_wallets", "amx_audit_events"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke all on[\s\S]+from anon;/);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[\s\S]+\s+to\s+anon/i);
});

test("environment contract contains placeholders and keeps settlement disabled", () => {
  const env = read(".env.example");
  for (const key of ["AMX_DATABASE_URL", "AMX_REDIS_URL", "AMX_STORAGE_URL", "AMX_PAYMENT_IDEMPOTENCY_SECRET", "X402_FACILITATOR_URL", "AMX_WEARABLE_SIGNING_SECRET"]) {
    assert.match(env, new RegExp(`^${key}=`, "m"));
  }
  assert.match(env, /^AMX_PAYMENT_MODE=simulation$/m);
  assert.match(env, /^X402_SETTLEMENT_ENABLED=false$/m);
});
