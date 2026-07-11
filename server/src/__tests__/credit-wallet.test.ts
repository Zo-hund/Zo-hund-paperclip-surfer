import { describe, expect, it } from "vitest";
import { spendCredits, refundCredits, InsufficientCreditsError } from "../services/creditWallet.js";

/**
 * Stateful fake db for the wallet's exact query shapes:
 *  - select().from().where().limit() → ledger row lookup
 *  - update().set().where()          → balance write (captured)
 *  - insert().values().returning()   → transaction insert (captured)
 */
function createFakeDb(ledgerRow: { creditBalance: number; tokenBalance: number } | null) {
  const state = {
    updates: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (ledgerRow ? [ledgerRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    }),
    insert: () => ({
      // Capture at values() time: the ledger-row insert path awaits values()
      // directly (thenable), while the transaction insert chains .returning().
      values: (values: Record<string, unknown>) => {
        state.inserts.push(values);
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
  it("debits the balance and records a CREDIT transaction to the escrow principal", async () => {
    const { db, state } = createFakeDb({ creditBalance: 250_000, tokenBalance: 0 });
    const txId = await spendCredits(db, { ...BASE, amount: 100_000 });

    expect(txId).toBe("tx-1");
    expect(state.updates[0]).toMatchObject({ creditBalance: 150_000 });
    expect(state.inserts[0]).toMatchObject({
      amount: 100_000,
      currency: "CREDIT",
      fromPrincipalId: "user-1",
      toPrincipalType: "system",
      toPrincipalId: "rq-factory-escrow",
      transactionType: "rq_factory_charge",
    });
  });

  it("rejects when the balance is short, reporting needed vs balance", async () => {
    const { db, state } = createFakeDb({ creditBalance: 500, tokenBalance: 0 });
    await expect(spendCredits(db, { ...BASE, amount: 100_000 })).rejects.toMatchObject({
      name: "InsufficientCreditsError",
      needed: 100_000,
      balance: 500,
    });
    // Nothing was written — the rejection happened before any mutation.
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("treats a missing ledger row as a zero balance", async () => {
    const { db } = createFakeDb(null);
    await expect(spendCredits(db, { ...BASE, amount: 1 })).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("rejects non-positive and non-integer amounts", async () => {
    const { db } = createFakeDb({ creditBalance: 100, tokenBalance: 0 });
    await expect(spendCredits(db, { ...BASE, amount: 0 })).rejects.toThrow(/positive integer/);
    await expect(spendCredits(db, { ...BASE, amount: -5 })).rejects.toThrow(/positive integer/);
    await expect(spendCredits(db, { ...BASE, amount: 1.5 })).rejects.toThrow(/positive integer/);
  });
});

describe("refundCredits", () => {
  const REFUND = {
    companyId: BASE.companyId,
    principalId: "user-1",
    fromPrincipalId: "rq-factory-escrow",
    transactionType: "rq_factory_refund",
  };

  it("re-credits an existing ledger row from the escrow principal", async () => {
    const { db, state } = createFakeDb({ creditBalance: 10, tokenBalance: 0 });
    await refundCredits(db, { ...REFUND, amount: 100_000 });

    expect(state.updates[0]).toMatchObject({ creditBalance: 100_010 });
    expect(state.inserts[0]).toMatchObject({
      amount: 100_000,
      currency: "CREDIT",
      fromPrincipalType: "system",
      fromPrincipalId: "rq-factory-escrow",
      toPrincipalId: "user-1",
      transactionType: "rq_factory_refund",
    });
  });

  it("creates the ledger row when the buyer has none", async () => {
    const { db, state } = createFakeDb(null);
    await refundCredits(db, { ...REFUND, amount: 500 });

    // First insert is the new ledger row, second is the transaction.
    expect(state.inserts[0]).toMatchObject({ creditBalance: 500, tokenBalance: 0, principalId: "user-1" });
    expect(state.inserts[1]).toMatchObject({ amount: 500, transactionType: "rq_factory_refund" });
    expect(state.updates).toHaveLength(0);
  });
});
