import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { amxRoutes } from "../routes/amx.js";
import { awardAgentTokens } from "../services/creditWallet.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// Keep the real implementations importable for the unit tests below; the
// route tests stub the wallet operations (same pattern as
// rq-portal-charging.test.ts, which keeps the real error class).
vi.mock("../services/creditWallet.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/creditWallet.js")>();
  return { ...actual, spendCredits: vi.fn(), refundCredits: vi.fn(), awardAgentTokens: vi.fn() };
});
const realWallet = await vi.importActual<typeof import("../services/creditWallet.js")>(
  "../services/creditWallet.js",
);

// amxRoutes builds these services at construction; keep them inert.
vi.mock("../services/rqPortalService.js", () => ({
  rqPortalService: vi.fn(() => ({
    submitRQ: vi.fn(),
    updateLifecycleStage: vi.fn(),
    listSubmissions: vi.fn(async () => []),
  })),
}));
vi.mock("../services/amxChainService.js", () => ({ amxChainService: () => ({}) }));
vi.mock("../services/finance.js", () => ({ financeService: () => ({}) }));

// ---------------------------------------------------------------------------
// awardAgentTokens — unit tests (stateful fake db, credit-wallet.test.ts style)
// ---------------------------------------------------------------------------

/**
 * Stateful fake db for awardAgentTokens' exact query shapes:
 *  - select().from().where().limit() → agent ledger row lookup (queue)
 *  - update(table).set().where()     → tokenBalance write (captured)
 *  - insert(table).values().returning() / thenable → row + tx inserts (captured)
 */
function createWalletFakeDb(selectQueue: Array<{ creditBalance: number; tokenBalance: number } | null>) {
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

const AWARD = {
  companyId: COMPANY,
  agentId: "agent-a",
  transactionType: "agent_earnings",
  metadata: { submissionId: "rq-1", tier: "digital_foundation" },
};

describe("awardAgentTokens", () => {
  it("credits an existing agent ledger row's tokenBalance and records the escrow → agent transaction", async () => {
    const { db, state } = createWalletFakeDb([{ creditBalance: 5, tokenBalance: 100 }]);
    const txId = await realWallet.awardAgentTokens(db, { ...AWARD, amount: 40_000 });

    expect(txId).toBe("tx-1");
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ table: "amx_ledger", values: { tokenBalance: 40_100 } });
    // Only the transaction was inserted — the row already existed.
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]!.table).toBe("amx_transactions");
    expect(state.inserts[0]!.values).toMatchObject({
      fromCompanyId: COMPANY,
      toCompanyId: COMPANY,
      fromPrincipalType: "system",
      fromPrincipalId: "rq-factory-escrow",
      toPrincipalType: "agent",
      toPrincipalId: "agent-a",
      amount: 40_000,
      currency: "AMX",
      status: "completed",
      transactionType: "agent_earnings",
      metadata: { submissionId: "rq-1", tier: "digital_foundation" },
    });
  });

  it("creates the agent's ledger row on first earning (zero credits, tokenBalance = amount)", async () => {
    const { db, state } = createWalletFakeDb([null]);
    await realWallet.awardAgentTokens(db, { ...AWARD, amount: 500 });

    expect(state.updates).toHaveLength(0);
    // First insert is the new ledger row, second is the transaction.
    expect(state.inserts[0]).toMatchObject({
      table: "amx_ledger",
      values: {
        companyId: COMPANY,
        principalType: "agent",
        principalId: "agent-a",
        creditBalance: 0,
        tokenBalance: 500,
      },
    });
    expect(state.inserts[1]!.values).toMatchObject({ amount: 500, currency: "AMX" });
  });

  it("rejects non-positive and non-integer amounts before touching the db", async () => {
    const { db, state } = createWalletFakeDb([{ creditBalance: 0, tokenBalance: 0 }]);
    await expect(realWallet.awardAgentTokens(db, { ...AWARD, amount: 0 })).rejects.toThrow(/positive integer/);
    await expect(realWallet.awardAgentTokens(db, { ...AWARD, amount: -5 })).rejects.toThrow(/positive integer/);
    await expect(realWallet.awardAgentTokens(db, { ...AWARD, amount: 1.5 })).rejects.toThrow(/positive integer/);
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Routes — RQ completion settlement + agent wallet read
// ---------------------------------------------------------------------------

/** Queue-based fake db for the routes' lookups (rq-portal-charging style);
 * the update chain is thenable so `await db.update()...` consumes a slot. */
function createFakeDb(queue: unknown[][] = []) {
  let call = 0;
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
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

const CHARGED_SUBMISSION = {
  id: "rq-1",
  companyId: COMPANY,
  userId: "buyer-1",
  tier: "digital_foundation",
  status: "review",
  creditCost: 100_001, // deliberately odd — exercises both floor steps
  agentSwarmIds: ["agent-a", "agent-b"],
};

describe("RQ completion — escrow settlement", () => {
  afterEach(() => vi.clearAllMocks());

  it("certifies the RQ and splits the agent share across the swarm with floor math", async () => {
    vi.mocked(awardAgentTokens).mockResolvedValue("tx-earn");
    const res = await request(createApp(admin, [[CHARGED_SUBMISSION]]))
      .post(`/api/companies/${COMPANY}/amx/rq/rq-1/complete`).send({});

    expect(res.status).toBe(200);
    // floor(100_001 * 0.8) = 80_000 → floor(80_000 / 2) = 40_000 each;
    // platform keeps the 20% share plus the 1-credit floor remainder.
    expect(res.body).toEqual({
      submissionId: "rq-1",
      status: "certified",
      agentPayouts: [
        { agentId: "agent-a", tokens: 40_000 },
        { agentId: "agent-b", tokens: 40_000 },
      ],
      platformRetained: 20_001,
    });
    expect(awardAgentTokens).toHaveBeenCalledTimes(2);
    expect(awardAgentTokens).toHaveBeenCalledWith(expect.anything(), {
      companyId: COMPANY,
      agentId: "agent-a",
      amount: 40_000,
      transactionType: "agent_earnings",
      metadata: { submissionId: "rq-1", tier: "digital_foundation" },
    });
    expect(awardAgentTokens).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      agentId: "agent-b",
      amount: 40_000,
    }));
  });

  it("returns 409 for an already-certified submission without paying anyone", async () => {
    const res = await request(createApp(admin, [[{ ...CHARGED_SUBMISSION, status: "certified" }]]))
      .post(`/api/companies/${COMPANY}/amx/rq/rq-1/complete`).send({});
    expect(res.status).toBe(409);
    expect(awardAgentTokens).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown submission", async () => {
    const res = await request(createApp(admin, [[]]))
      .post(`/api/companies/${COMPANY}/amx/rq/rq-missing/complete`).send({});
    expect(res.status).toBe(404);
  });

  it("rejects a non-admin member (403)", async () => {
    const res = await request(createApp(member, [[CHARGED_SUBMISSION]]))
      .post(`/api/companies/${COMPANY}/amx/rq/rq-1/complete`).send({});
    expect(res.status).toBe(403);
    expect(awardAgentTokens).not.toHaveBeenCalled();
  });

  it("completes a free (zero-creditCost) run with empty payouts and nothing retained", async () => {
    const submission = { ...CHARGED_SUBMISSION, id: "rq-2", creditCost: 0 };
    const res = await request(createApp(admin, [[submission]]))
      .post(`/api/companies/${COMPANY}/amx/rq/rq-2/complete`).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      submissionId: "rq-2",
      status: "certified",
      agentPayouts: [],
      platformRetained: 0,
    });
    expect(awardAgentTokens).not.toHaveBeenCalled();
  });

  it("retains the full creditCost when the swarm is empty", async () => {
    const submission = { ...CHARGED_SUBMISSION, id: "rq-3", agentSwarmIds: [] };
    const res = await request(createApp(admin, [[submission]]))
      .post(`/api/companies/${COMPANY}/amx/rq/rq-3/complete`).send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ agentPayouts: [], platformRetained: 100_001 });
    expect(awardAgentTokens).not.toHaveBeenCalled();
  });
});

describe("GET agent wallet", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns the agent's balances and its recent transactions", async () => {
    const ledgerRow = { creditBalance: 25, tokenBalance: 40_000 };
    const tx = {
      id: "tx-earn",
      amount: 40_000,
      currency: "AMX",
      transactionType: "agent_earnings",
      fromPrincipalId: "rq-factory-escrow",
      toPrincipalId: "agent-a",
      status: "completed",
      occurredAt: new Date("2026-07-11T00:00:00Z"),
      metadata: { submissionId: "rq-1" },
    };
    const res = await request(createApp(member, [[ledgerRow], [tx]]))
      .get(`/api/companies/${COMPANY}/amx/agents/agent-a/wallet`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      creditBalance: 25,
      tokenBalance: 40_000,
      transactions: [expect.objectContaining({
        id: "tx-earn",
        amount: 40_000,
        currency: "AMX",
        transactionType: "agent_earnings",
        occurredAt: "2026-07-11T00:00:00.000Z",
      })],
    });
  });

  it("returns zero balances and no transactions for an agent that never earned", async () => {
    const res = await request(createApp(member, [[], []]))
      .get(`/api/companies/${COMPANY}/amx/agents/agent-x/wallet`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ creditBalance: 0, tokenBalance: 0, transactions: [] });
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const outsider = { ...member, companyIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], companyRoles: {} };
    const res = await request(createApp(outsider))
      .get(`/api/companies/${COMPANY}/amx/agents/agent-a/wallet`);
    expect(res.status).toBe(403);
  });
});
