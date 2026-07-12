import express from "express";
import request from "supertest";
import { getTableName, type Table } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { amxRoutes } from "../routes/amx.js";
import { lmsRoutes } from "../routes/lms.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("../services/amxChainService.js", () => ({ amxChainService: () => ({}) }));
vi.mock("../services/rqPortalService.js", () => ({ rqPortalService: () => ({}) }));
vi.mock("../services/finance.js", () => ({ financeService: () => ({}) }));

/** Queue-based fake db (agent-wallets.test.ts style): each select/limit/
 * groupBy/then call consumes the next queued result set, in call order. */
function createQueueDb(queue: unknown[][] = []) {
  let call = 0;
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    limit: async () => queue[call++] ?? [],
    update: () => chain,
    set: () => chain,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(queue[call++] ?? []).then(resolve, reject),
  };
  return chain as never;
}

/** Stateful fake db (marketplace-moderation.test.ts style): select() is
 * queue-driven, insert() captures the affected table + payload. */
function createStatefulDb(selectQueue: unknown[][] = []) {
  const queue = [...selectQueue];
  const state = {
    inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => queue.shift() ?? [],
        }),
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: getTableName(table), values });
        return { returning: async () => [{ id: "booking-1", ...values }] };
      },
    }),
  };
  return { db: db as never, state };
}

const member = {
  type: "board", source: "session", userId: "member-1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "member" },
};
const outsider = {
  type: "board", source: "session", userId: "outsider-1",
  companyIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], companyRoles: {},
};

function createAmxApp(actor: Record<string, unknown>, queue: unknown[][] = []) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", amxRoutes(createQueueDb(queue)));
  app.use(errorHandler);
  return app;
}

function createLmsQueueApp(actor: Record<string, unknown>, queue: unknown[][] = []) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", lmsRoutes(createQueueDb(queue)));
  app.use(errorHandler);
  return app;
}

function createLmsStatefulApp(actor: Record<string, unknown>, selectQueue: unknown[][] = []) {
  const { db, state } = createStatefulDb(selectQueue);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", lmsRoutes(db));
  app.use(errorHandler);
  return { app, state };
}

describe("GET /companies/:companyId/amx/members/:memberId/wallet", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns the member's balances and recent transactions", async () => {
    const ledgerRow = { creditBalance: 10, tokenBalance: 2_500 };
    const tx = {
      id: "tx-1",
      amount: 2_500,
      currency: "AMX",
      transactionType: "marketplace_booking",
      fromPrincipalId: "marketplace-escrow",
      toPrincipalId: "member-a",
      status: "completed",
      occurredAt: new Date("2026-07-01T00:00:00Z"),
      metadata: { bookingId: "booking-1" },
    };
    const res = await request(createAmxApp(member, [[ledgerRow], [tx]]))
      .get(`/api/companies/${COMPANY}/amx/members/member-a/wallet`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      creditBalance: 10,
      tokenBalance: 2_500,
      transactions: [expect.objectContaining({
        id: "tx-1",
        amount: 2_500,
        currency: "AMX",
        occurredAt: "2026-07-01T00:00:00.000Z",
      })],
    });
  });

  it("returns zero balances and no transactions for a member with no ledger row", async () => {
    const res = await request(createAmxApp(member, [[], []]))
      .get(`/api/companies/${COMPANY}/amx/members/member-x/wallet`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ creditBalance: 0, tokenBalance: 0, transactions: [] });
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const res = await request(createAmxApp(outsider))
      .get(`/api/companies/${COMPANY}/amx/members/member-a/wallet`);
    expect(res.status).toBe(403);
  });
});

describe("GET /companies/:companyId/lms/marketplace/listings/:listingId/earnings-by-phase", () => {
  afterEach(() => vi.clearAllMocks());

  it("groups completed bookings by phase, including the null (unspecified) bucket", async () => {
    const listingRow = { id: "listing-1" };
    const grouped = [
      { phase: "simulation", totalSims: 300, bookingCount: 3 },
      { phase: "production", totalSims: 1_000, bookingCount: 2 },
      { phase: null, totalSims: 50, bookingCount: 1 },
    ];
    const res = await request(createLmsQueueApp(member, [[listingRow], grouped]))
      .get(`/api/companies/${COMPANY}/lms/marketplace/listings/listing-1/earnings-by-phase`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(grouped);
  });

  it("returns 404 for a listing outside the company", async () => {
    const res = await request(createLmsQueueApp(member, [[]]))
      .get(`/api/companies/${COMPANY}/lms/marketplace/listings/ghost/earnings-by-phase`);
    expect(res.status).toBe(404);
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const res = await request(createLmsQueueApp(outsider))
      .get(`/api/companies/${COMPANY}/lms/marketplace/listings/listing-1/earnings-by-phase`);
    expect(res.status).toBe(403);
  });
});

describe("POST /companies/:companyId/lms/marketplace/bookings — phase persistence", () => {
  afterEach(() => vi.clearAllMocks());

  it("persists the phase field when provided", async () => {
    const { app, state } = createLmsStatefulApp(member);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/lms/marketplace/bookings`)
      .send({
        listingId: "11111111-1111-4111-8111-111111111111",
        clientMemberId: "member-1",
        projectTitle: "Test engagement",
        budgetSims: 0,
        phase: "simulation",
      });

    expect(res.status).toBe(201);
    expect(res.body.phase).toBe("simulation");
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]!.table).toBe("lms_marketplace_bookings");
    expect(state.inserts[0]!.values).toMatchObject({ phase: "simulation" });
  });

  it("persists a null phase when omitted (backward compatible with older clients)", async () => {
    const { app, state } = createLmsStatefulApp(member);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/lms/marketplace/bookings`)
      .send({
        listingId: "11111111-1111-4111-8111-111111111111",
        clientMemberId: "member-1",
        projectTitle: "Test engagement",
        budgetSims: 0,
      });

    expect(res.status).toBe(201);
    expect(state.inserts[0]!.values.phase).toBeUndefined();
  });
});
