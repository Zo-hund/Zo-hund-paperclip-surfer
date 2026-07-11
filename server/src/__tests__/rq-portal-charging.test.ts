import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { amxRoutes } from "../routes/amx.js";
import { spendCredits, refundCredits } from "../services/creditWallet.js";
import { rqPortalService } from "../services/rqPortalService.js";
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

/** Queue-based fake db for the refund route's submission lookup. */
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
const admin = {
  type: "board", source: "session", userId: "u2",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "admin" },
};

const VALID_BODY = {
  tier: "digital_foundation",
  contextData: { domainContext: "Nonprofit food bank in Louisville" },
  deploymentMode: "cloud",
};

describe("RQ portal — credit charging", () => {
  afterEach(() => vi.clearAllMocks());

  it("simulation runs (the default) are free — no wallet call, creditCost 0", async () => {
    const res = await request(createApp(member)).post(`/api/companies/${COMPANY}/amx/rq-portal`).send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(submitRQ).toHaveBeenCalledWith(COMPANY, "u1", expect.objectContaining({ creditCost: 0, amxTxId: null, isSimulation: true }));
  });

  it("live runs charge the tier's credit cost into RQ escrow before submitting", async () => {
    vi.mocked(spendCredits).mockResolvedValue("tx-42");
    const res = await request(createApp(member))
      .post(`/api/companies/${COMPANY}/amx/rq-portal`)
      .send({ ...VALID_BODY, isSimulation: false });

    expect(res.status).toBe(201);
    expect(spendCredits).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      companyId: COMPANY,
      amount: 100_000,
      toPrincipalId: "rq-factory-escrow",
      transactionType: "rq_factory_charge",
    }));
    expect(submitRQ).toHaveBeenCalledWith(COMPANY, "u1", expect.objectContaining({
      creditCost: 100_000,
      amxTxId: "tx-42",
      isSimulation: false,
    }));
  });

  it("returns 402 with the shortfall when the balance can't cover a live run — and never submits", async () => {
    const { InsufficientCreditsError } = await import("../services/creditWallet.js");
    vi.mocked(spendCredits).mockRejectedValue(new InsufficientCreditsError(100_000, 250));
    const res = await request(createApp(member))
      .post(`/api/companies/${COMPANY}/amx/rq-portal`)
      .send({ ...VALID_BODY, isSimulation: false });

    expect(res.status).toBe(402);
    expect(res.body.needed).toBe(100_000);
    expect(res.body.balance).toBe(250);
    expect(submitRQ).not.toHaveBeenCalled();
  });

  it("maps legacy tier aliases to canonical slugs (starter → digital_foundation)", async () => {
    const res = await request(createApp(member))
      .post(`/api/companies/${COMPANY}/amx/rq-portal`)
      .send({ ...VALID_BODY, tier: "starter" });
    expect(res.status).toBe(201);
    expect(submitRQ).toHaveBeenCalledWith(COMPANY, "u1", expect.objectContaining({ tier: "digital_foundation" }));
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const outsider = { ...member, companyIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], companyRoles: {} };
    const res = await request(createApp(outsider)).post(`/api/companies/${COMPANY}/amx/rq-portal`).send(VALID_BODY);
    expect(res.status).toBe(403);
  });
});

describe("RQ portal — refund", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects a non-admin member (403)", async () => {
    const res = await request(createApp(member)).post(`/api/companies/${COMPANY}/amx/rq/rq-1/refund`).send({});
    expect(res.status).toBe(403);
  });

  it("refunds a charged submission back to its requester and cancels it", async () => {
    vi.mocked(refundCredits).mockResolvedValue("tx-refund-1");
    const submission = { id: "rq-1", companyId: COMPANY, userId: "buyer-1", creditCost: 100_000, status: "submitted", tier: "digital_foundation" };
    const res = await request(createApp(admin, [[submission]]))
      .post(`/api/companies/${COMPANY}/amx/rq/rq-1/refund`).send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refunded: 100_000, status: "cancelled" });
    expect(refundCredits).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      principalId: "buyer-1",
      amount: 100_000,
      fromPrincipalId: "rq-factory-escrow",
    }));
  });

  it("is a no-op for free (simulation) submissions", async () => {
    const submission = { id: "rq-2", companyId: COMPANY, userId: "buyer-1", creditCost: 0, status: "submitted" };
    const res = await request(createApp(admin, [[submission]]))
      .post(`/api/companies/${COMPANY}/amx/rq/rq-2/refund`).send({});
    expect(res.status).toBe(200);
    expect(res.body.refunded).toBe(0);
    expect(refundCredits).not.toHaveBeenCalled();
  });
});
