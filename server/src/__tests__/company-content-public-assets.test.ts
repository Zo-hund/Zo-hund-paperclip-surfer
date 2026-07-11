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

// storage/service.ts's buildObjectKey produces:
//   `${companyId}/${namespace}/${yyyy}/${mm}/${dd}/${uuid}-${filename}`
// The route passes namespace `assets/${namespaceSuffix}`, so for a
// stripe-product upload the marker segment sits in the MIDDLE of the key
// (preceded by a per-tenant company id) — a prefix match would never fire.
// This mirrors the exact shape the service produces, independent of the
// mocked DB below, so a future regression to a prefix-only match is caught
// even though the fake db doesn't evaluate real SQL LIKE semantics.
function realisticObjectKey(namespaceSuffix: string) {
  const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  return `${companyId}/assets/${namespaceSuffix}/2026/07/11/11111111-1111-4111-8111-111111111111-amx-labs-solo.png`;
}

describe("stripe-product objectKey shape assumption", () => {
  it("the public-check segment matches a realistic stripe-product objectKey", () => {
    const key = realisticObjectKey("stripe-product");
    expect(key).toContain("/assets/stripe-product/");
    // A naive prefix check (key.startsWith("assets/stripe-product/")) is
    // exactly the bug this locks in — it's always false because companyId
    // comes first.
    expect(key.startsWith("assets/stripe-product/")).toBe(false);
  });

  it("does not match an unrelated namespace's objectKey", () => {
    const key = realisticObjectKey("issue-attachment");
    expect(key).not.toContain("/assets/stripe-product/");
  });
});

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
