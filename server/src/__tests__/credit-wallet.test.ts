import { describe, expect, it } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { spendCredits, refundCredits, getCombinedBalance, InsufficientCreditsError } from "../services/creditWallet.js";

/**
 * Stateful fake db for the wallet's exact query shapes:
 *  - select().from().where().limit() → ledger row lookup, served from a queue
 *    (the wallet reads the company-scoped row first, then the global row)
 *  - update(table).set().where()     → balance write (captured with table name)
 *  - insert(table).values().returning() → transaction insert (captured)
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
      // Capture at values() time: the ledger-row insert path awaits values()
      // directly (thenable), while the transaction insert chains .returning().
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
  companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  principalId: "user-1",
  toPrincipalId: "rq-factory-escrow",
  transactionType: "rq_factory_charge",
};

describe("spendCredits", () => {
  it("spends entirely from the company row when it covers the amount, leaving the global row untouched", async () => {
    const { db, state } = createFakeDb([
      { creditBalance: 250_000, tokenBalance: 0 }, // company
      { creditBalance: 50_000, tokenBalance: 0 },  // global
    ]);
    const txId = await spendCredits(db, { ...BASE, amount: 100_000 });

    expect(txId).toBe("tx-1");
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ table: "amx_ledger", values: { creditBalance: 150_000 } });
    expect(state.inserts[0]!.table).toBe("amx_transactions");
    expect(state.inserts[0]!.values).toMatchObject({
      amount: 100_000,
      currency: "CREDIT",
      fromPrincipalId: "user-1",
      toPrincipalType: "system",
      toPrincipalId: "rq-factory-escrow",
      transactionType: "rq_factory_charge",
      metadata: { companySpent: 100_000, globalSpent: 0 },
    });
  });

  it("splits the spend across company then global rows, recording ONE transaction for the total", async () => {
    const { db, state } = createFakeDb([
      { creditBalance: 60_000, tokenBalance: 0 },  // company
      { creditBalance: 100_000, tokenBalance: 0 }, // global
    ]);
    await spendCredits(db, { ...BASE, amount: 100_000 });

    expect(state.updates).toHaveLength(2);
    expect(state.updates[0]).toMatchObject({ table: "amx_ledger", values: { creditBalance: 0 } });
    expect(state.updates[1]).toMatchObject({ table: "amx_global_ledger", values: { creditBalance: 60_000 } });
    // Exactly ONE amx_transactions row for the split spend — a second insert
    // (amx_chain_events, the chain-of-custody record) is expected alongside it.
    expect(state.inserts.filter((i) => i.table === "amx_transactions")).toHaveLength(1);
    expect(state.inserts[0]!.values).toMatchObject({
      amount: 100_000,
      metadata: { companySpent: 60_000, globalSpent: 40_000 },
    });
  });

  it("spends entirely from the global row when the buyer has no company row", async () => {
    const { db, state } = createFakeDb([
      null,                                        // company — no row
      { creditBalance: 200_000, tokenBalance: 0 }, // global
    ]);
    await spendCredits(db, { ...BASE, amount: 150_000 });

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ table: "amx_global_ledger", values: { creditBalance: 50_000 } });
    expect(state.inserts[0]!.values).toMatchObject({
      metadata: { companySpent: 0, globalSpent: 150_000 },
    });
  });

  it("rejects when the combined balance is short, reporting needed vs combined balance", async () => {
    const { db, state } = createFakeDb([
      { creditBalance: 500, tokenBalance: 0 }, // company
      { creditBalance: 300, tokenBalance: 0 }, // global
    ]);
    await expect(spendCredits(db, { ...BASE, amount: 100_000 })).rejects.toMatchObject({
      name: "InsufficientCreditsError",
      needed: 100_000,
      balance: 800,
    });
    // Nothing was written — the rejection happened before any mutation.
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("treats missing ledger rows as a zero balance", async () => {
    const { db } = createFakeDb([null, null]);
    await expect(spendCredits(db, { ...BASE, amount: 1 })).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("rejects non-positive and non-integer amounts", async () => {
    const { db } = createFakeDb([{ creditBalance: 100, tokenBalance: 0 }, null]);
    await expect(spendCredits(db, { ...BASE, amount: 0 })).rejects.toThrow(/positive integer/);
    await expect(spendCredits(db, { ...BASE, amount: -5 })).rejects.toThrow(/positive integer/);
    await expect(spendCredits(db, { ...BASE, amount: 1.5 })).rejects.toThrow(/positive integer/);
  });
});

describe("getCombinedBalance", () => {
  it("sums the company and global balances, treating missing rows as 0", async () => {
    const { db } = createFakeDb([
      { creditBalance: 1_000, tokenBalance: 0 }, // company
      { creditBalance: 2_500, tokenBalance: 0 }, // global
    ]);
    await expect(getCombinedBalance(db, { companyId: BASE.companyId, principalId: "user-1" })).resolves.toEqual({
      companyCredits: 1_000,
      globalCredits: 2_500,
      total: 3_500,
    });

    const { db: emptyDb } = createFakeDb([null, null]);
    await expect(getCombinedBalance(emptyDb, { companyId: BASE.companyId, principalId: "user-1" })).resolves.toEqual({
      companyCredits: 0,
      globalCredits: 0,
      total: 0,
    });
  });
});

describe("refundCredits", () => {
  const REFUND = {
    companyId: BASE.companyId,
    principalId: "user-1",
    fromPrincipalId: "rq-factory-escrow",
    transactionType: "rq_factory_refund",
  };

  it("re-credits the COMPANY ledger row from the escrow principal", async () => {
    const { db, state } = createFakeDb([{ creditBalance: 10, tokenBalance: 0 }]);
    await refundCredits(db, { ...REFUND, amount: 100_000 });

    expect(state.updates[0]).toMatchObject({ table: "amx_ledger", values: { creditBalance: 100_010 } });
    expect(state.inserts[0]!.values).toMatchObject({
      amount: 100_000,
      currency: "CREDIT",
      fromPrincipalType: "system",
      fromPrincipalId: "rq-factory-escrow",
      toPrincipalId: "user-1",
      transactionType: "rq_factory_refund",
    });
  });

  it("creates the company ledger row when the buyer has none", async () => {
    const { db, state } = createFakeDb([null]);
    await refundCredits(db, { ...REFUND, amount: 500 });

    // First insert is the new ledger row, second is the transaction.
    expect(state.inserts[0]).toMatchObject({ table: "amx_ledger", values: { creditBalance: 500, tokenBalance: 0, principalId: "user-1" } });
    expect(state.inserts[1]!.values).toMatchObject({ amount: 500, transactionType: "rq_factory_refund" });
    expect(state.updates).toHaveLength(0);
  });
});
