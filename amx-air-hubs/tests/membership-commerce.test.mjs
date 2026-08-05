import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import worker from "../worker.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("TECH AT NITE membership commerce", () => {
  test("publishes the business-model tiers without conflating plans and security roles", async () => {
    const runtime = await read("../worker.js");
    const auth = await read("../src/member-auth.tsx");
    const routes = await read("../src/App.tsx");
    for (const plan of ["Explorer", "Learner", "Builder", "Ambassador", "Earner", "Parent", "Community", "Volunteer", "Sponsor", "Donor"]) assert.match(runtime, new RegExp(`name: "${plan}"`));
    assert.match(auth, /"member" \| "trainer" \| "operator"/);
    assert.match(routes, /path="\/membership"/);
    assert.match(routes, /MembershipPage/);
  });

  test("loads live recurring price data from Stripe while keeping price IDs server-side", async () => {
    const originalFetch = globalThis.fetch;
    const client = await read("../src/membership-platform.ts");
    assert.doesNotMatch(client, /MEMBERSHIP_PRICE_|STRIPE_SECRET_KEY/);
    globalThis.fetch = async (input) => {
      if (String(input).includes("/prices/price_learner")) return Response.json({ id: "price_learner", active: true, unit_amount: 2500, currency: "usd", recurring: { interval: "month", interval_count: 1 } });
      throw new Error(`Unexpected request: ${input}`);
    };
    try {
      const response = await worker.fetch(new Request("https://amx.example/api/membership/catalog"), { STRIPE_SECRET_KEY: "sk_test", MEMBERSHIP_PRICE_LEARNER: "price_learner", ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
      const body = await response.json();
      const learner = body.plans.find((plan) => plan.id === "learner");
      assert.equal(response.status, 200);
      assert.equal(body.plans.length, 10);
      assert.equal(learner.amountCents, 2500);
      assert.equal(learner.interval, "month");
      assert.equal("priceEnv" in learner, false);
    } finally { globalThis.fetch = originalFetch; }
  });

  test("creates Stripe-hosted subscription checkout with AMX entitlement metadata", async () => {
    const originalFetch = globalThis.fetch;
    let checkoutBody = "";
    globalThis.fetch = async (input, init = {}) => {
      if (String(input).endsWith("/checkout/sessions")) { checkoutBody = String(init.body); return Response.json({ id: "cs_membership_123", url: "https://checkout.stripe.com/c/pay/cs_membership_123" }); }
      throw new Error(`Unexpected request: ${input}`);
    };
    const db = { prepare() { return { bind() { return { first: async () => null, run: async () => ({ success: true }) }; } }; }, batch: async () => [] };
    try {
      const response = await worker.fetch(new Request("https://amx.example/api/membership/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: "tech-at-nite", planId: "learner" }) }), { DB: db, STRIPE_SECRET_KEY: "sk_test", MEMBERSHIP_PRICE_LEARNER: "price_learner", MEMBERSHIP_PUBLIC_BASE_URL: "https://amx-hubs.cc", ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.match(body.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
      assert.match(checkoutBody, /mode=subscription/);
      assert.match(checkoutBody, /line_items%5B0%5D%5Bprice%5D=price_learner/);
      assert.match(checkoutBody, /amx_membership_plan%5D=learner/);
      assert.doesNotMatch(checkoutBody, /operator/);
    } finally { globalThis.fetch = originalFetch; }
  });

  test("accepts signed subscription events and persists the provisioned tier", async () => {
    const secret = "whsec_membership";
    const event = { id: "evt_membership_123", type: "customer.subscription.updated", data: { object: { id: "sub_123", customer: "cus_123", status: "active", current_period_end: Math.floor(Date.now() / 1000) + 86400, cancel_at_period_end: false, metadata: { amx_membership_plan: "builder", amx_member_id: "member-123", tenant_id: "tech-at-nite" } } } };
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const writes = [];
    const db = { prepare(sql) { return { bind(...values) { return { first: async () => null, run: async () => { writes.push({ sql, values }); return { success: true }; } }; } }; }, batch: async () => [] };
    const response = await worker.fetch(new Request("https://amx.example/api/membership/stripe-webhook", { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${signature}` }, body: payload }), { DB: db, MEMBERSHIP_STRIPE_WEBHOOK_SECRET: secret, ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.planId, "builder");
    assert.equal(body.status, "active");
    assert.ok(writes.some((entry) => entry.sql.startsWith("INSERT INTO membership_subscriptions") && entry.values.includes("builder")));
    assert.ok(writes.some((entry) => entry.sql.startsWith("INSERT INTO membership_webhook_events")));
  });

  test("enables row-level security for member subscription records", async () => {
    const migration = await read("../supabase/migrations/20260805140000_membership_commerce.sql");
    assert.match(migration, /alter table public\.membership_subscriptions enable row level security/);
    assert.match(migration, /member_id = \(select auth\.uid\(\)\)/);
    assert.match(migration, /private\.is_amx_operator\(\)/);
    assert.doesNotMatch(migration, /grant (insert|update|delete)/i);
  });

  test("opens account creation from membership join links", async () => {
    const account = await read("../src/pages/account.tsx");
    assert.match(account, /searchParams\.get\("mode"\) === "create"/);
    assert.match(account, /return "create"/);
  });
});
