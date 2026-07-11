import { Router } from "express";
import Stripe from "stripe";
import type { Db } from "@paperclipai/db";
import { stripePrices, amxGlobalLedger, amxTransactions, companies, stripeProcessedEvents } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";
import { CREDIT_PACKAGES, CREDIT_PACKAGE_AMOUNTS } from "@paperclipai/shared";
import { provisionMember, cancelMember, TIER_MEMBER_TYPES, getPriceForTier } from "../services/stripeProvisioningService.js";
import { assertCompanyAccess, assertCompanyRole, assertInstanceAdmin, getActorInfo } from "./authz.js";
import { logActivity } from "../services/index.js";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

// 16 TECH AT NITE tiers — (name, amount in cents, interval)
const CATALOG_TIERS: Array<{ name: string; amount: number; interval: "month" | "year" | "week" | "one_time"; description: string }> = [
  // Core progression tiers
  { name: "learner",           amount: 1900,  interval: "month",    description: "Access core workshops and learning modules" },
  { name: "builder",           amount: 3900,  interval: "month",    description: "Builder track: all learner perks plus project labs" },
  { name: "ambassador",        amount: 6900,  interval: "month",    description: "Ambassador track: community leadership tools" },
  { name: "earner",            amount: 9900,  interval: "month",    description: "Earner track: marketplace access and gig tools" },
  { name: "parent",            amount: 1500,  interval: "month",    description: "Parent portal: monitor linked learner progress" },
  { name: "community",         amount: 500,   interval: "month",    description: "Community member access" },
  { name: "volunteer",         amount: 0,     interval: "month",    description: "Volunteer access (complimentary)" },
  { name: "sponsor",           amount: 50000, interval: "year",     description: "Annual sponsorship tier" },
  { name: "donor",             amount: 25000, interval: "year",     description: "Annual donor membership" },
  // New weekly + drop-in tiers
  { name: "dropin_pass",       amount: 2500,  interval: "one_time", description: "Single-session drop-in access pass" },
  { name: "member_weekly",     amount: 2500,  interval: "week",     description: "Week-to-week member access" },
  { name: "access_hub",        amount: 10000, interval: "week",     description: "Access Hub — premium weekly, all sessions + agent copilot" },
  // Partner tiers
  { name: "partner_free",      amount: 0,     interval: "month",    description: "Skill Provider free entry — marketplace listing + revenue share" },
  { name: "partner_pro",       amount: 4900,  interval: "month",    description: "Skill Provider Pro — featured listing + full analytics" },
  // Org tiers
  { name: "nonprofit_baseline",amount: 900,   interval: "month",    description: "Non-profit baseline — LMS + grant reporting" },
  { name: "business_micro",    amount: 2900,  interval: "month",    description: "Micro-business professional development" },
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
   * Creates a Stripe Product+Price for each of the CATALOG_TIERS (16 tiers)
   * and stores the price IDs in the stripePrices table. Safe to re-run —
   * existing active prices for a tier are skipped.
   */
  router.post("/companies/:companyId/stripe/seed-catalog", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    // Creating a company's Stripe product catalog is an admin-level action,
    // scoped to that company — never allow it against an arbitrary companyId.
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");

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
        ...(tier.amount > 0 && tier.interval !== "one_time"
          ? { recurring: { interval: tier.interval as "month" | "year" | "week" } }
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
   * POST /companies/:companyId/stripe/custom-tier
   * Creates ONE Stripe Product+Price for a tenant-specific tier that doesn't
   * belong in the shared CATALOG_TIERS list (e.g. a seat-based pricing model
   * unique to one company) and stores it in stripePrices, exactly like
   * seed-catalog does per-tier — just parameterized instead of hardcoded.
   * Idempotent per (companyId, tierName): re-posting the same tierName
   * returns the existing active price rather than creating a duplicate.
   */
  router.post("/companies/:companyId/stripe/custom-tier", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");

    const { tierName, name, description, amount, interval, seats, imageUrl, features } = req.body as {
      tierName?: string;
      name?: string;
      description?: string;
      amount?: number;
      interval?: "month" | "year" | "week" | "one_time";
      seats?: number;
      imageUrl?: string;
      features?: string[];
    };

    if (!tierName || !/^[a-z0-9_]+$/.test(tierName)) {
      res.status(422).json({ error: "tierName is required and must be lowercase snake_case" });
      return;
    }
    if (!name || !name.trim()) {
      res.status(422).json({ error: "name is required" });
      return;
    }
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
      res.status(422).json({ error: "amount (cents, integer) is required" });
      return;
    }
    const VALID_INTERVALS = ["month", "year", "week", "one_time"] as const;
    if (!interval || !VALID_INTERVALS.includes(interval)) {
      res.status(422).json({ error: `interval must be one of: ${VALID_INTERVALS.join(", ")}` });
      return;
    }
    if (seats !== undefined && (!Number.isInteger(seats) || seats < 1)) {
      res.status(422).json({ error: "seats must be a positive integer when provided" });
      return;
    }
    if (imageUrl !== undefined && !/^https:\/\//.test(imageUrl)) {
      res.status(422).json({ error: "imageUrl must be an https URL when provided" });
      return;
    }
    // Stripe allows at most 15 marketing features per product, 80 chars each.
    if (features !== undefined) {
      const valid =
        Array.isArray(features) &&
        features.length <= 15 &&
        features.every((f) => typeof f === "string" && f.trim().length > 0 && f.length <= 80);
      if (!valid) {
        res.status(422).json({ error: "features must be an array of up to 15 non-empty strings (max 80 chars each)" });
        return;
      }
    }

    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      res.status(503).json({ error: "Stripe not configured — set STRIPE_SECRET_KEY" });
      return;
    }

    const existing = await db
      .select({ stripePriceId: stripePrices.stripePriceId })
      .from(stripePrices)
      .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.tierName, tierName), eq(stripePrices.isActive, 1)))
      .limit(1);

    if (existing.length > 0) {
      res.json({ tier: tierName, priceId: existing[0]!.stripePriceId, skipped: true });
      return;
    }

    const product = await stripe.products.create({
      name,
      description: description || undefined,
      ...(imageUrl ? { images: [imageUrl] } : {}),
      ...(features?.length ? { marketing_features: features.map((f) => ({ name: f.trim() })) } : {}),
      metadata: { tierName, companyId, ...(seats !== undefined ? { seats: String(seats) } : {}) },
    });

    const priceData: Stripe.PriceCreateParams = {
      product: product.id,
      currency: "usd",
      unit_amount: amount,
      metadata: { tierName, companyId, ...(seats !== undefined ? { seats: String(seats) } : {}) },
      ...(amount > 0 && interval !== "one_time" ? { recurring: { interval } } : {}),
    };
    const price = await stripe.prices.create(priceData);

    await db.insert(stripePrices).values({
      companyId,
      tierName,
      stripeProductId: product.id,
      stripePriceId: price.id,
      currency: "usd",
      amount,
      interval,
      isActive: 1,
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.stripe_custom_tier_created",
      entityType: "company",
      entityId: companyId,
      details: { tierName, name, amount, interval, seats },
    });

    res.status(201).json({ tier: tierName, productId: product.id, priceId: price.id, amount, interval, seats: seats ?? null });
  });

  /**
   * POST /companies/:companyId/stripe/tiers/:tierName/deactivate
   * Marks every stripePrices row for (companyId, tierName) inactive. Used when
   * a tier's prices move to a different Stripe account (the old price IDs
   * become invalid under the new key) or a tier is retired — clears the way
   * for custom-tier's idempotency check to create a fresh price. Does NOT
   * touch Stripe itself: existing subscriptions on the old price keep billing.
   */
  router.post("/companies/:companyId/stripe/tiers/:tierName/deactivate", async (req, res) => {
    const { companyId, tierName } = req.params as { companyId: string; tierName: string };
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");

    const deactivated = await db
      .update(stripePrices)
      .set({ isActive: 0 })
      .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.tierName, tierName), eq(stripePrices.isActive, 1)))
      .returning({ stripePriceId: stripePrices.stripePriceId });

    if (deactivated.length > 0) {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.stripe_tier_deactivated",
        entityType: "company",
        entityId: companyId,
        details: { tierName, priceIds: deactivated.map((r) => r.stripePriceId) },
      });
    }

    res.json({ tier: tierName, deactivated: deactivated.length });
  });

  /**
   * POST /companies/:companyId/stripe/seed-credit-packages
   * Creates 4 one-time Stripe products for SIMS credit bundles.
   * Safe to re-run — existing entries are skipped.
   */
  // Canonical pack definitions live in @paperclipai/shared (credits.ts) —
  // adapt to the {name, credits, amount} shape this seeder uses.
  const creditPackageSeeds = CREDIT_PACKAGES.map((p) => ({
    name: p.tierName,
    credits: p.credits,
    amount: p.amountCents,
  }));

  router.post("/companies/:companyId/stripe/seed-credit-packages", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");

    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      res.status(503).json({ error: "Stripe not configured — set STRIPE_SECRET_KEY" });
      return;
    }

    const results: Array<{ tier: string; priceId: string; skipped?: boolean }> = [];

    for (const pkg of creditPackageSeeds) {
      const existing = await db.select({ stripePriceId: stripePrices.stripePriceId })
        .from(stripePrices)
        .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.tierName, pkg.name), eq(stripePrices.isActive, 1)))
        .limit(1);

      if (existing.length > 0) {
        results.push({ tier: pkg.name, priceId: existing[0]!.stripePriceId, skipped: true });
        continue;
      }

      const product = await stripe.products.create({
        name: `SIMS Credits — ${pkg.credits.toLocaleString()}`,
        metadata: { tierName: pkg.name, companyId, creditAmount: String(pkg.credits) },
      });

      const price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: pkg.amount,
        metadata: { tierName: pkg.name, companyId },
      });

      await db.insert(stripePrices).values({
        companyId,
        tierName: pkg.name,
        stripeProductId: product.id,
        stripePriceId: price.id,
        currency: "usd",
        amount: pkg.amount,
        interval: "one_time",
        isActive: 1,
      });

      results.push({ tier: pkg.name, priceId: price.id });
    }

    res.json({ seeded: results.length, results });
  });

  /**
   * POST /stripe/provision-tenant
   * Creates a new company row (idempotent by issuePrefix) and optionally seeds the Stripe catalog.
   * Body: { name, issuePrefix, description?, seedStripe? }
   */
  router.post("/stripe/provision-tenant", async (req, res) => {
    // Minting a brand-new tenant company is an instance-level action — not
    // something any company-scoped board user may do.
    assertInstanceAdmin(req);
    const { name, issuePrefix, description, seedStripe } = req.body as {
      name: string;
      issuePrefix: string;
      description?: string;
      seedStripe?: boolean;
    };

    if (!name || !issuePrefix) {
      res.status(400).json({ error: "name and issuePrefix are required" });
      return;
    }

    // Idempotent — return existing if already provisioned
    const [existing] = await db.select({ id: companies.id, issuePrefix: companies.issuePrefix })
      .from(companies)
      .where(eq(companies.issuePrefix, issuePrefix.toUpperCase()))
      .limit(1);

    if (existing) {
      res.json({ companyId: existing.id, issuePrefix: existing.issuePrefix, created: false });
      return;
    }

    const [created] = await db.insert(companies).values({
      name,
      description: description ?? null,
      issuePrefix: issuePrefix.toUpperCase(),
      status: "active",
    }).returning({ id: companies.id });

    if (!created) {
      res.status(500).json({ error: "Failed to create company" });
      return;
    }

    const result: { companyId: string; issuePrefix: string; created: boolean; catalogSeeded?: boolean; catalogError?: string } = {
      companyId: created.id,
      issuePrefix: issuePrefix.toUpperCase(),
      created: true,
    };

    if (seedStripe) {
      try {
        const stripe = getStripe();
        for (const tier of CATALOG_TIERS) {
          const product = await stripe.products.create({
            name: `TECH AT NITE — ${tier.name.charAt(0).toUpperCase() + tier.name.slice(1)}`,
            description: tier.description,
            metadata: { tierName: tier.name, companyId: created.id },
          });
          const price = await stripe.prices.create({
            product: product.id,
            currency: "usd",
            unit_amount: tier.amount,
            metadata: { tierName: tier.name, companyId: created.id },
            ...(tier.amount > 0 && tier.interval !== "one_time" ? { recurring: { interval: tier.interval as "month" | "year" | "week" } } : {}),
          });
          await db.insert(stripePrices).values({
            companyId: created.id,
            tierName: tier.name,
            stripeProductId: product.id,
            stripePriceId: price.id,
            currency: "usd",
            amount: tier.amount,
            interval: tier.interval,
            isActive: 1,
          });
        }
        result.catalogSeeded = true;
      } catch (err) {
        result.catalogSeeded = false;
        result.catalogError = err instanceof Error ? err.message : "Stripe error";
      }
    }

    res.status(201).json(result);
  });

  /**
   * GET /companies/:companyId/stripe/prices
   * Lists all active prices for this company with checkout URLs.
   */
  router.get("/companies/:companyId/stripe/prices", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
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

  /**
   * POST /companies/:companyId/stripe/checkout
   * Creates a Stripe Checkout Session and returns { url } to redirect the user.
   * For free tiers (amount=0), provisions the member directly and returns { url: null, provisioned: true }.
   *
   * Body: { tierName, userId, successUrl?, cancelUrl? }
   */
  router.post("/companies/:companyId/stripe/checkout", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    // Checkout provisions membership within this company (including the free
    // path, which writes directly) — require company access + member role so
    // it can't be driven against another tenant's companyId.
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "member");
    const { tierName, userId, successUrl, cancelUrl } = req.body as {
      tierName: string;
      userId: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    if (!tierName || !userId) {
      res.status(400).json({ error: "tierName and userId are required" });
      return;
    }

    const priceRow = await getPriceForTier(db, companyId, tierName);
    if (!priceRow) {
      res.status(404).json({ error: `No active price for tier "${tierName}". Run seed-catalog first.` });
      return;
    }

    // Free tier — provision directly, no payment needed. The synthetic
    // subscription id is deterministic (no timestamp) so repeat checkouts
    // hit provisionMember's upsert-by-subscription-id path instead of
    // inserting a duplicate row and re-awarding tier credits each click.
    if (priceRow.amount === 0) {
      await provisionMember(db, {
        companyId,
        userId,
        tierName,
        stripeCustomerId: "free-direct",
        stripeSubscriptionId: `free-${companyId}-${userId}-${tierName}`,
        stripePriceId: priceRow.stripePriceId,
        status: "active",
      });
      res.json({ url: null, provisioned: true, tier: tierName });
      return;
    }

    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      res.status(503).json({ error: "Stripe not configured — set STRIPE_SECRET_KEY" });
      return;
    }

    const appUrl = process.env.APP_URL ?? "https://amx-air-hubs.cc";
    const resolvedSuccessUrl = successUrl ?? `${appUrl}?checkout=success&tier=${encodeURIComponent(tierName)}`;
    const resolvedCancelUrl = cancelUrl ?? `${appUrl}?checkout=canceled`;

    // Credit packages use one-time payment mode and carry creditAmount in metadata
    const isOneTime = priceRow.interval === "one_time";
    const creditAmount = CREDIT_PACKAGE_AMOUNTS[tierName];

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: isOneTime ? "payment" : "subscription",
      line_items: [{ price: priceRow.stripePriceId, quantity: 1 }],
      metadata: {
        companyId,
        userId,
        tierName,
        ...(creditAmount != null ? { creditAmount: String(creditAmount), packageTier: tierName } : {}),
      },
      client_reference_id: userId,
      success_url: resolvedSuccessUrl,
      cancel_url: resolvedCancelUrl,
    };

    try {
      const session = await stripe.checkout.sessions.create(sessionParams);
      res.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe error";
      res.status(500).json({ error: msg });
    }
  });

  return router;
}

/** Reads current_period_end across Stripe API versions: on 2026-05-27+ it
 * lives on the subscription item, not the subscription object. Returns null
 * when absent so we never persist an Invalid Date. */
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const itemEnd = (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  const topEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const epoch = itemEnd ?? topEnd;
  return typeof epoch === "number" && Number.isFinite(epoch) ? new Date(epoch * 1000) : null;
}

async function handleStripeEvent(db: Db, event: Stripe.Event): Promise<void> {
  // Idempotency: Stripe delivers events at-least-once. Record the event id
  // first; if it's already present, this is a redelivery — skip it so credit
  // awards and ledger writes never double-apply.
  const inserted = await db
    .insert(stripeProcessedEvents)
    .values({ eventId: event.id, eventType: event.type })
    .onConflictDoNothing()
    .returning({ eventId: stripeProcessedEvents.eventId });
  if (inserted.length === 0) {
    console.warn("[stripe] duplicate event ignored", event.id, event.type);
    return;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.metadata?.companyId;
      // Public storefront checkouts (stripe-public.ts) carry no userId — the
      // buyer has no account. Fall back to the email Stripe collected at
      // checkout, namespaced so it can't collide with real user ids.
      const checkoutEmail = session.customer_details?.email?.trim().toLowerCase() ?? null;
      const userId =
        session.metadata?.userId ?? session.client_reference_id ?? (checkoutEmail ? `email:${checkoutEmail}` : null);

      // One-time credit purchase — metadata.creditAmount present. Purchased
      // credits land in the GLOBAL ledger so they're spendable in any company.
      if (session.metadata?.creditAmount) {
        const creditAmount = parseInt(session.metadata.creditAmount, 10);
        const principalId = session.metadata?.principalId ?? userId;
        if (companyId && principalId && creditAmount > 0) {
          await db.insert(amxTransactions).values({
            fromCompanyId: companyId,
            toCompanyId: companyId,
            fromPrincipalType: "system",
            fromPrincipalId: "stripe-checkout",
            toPrincipalType: "user",
            toPrincipalId: principalId,
            amount: creditAmount,
            currency: "CREDIT",
            transactionType: "credit_purchase",
            status: "completed",
            metadata: { packageTier: session.metadata?.packageTier, stripeSessionId: session.id, scope: "global" },
          });

          const [existing] = await db.select().from(amxGlobalLedger)
            .where(and(eq(amxGlobalLedger.principalType, "user"), eq(amxGlobalLedger.principalId, principalId)));

          if (existing) {
            await db.update(amxGlobalLedger)
              .set({ creditBalance: existing.creditBalance + creditAmount, updatedAt: new Date() })
              .where(and(eq(amxGlobalLedger.principalType, "user"), eq(amxGlobalLedger.principalId, principalId)));
          } else {
            await db.insert(amxGlobalLedger).values({
              principalType: "user",
              principalId,
              creditBalance: creditAmount,
              tokenBalance: 0,
            });
          }
        }
        break;
      }

      // Subscription checkout flow
      if (session.mode !== "subscription") break;
      const tierName = session.metadata?.tierName;
      if (!companyId || !userId || !tierName) {
        console.warn("[stripe] checkout.session.completed missing metadata", session.id);
        break;
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
        currentPeriodEnd: subscriptionPeriodEnd(sub) ?? undefined,
      });
      // The subscription.updated handler needs companyId/userId/tierName on
      // the SUBSCRIPTION's metadata (checkout-session metadata doesn't carry
      // over). Stamp them now so later status changes (past_due, renewals)
      // keep flowing through provisionMember. Best-effort — provisioning
      // above already succeeded.
      if (!sub.metadata?.userId) {
        await stripe.subscriptions
          .update(subscriptionId, { metadata: { ...sub.metadata, companyId, userId, tierName } })
          .catch((err) => console.warn("[stripe] failed to stamp subscription metadata", subscriptionId, err));
      }
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
        currentPeriodEnd: subscriptionPeriodEnd(sub) ?? undefined,
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
