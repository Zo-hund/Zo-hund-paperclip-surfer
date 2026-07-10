import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripeApiRoutes } from "../routes/stripe.js";
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
