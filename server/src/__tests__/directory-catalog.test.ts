import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { directoryCatalogRoutes } from "../routes/directory-catalog.js";
import { boardMutationGuard } from "../middleware/board-mutation-guard.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/**
 * Queue-based fake db, same shape as stripe-public-routes.test.ts: each route
 * runs a fixed sequence of `db.select().from()[.join()].where()` queries;
 * entry N of `queue` is the row array the Nth query resolves to.
 */
function createFakeDb(queue: unknown[][]) {
  let call = 0;
  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: async () => queue[call++] ?? [],
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(queue[call++] ?? []).then(resolve, reject),
  };
  return chain as never;
}

/** Mirrors production mounting: anonymous actor + boardMutationGuard first,
 * exactly like a logged-out visitor hitting /api on the deployed app. */
function createApp(queue: unknown[][]) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = { type: "none" };
    next();
  });
  app.use(boardMutationGuard());
  app.use("/api", directoryCatalogRoutes(createFakeDb(queue)));
  app.use(errorHandler);
  return app;
}

describe("GET /public/directory/companies", () => {
  it("returns mapped companies with total, sourced from the isPublic=true query", async () => {
    // Route issues a single company+logo join query — these rows stand in
    // for what `WHERE companies.is_public = true` already filtered to.
    const rows = [
      {
        id: COMPANY_ID,
        name: "AMX Labs",
        tagline: "Building the future",
        description: "An AI-agent company",
        brandColor: "#0ea5e9",
        logoAssetId: null,
      },
      {
        id: COMPANY_ID_2,
        name: "Tech At Nite",
        tagline: null,
        description: null,
        brandColor: null,
        logoAssetId: "logo-asset-id",
      },
    ];
    const res = await request(createApp([rows])).get("/api/public/directory/companies");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.companies).toHaveLength(2);
    expect(res.body.companies[0]).toMatchObject({
      id: COMPANY_ID,
      name: "AMX Labs",
      tagline: "Building the future",
      logoUrl: null,
    });
    // logoAssetId resolves through the public asset route, same convention as stripe-public.ts
    expect(res.body.companies[1]).toMatchObject({
      id: COMPANY_ID_2,
      name: "Tech At Nite",
      tagline: null,
      logoUrl: "/api/public/assets/logo-asset-id/content",
    });
  });

  it("returns an empty directory when no companies have opted in", async () => {
    const res = await request(createApp([[]])).get("/api/public/directory/companies");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ companies: [], total: 0 });
  });
});

describe("GET /public/directory/catalog", () => {
  const TIER_ROW = {
    id: "price-1",
    tierName: "team_15",
    amount: 100000,
    currency: "usd",
    interval: "month",
    companyId: COMPANY_ID,
    companyName: "AMX Labs",
    companyPrefix: "AMXA",
  };
  const LISTING_ROW = {
    id: "listing-1",
    title: "Video editing",
    bio: "Fast turnaround",
    hourlyRateSims: 75,
    companyId: COMPANY_ID_2,
    companyName: "Tech At Nite",
    companyPrefix: "TAN",
  };

  it("rejects an invalid kind filter (422)", async () => {
    const res = await request(createApp([])).get("/api/public/directory/catalog?kind=bogus");
    expect(res.status).toBe(422);
  });

  it("rejects a malformed companyId filter (422)", async () => {
    const res = await request(createApp([])).get("/api/public/directory/catalog?companyId=not-a-uuid");
    expect(res.status).toBe(422);
  });

  it("filters to only subscription tiers when kind=subscription_tier (marketplace query not run)", async () => {
    const res = await request(createApp([[TIER_ROW]]))
      .get("/api/public/directory/catalog?kind=subscription_tier");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      kind: "subscription_tier",
      name: "Team 15",
      priceLabel: "$1,000/mo",
      companyId: COMPANY_ID,
      companyPrefix: "AMXA",
    });
  });

  it("filters to only marketplace listings when kind=marketplace_listing (tier query not run)", async () => {
    const res = await request(createApp([[LISTING_ROW]]))
      .get("/api/public/directory/catalog?kind=marketplace_listing");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      kind: "marketplace_listing",
      name: "Video editing",
      priceLabel: "75 sims/hr",
      companyId: COMPANY_ID_2,
      companyPrefix: "TAN",
    });
  });

  it("combines both kinds when no kind filter is given", async () => {
    const res = await request(createApp([[TIER_ROW], [LISTING_ROW]]))
      .get("/api/public/directory/catalog");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const kinds = res.body.items.map((i: { kind: string }) => i.kind).sort();
    expect(kinds).toEqual(["marketplace_listing", "subscription_tier"]);
  });

  it("clamps a limit above 200 down to 200, while total reflects the full match count", async () => {
    const manyTiers = Array.from({ length: 250 }, (_, i) => ({
      ...TIER_ROW,
      id: `price-${i}`,
      tierName: `tier_${i}`,
    }));
    const res = await request(createApp([manyTiers]))
      .get("/api/public/directory/catalog?kind=subscription_tier&limit=9999");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(250);
    expect(res.body.items).toHaveLength(200);
  });

  it("defaults to a limit of 50 when none is given", async () => {
    const manyTiers = Array.from({ length: 60 }, (_, i) => ({
      ...TIER_ROW,
      id: `price-${i}`,
      tierName: `tier_${i}`,
    }));
    const res = await request(createApp([manyTiers]))
      .get("/api/public/directory/catalog?kind=subscription_tier");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(60);
    expect(res.body.items).toHaveLength(50);
  });
});
