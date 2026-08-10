import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import worker from "../worker.js";

test("operator provisions reusable Stripe admission inventory", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const target = String(input);
    calls.push({ target, body: String(init.body || "") });
    if (target.endsWith("/products")) return Response.json({ id: "prod_event123" });
    if (target.endsWith("/prices")) return Response.json({ id: "price_event123" });
    if (target.endsWith("/payment_links")) return Response.json({ id: "plink_event123", url: "https://buy.stripe.com/test_event123" });
    throw new Error(`Unexpected request ${target}`);
  };
  try {
    const response = await worker.fetch(new Request("https://amx.example/api/stage/tickets/payment-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: "event-nexus1", eventTitle: "AMX Innovation Expo", tierId: "general", tierLabel: "Expo Pass", priceCents: 2500, capacity: 44, passPath: "/join/invite-token-123" }) }), { STRIPE_SECRET_KEY: "sk_test", MERCH_PUBLIC_BASE_URL: "https://amx-hubs.cc", ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.checkoutUrl, "https://buy.stripe.com/test_event123");
    assert.equal(calls.length, 3);
    assert.match(calls[1].body, /unit_amount=2500/);
    assert.match(calls[2].body, /after_completion%5Btype%5D=redirect/);
    assert.match(calls[2].body, /join%2Finvite-token-123/);
  } finally { globalThis.fetch = originalFetch; }
});

test("admission UI supports Stripe and rights-cleared promo video", async () => {
  const consoleSource = await readFile(new URL("../src/StageEventConsole.tsx", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../worker.js", import.meta.url), "utf8");
  assert.match(consoleSource, /Connect Stripe/);
  assert.match(consoleSource, /promo \/ ad asset/);
  assert.match(consoleSource, /Take to Stage/);
  assert.match(runtime, /stage-promo/);
  assert.match(runtime, /stage\.ticket_payment_link_created/);
});
