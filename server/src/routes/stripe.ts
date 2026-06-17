import { Router } from "express";
import Stripe from "stripe";
import type { Db } from "@paperclipai/db";
import { stripePrices } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";
import { provisionMember, cancelMember, TIER_MEMBER_TYPES } from "../services/stripeProvisioningService.js";
import type { Request as ExpressRequest } from "express";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

// 9 TECH AT NITE tiers — (name, amount in cents, interval)
const CATALOG_TIERS: Array<{ name: string; amount: number; interval: "month" | "year"; description: string }> = [
  { name: "learner",    amount: 1900,  interval: "month", description: "Access core workshops and learning modules" },
  { name: "builder",    amount: 3900,  interval: "month", description: "Builder track: all learner perks plus project labs" },
  { name: "ambassador", amount: 6900,  interval: "month", description: "Ambassador track: community leadership tools" },
  { name: "earner",     amount: 9900,  interval: "month", description: "Earner track: marketplace access and gig tools" },
  { name: "parent",     amount: 1500,  interval: "month", description: "Parent portal: monitor linked learner progress" },
  { name: "community",  amount: 500,   interval: "month", description: "Community member access" },
  { name: "volunteer",  amount: 0,     interval: "month", description: "Volunteer access (complimentary)" },
  { name: "sponsor",    amount: 50000, interval: "year",  description: "Annual sponsorship tier" },
  { name: "donor",      amount: 25000, interval: "year",  description: "Annual donor membership" },
];

/**
 * Webhook handler — mounted directly on app at /stripe (bypasses api boardMutationGuard).
 * Uses req.rawBody stashed by express.json verify callback.
 */
export function stripeWebhookRoutes(db: Db): Router {
  const router = Router();

  router.post("/webhook", async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not configured" });
      return;
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Signature verification failed";
      res.status(400).json({ error: msg });
      return;
    }

    try {
      await handleStripeEvent(db, event);
      res.json({ received: true });
    } catch (err) {
      console.error("[stripe webhook] handler error", err);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  return router;
}

/**
 * Admin API routes — mounted inside the api Router at /api.
 * Requires board authentication (enforced by the api router's boardMutationGuard).
 */
export function stripeApiRoutes(db: Db): Router {
  const router = Router();

  /**
   * POST /companies/:companyId/stripe/seed-catalog
   * Creates all 9 Stripe Products+Prices and stores price IDs in stripePrices table.
   * Safe to re-run — existing active prices are skipped.
   */
  router.post("/companies/:companyId/stripe/seed-catalog", async (req, res) => {
    const { companyId } = req.params as { companyId: string };

    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      res.status(503).json({ error: "Stripe not configured — set STRIPE_SECRET_KEY" });
      return;
    }

    const results: Array<{ tier: string; productId: string; priceId: string; skipped?: boolean }> = [];

    for (const tier of CATALOG_TIERS) {
      // Check if already seeded for this company+tier
      const existing = await db
        .select({ stripePriceId: stripePrices.stripePriceId })
        .from(stripePrices)
        .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.tierName, tier.name), eq(stripePrices.isActive, 1)))
        .limit(1);

      if (existing.length > 0) {
        results.push({ tier: tier.name, productId: "", priceId: existing[0]!.stripePriceId, skipped: true });
        continue;
      }

      const product = await stripe.products.create({
        name: `TECH AT NITE — ${tier.name.charAt(0).toUpperCase() + tier.name.slice(1)}`,
        description: tier.description,
        metadata: { tierName: tier.name, companyId },
      });

      const priceData: Stripe.PriceCreateParams = {
        product: product.id,
        currency: "usd",
        unit_amount: tier.amount,
        metadata: { tierName: tier.name, companyId },
        ...(tier.amount > 0
          ? { recurring: { interval: tier.interval } }
          : {}),
      };

      const price = await stripe.prices.create(priceData);

      await db.insert(stripePrices).values({
        companyId,
        tierName: tier.name,
        stripeProductId: product.id,
        stripePriceId: price.id,
        currency: "usd",
        amount: tier.amount,
        interval: tier.interval,
        isActive: 1,
      });

      results.push({ tier: tier.name, productId: product.id, priceId: price.id });
    }

    res.json({ seeded: results.length, results });
  });

  /**
   * GET /companies/:companyId/stripe/prices
   * Lists all active prices for this company with checkout URLs.
   */
  router.get("/companies/:companyId/stripe/prices", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    const rows = await db
      .select()
      .from(stripePrices)
      .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.isActive, 1)));

    res.json({
      prices: rows.map((r) => ({
        tier: r.tierName,
        priceId: r.stripePriceId,
        amount: r.amount,
        interval: r.interval,
        memberTypes: TIER_MEMBER_TYPES[r.tierName] ?? [r.tierName],
      })),
    });
  });

  return router;
}

async function handleStripeEvent(db: Db, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;
      const companyId = session.metadata?.companyId;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      const tierName = session.metadata?.tierName;
      if (!companyId || !userId || !tierName) {
        console.warn("[stripe] checkout.session.completed missing metadata", session.id);
        return;
      }
      const subscriptionId = session.subscription as string;
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price.id ?? "";
      await provisionMember(db, {
        companyId,
        userId,
        tierName,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        status: sub.status,
        currentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000),
      });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = sub.metadata?.companyId;
      const userId = sub.metadata?.userId;
      const tierName = sub.metadata?.tierName;
      if (!companyId || !userId || !tierName) return;
      const priceId = sub.items.data[0]?.price.id ?? "";
      await provisionMember(db, {
        companyId,
        userId,
        tierName,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        status: sub.status,
        currentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000),
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await cancelMember(db, sub.id);
      break;
    }

    default:
      break;
  }
}
