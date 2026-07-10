import { describe, expect, it } from "vitest";
import { lmsMemberProfiles, stripeSubscriptions } from "@paperclipai/db";
import { cancelMember } from "../services/stripeProvisioningService.js";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "user-1";

/**
 * Stateful fake db for cancelMember's exact query sequence:
 *   1. select sub row by subscription id (with .limit)
 *   2. update stripeSubscriptions -> canceled
 *   3. select remaining active/trialing subs (awaited directly, no .limit)
 *   4. update lmsMemberProfiles with recomputed entitlements
 * Captures every update's table + payload for assertions.
 */
function createFakeDb(opts: { subRow: { companyId: string; userId: string } | null; remaining: Array<{ tierName: string }> }) {
  const updates: Array<{ table: unknown; set: Record<string, unknown> }> = [];
  let selectCount = 0;

  const makeChain = (result: unknown[]) => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = async () => result;
    // Drizzle select chains are thenable — cancelMember awaits the
    // remaining-subs query without .limit().
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };

  const db = {
    select: () => {
      selectCount += 1;
      return makeChain(selectCount === 1 ? (opts.subRow ? [opts.subRow] : []) : opts.remaining);
    },
    update: (table: unknown) => ({
      set: (payload: Record<string, unknown>) => ({
        where: async () => {
          updates.push({ table, set: payload });
        },
      }),
    }),
  };
  return { db: db as never, updates };
}

describe("cancelMember — entitlement recompute", () => {
  it("keeps member types granted by other active subscriptions", async () => {
    const { db, updates } = createFakeDb({
      subRow: { companyId: COMPANY_ID, userId: USER_ID },
      // The user still holds an active builder sub and a parent sub after
      // this cancellation.
      remaining: [{ tierName: "builder" }, { tierName: "parent" }],
    });

    await cancelMember(db, "sub_cancelled_1");

    const profileUpdate = updates.find((u) => u.table === lmsMemberProfiles);
    expect(profileUpdate).toBeDefined();
    expect((profileUpdate!.set.memberTypes as string[]).sort()).toEqual(["builder", "learner", "parent"]);
    expect(profileUpdate!.set.progressionStage).toBe("builder");
  });

  it("wipes entitlements only when no active subscriptions remain", async () => {
    const { db, updates } = createFakeDb({
      subRow: { companyId: COMPANY_ID, userId: USER_ID },
      remaining: [],
    });

    await cancelMember(db, "sub_cancelled_1");

    const profileUpdate = updates.find((u) => u.table === lmsMemberProfiles);
    expect(profileUpdate).toBeDefined();
    expect(profileUpdate!.set.memberTypes).toEqual([]);
    expect(profileUpdate!.set.progressionStage).toBe("explorer");
  });

  it("still marks the subscription canceled when the sub row is unknown, without touching profiles", async () => {
    const { db, updates } = createFakeDb({ subRow: null, remaining: [] });

    await cancelMember(db, "sub_unknown");

    expect(updates.some((u) => u.table === stripeSubscriptions)).toBe(true);
    expect(updates.some((u) => u.table === lmsMemberProfiles)).toBe(false);
  });
});
