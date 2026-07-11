import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripeApiRoutes } from "../routes/stripe.js";
import { provisionMember, getPriceForTier } from "../services/stripeProvisioningService.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// The provisioning service is only reached on the free-tier checkout path,
// which the authz denials never get to — stub it so imports resolve.
vi.mock("../services/stripeProvisioningService.js", () => ({
  provisionMember: vi.fn(),
  cancelMember: vi.fn(),
  getPriceForTier: vi.fn(),
  TIER_MEMBER_TYPES: {},
}));

/** Fake db — the authz denials short-circuit before any query runs, so this
 * only needs to exist, not return anything meaningful. */
function createFakeDb() {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [],
    insert: () => chain,
    values: () => chain,
    update: () => chain,
    set: () => chain,
    returning: async () => [],
  };
  return chain as never;
}

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", stripeApiRoutes(createFakeDb()));
  app.use(errorHandler);
  return app;
}

// A board user who is an admin of company A only.
const adminOfA = {
  type: "board",
  source: "session",
  userId: "u1",
  companyIds: [COMPANY_A],
  companyRoles: { [COMPANY_A]: "admin" },
};
// A member (not admin) of company A.
const memberOfA = {
  type: "board",
  source: "session",
  userId: "u2",
  companyIds: [COMPANY_A],
  companyRoles: { [COMPANY_A]: "member" },
};
const instanceAdmin = {
  type: "board",
  source: "session",
  userId: "u3",
  isInstanceAdmin: true,
  companyIds: [],
  companyRoles: {},
};

describe("Stripe tenant routes — company-scoped authorization", () => {
  afterEach(() => vi.clearAllMocks());

  it("seed-catalog: rejects a caller with no access to the target company (403)", async () => {
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_B}/stripe/seed-catalog`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("seed-catalog: rejects a member (non-admin) of the target company (403)", async () => {
    const res = await request(createApp(memberOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/seed-catalog`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("checkout: rejects a caller scoped to a different company (403)", async () => {
    const res = await request(createApp(memberOfA))
      .post(`/api/companies/${COMPANY_B}/stripe/checkout`)
      .send({ tierName: "learner", userId: "u2" });
    expect(res.status).toBe(403);
  });

  it("prices: rejects a caller scoped to a different company (403)", async () => {
    const res = await request(createApp(memberOfA)).get(`/api/companies/${COMPANY_B}/stripe/prices`);
    expect(res.status).toBe(403);
  });

  it("provision-tenant: rejects a non-instance-admin board user (403)", async () => {
    const res = await request(createApp(adminOfA))
      .post(`/api/stripe/provision-tenant`)
      .send({ name: "Sneaky Co", issuePrefix: "SNK" });
    expect(res.status).toBe(403);
  });

  it("provision-tenant: an instance admin passes the authz gate (not 403)", async () => {
    const res = await request(createApp(instanceAdmin))
      .post(`/api/stripe/provision-tenant`)
      .send({ name: "New Tenant", issuePrefix: "NEW" });
    // Passes authz; may then 201 (created) or 500 depending on the fake db —
    // the point is it is NOT blocked at the authorization gate.
    expect(res.status).not.toBe(403);
  });
});

describe("custom-tier — company-scoped authorization and validation", () => {
  const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    vi.clearAllMocks();
    if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
  });

  const validBody = { tierName: "solo", name: "AMX Labs - Solo", amount: 10000, interval: "month" };

  it("rejects a caller with no access to the target company (403)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_B}/stripe/custom-tier`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it("rejects a member (non-admin) of the target company (403)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(memberOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it("rejects a non-snake_case tierName (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, tierName: "Solo Plan" });
    expect(res.status).toBe(422);
  });

  it("rejects a missing name (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { name: _name, ...body } = validBody;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send(body);
    expect(res.status).toBe(422);
  });

  it("rejects a negative amount (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, amount: -100 });
    expect(res.status).toBe(422);
  });

  it("rejects a non-integer amount (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, amount: 99.5 });
    expect(res.status).toBe(422);
  });

  it("rejects an invalid interval (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, interval: "daily" });
    expect(res.status).toBe(422);
  });

  it("rejects seats=0 (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, seats: 0 });
    expect(res.status).toBe(422);
  });

  it("rejects a non-https imageUrl (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, imageUrl: "http://insecure.example.com/img.png" });
    expect(res.status).toBe(422);
  });

  it("rejects more than 15 marketing features (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, features: Array.from({ length: 16 }, (_, i) => `Feature ${i}`) });
    expect(res.status).toBe(422);
  });

  it("rejects a feature over 80 characters (422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, features: ["x".repeat(81)] });
    expect(res.status).toBe(422);
  });

  it("accepts a valid imageUrl and features past validation (503 without Stripe, not 422)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send({ ...validBody, imageUrl: "https://amx-air-hubs.cc/api/public/assets/x/content", features: ["1 seat", "Full platform access"] });
    expect(res.status).toBe(503);
  });
});

describe("tier deactivate — company-scoped authorization", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects a caller with no access to the target company (403)", async () => {
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_B}/stripe/tiers/solo/deactivate`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects a member (non-admin) of the target company (403)", async () => {
    const res = await request(createApp(memberOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/tiers/solo/deactivate`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns a zero count when no active rows match (200)", async () => {
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/tiers/ghost_tier/deactivate`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tier: "ghost_tier", deactivated: 0 });
  });
});

describe("custom-tier — Stripe availability and idempotency", () => {
  const ORIGINAL_STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    vi.clearAllMocks();
    if (ORIGINAL_STRIPE_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_KEY;
  });

  const validBody = { tierName: "solo", name: "AMX Labs - Solo", amount: 10000, interval: "month" };

  it("returns 503 when Stripe isn't configured, after passing authz+validation", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await request(createApp(adminOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send(validBody);
    expect(res.status).toBe(503);
  });

  it("is idempotent per (companyId, tierName) — returns the existing price without creating a duplicate", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_key_for_client_construction_only";
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as never as { actor: unknown }).actor = adminOfA;
      next();
    });
    const chain = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      limit: async () => [{ stripePriceId: "price_existing_solo" }],
    };
    app.use("/api", stripeApiRoutes(chain as never));
    app.use(errorHandler);

    const res = await request(app)
      .post(`/api/companies/${COMPANY_A}/stripe/custom-tier`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tier: "solo", priceId: "price_existing_solo", skipped: true });
  });
});

describe("free-tier checkout — idempotent provisioning", () => {
  afterEach(() => vi.clearAllMocks());

  it("uses a deterministic synthetic subscription id (repeat checkouts upsert, not duplicate)", async () => {
    vi.mocked(getPriceForTier).mockResolvedValue({
      id: "row-1",
      companyId: COMPANY_A,
      tierName: "volunteer",
      stripeProductId: "prod_x",
      stripePriceId: "price_x",
      currency: "usd",
      amount: 0,
      interval: "month",
      isActive: 1,
      createdAt: new Date(),
    });

    const res = await request(createApp(memberOfA))
      .post(`/api/companies/${COMPANY_A}/stripe/checkout`)
      .send({ tierName: "volunteer", userId: "u2" });

    expect(res.status).toBe(200);
    expect(res.body.provisioned).toBe(true);
    expect(provisionMember).toHaveBeenCalledTimes(1);
    const input = vi.mocked(provisionMember).mock.calls[0][1];
    // No timestamp component — the same user re-checking-out the same free
    // tier must produce the SAME id so provisionMember upserts instead of
    // inserting a new row and re-awarding credits.
    expect(input.stripeSubscriptionId).toBe(`free-${COMPANY_A}-u2-volunteer`);
  });
});
