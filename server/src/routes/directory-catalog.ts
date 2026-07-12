import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { companies, companyLogos, stripePrices, lmsMarketplaceListings } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { unprocessable } from "../errors.js";

/**
 * Public directory routes
 *
 * Fully public — no `assertBoard`/`assertCompanyAccess`/`getActorInfo` calls
 * anywhere in this file, matching the convention documented in
 * stripe-public.ts / meeting-guests.ts. These power the unauthenticated
 * company directory (/directory/companies) and cross-company product/service
 * catalog (/directory/catalog): a visitor browsing the directory has no
 * Paperclip account, so the only trusted inputs are the optional `kind` /
 * `companyId` / `limit` query filters — everything else is resolved
 * server-side from rows where `companies.isPublic = true`.
 *
 * Only companies that have explicitly opted in via `isPublic` are ever
 * surfaced here — this is an admin-gated opt-in (see PATCH /companies/:id),
 * off by default.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Simple sliding-window rate limiter, same shape as stripe-public.ts. */
function createRateLimiter(maxAttempts: number, windowMs: number) {
  const attempts = new Map<string, number[]>();
  return {
    check(key: string): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;
      const existing = (attempts.get(key) ?? []).filter((ts) => ts > windowStart);
      if (existing.length >= maxAttempts) return false;
      existing.push(now);
      attempts.set(key, existing);
      return true;
    },
  };
}

function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/** Turns a tier slug into a readable fallback label, e.g. coop_2 → "Coop 2". */
function tierLabel(tierName: string): string {
  return tierName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function intervalSuffix(interval: string): string {
  switch (interval) {
    case "month": return "/mo";
    case "year": return "/yr";
    case "week": return "/wk";
    default: return "";
  }
}

/** Cents + currency + interval → a short display label, e.g. "$100/mo". */
function formatPriceLabel(amountCents: number, currency: string, interval: string): string {
  const dollars = amountCents / 100;
  const formatted = Number.isInteger(dollars) ? dollars.toLocaleString() : dollars.toFixed(2);
  const symbol = currency.toLowerCase() === "usd" ? "$" : `${currency.toUpperCase()} `;
  return `${symbol}${formatted}${intervalSuffix(interval)}`;
}

const CATALOG_KINDS = ["subscription_tier", "marketplace_listing"] as const;
type CatalogKind = (typeof CATALOG_KINDS)[number];

interface CatalogItem {
  id: string;
  kind: CatalogKind;
  name: string;
  description: string | null;
  priceLabel: string;
  companyId: string;
  companyName: string;
  companyPrefix: string;
  imageUrl: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw: unknown): number {
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export function directoryCatalogRoutes(db: Db): Router {
  const router = Router();

  // Directory page loads are generous, same budget as stripe-public's catalog reads.
  const limiter = createRateLimiter(30, 60_000);

  /**
   * GET /public/directory/companies
   * Every company that has opted in to the public directory (isPublic = true).
   */
  router.get("/public/directory/companies", async (req, res) => {
    if (!limiter.check(clientIp(req))) {
      return res.status(429).json({ error: "Too many requests — try again later" });
    }

    const rows = await db
      .select({
        id: companies.id,
        name: companies.name,
        tagline: companies.tagline,
        description: companies.description,
        brandColor: companies.brandColor,
        logoAssetId: companyLogos.assetId,
      })
      .from(companies)
      .leftJoin(companyLogos, eq(companyLogos.companyId, companies.id))
      .where(eq(companies.isPublic, true));

    const mapped = rows.map((row) => ({
      id: row.id,
      name: row.name,
      tagline: row.tagline,
      description: row.description,
      brandColor: row.brandColor,
      logoUrl: row.logoAssetId ? `/api/public/assets/${row.logoAssetId}/content` : null,
    }));

    res.json({ companies: mapped, total: mapped.length });
  });

  /**
   * GET /public/directory/catalog
   * Cross-company product/service catalog: active Stripe subscription tiers
   * plus public marketplace listings, from companies where isPublic = true.
   * Query filters: ?kind=subscription_tier|marketplace_listing, ?companyId=,
   * ?limit= (default 50, clamped to 200).
   */
  router.get("/public/directory/catalog", async (req, res) => {
    if (!limiter.check(clientIp(req))) {
      return res.status(429).json({ error: "Too many requests — try again later" });
    }

    const { kind, companyId } = req.query as { kind?: string; companyId?: string };
    if (kind !== undefined && !CATALOG_KINDS.includes(kind as CatalogKind)) {
      throw unprocessable(`kind must be one of: ${CATALOG_KINDS.join(", ")}`);
    }
    if (companyId !== undefined && !UUID_RE.test(companyId)) {
      throw unprocessable("companyId must be a valid UUID");
    }
    const limit = parseLimit(req.query.limit);

    const items: CatalogItem[] = [];

    if (kind === undefined || kind === "subscription_tier") {
      const tierFilters = [eq(companies.isPublic, true), eq(stripePrices.isActive, 1)];
      if (companyId) tierFilters.push(eq(stripePrices.companyId, companyId));

      const tierRows = await db
        .select({
          id: stripePrices.id,
          tierName: stripePrices.tierName,
          amount: stripePrices.amount,
          currency: stripePrices.currency,
          interval: stripePrices.interval,
          companyId: companies.id,
          companyName: companies.name,
          companyPrefix: companies.issuePrefix,
        })
        .from(stripePrices)
        .innerJoin(companies, eq(stripePrices.companyId, companies.id))
        .where(and(...tierFilters));

      for (const row of tierRows) {
        items.push({
          id: row.id,
          kind: "subscription_tier",
          name: tierLabel(row.tierName),
          description: null,
          priceLabel: formatPriceLabel(row.amount, row.currency, row.interval),
          companyId: row.companyId,
          companyName: row.companyName,
          companyPrefix: row.companyPrefix,
          imageUrl: null,
        });
      }
    }

    if (kind === undefined || kind === "marketplace_listing") {
      const listingFilters = [
        eq(lmsMarketplaceListings.isPublic, true),
        eq(lmsMarketplaceListings.isActive, 1),
        eq(companies.isPublic, true),
      ];
      if (companyId) listingFilters.push(eq(lmsMarketplaceListings.companyId, companyId));

      const listingRows = await db
        .select({
          id: lmsMarketplaceListings.id,
          title: lmsMarketplaceListings.title,
          bio: lmsMarketplaceListings.bio,
          hourlyRateSims: lmsMarketplaceListings.hourlyRateSims,
          companyId: companies.id,
          companyName: companies.name,
          companyPrefix: companies.issuePrefix,
        })
        .from(lmsMarketplaceListings)
        .innerJoin(companies, eq(lmsMarketplaceListings.companyId, companies.id))
        .where(and(...listingFilters));

      for (const row of listingRows) {
        items.push({
          id: row.id,
          kind: "marketplace_listing",
          name: row.title,
          description: row.bio,
          priceLabel: `${row.hourlyRateSims} sims/hr`,
          companyId: row.companyId,
          companyName: row.companyName,
          companyPrefix: row.companyPrefix,
          imageUrl: null,
        });
      }
    }

    const total = items.length;
    res.json({ items: items.slice(0, limit), total });
  });

  return router;
}
