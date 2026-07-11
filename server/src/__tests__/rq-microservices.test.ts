import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { amxRoutes } from "../routes/amx.js";
import { spendCredits } from "../services/creditWallet.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// Keep the real InsufficientCreditsError class (the route uses instanceof);
// stub only the wallet operations.
vi.mock("../services/creditWallet.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/creditWallet.js")>();
  return { ...actual, spendCredits: vi.fn(), refundCredits: vi.fn() };
});

const submitRQ = vi.fn(async (_c: string, _u: string, data: Record<string, unknown>) => ({
  id: "rq-1",
  ...data,
  status: "submitted",
  issueIdentifier: "AMXA-1",
}));
vi.mock("../services/rqPortalService.js", () => ({
  rqPortalService: vi.fn(() => ({
    submitRQ: (...args: unknown[]) => submitRQ(...(args as [string, string, Record<string, unknown>])),
    updateLifecycleStage: vi.fn(),
    listSubmissions: vi.fn(async () => []),
  })),
}));
// amxRoutes also builds these services at construction; keep them inert.
vi.mock("../services/amxChainService.js", () => ({ amxChainService: () => ({}) }));
vi.mock("../services/finance.js", () => ({ financeService: () => ({}) }));

/** Queue-based fake db (unused by these routes, but amxRoutes requires one). */
function createFakeDb(queue: unknown[][] = []) {
  let call = 0;
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => queue[call++] ?? [],
    update: () => chain,
    set: () => chain,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(queue[call++] ?? []).then(resolve, reject),
  };
  return chain as never;
}

function createApp(actor: Record<string, unknown>, queue: unknown[][] = []) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", amxRoutes(createFakeDb(queue)));
  app.use(errorHandler);
  return app;
}

const member = {
  type: "board", source: "session", userId: "u1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "member" },
};

const VALID_SERVICE_BODY = {
  serviceKey: "seo_blog_article",
  contextData: { domainContext: "Nonprofit food bank in Louisville" },
  deploymentMode: "cloud",
};

describe("RQ catalog", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns the 3 big tiers and all 12 micro-services", async () => {
    const res = await request(createApp(member)).get(`/api/companies/${COMPANY}/amx/rq-catalog`);
    expect(res.status).toBe(200);
    expect(res.body.tiers).toHaveLength(3);
    expect(res.body.tiers[0]).toMatchObject({
      key: "digital_foundation",
      label: "Digital Foundation",
      creditCost: 100_000,
    });
    expect(res.body.microServices).toHaveLength(12);
    expect(res.body.microServices).toContainEqual({
      key: "seo_blog_article",
      label: "SEO Blog Article",
      description: "1,000-word SEO-optimized article",
      creditCost: 1_500,
      segment: "general",
    });
    expect(res.body.microServices).toContainEqual(expect.objectContaining({
      key: "grant_writing_draft",
      segment: "nonprofit",
    }));
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const outsider = { ...member, companyIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], companyRoles: {} };
    const res = await request(createApp(outsider)).get(`/api/companies/${COMPANY}/amx/rq-catalog`);
    expect(res.status).toBe(403);
  });
});

describe("RQ portal — micro-service submissions", () => {
  afterEach(() => vi.clearAllMocks());

  it("live runs charge the service's credit cost into RQ escrow and submit tier svc_<key>", async () => {
    vi.mocked(spendCredits).mockResolvedValue("tx-77");
    const res = await request(createApp(member))
      .post(`/api/companies/${COMPANY}/amx/rq-portal`)
      .send({ ...VALID_SERVICE_BODY, isSimulation: false });

    expect(res.status).toBe(201);
    expect(spendCredits).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      companyId: COMPANY,
      amount: 1_500,
      toPrincipalId: "rq-factory-escrow",
      transactionType: "rq_factory_charge",
      metadata: { serviceKey: "seo_blog_article", deploymentMode: "cloud" },
    }));
    expect(submitRQ).toHaveBeenCalledWith(COMPANY, "u1", expect.objectContaining({
      tier: "svc_seo_blog_article",
      creditCost: 1_500,
      amxTxId: "tx-77",
      isSimulation: false,
    }));
  });

  it("simulation runs (the default) are free — no wallet call, creditCost 0", async () => {
    const res = await request(createApp(member))
      .post(`/api/companies/${COMPANY}/amx/rq-portal`)
      .send(VALID_SERVICE_BODY);

    expect(res.status).toBe(201);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(submitRQ).toHaveBeenCalledWith(COMPANY, "u1", expect.objectContaining({
      tier: "svc_seo_blog_article",
      creditCost: 0,
      amxTxId: null,
      isSimulation: true,
    }));
  });

  it("rejects an unknown serviceKey (422) and never submits", async () => {
    const res = await request(createApp(member))
      .post(`/api/companies/${COMPANY}/amx/rq-portal`)
      .send({ ...VALID_SERVICE_BODY, serviceKey: "not_a_service" });

    expect(res.status).toBe(422);
    expect(submitRQ).not.toHaveBeenCalled();
  });

  it("rejects a body with both tier and serviceKey (422)", async () => {
    const res = await request(createApp(member))
      .post(`/api/companies/${COMPANY}/amx/rq-portal`)
      .send({ ...VALID_SERVICE_BODY, tier: "digital_foundation" });

    expect(res.status).toBe(422);
    expect(submitRQ).not.toHaveBeenCalled();
  });

  it("rejects a body with neither tier nor serviceKey (422)", async () => {
    const { serviceKey: _omitted, ...body } = VALID_SERVICE_BODY;
    const res = await request(createApp(member))
      .post(`/api/companies/${COMPANY}/amx/rq-portal`)
      .send(body);

    expect(res.status).toBe(422);
    expect(submitRQ).not.toHaveBeenCalled();
  });
});
