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

function admissionDatabase() {
  let event = null;
  const reservations = [];
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes("INSERT INTO stage_admission_events")) {
                const [event_id, room_code, title, starts_at, runtime_minutes, payload, updated_at, updated_by] = values;
                event = { event_id, room_code, title, starts_at, runtime_minutes, payload, updated_at, updated_by };
              }
              if (sql.includes("INSERT INTO stage_admission_reservations")) {
                const [id, event_id, seat_id, tier_id, identity_type, member_id, partner_id, display_label, profile_path, avatar_url, created_at, updated_at] = values;
                if (reservations.some((item) => item.event_id === event_id && item.seat_id === seat_id)) throw new Error("unique");
                reservations.push({ id, event_id, seat_id, tier_id, identity_type, member_id, partner_id, display_label, profile_path, avatar_url, status: "reserved", created_at, updated_at });
              }
              return { success: true };
            },
            async first() { return sql.includes("FROM stage_admission_events") ? event : null; },
            async all() {
              if (sql.includes("SELECT seat_id FROM stage_admission_reservations")) return { results: reservations.map(({ seat_id }) => ({ seat_id })) };
              if (sql.includes("FROM stage_admission_reservations")) return { results: reservations };
              return { results: [] };
            },
          };
        },
        async run() { return { success: true }; },
      };
    },
    async batch(statements) { for (const statement of statements) if (statement.run) await statement.run(); return []; },
  };
}

test("event admissions publish inventory and atomically reserve a guest seat", async () => {
  const DB = admissionDatabase();
  const env = { DB, ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } };
  const event = { id: "event-expo", title: "AMX Innovation Expo", startsAt: "2026-08-15T18:00:00.000Z", runtimeMinutes: 180, seats: [{ id: "H-A01", label: "A1", section: "house", tierId: "general", status: "open" }], ticketTiers: [{ id: "general", label: "Expo Pass", capacity: 1 }] };
  const published = await worker.fetch(new Request("https://amx.example/api/stage/admissions/event-expo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: "NEXUS1", event }) }), env);
  assert.equal(published.status, 200);
  assert.equal((await published.json()).availableSeats, 1);

  const reserved = await worker.fetch(new Request("https://amx.example/api/stage/admissions/event-expo/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tierId: "general", displayName: "Waterfront Guest" }) }), env);
  assert.equal(reserved.status, 201);
  const result = await reserved.json();
  assert.equal(result.availableSeats, 0);
  assert.equal(result.reservations[0].identityType, "guest");
  assert.equal(result.reservations[0].seatId, "H-A01");

  const collision = await worker.fetch(new Request("https://amx.example/api/stage/admissions/event-expo/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tierId: "general", displayName: "Second Guest" }) }), env);
  assert.equal(collision.status, 409);
});

test("event pass UI maps availability to member, partner, and guest profiles", async () => {
  const viewer = await readFile(new URL("../src/pages/stage-viewer.tsx", import.meta.url), "utf8");
  const consoleSource = await readFile(new URL("../src/StageEventConsole.tsx", import.meta.url), "utf8");
  assert.match(viewer, /AVAILABLE/);
  assert.match(viewer, /reserveStageAdmission/);
  assert.match(consoleSource, /LIVE RESERVATIONS/);
  assert.match(consoleSource, /publishStageAdmissions/);
});
