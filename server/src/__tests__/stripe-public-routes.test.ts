import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { stripePublicRoutes } from "../routes/stripe-public.js";
import { boardMutationGuard } from "../middleware/board-mutation-guard.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Queue-based fake db: each route runs a fixed sequence of
 * `db.select().from().where()[.limit()]` queries; entry N of `queue` is the
 * row array the Nth query resolves to, whether it terminates in `.limit()`
 * or is awaited directly.
 */
function createFakeDb(queue: unknown[][]) {
  let call = 0;
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => queue[call++] ?? [],
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(queue[call++] ?? []).then(resolve, reject),
  };
  return chain as never;
}

/** Mirrors production mounting: anonymous actor + boardMutationGuard first,
 * exactly like a logged-out visitor hitting /api on the deployed app. */
function createApp(queue: unknown[][]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = { type: "none" };
    next();
  });
  app.use(boardMutationGuard());
  app.use("/api", stripePublicRoutes(createFakeDb(queue)));
  app.use(errorHandler);
  return app;
}

const COMPANY_ROW = { name: "AMX Labs — Membership", brandColor: "#0ea5e9" };
const PRICE_ROWS = [
  { tierName: "team_15", stripeProductId: "prod_t", stripePriceId: "price_t", amount: 100000, currency: "usd", interval: "month", isActive: 1 },
  { tierName: "solo", stripeProductId: "prod_s", stripePriceId: "price_s", amount: 10000, currency: "usd", interval: "month", isActive: 1 },
];

const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
afterEach(() => {
  if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
});

describe("GET /public/companies/:companyId/stripe/catalog", () => {
  it("returns 404 for a malformed (non-UUID) companyId without touching the db", async () => {
    const res = await request(createApp([])).get(`/api/public/companies/not-a-uuid/stripe/catalog`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown company", async () => {
    const res = await request(createApp([[]])).get(`/api/public/companies/${COMPANY_ID}/stripe/catalog`);
    expect(res.status).toBe(404);
  });

  it("returns branding plus active tiers sorted by price, with tier-slug fallbacks when Stripe is unavailable", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    // Query order: company → logo → prices
    const res = await request(createApp([[COMPANY_ROW], [], PRICE_ROWS]))
      .get(`/api/public/companies/${COMPANY_ID}/stripe/catalog`);
    expect(res.status).toBe(200);
    expect(res.body.companyName).toBe("AMX Labs — Membership");
    expect(res.body.brandColor).toBe("#0ea5e9");
    expect(res.body.logoUrl).toBeNull();
    expect(res.body.tiers.map((t: { tier: string }) => t.tier)).toEqual(["solo", "team_15"]);
    // Without Stripe product data the name falls back to a readable slug.
    expect(res.body.tiers[0].name).toBe("Solo");
    expect(res.body.tiers[0].amount).toBe(10000);
    expect(res.body.tiers[0].features).toEqual([]);
  });

  it("links the company logo via the public asset route when one exists", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp([[COMPANY_ROW], [{ assetId: "logo-asset-id" }], []]))
      .get(`/api/public/companies/${COMPANY_ID}/stripe/catalog`);
    expect(res.status).toBe(200);
    expect(res.body.logoUrl).toBe("/api/public/assets/logo-asset-id/content");
  });
});

describe("POST /public/companies/:companyId/stripe/checkout", () => {
  it("is not blocked by boardMutationGuard for an anonymous (type: none) actor", async () => {
    // Malformed id → 404 from the route itself, proving the guard passed the
    // request through rather than 403ing the anonymous POST.
    const res = await request(createApp([]))
      .post(`/api/public/companies/not-a-uuid/stripe/checkout`)
      .send({ tierName: "solo" });
    expect(res.status).toBe(404);
  });

  it("rejects a missing tierName (422)", async () => {
    const res = await request(createApp([]))
      .post(`/api/public/companies/${COMPANY_ID}/stripe/checkout`)
      .send({});
    expect(res.status).toBe(422);
  });

  it("returns 404 for an unknown company", async () => {
    const res = await request(createApp([[]]))
      .post(`/api/public/companies/${COMPANY_ID}/stripe/checkout`)
      .send({ tierName: "solo" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a tier with no active price", async () => {
    const res = await request(createApp([[{ id: COMPANY_ID }], []]))
      .post(`/api/public/companies/${COMPANY_ID}/stripe/checkout`)
      .send({ tierName: "ghost_tier" });
    expect(res.status).toBe(404);
  });

  it("refuses to self-provision a free tier for an anonymous visitor (422)", async () => {
    const freePrice = { ...PRICE_ROWS[1], tierName: "volunteer", amount: 0 };
    const res = await request(createApp([[{ id: COMPANY_ID }], [freePrice]]))
      .post(`/api/public/companies/${COMPANY_ID}/stripe/checkout`)
      .send({ tierName: "volunteer" });
    expect(res.status).toBe(422);
  });

  it("refuses one-time tiers, which have no public provisioning path (422)", async () => {
    const oneTime = { ...PRICE_ROWS[1], tierName: "dropin_pass", interval: "one_time" };
    const res = await request(createApp([[{ id: COMPANY_ID }], [oneTime]]))
      .post(`/api/public/companies/${COMPANY_ID}/stripe/checkout`)
      .send({ tierName: "dropin_pass" });
    expect(res.status).toBe(422);
  });

  it("returns 503 when Stripe is not configured for a valid paid tier", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp([[{ id: COMPANY_ID }], [PRICE_ROWS[1]]]))
      .post(`/api/public/companies/${COMPANY_ID}/stripe/checkout`)
      .send({ tierName: "solo" });
    expect(res.status).toBe(503);
  });
});
