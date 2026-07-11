import { describe, expect, it } from "vitest";
import { resolveCreditPurchaseTotal } from "../routes/stripe.js";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Stateful fake db for resolveCreditPurchaseTotal's exact query shape:
 *  - select().from().where().limit() → nonprofit-subscription lookup, served
 *    from a queue (same style as credit-wallet.test.ts). Every select is
 *    counted so tests can assert the missing-companyId path never queries.
 */
function createFakeDb(selectQueue: Array<{ id: string } | null>) {
  const queue = [...selectQueue];
  const state = { selects: 0 };
  const db = {
    select: () => {
      state.selects += 1;
      return {
        from: () => ({
          where: () => ({
            limit: async () => {
              const row = queue.shift() ?? null;
              return row ? [row] : [];
            },
          }),
        }),
      };
    },
  };
  return { db: db as never, state };
}

describe("resolveCreditPurchaseTotal", () => {
  it("grants +25% bonus credits to a company with an active nonprofit_baseline subscription", async () => {
    const { db, state } = createFakeDb([{ id: "sub-1" }]);

    const result = await resolveCreditPurchaseTotal(db, { companyId: COMPANY_ID, creditAmount: 1_000 });

    expect(result).toEqual({ total: 1_250, bonus: 250 });
    expect(state.selects).toBe(1);
  });

  it("leaves non-nonprofit companies unchanged — bonus 0, total equals the pack size", async () => {
    const { db, state } = createFakeDb([null]);

    const result = await resolveCreditPurchaseTotal(db, { companyId: COMPANY_ID, creditAmount: 1_000 });

    expect(result).toEqual({ total: 1_000, bonus: 0 });
    expect(state.selects).toBe(1);
  });

  it("floors fractional bonuses (999-credit pack → 249 bonus, never 249.75)", async () => {
    const { db } = createFakeDb([{ id: "sub-1" }]);

    const result = await resolveCreditPurchaseTotal(db, { companyId: COMPANY_ID, creditAmount: 999 });

    expect(result).toEqual({ total: 1_248, bonus: 249 });
  });

  it("skips the bonus check entirely when companyId is missing — no bonus, no db query", async () => {
    const { db, state } = createFakeDb([]);

    await expect(resolveCreditPurchaseTotal(db, { companyId: undefined, creditAmount: 1_000 })).resolves.toEqual({
      total: 1_000,
      bonus: 0,
    });
    await expect(resolveCreditPurchaseTotal(db, { companyId: null, creditAmount: 500 })).resolves.toEqual({
      total: 500,
      bonus: 0,
    });
    expect(state.selects).toBe(0);
  });
});
