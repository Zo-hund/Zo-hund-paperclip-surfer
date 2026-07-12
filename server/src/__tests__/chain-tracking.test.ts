import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { spendCredits, refundCredits, awardAgentTokens } from "../services/creditWallet.js";
import { amxRoutes } from "../routes/amx.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// amxRoutes also builds these services at construction (same pattern as
// marketplace-moderation.test.ts / rq-portal-charging.test.ts) — keep them
// inert so the directory-route tests below don't need a fully-featured db.
vi.mock("../services/rqPortalService.js", () => ({ rqPortalService: () => ({}) }));
vi.mock("../services/finance.js", () => ({ financeService: () => ({}) }));

/**
 * Stateful fake db — same shape as credit-wallet.test.ts / agent-wallets.test.ts
 * (select().from().where().limit() served from a queue; update/insert
 * captured with table name via getTableName). Reused here to verify the
 * NEW amx_chain_events insert that spendCredits/refundCredits/
 * awardAgentTokens now perform after their primary write.
 */
function createFakeDb(selectQueue: Array<{ creditBalance: number; tokenBalance: number } | null>) {
  const queue = [...selectQueue];
  const state = {
    updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
    inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const row = queue.shift() ?? null;
            return row ? [row] : [];
          },
        }),
      }),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ table: getTableName(table), values });
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: getTableName(table), values });
        return {
          returning: async () => [{ id: "tx-1" }],
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
        };
      },
    }),
  };
  return { db: db as never, state };
}

const BASE = {
  companyId: COMPANY,
  principalId: "user-1",
  toPrincipalId: "rq-factory-escrow",
  transactionType: "rq_factory_charge",
};

describe("chain-of-custody instrumentation", () => {
  it("spendCredits records a CREDIT_SPEND amx_chain_events row after the transaction insert, balance write unaffected", async () => {
    const { db, state } = createFakeDb([
      { creditBalance: 250_000, tokenBalance: 0 }, // company
      { creditBalance: 50_000, tokenBalance: 0 },  // global
    ]);
    const txId = await spendCredits(db, { ...BASE, amount: 100_000 });

    expect(txId).toBe("tx-1");
    // Primary balance write is unchanged.
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ table: "amx_ledger", values: { creditBalance: 150_000 } });

    const chainInserts = state.inserts.filter((i) => i.table === "amx_chain_events");
    expect(chainInserts).toHaveLength(1);
    expect(chainInserts[0]!.values).toMatchObject({
      companyId: COMPANY,
      principalType: "user",
      principalId: "user-1",
      action: "CREDIT_SPEND",
      payload: expect.objectContaining({ transactionId: "tx-1", amount: 100_000 }),
    });
  });

  it("refundCredits records a CREDIT_REFUND amx_chain_events row after the transaction insert", async () => {
    const { db, state } = createFakeDb([{ creditBalance: 10, tokenBalance: 0 }]);
    const txId = await refundCredits(db, {
      companyId: COMPANY,
      principalId: "user-1",
      amount: 100_000,
      fromPrincipalId: "rq-factory-escrow",
      transactionType: "rq_factory_refund",
    });

    expect(txId).toBe("tx-1");
    expect(state.updates[0]).toMatchObject({ table: "amx_ledger", values: { creditBalance: 100_010 } });

    const chainInserts = state.inserts.filter((i) => i.table === "amx_chain_events");
    expect(chainInserts).toHaveLength(1);
    expect(chainInserts[0]!.values).toMatchObject({
      companyId: COMPANY,
      principalType: "user",
      principalId: "user-1",
      action: "CREDIT_REFUND",
      payload: expect.objectContaining({ transactionId: "tx-1", amount: 100_000 }),
    });
  });

  it("awardAgentTokens records an AGENT_EARNINGS amx_chain_events row after the transaction insert", async () => {
    const { db, state } = createFakeDb([{ creditBalance: 5, tokenBalance: 100 }]);
    const txId = await awardAgentTokens(db, {
      companyId: COMPANY,
      agentId: "agent-a",
      amount: 40_000,
      transactionType: "agent_earnings",
    });

    expect(txId).toBe("tx-1");
    expect(state.updates[0]).toMatchObject({ table: "amx_ledger", values: { tokenBalance: 40_100 } });

    const chainInserts = state.inserts.filter((i) => i.table === "amx_chain_events");
    expect(chainInserts).toHaveLength(1);
    expect(chainInserts[0]!.values).toMatchObject({
      companyId: COMPANY,
      principalType: "agent",
      principalId: "agent-a",
      action: "AGENT_EARNINGS",
      payload: expect.objectContaining({ transactionId: "tx-1", amount: 40_000 }),
    });
  });

  it("spendCredits still succeeds even when the chain event insert throws (best-effort, non-blocking)", async () => {
    const { db: baseDb, state } = createFakeDb([
      { creditBalance: 250_000, tokenBalance: 0 },
      { creditBalance: 50_000, tokenBalance: 0 },
    ]);
    // Wrap insert so amx_chain_events specifically throws — every other
    // table behaves normally. The primary spend must still complete.
    const throwingDb = {
      ...(baseDb as Record<string, unknown>),
      insert: (table: Table) => {
        if (getTableName(table) === "amx_chain_events") {
          throw new Error("simulated chain outage");
        }
        return (baseDb as { insert: (t: Table) => unknown }).insert(table);
      },
    };
    const txId = await spendCredits(throwingDb as never, { ...BASE, amount: 100_000 });
    expect(txId).toBe("tx-1");
    expect(state.updates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /companies/:companyId/amx/chain/directory
// ---------------------------------------------------------------------------

/** Fake db for the directory route's parallel events + count queries. Each
 * `where()` call is served from an ordered queue: the events query resolves
 * via `.orderBy().limit()`, the count query resolves by awaiting `where()`
 * directly (both are constructed in `Promise.all([...])`, left-to-right, so
 * the events query always consumes the queue before the count query). */
function createDirectoryFakeDb(queue: unknown[][]) {
  let call = 0;
  const state = { limits: [] as number[] };
  function terminal(rows: unknown[]) {
    return {
      orderBy: () => ({
        limit: async (n: number) => {
          state.limits.push(n);
          return rows;
        },
      }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
  }
  const db = {
    select: () => ({
      from: () => ({
        where: () => terminal(queue[call++] ?? []),
      }),
    }),
  };
  return { db: db as never, state };
}

function createApp(actor: Record<string, unknown>, queue: unknown[][]) {
  const { db, state } = createDirectoryFakeDb(queue);
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

const member = {
  type: "board", source: "session", userId: "u1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "member" },
};

const EVENT_ROW = {
  id: "evt-1",
  companyId: COMPANY,
  principalType: "user",
  principalId: "user-1",
  action: "CREDIT_SPEND",
  payload: { transactionId: "tx-1", amount: 100 },
  signature: "abc123",
  createdAt: new Date("2026-07-01T00:00:00Z"),
};

describe("GET /companies/:companyId/amx/chain/directory", () => {
  it("returns events + total with no filters, defaulting to a limit of 50", async () => {
    const { app, state } = createApp(member, [[EVENT_ROW], [{ total: 1 }]]);
    const res = await request(app).get(`/api/companies/${COMPANY}/amx/chain/directory`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      events: [{
        id: "evt-1",
        action: "CREDIT_SPEND",
        principalType: "user",
        principalId: "user-1",
        payload: { transactionId: "tx-1", amount: 100 },
        createdAt: "2026-07-01T00:00:00.000Z",
      }],
      total: 1,
    });
    expect(state.limits).toEqual([50]);
  });

  it("passes an action filter through to the query", async () => {
    const { app } = createApp(member, [[EVENT_ROW], [{ total: 1 }]]);
    const res = await request(app)
      .get(`/api/companies/${COMPANY}/amx/chain/directory`)
      .query({ action: "CREDIT_SPEND" });
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
  });

  it("passes a principalId filter through to the query", async () => {
    const { app } = createApp(member, [[], [{ total: 0 }]]);
    const res = await request(app)
      .get(`/api/companies/${COMPANY}/amx/chain/directory`)
      .query({ principalId: "user-99" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ events: [], total: 0 });
  });

  it("clamps an oversized limit down to 200 rather than rejecting the request", async () => {
    const { app, state } = createApp(member, [[], [{ total: 0 }]]);
    const res = await request(app)
      .get(`/api/companies/${COMPANY}/amx/chain/directory`)
      .query({ limit: "5000" });
    expect(res.status).toBe(200);
    expect(state.limits).toEqual([200]);
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const outsider = { ...member, companyIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], companyRoles: {} };
    const { app } = createApp(outsider, []);
    const res = await request(app).get(`/api/companies/${COMPANY}/amx/chain/directory`);
    expect(res.status).toBe(403);
  });
});
