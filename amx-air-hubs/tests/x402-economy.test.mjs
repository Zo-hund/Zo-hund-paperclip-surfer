import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const runtime = readFileSync(new URL("../src/x402-economy.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/x402-economy.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const connections = readFileSync(new URL("../src/pages/connections.tsx", import.meta.url), "utf8");
const docs = readFileSync(new URL("../docs/X402_AGENT_ECONOMY.md", import.meta.url), "utf8");

test("x402 economy is available as an operator-gated control page", () => {
  assert.match(routes, /path="\/control\/economy" element={<RequireMember roles=\{\["operator"\]\}>/);
  assert.match(page, /AMX AGENT ECONOMY \/ X402/);
  assert.match(page, /HTTP-NATIVE PAYMENT FLOW/);
  assert.match(page, /SERVICE MARKETPLACE/);
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
});
