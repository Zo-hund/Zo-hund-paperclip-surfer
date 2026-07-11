import { Router } from "express";
import Stripe from "stripe";
import type { Db } from "@paperclipai/db";
import { stripePrices, companies, companyLogos } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";
import { notFound, unprocessable } from "../errors.js";

/**
 * Public Stripe storefront routes
 *
 * Fully public — no `assertBoard`/`assertCompanyAccess`/`getActorInfo` calls
 * anywhere in this file, matching the convention documented in
 * meeting-guests.ts. These power the customer-facing pricing page
 * (/hub/:companyId/pricing): a prospective subscriber has no Paperclip
 * account, so the only inputs trusted here are the companyId in the URL and
 * the tier name — everything else (price, redirect URLs, buyer identity) is
 * resolved server-side. An unknown or malformed companyId returns a uniform
 * 404, never 401/403.
 *
 * Buyer identity: Stripe Checkout collects the buyer's email; the webhook
 * (stripe.ts) derives `email:<address>` as the userId when no authenticated
 * userId was attached, so provisioning works without an account.
 */

/** Simple sliding-window rate limiter, same shape as meeting-guests.ts. */
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

interface ProductDetails {
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  features: string[];
}

/** Stripe product details change rarely; cache per product id so the public
 * catalog page doesn't issue a Stripe API call per price per visitor. */
const PRODUCT_CACHE_TTL_MS = 5 * 60_000;
const productCache = new Map<string, { details: ProductDetails; fetchedAt: number }>();

async function fetchProductDetails(productId: string): Promise<ProductDetails | null> {
  const cached = productCache.get(productId);
  if (cached && Date.now() - cached.fetchedAt < PRODUCT_CACHE_TTL_MS) return cached.details;
  try {
    const stripe = getStripe();
    const product = await stripe.products.retrieve(productId);
    const details: ProductDetails = {
      name: product.name ?? null,
      description: product.description ?? null,
      imageUrl: product.images?.[0] ?? null,
      features: (product.marketing_features ?? []).map((f) => f.name).filter((n): n is string => Boolean(n)),
    };
    productCache.set(productId, { details, fetchedAt: Date.now() });
    return details;
  } catch {
    // Stripe unconfigured or product fetch failed — the catalog still renders
    // from the DB row (tier name + amount), just without marketing copy.
    return null;
  }
}

/** Turns a tier slug into a readable fallback label, e.g. coop_2 → "Coop 2". */
function tierLabel(tierName: string): string {
  return tierName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stripePublicRoutes(db: Db): Router {
  const router = Router();

  // Catalog reads are generous (page loads); checkout is tighter since each
  // call creates a Stripe Checkout session.
  const catalogLimiter = createRateLimiter(30, 60_000);
  const checkoutLimiter = createRateLimiter(10, 60_000);

  /**
   * GET /public/companies/:companyId/stripe/catalog
   * Public price list for a company's storefront: company branding plus every
   * active tier, enriched with the Stripe product's name/description/image/
   * marketing features when available.
   */
  router.get("/public/companies/:companyId/stripe/catalog", async (req, res) => {
    if (!catalogLimiter.check(clientIp(req))) {
      return res.status(429).json({ error: "Too many requests — try again later" });
    }

    const { companyId } = req.params as { companyId: string };
    if (!UUID_RE.test(companyId)) throw notFound("Company not found");

    const [company] = await db
      .select({ name: companies.name, brandColor: companies.brandColor })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) throw notFound("Company not found");

    const [logo] = await db
      .select({ assetId: companyLogos.assetId })
      .from(companyLogos)
      .where(eq(companyLogos.companyId, companyId))
      .limit(1);

    const rows = await db
      .select()
      .from(stripePrices)
      .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.isActive, 1)));

    const tiers = await Promise.all(
      rows.map(async (row) => {
        const details = await fetchProductDetails(row.stripeProductId);
        return {
          tier: row.tierName,
          name: details?.name ?? tierLabel(row.tierName),
          description: details?.description ?? null,
          imageUrl: details?.imageUrl ?? null,
          features: details?.features ?? [],
          amount: row.amount,
          currency: row.currency,
          interval: row.interval,
        };
      }),
    );
    tiers.sort((a, b) => a.amount - b.amount);

    res.json({
      companyName: company.name,
      brandColor: company.brandColor ?? null,
      logoUrl: logo?.assetId ? `/api/public/assets/${logo.assetId}/content` : null,
      tiers,
    });
  });

  /**
   * POST /public/companies/:companyId/stripe/checkout
   * Starts a Stripe Checkout session for an anonymous visitor. Body: { tierName }.
   * Recurring paid tiers only — free tiers can't be self-provisioned without an
   * account, and one-time tiers have no public provisioning path. Redirect URLs
   * are always server-derived (never caller-supplied — open-redirect guard).
   */
  router.post("/public/companies/:companyId/stripe/checkout", async (req, res) => {
    if (!checkoutLimiter.check(clientIp(req))) {
      return res.status(429).json({ error: "Too many requests — try again later" });
    }

    const { companyId } = req.params as { companyId: string };
    if (!UUID_RE.test(companyId)) throw notFound("Company not found");

    const { tierName } = req.body as { tierName?: string };
    if (!tierName || typeof tierName !== "string") {
      throw unprocessable("tierName is required");
    }

    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) throw notFound("Company not found");

    const [priceRow] = await db
      .select()
      .from(stripePrices)
      .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.tierName, tierName), eq(stripePrices.isActive, 1)))
      .limit(1);
    if (!priceRow) throw notFound("Plan not found");

    if (priceRow.amount === 0) {
      throw unprocessable("This plan requires an account — sign in or contact the company to join");
    }
    if (priceRow.interval === "one_time") {
      throw unprocessable("This plan is not available for online purchase");
    }

    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      res.status(503).json({ error: "Payments are not available right now" });
      return;
    }

    const appUrl = process.env.APP_URL ?? "https://amx-air-hubs.cc";
    const storefrontUrl = `${appUrl}/hub/${companyId}/pricing`;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceRow.stripePriceId, quantity: 1 }],
        // No userId here — the buyer has no account. The webhook resolves the
        // identity from the checkout email (email:<address>) on completion.
        metadata: { companyId, tierName, source: "public_storefront" },
        subscription_data: { metadata: { companyId, tierName } },
        success_url: `${storefrontUrl}?checkout=success&tier=${encodeURIComponent(tierName)}`,
        cancel_url: `${storefrontUrl}?checkout=canceled`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error("[stripe public checkout] session create failed", err);
      res.status(500).json({ error: "Could not start checkout — try again later" });
    }
  });

  return router;
}
