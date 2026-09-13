import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import worker from "../worker.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("AMX collective merch", () => {
  test("registers member storefront, event merch, and order routes", async () => {
    const app = await read("../src/App.tsx");
    assert.match(app, /path="\/marketplace\/merch"/);
    assert.match(app, /path="\/events\/:eventId\/merch"/);
    assert.match(app, /path="\/account\/orders"/);
  });

  test("keeps Printful credentials server-side and uses a fixed upstream", async () => {
    const client = await read("../src/merch-platform.ts");
    const runtime = await read("../worker.js");
    assert.doesNotMatch(client, /PRINTFUL_API_TOKEN/);
    assert.match(runtime, /PRINTFUL_API_BASE = "https:\/\/api\.printful\.com"/);
    assert.match(runtime, /Authorization: `Bearer \$\{String\(env\.PRINTFUL_API_TOKEN/);
    assert.match(runtime, /pending_payment/);
    assert.match(runtime, /\/api\/merch\/payment-confirmed/);
    assert.match(runtime, /\/orders\?confirm=true/);
    assert.match(runtime, /Confirmed payment does not match the merchandise order/);
    assert.match(runtime, /\/api\/merch\/printful-webhook/);
    assert.match(runtime, /package_shipped/);
    assert.match(runtime, /merch_webhook_events/);
    assert.match(runtime, /\/api\/merch\/admin\/configure-webhook/);
    assert.match(runtime, /STRIPE_API_BASE = "https:\/\/api\.stripe\.com\/v1"/);
    assert.match(runtime, /\/checkout\/sessions/);
    assert.match(runtime, /verifyStripeSignature/);
    assert.match(runtime, /checkout\.session\.completed/);
    assert.match(runtime, /\/api\/merch\/admin\/connect\/onboard/);
    assert.match(runtime, /payoutReleaseMatch/);
    assert.match(runtime, /payoutReverseMatch/);
    assert.match(runtime, /source_transaction/);
    assert.match(runtime, /Only shipped-order allocations can be released/);
  });

  test("creates Stripe-hosted Express onboarding without collecting bank details", async () => {
    const originalFetch = globalThis.fetch;
    let accountBody = "";
    globalThis.fetch = async (input, init = {}) => {
      const target = String(input);
      if (target.endsWith("/accounts")) { accountBody = String(init.body); return Response.json({ id: "acct_partner123", details_submitted: false, charges_enabled: false, payouts_enabled: false, requirements: { currently_due: ["individual.verification.document"] } }); }
      if (target.endsWith("/account_links")) return Response.json({ url: "https://connect.stripe.com/setup/s/acct_partner123" });
      throw new Error(`Unexpected request: ${target}`);
    };
    const writes = [];
    const db = {
      prepare(sql) { return { bind(...values) { return { first: async () => null, run: async () => { writes.push({ sql, values }); return { success: true }; } }; } }; },
      batch: async () => [],
    };
    try {
      const response = await worker.fetch(new Request("https://amx.example/api/merch/admin/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: "tech-at-nite", beneficiaryType: "partner", beneficiaryId: "community-runway", displayName: "Community Runway", contactEmail: "partner@example.com" }),
      }), { DB: db, STRIPE_SECRET_KEY: "sk_test_secret", STRIPE_WEBHOOK_SECRET: "whsec_secret", MERCH_PUBLIC_BASE_URL: "https://amx-hubs.cc", ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.equal(body.stripeAccountId, "acct_partner123");
      assert.match(body.onboardingUrl, /^https:\/\/connect\.stripe\.com\//);
      assert.match(accountBody, /type=express/);
      assert.match(accountBody, /metadata%5Bamx_beneficiary_id%5D=community-runway/);
      assert.doesNotMatch(accountBody, /bank|routing|account_number/i);
      assert.ok(writes.some((entry) => entry.sql.startsWith("INSERT INTO merch_payout_profiles")));
    } finally { globalThis.fetch = originalFetch; }
  });

  test("releases only a payable allocation to an active Stripe account", async () => {
    const originalFetch = globalThis.fetch;
    let transferBody = "";
    globalThis.fetch = async (input, init = {}) => {
      const target = String(input);
      if (target.includes("/payment_intents/pi_paid123")) return Response.json({ id: "pi_paid123", latest_charge: "ch_source123" });
      if (target.endsWith("/transfers")) { transferBody = String(init.body); return Response.json({ id: "tr_collective123" }); }
      throw new Error(`Unexpected request: ${target}`);
    };
    const writes = [];
    const allocation = { id: "allocation-123", order_id: "order-123", tenant_id: "tech-at-nite", beneficiary_type: "partner", beneficiary_id: "community-runway", amount_cents: 510, status: "payable", currency: "USD", total_cents: 3400, order_payload: JSON.stringify({ paymentReference: "pi_paid123" }), stripe_account_id: "acct_partner123", onboarding_status: "active", details_submitted: 1, payouts_enabled: 1 };
    const db = {
      prepare(sql) { return { bind(...values) { return { first: async () => sql.startsWith("SELECT allocation.id") ? allocation : null, run: async () => { writes.push({ sql, values }); return { success: true }; } }; } }; },
      batch: async () => [],
    };
    try {
      const response = await worker.fetch(new Request("https://amx.example/api/merch/admin/payouts/allocation-123/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: "tech-at-nite" }) }), { DB: db, STRIPE_SECRET_KEY: "sk_test_secret", ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.equal(body.transferId, "tr_collective123");
      assert.match(transferBody, /amount=510/);
      assert.match(transferBody, /destination=acct_partner123/);
      assert.match(transferBody, /source_transaction=ch_source123/);
      assert.ok(writes.some((entry) => entry.sql.startsWith("UPDATE merch_revenue_allocations SET status = 'paid'")));
    } finally { globalThis.fetch = originalFetch; }
  });

  test("requires an audited operator action to reverse a submitted transfer", async () => {
    const originalFetch = globalThis.fetch;
    let reversalBody = "";
    globalThis.fetch = async (input, init = {}) => {
      const target = String(input);
      if (target.endsWith("/transfers/tr_collective123/reversals")) { reversalBody = String(init.body); return Response.json({ id: "trr_refund123" }); }
      throw new Error(`Unexpected request: ${target}`);
    };
    const writes = [];
    const db = {
      prepare(sql) { return { bind(...values) { return { first: async () => sql.startsWith("SELECT id, allocation_id") ? { id: "payout-1", allocation_id: "allocation-123", order_id: "order-123", stripe_transfer_id: "tr_collective123", amount_cents: 510, status: "submitted" } : null, run: async () => { writes.push({ sql, values }); return { success: true }; } }; } }; },
      batch: async () => [],
    };
    try {
      const response = await worker.fetch(new Request("https://amx.example/api/merch/admin/payouts/allocation-123/reverse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: "tech-at-nite", reason: "Customer refund approved" }) }), { DB: db, STRIPE_SECRET_KEY: "sk_test_secret", ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.equal(body.reversalId, "trr_refund123");
      assert.match(reversalBody, /amount=510/);
      assert.match(reversalBody, /amx_reversal_reason/);
      assert.ok(writes.some((entry) => entry.sql.startsWith("UPDATE merch_payout_transfers SET status = 'reversed'")));
      assert.ok(writes.some((entry) => entry.sql.startsWith("INSERT INTO merch_connect_events")));
    } finally { globalThis.fetch = originalFetch; }
  });

  test("reconciles signed Stripe Connect account and transfer events", async () => {
    const secret = "whsec_connect_secret";
    const writes = [];
    const db = {
      prepare(sql) { return { bind(...values) { return { first: async () => null, run: async () => { writes.push({ sql, values }); return { success: true }; } }; } }; },
      batch: async () => [],
    };
    const send = async (event) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify(event);
      const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
      return worker.fetch(new Request("https://amx.example/api/merch/stripe-webhook", { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${signature}` }, body: payload }), { DB: db, STRIPE_WEBHOOK_SECRET: secret, ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
    };
    const accountResponse = await send({ id: "evt_account_active", type: "account.updated", data: { object: { id: "acct_partner123", details_submitted: true, charges_enabled: true, payouts_enabled: true, requirements: { currently_due: [] } } } });
    const reversalResponse = await send({ id: "evt_transfer_reversed", type: "transfer.reversed", data: { object: { id: "tr_collective123", amount_reversed: 510, metadata: { amx_allocation_id: "allocation-123" } } } });
    assert.equal(accountResponse.status, 200);
    assert.equal((await accountResponse.json()).onboardingStatus, "active");
    assert.equal(reversalResponse.status, 200);
    assert.ok(writes.some((entry) => entry.sql.startsWith("UPDATE merch_payout_profiles SET onboarding_status")));
    assert.ok(writes.some((entry) => entry.sql.startsWith("UPDATE merch_revenue_allocations SET status = 'reversed'")));
    assert.equal(writes.filter((entry) => entry.sql.startsWith("INSERT INTO merch_connect_events")).length, 2);
  });

  test("accepts only signed, recent Stripe webhook payloads", async () => {
    const secret = "whsec_test_secret";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ id: "evt_test_123", type: "customer.created", data: { object: {} } });
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const response = await worker.fetch(new Request("https://amx.example/api/merch/stripe-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${signature}` },
      body: payload,
    }), { STRIPE_WEBHOOK_SECRET: secret, ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.ignored, true);
    const rejected = await worker.fetch(new Request("https://amx.example/api/merch/stripe-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=bad` },
      body: payload,
    }), { STRIPE_WEBHOOK_SECRET: secret, ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
    assert.equal(rejected.status, 403);
  });

  test("creates Stripe Checkout from server-validated Printful prices", async () => {
    const originalFetch = globalThis.fetch;
    let stripeBody = "";
    globalThis.fetch = async (input, init = {}) => {
      const target = String(input);
      if (target.includes("/store/products?")) return Response.json({ result: [{ id: 1 }] });
      if (target.endsWith("/store/products/1")) return Response.json({ result: { sync_product: { id: 1, name: "AMX Test Tee", thumbnail_url: "https://images.example/tee.png" }, sync_variants: [{ id: 11, name: "Black / M", retail_price: "34.00", currency: "USD" }] } });
      if (target.endsWith("/checkout/sessions")) { stripeBody = String(init.body); return Response.json({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" }); }
      throw new Error(`Unexpected request: ${target}`);
    };
    const writes = [];
    const db = {
      prepare(sql) { return { bind(...values) { return { first: async () => null, run: async () => { writes.push({ sql, values }); return { success: true }; } }; } }; },
      batch: async () => [],
    };
    try {
      const response = await worker.fetch(new Request("https://amx.example/api/merch/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: "tech-at-nite", items: [{ productId: "1", variantId: "11", quantity: 2, unitPriceCents: 1 }] }),
      }), {
        DB: db,
        PRINTFUL_API_TOKEN: "printful-secret",
        STRIPE_SECRET_KEY: "sk_test_secret",
        STRIPE_WEBHOOK_SECRET: "whsec_secret",
        MERCH_PUBLIC_BASE_URL: "https://amx-hubs.cc",
        ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
      });
      const body = await response.json();
      assert.equal(response.status, 201);
      assert.equal(body.checkoutProvider, "stripe");
      assert.equal(body.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_123");
      assert.match(stripeBody, /line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=3400/);
      assert.match(stripeBody, /line_items%5B0%5D%5Bquantity%5D=2/);
      assert.ok(writes.some((entry) => entry.sql.startsWith("INSERT INTO merch_orders") && entry.values.includes(6800)));
    } finally { globalThis.fetch = originalFetch; }
  });

  test("expires an unpaid signed Stripe Checkout order", async () => {
    const secret = "whsec_expiry_secret";
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ id: "evt_expired_123", type: "checkout.session.expired", data: { object: { id: "cs_expired", metadata: { amx_order_id: "order-expired" } } } });
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const writes = [];
    const db = {
      prepare(sql) { return { bind(...values) { return { first: async () => null, run: async () => { writes.push({ sql, values }); return { success: true }; } }; } }; },
      batch: async () => [],
    };
    const response = await worker.fetch(new Request("https://amx.example/api/merch/stripe-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": `t=${timestamp},v1=${signature}` },
      body: payload,
    }), { DB: db, STRIPE_WEBHOOK_SECRET: secret, ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "failed");
    assert.ok(writes.some((entry) => entry.sql.startsWith("UPDATE merch_orders SET status = 'failed'")));
    assert.ok(writes.some((entry) => entry.sql.startsWith("INSERT INTO merch_webhook_events")));
  });

  test("rejects unsigned Printful fulfillment events", async () => {
    const response = await worker.fetch(new Request("https://amx.example/api/merch/printful-webhook?token=wrong", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "package_shipped", store: 12, data: {} }),
    }), {
      MERCH_PRINTFUL_WEBHOOK_TOKEN: "correct-secret",
      ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
    });
    assert.equal(response.status, 403);
  });

  test("applies a signed shipment update and tracking URL", async () => {
    const writes = [];
    const db = {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              first: async () => sql.startsWith("SELECT id, status, payload FROM merch_orders")
                ? { id: "order-123", status: "submitted", payload: JSON.stringify({ items: [] }) }
                : null,
              run: async () => { writes.push({ sql, values }); return { success: true }; },
            };
          },
        };
      },
      batch: async () => [],
    };
    const response = await worker.fetch(new Request("https://amx.example/api/merch/printful-webhook?token=correct-secret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "package_shipped",
        created: 1770000000,
        store: 12,
        data: { order: { id: 99, external_id: "order-123" }, shipment: { id: 44, carrier: "UPS", tracking_number: "1Z123", tracking_url: "https://www.ups.com/track/1Z123" } },
      }),
    }), {
      DB: db,
      PRINTFUL_STORE_ID: "12",
      MERCH_PRINTFUL_WEBHOOK_TOKEN: "correct-secret",
      ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "shipped");
    assert.equal(body.trackingAvailable, true);
    assert.ok(writes.some((entry) => entry.sql.startsWith("UPDATE merch_orders SET status") && entry.values.includes("https://www.ups.com/track/1Z123")));
    assert.ok(writes.some((entry) => entry.sql.startsWith("UPDATE merch_revenue_allocations SET status = 'payable'")));
  });

  test("adds Printful to the operator connection registry", async () => {
    const page = await read("../src/pages/connections.tsx");
    assert.match(page, /provider: "printful"/);
    assert.match(page, /https:\/\/api\.printful\.com/);
    assert.match(page, /Register shipping updates/);
    assert.match(page, /provider: "stripe"/);
    assert.match(page, /Start secure onboarding/);
    assert.match(page, /Release payout/);
    assert.match(page, /Reverse transfer/);
  });

  test("adds a merch call to action to Stage sponsor inventory", async () => {
    const production = await read("../src/stage-production.ts");
    const viewer = await read("../src/pages/stage-viewer.tsx");
    assert.match(production, /id: "amx-merch"/);
    assert.match(production, /ctaUrl: "\/marketplace\/merch"/);
    assert.match(viewer, /sponsor\.ctaUrl\?\.startsWith\("\/"\)/);
  });

  test("curates event merch in Stage control and publishes it to the live viewer", async () => {
    const consolePage = await read("../src/StageEventConsole.tsx");
    const eventState = await read("../src/stage-events.ts");
    const viewer = await read("../src/pages/stage-viewer.tsx");
    const styles = await read("../src/event-merch.css");
    assert.match(eventState, /merchProductIds: string\[\]/);
    assert.match(eventState, /slice\(0, 6\)/);
    assert.match(consolePage, /EVENT MERCH DROP/);
    assert.match(consolePage, /loadMerchCatalog\(tenant\.id, event\.id\)/);
    assert.match(viewer, /SHOP EVENT DROP/);
    assert.match(viewer, /stage-viewer-merch/);
    assert.match(viewer, /\/events\/\$\{production\.state\.event\.id\}\/merch/);
    assert.match(styles, /@media\(max-width:700px\)/);
  });

  test("defines tenant order and allocation RLS", async () => {
    const migration = await read("../supabase/migrations/20260802010000_merch_collective_economics.sql");
    const hardening = await read("../supabase/migrations/20260805070000_merch_policy_hardening.sql");
    assert.match(migration, /alter table public\.merch_orders enable row level security/);
    assert.match(migration, /members read their merch orders/);
    assert.match(migration, /merch_revenue_allocations/);
    assert.match(migration, /merch_payout_profiles/);
    assert.match(migration, /merch_payout_transfers/);
    assert.match(migration, /operators read tenant payout profiles/);
    assert.match(migration, /transfer_row\.stripe_transfer_id = merch_connect_events\.stripe_object_id/);
    assert.match(migration, /revoke insert, update, delete/);
    assert.match(hardening, /members and operators read authorized merch orders/);
    assert.match(hardening, /member_id = \(select auth\.uid\(\)\)/);
    assert.match(hardening, /private\.can_manage_connection_tenant\(tenant_id\)/);
  });

  test("returns a safe preview status when Printful is not configured", async () => {
    const response = await worker.fetch(new Request("https://amx.example/api/merch/catalog?tenantId=tech-at-nite"), {
      ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.configured, false);
    assert.equal(body.checkoutConfigured, false);
    assert.deepEqual(body.products, []);
  });

  test("returns a clear catalog setup message when Printful rejects the token or store", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      if (String(input).includes("/store/products?")) return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
      if (String(input).includes("/product-templates?")) return Response.json({ error: { message: "Missing scope" } }, { status: 403 });
      throw new Error(`Unexpected request: ${input}`);
    };
    try {
      const response = await worker.fetch(new Request("https://amx.example/api/merch/catalog?tenantId=tech-at-nite"), {
        PRINTFUL_API_TOKEN: "bad-or-wrong-scope",
        PRINTFUL_STORE_ID: "isolated-bad-store",
        ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.configured, false);
      assert.equal(body.source, "printful");
      assert.match(body.message, /PRINTFUL_STORE_ID, synced store products, or product template permissions/);
    } finally { globalThis.fetch = originalFetch; }
  });

  test("shows Printful product templates when store products are not synced yet", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const target = String(input);
      if (target.includes("/store/products?")) return Response.json({ result: [] });
      if (target.includes("/product-templates?")) return Response.json({ result: { items: [{ id: 77, title: "AMX Labs Creator Tee", mockup_file_url: "https://images.example/template.png", available_variant_ids: [401, 402] }] } });
      throw new Error(`Unexpected request: ${target}`);
    };
    try {
      const response = await worker.fetch(new Request("https://amx.example/api/merch/catalog?tenantId=amx-labs"), {
        PRINTFUL_API_TOKEN: "printful-secret",
        PRINTFUL_STORE_ID: "template-store",
        ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.configured, true);
      assert.equal(body.checkoutConfigured, false);
      assert.equal(body.products[0].id, "template-77");
      assert.equal(body.products[0].variants[0].available, false);
      assert.match(body.message, /Sync these products/);
    } finally { globalThis.fetch = originalFetch; }
  });
});
