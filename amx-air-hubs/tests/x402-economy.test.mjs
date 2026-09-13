import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const runtime = readFileSync(new URL("../src/x402-economy.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/x402-economy.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const connections = readFileSync(new URL("../src/pages/connections.tsx", import.meta.url), "utf8");
const docs = readFileSync(new URL("../docs/X402_AGENT_ECONOMY.md", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const d1Migration = readFileSync(new URL("../drizzle/0011_x402_agent_economy.sql", import.meta.url), "utf8");
const supabaseMigration = readFileSync(new URL("../supabase/migrations/20260810150000_x402_agent_economy.sql", import.meta.url), "utf8");

test("x402 economy is available as an operator-gated control page", () => {
  assert.match(routes, /path="\/control\/economy" element={<RequireMember roles=\{\["operator"\]\}>/);
  assert.match(page, /AMX AGENT ECONOMY \/ X402/);
  assert.match(page, /HTTP-NATIVE PAYMENT FLOW/);
  assert.match(page, /SERVICE MARKETPLACE/);
  assert.match(page, /Request server quote/);
  assert.match(page, /SERVER LEDGER/);
});

test("x402 connection is managed through the platform connection registry", () => {
  assert.match(connections, /provider: "x402"/);
  assert.match(connections, /quote, authorize, pay, verify, settle, reconcile/);
  assert.match(connections, /HTTP 402 quotes, agent wallets, metering, and partner service settlement/);
});

test("agent economy models payments, policy gates, and revenue splits", () => {
  for (const agent of ["AMX Payment Agent", "AMX Economy Agent", "AMX Wallet Agent", "AMX Metering Agent", "AMX Revenue Agent", "AMX Compliance Agent", "AMX Treasury Agent"]) {
    assert.match(runtime, new RegExp(agent));
  }
  assert.match(runtime, /HTTP 402 Payment Required/);
  assert.match(runtime, /requires_connection/);
  assert.match(runtime, /serviceProviderPct: 60/);
  assert.match(runtime, /memberDiscountCents/);
  assert.match(runtime, /Budget policy blocks this request/);
});

test("x402 documentation explains safe wearable identity and live settlement gates", () => {
  assert.match(docs, /wearable, QR, or membership card identifies/);
  assert.match(docs, /does not hold payment credentials/);
  assert.match(docs, /Live settlement should stay inactive/);
  assert.match(docs, /POST \/api\/x402\/quote/);
  assert.match(docs, /X402_FACILITATOR_URL/);
});

test("x402 worker exposes protected payment contract and operator approval routes", () => {
  for (const route of ["/api/x402/health", "/api/x402/quote", "/api/x402/authorize", "/api/x402/ledger"]) {
    assert.match(worker, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(worker, /api\\\/x402\\\/admin\\\/approvals/);
  assert.match(worker, /startsWith\("\/api\/x402\/admin"\)/);
  assert.match(worker, /return \["operator"\]/);
  assert.match(worker, /x402_payment_events/);
  assert.match(worker, /x402_approval_requests/);
  assert.match(worker, /x402_service_meter_events/);
  assert.match(worker, /paymentRequired \? 402/);
  assert.match(worker, /approval_requested/);
});

test("x402 migrations include ledger tables and tenant RLS policies", () => {
  for (const source of [d1Migration, supabaseMigration]) {
    assert.match(source, /x402_payment_events/);
    assert.match(source, /x402_approval_requests/);
    assert.match(source, /x402_service_meter_events/);
  }
  assert.match(supabaseMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(supabaseMigration, /private\.can_manage_connection_tenant\(tenant_id\)/);
  assert.doesNotMatch(supabaseMigration, /TO anon/);
});
