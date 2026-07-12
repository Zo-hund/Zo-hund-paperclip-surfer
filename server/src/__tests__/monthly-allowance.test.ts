import { describe, expect, it } from "vitest";
import { awardMonthlyAllowance } from "../services/stripeProvisioningService.js";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "user-1";

/**
 * Stateful fake db for awardMonthlyAllowance's exact query shapes:
 *  - insert().values()        → transaction row / new ledger row (captured;
 *                               awaited directly, so values() is thenable)
 *  - select().from().where()  → ledger lookup (awaited without .limit, so
 *                               where() is thenable)
 *  - update().set().where()   → ledger balance write (captured)
 */
function createFakeDb(ledgerRow: { creditBalance: number; tokenBalance: number } | null) {
  const state = {
    updates: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: (() => {
          const chain: Record<string, unknown> = {};
          chain.limit = async () => (ledgerRow ? [ledgerRow] : []);
          chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(ledgerRow ? [ledgerRow] : []).then(resolve, reject);
          return () => chain;
        })(),
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
  companyId: COMPANY_ID,
  userId: USER_ID,
  invoiceId: "in_test_1",
};

describe("awardMonthlyAllowance", () => {
  it("credits an existing ledger row by the tier allowance", async () => {
    const { db, state } = createFakeDb({ creditBalance: 1_000, tokenBalance: 25 });

    const result = await awardMonthlyAllowance(db, { ...BASE, tierName: "solo" });

    expect(result).toEqual({ awarded: 2_500 });
    // 1,000 existing + 2,500 solo allowance — token balance untouched.
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ creditBalance: 3_500 });
    expect(state.updates[0]).not.toHaveProperty("tokenBalance");
  });

  it("creates the ledger row when the user has none", async () => {
    const { db, state } = createFakeDb(null);

    const result = await awardMonthlyAllowance(db, { ...BASE, tierName: "team_15" });

    expect(result).toEqual({ awarded: 30_000 });
    expect(state.updates).toHaveLength(0);
    // First insert is the transaction, second the new ledger row, third the
    // amx_chain_events chain-of-custody record.
    expect(state.inserts).toHaveLength(3);
    expect(state.inserts[1]).toMatchObject({
      companyId: COMPANY_ID,
      principalType: "user",
      principalId: USER_ID,
      creditBalance: 30_000,
      tokenBalance: 0,
    });
  });

  it("is a no-op for a tier without a monthly allowance", async () => {
    const { db, state } = createFakeDb({ creditBalance: 100, tokenBalance: 0 });

    const result = await awardMonthlyAllowance(db, { ...BASE, tierName: "unknown_tier" });

    expect(result).toEqual({ awarded: 0 });
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("records a monthly_allowance transaction from the stripe-subscription principal", async () => {
    const { db, state } = createFakeDb({ creditBalance: 0, tokenBalance: 0 });

    await awardMonthlyAllowance(db, { ...BASE, tierName: "builder" });

    // The transaction insert, plus the amx_chain_events chain-of-custody record.
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0]).toMatchObject({
      fromCompanyId: COMPANY_ID,
      toCompanyId: COMPANY_ID,
      fromPrincipalType: "system",
      fromPrincipalId: "stripe-subscription",
      toPrincipalType: "user",
      toPrincipalId: USER_ID,
      amount: 500,
      currency: "CREDIT",
      transactionType: "monthly_allowance",
      status: "completed",
      metadata: { tierName: "builder", invoiceId: "in_test_1" },
    });
  });
});
