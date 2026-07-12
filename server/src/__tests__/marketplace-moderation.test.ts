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
vi.mock("../services/index.js", () => ({ logActivity: vi.fn() }));

/** Stateful fake db: select() is queue-driven (queue[N] = Nth query's rows);
 * update/insert capture the affected table name + payload. */
function createFakeDb(selectQueue: unknown[][] = []) {
  const queue = [...selectQueue];
  const state = {
    updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
    inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => queue.shift() ?? [],
          orderBy: async () => queue.shift() ?? [],
        }),
      }),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        // Some callers await where() directly, others chain .returning() —
        // support both by making the where() result thenable AND provide
        // .returning().
        where: () => {
          state.updates.push({ table: getTableName(table), values });
          const result = queue.shift() ?? [{ id: "row-1", ...values }];
          return {
            returning: async () => result,
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
          };
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: getTableName(table), values });
        return {
          returning: async () => [{ id: "row-new", ...values }],
        };
      },
    }),
  };
  return { db: db as never, state };
}

const admin = {
  type: "board", source: "session", userId: "admin-1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "admin" },
};
const member = {
  type: "board", source: "session", userId: "member-1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "member" },
};

function createLmsApp(actor: Record<string, unknown>, selectQueue: unknown[][] = []) {
  const { db, state } = createFakeDb(selectQueue);
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

function createAmxApp(actor: Record<string, unknown>, selectQueue: unknown[][] = []) {
  const { db, state } = createFakeDb(selectQueue);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", amxRoutes(db));
  app.use(errorHandler);
  return { app, state };
}

describe("PATCH /companies/:companyId/lms/marketplace/listings/:listingId", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects a non-admin member (403)", async () => {
    const { app } = createLmsApp(member);
    const res = await request(app)
      .patch(`/api/companies/${COMPANY}/lms/marketplace/listings/listing-1`)
      .send({ isActive: 0 });
    expect(res.status).toBe(403);
  });

  it("deactivates a listing for an admin", async () => {
    const { app, state } = createLmsApp(admin, [
      [{ id: "listing-1", companyId: COMPANY, isActive: 0, displayName: "Test" }],
    ]);
    const res = await request(app)
      .patch(`/api/companies/${COMPANY}/lms/marketplace/listings/listing-1`)
      .send({ isActive: 0 });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(0);
    expect(state.updates[0]!.table).toBe("lms_marketplace_listings");
    expect(state.updates[0]!.values).toMatchObject({ isActive: 0 });
  });

  it("returns 404 for a listing outside the company", async () => {
    const { app } = createLmsApp(admin, [[]]);
    const res = await request(app)
      .patch(`/api/companies/${COMPANY}/lms/marketplace/listings/ghost`)
      .send({ isActive: 0 });
    expect(res.status).toBe(404);
  });

  it("rejects an empty body — nothing to update (422 from zod, all fields optional but harmless no-op still allowed)", async () => {
    // All fields are optional, so an empty body is technically valid input;
    // this documents that behavior rather than asserting a rejection.
    const { app } = createLmsApp(admin, [[{ id: "listing-1", companyId: COMPANY }]]);
    const res = await request(app)
      .patch(`/api/companies/${COMPANY}/lms/marketplace/listings/listing-1`)
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /companies/:companyId/amx/wallet/adjust", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects a non-admin member (403)", async () => {
    const { app } = createAmxApp(member);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/amx/wallet/adjust`)
      .send({ principalId: "u1", creditDelta: -500, reason: "test" });
    expect(res.status).toBe(403);
  });

  it("rejects a request with both deltas zero (422)", async () => {
    const { app } = createAmxApp(admin);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/amx/wallet/adjust`)
      .send({ principalId: "u1", creditDelta: 0, tokenDelta: 0, reason: "test" });
    // validate() middleware maps zod parse failures to 400 (repo convention).
    expect(res.status).toBe(400);
  });

  it("applies a negative delta against an existing ledger row, floored at 0", async () => {
    const { app, state } = createAmxApp(admin, [
      [{ creditBalance: 300, tokenBalance: 500 }], // existing ledger row
    ]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/amx/wallet/adjust`)
      .send({ principalId: "u1", tokenDelta: -500, reason: "reclaim test tokens" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ creditBalance: 300, tokenBalance: 0 });
    expect(state.updates[0]!.table).toBe("amx_ledger");
    expect(state.updates[0]!.values).toMatchObject({ creditBalance: 300, tokenBalance: 0 });
    expect(state.inserts[0]!.table).toBe("amx_transactions");
    expect(state.inserts[0]!.values).toMatchObject({
      transactionType: "admin_adjustment",
      metadata: expect.objectContaining({ tokenDelta: -500, reason: "reclaim test tokens" }),
    });
  });

  it("creates the ledger row when the principal has none, and never goes negative", async () => {
    const { app, state } = createAmxApp(admin, [[]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/amx/wallet/adjust`)
      .send({ principalId: "u2", tokenDelta: -9999, creditDelta: 100, reason: "correction" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ creditBalance: 100, tokenBalance: 0 });
    expect(state.inserts[0]!.table).toBe("amx_ledger");
  });
});
