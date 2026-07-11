import { describe, expect, it } from "vitest";
import { companyContentService } from "../services/company-content.js";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";

/**
 * Queue-based fake db: isAssetPubliclyReferenced runs up to 4 sequential
 * `db.select().from().where()` queries (stripe product image, logo, staff,
 * event) and short-circuits on the first match. Each entry in `queue` is the
 * row array returned by the Nth query issued against this db instance.
 */
function createFakeDb(queue: unknown[][]) {
  let call = 0;
  const chain = {
    from: () => chain,
    where: () => chain,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(queue[call++] ?? []).then(resolve),
  };
  return { select: () => chain } as never;
}

describe("companyContentService.isAssetPubliclyReferenced", () => {
  it("treats an asset uploaded under the stripe-product namespace as public", async () => {
    // First query (stripe product image objectKey LIKE match) returns a row.
    const svc = companyContentService(createFakeDb([[{ id: ASSET_ID }]]));
    await expect(svc.isAssetPubliclyReferenced(ASSET_ID)).resolves.toBe(true);
  });

  it("still treats a company logo asset as public (pre-existing behavior preserved)", async () => {
    // 1st query (stripe product) empty, 2nd (logo) matches.
    const svc = companyContentService(createFakeDb([[], [{ id: "logo-row" }]]));
    await expect(svc.isAssetPubliclyReferenced(ASSET_ID)).resolves.toBe(true);
  });

  it("returns false for an asset with no public reference at all", async () => {
    const svc = companyContentService(createFakeDb([[], [], [], []]));
    await expect(svc.isAssetPubliclyReferenced(ASSET_ID)).resolves.toBe(false);
  });
});
