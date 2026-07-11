import { Router } from "express";
import Stripe from "stripe";
import type { Db } from "@paperclipai/db";
import {
  amxChainEvents, amxCertificates, agents, issues,
  lmsMarketplaceListings, amxLedger, amxTransactions,
  lmsMemberProfiles, lmsLearnerBadges, lmsBadgeDefinitions, stripePrices, companies,
  rqSubmissions,
} from "@paperclipai/db";
import { amxChainService } from "../services/amxChainService.js";
import { rqPortalService } from "../services/rqPortalService.js";
import { financeService } from "../services/finance.js";
import { assertCompanyAccess, assertCompanyRole, getActorInfo } from "./authz.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { eq, desc, and, or, inArray } from "drizzle-orm";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

import {
  CREDIT_PACKAGE_AMOUNTS,
  RQ_TIERS,
  RQ_ESCROW_PRINCIPAL_ID,
  MICRO_SERVICES,
  resolveRqTier,
  type MicroServiceKey,
} from "@paperclipai/shared";
import { spendCredits, refundCredits, InsufficientCreditsError } from "../services/creditWallet.js";
import { renderCertificatePdf } from "../services/pdf-export.js";

const submitRqSchema = z.object({
  // Exactly one of tier / serviceKey must be present — enforced in the route
  // handler (422) so the error is actionable rather than a generic zod 400.
  // Canonical tier slugs plus the legacy aliases older clients still send.
  tier: z.enum([
    "digital_foundation", "hybrid_growth", "metaverse_enterprise",
    "starter", "pro", "enterprise",
  ]).optional(),
  // Micro-service key (see MICRO_SERVICES) — validated against the catalog
  // in the handler.
  serviceKey: z.string().optional(),
  contextData: z.object({
    userContext: z.string().optional(),
    domainContext: z.string().optional(),
    institutionalMemory: z.string().optional(),
  }),
  deploymentMode: z.enum(["cloud", "on-prem", "hybrid"]),
  // Previously absent from this schema, so zod silently STRIPPED the flag the
  // UI was sending and every submission was forced into simulation mode.
  isSimulation: z.boolean().optional(),
});

export function amxRoutes(db: Db) {
  const router = Router();
  const chainSvc = amxChainService(db);
  const rqSvc = rqPortalService(db);
  const financeSvc = financeService(db);

  /**
   * GET /api/companies/:companyId/amx/exchange
   * Returns marketplace earners and stats.
   */
  router.get("/companies/:companyId/amx/exchange", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const listings = await db.select().from(lmsMarketplaceListings)
      .where(and(eq(lmsMarketplaceListings.companyId, companyId), eq(lmsMarketplaceListings.isActive, 1)))
      .orderBy(desc(lmsMarketplaceListings.createdAt));

    const earners = listings.map(l => ({
      id: l.id,
      name: l.displayName,
      title: l.title,
      bio: l.bio ?? "",
      skills: (l.skills as string[]) ?? [],
      rating: l.rating / 10,
      reviews: l.reviewCount,
      projects: l.projectsCompleted,
      badges: 0,
      rate: l.hourlyRateSims,
      location: l.availability === "available" ? "Available Now" : l.availability === "on_project" ? "On Project" : "Busy",
      status: l.availability === "available" ? "Available Now" : "On Project",
    }));

    const availableEarners = listings.filter(l => l.availability === "available").length;
    const totalProjects = listings.reduce((sum, l) => sum + l.projectsCompleted, 0);
    const avgRating = listings.length > 0
      ? Math.round(listings.reduce((sum, l) => sum + l.rating, 0) / listings.length) / 10
      : 0;

    res.json({
      earners,
      stats: { availableEarners, projectsCompleted: totalProjects, averageRating: avgRating },
    });
  });

  /**
   * GET /api/companies/:companyId/amx/wallet
   * Returns real ledger balances, transactions, engagement score, and badges.
   */
  router.get("/companies/:companyId/amx/wallet", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const [ledger] = await db.select().from(amxLedger)
      .where(and(eq(amxLedger.companyId, companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, actorId)))
      .limit(1);

    const transactions = await db.select().from(amxTransactions)
      .where(and(
        or(
          and(eq(amxTransactions.fromPrincipalId, actorId), eq(amxTransactions.fromCompanyId, companyId)),
          and(eq(amxTransactions.toPrincipalId, actorId), eq(amxTransactions.toCompanyId, companyId)),
        )
      ))
      .orderBy(desc(amxTransactions.occurredAt))
      .limit(20);

    const [profile] = await db
      .select({ engagementScore: lmsMemberProfiles.engagementScore })
      .from(lmsMemberProfiles)
      .where(and(eq(lmsMemberProfiles.companyId, companyId), eq(lmsMemberProfiles.userId, actorId)))
      .limit(1);

    const badges = await db
      .select({
        id: lmsLearnerBadges.id,
        name: lmsBadgeDefinitions.name,
        category: lmsBadgeDefinitions.category,
        iconUrl: lmsBadgeDefinitions.iconUrl,
        awardedAt: lmsLearnerBadges.awardedAt,
      })
      .from(lmsLearnerBadges)
      .innerJoin(lmsBadgeDefinitions, eq(lmsLearnerBadges.badgeDefinitionId, lmsBadgeDefinitions.id))
      .where(and(eq(lmsLearnerBadges.companyId, companyId), eq(lmsLearnerBadges.memberId, actorId)));

    res.json({
      creditBalance: ledger?.creditBalance ?? 0,
      tokenBalance: ledger?.tokenBalance ?? 0,
      engagementScore: profile?.engagementScore ?? 0,
      badges: badges.map(b => ({ ...b, awardedAt: b.awardedAt.toISOString() })),
      transactions: transactions.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        currency: tx.currency,
        transactionType: tx.transactionType,
        fromPrincipalId: tx.fromPrincipalId,
        toPrincipalId: tx.toPrincipalId,
        status: tx.status,
        occurredAt: tx.occurredAt.toISOString(),
        metadata: tx.metadata ?? null,
      })),
    });
  });

  /**
   * POST /api/companies/:companyId/amx/buy-credits
   * Creates a Stripe Checkout session for a one-time credit package purchase.
   */
  const buyCreditsSchema = z.object({
    packageTier: z.enum(["credits_starter", "credits_pro", "credits_enterprise", "credits_scale"]),
    principalId: z.string().min(1),
  });

  router.post("/companies/:companyId/amx/buy-credits", validate(buyCreditsSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { packageTier, principalId } = req.body as z.infer<typeof buyCreditsSchema>;

    let stripe: Stripe;
    try {
      stripe = getStripe();
    } catch {
      res.status(503).json({ error: "Stripe not configured — set STRIPE_SECRET_KEY" });
      return;
    }

    const [price] = await db.select().from(stripePrices)
      .where(and(
        eq(stripePrices.companyId, companyId),
        eq(stripePrices.tierName, packageTier),
        eq(stripePrices.isActive, 1),
        eq(stripePrices.interval, "one_time"),
      ))
      .limit(1);

    if (!price) {
      res.status(404).json({ error: "Credit package not found — run POST /stripe/seed-credit-packages first" });
      return;
    }

    const creditAmount = CREDIT_PACKAGE_AMOUNTS[packageTier] ?? 0;
    const publicUrl = process.env.PAPERCLIP_PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;

    // Routes are company-prefixed (e.g. /AMXA/xp/wallet); build the return URL with the prefix.
    const [company] = await db.select({ issuePrefix: companies.issuePrefix })
      .from(companies).where(eq(companies.id, companyId)).limit(1);
    const walletPath = company?.issuePrefix ? `/${company.issuePrefix}/xp/wallet` : "/xp/wallet";

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: price.stripePriceId, quantity: 1 }],
        metadata: { companyId, principalId, packageTier, creditAmount: String(creditAmount) },
        success_url: `${publicUrl}${walletPath}?payment=success`,
        cancel_url: `${publicUrl}${walletPath}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Stripe error";
      res.status(502).json({ error: `Stripe checkout failed: ${msg}` });
      return;
    }

    res.json({ checkoutUrl: session.url });
  });

  /**
   * GET /api/companies/:companyId/amx/chain
   * Returns real amx_chain_events as ledger logs (no certificates — moved to /amx/certificates).
   */
  router.get("/companies/:companyId/amx/chain", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const events = await db
      .select()
      .from(amxChainEvents)
      .where(eq(amxChainEvents.companyId, companyId))
      .orderBy(desc(amxChainEvents.createdAt))
      .limit(50);

    // Batch-resolve agent names for principalType === "agent"
    const agentIds = [...new Set(
      events.filter((e) => e.principalType === "agent").map((e) => e.principalId),
    )];
    const agentNameMap: Record<string, string> = {};
    if (agentIds.length > 0) {
      const rows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(inArray(agents.id, agentIds));
      for (const row of rows) agentNameMap[row.id] = row.name;
    }

    const logs = events.map((e) => ({
      id: e.id,
      action: e.action,
      principal: e.principalType === "agent" ? (agentNameMap[e.principalId] ?? e.principalId) : e.principalId,
      status: "VERIFIED",
      hash: e.signature.length > 20 ? `${e.signature.slice(0, 20)}...` : e.signature,
      timestamp: e.createdAt.toISOString(),
    }));

    res.json({ logs });
  });

  /**
   * GET /api/companies/:companyId/amx/certificates
   * Returns real amxCertificates for the company.
   */
  router.get("/companies/:companyId/amx/certificates", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const certs = await db
      .select({
        id: amxCertificates.id,
        companyId: amxCertificates.companyId,
        issueId: amxCertificates.issueId,
        taskId: amxCertificates.taskId,
        responsiblePrincipalId: amxCertificates.responsiblePrincipalId,
        commitHashes: amxCertificates.commitHashes,
        taskLogsSummary: amxCertificates.taskLogsSummary,
        completionTimeMs: amxCertificates.completionTimeMs,
        finalCostTokens: amxCertificates.finalCostTokens,
        projects: amxCertificates.projects,
        resources: amxCertificates.resources,
        reports: amxCertificates.reports,
        certificateFootprint: amxCertificates.certificateFootprint,
        status: amxCertificates.status,
        issuedAt: amxCertificates.issuedAt,
        expiresAt: amxCertificates.expiresAt,
        issueIdentifier: issues.identifier,
      })
      .from(amxCertificates)
      .leftJoin(issues, eq(amxCertificates.issueId, issues.id))
      .where(eq(amxCertificates.companyId, companyId))
      .orderBy(desc(amxCertificates.issuedAt));

    // Best-effort resolve principal names from agents table
    const principalIds = [...new Set(certs.map((c) => c.responsiblePrincipalId))];
    const principalNameMap: Record<string, string> = {};
    if (principalIds.length > 0) {
      const rows = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(inArray(agents.id, principalIds));
      for (const row of rows) principalNameMap[row.id] = row.name;
    }

    const result = certs.map((c) => ({
      ...c,
      issuedAt: c.issuedAt.toISOString(),
      expiresAt: c.expiresAt?.toISOString() ?? null,
      responsiblePrincipalName: principalNameMap[c.responsiblePrincipalId] ?? null,
    }));

    res.json(result);
  });

  /**
   * GET /api/companies/:companyId/amx/certificates/:id/pdf
   * Streams a certificate PDF with embedded QR verify link.
   */
  router.get("/companies/:companyId/amx/certificates/:id/pdf", async (req, res) => {
    const { companyId, id } = req.params;
    assertCompanyAccess(req, companyId);

    const [cert] = await db
      .select()
      .from(amxCertificates)
      .where(and(eq(amxCertificates.id, id), eq(amxCertificates.companyId, companyId)))
      .limit(1);

    if (!cert) {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }

    // Best-effort resolve principal name
    let responsiblePrincipalName: string | null = null;
    const [agentRow] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, cert.responsiblePrincipalId))
      .limit(1);
    if (agentRow) responsiblePrincipalName = agentRow.name;

    const verifyUrl = `${req.protocol}://${req.get("host")}/api/certificates/verify/${cert.certificateFootprint}`;

    await renderCertificatePdf(
      res,
      {
        id: cert.id,
        certificateFootprint: cert.certificateFootprint,
        status: cert.status,
        responsiblePrincipalId: cert.responsiblePrincipalId,
        responsiblePrincipalName,
        completionTimeMs: cert.completionTimeMs,
        finalCostTokens: cert.finalCostTokens,
        commitHashes: cert.commitHashes,
        projects: cert.projects,
        resources: cert.resources,
        reports: cert.reports,
        issuedAt: cert.issuedAt,
      },
      verifyUrl,
    );
  });

  /**
   * GET /api/companies/:companyId/amx/rq-catalog
   * Returns the full RQ Factory offering: the three big tiers plus the
   * on-demand micro-service menu, all priced in credits. The UI renders
   * this instead of hardcoding the catalog client-side.
   */
  router.get("/companies/:companyId/amx/rq-catalog", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    res.json({
      tiers: Object.entries(RQ_TIERS).map(([key, t]) => ({
        key,
        label: t.label,
        creditCost: t.creditCost,
      })),
      microServices: Object.entries(MICRO_SERVICES).map(([key, s]) => ({
        key,
        label: s.label,
        description: s.description,
        creditCost: s.creditCost,
        segment: s.segment,
      })),
    });
  });

  /**
   * POST /api/companies/:companyId/amx/rq-portal
   * Submits a context factory request — either a big tier (`tier`) or an
   * on-demand micro-service (`serviceKey`), never both.
   *
   * Simulation runs are free (the default — "try the factory"). Live
   * production runs charge the tier's credit cost from the requester's
   * wallet into RQ escrow BEFORE the submission is created; an insufficient
   * balance returns 402 with the shortfall so the UI can route the user to
   * the buy-credits flow.
   */
  router.post("/companies/:companyId/amx/rq-portal", validate(submitRqSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const body = req.body as z.infer<typeof submitRqSchema>;
    if ((body.tier === undefined) === (body.serviceKey === undefined)) {
      res.status(422).json({ error: `Provide exactly one of "tier" or "serviceKey"` });
      return;
    }

    // Resolve what's being manufactured: a big tier or a micro-service.
    // rq_submissions.tier is free text — micro-services persist as svc_<key>.
    let submissionTier: string;
    let fullCreditCost: number;
    let chargeMetadata: Record<string, unknown>;
    if (body.serviceKey !== undefined) {
      if (!(body.serviceKey in MICRO_SERVICES)) {
        res.status(422).json({ error: `Unknown micro-service "${body.serviceKey}"` });
        return;
      }
      const service = MICRO_SERVICES[body.serviceKey as MicroServiceKey];
      submissionTier = `svc_${body.serviceKey}`;
      fullCreditCost = service.creditCost;
      chargeMetadata = { serviceKey: body.serviceKey, deploymentMode: body.deploymentMode };
    } else {
      const tier = resolveRqTier(body.tier!);
      if (!tier) {
        res.status(422).json({ error: `Unknown RQ tier "${body.tier}"` });
        return;
      }
      submissionTier = tier;
      fullCreditCost = RQ_TIERS[tier].creditCost;
      chargeMetadata = { tier, deploymentMode: body.deploymentMode };
    }

    const isSimulation = body.isSimulation ?? true;
    const creditCost = isSimulation ? 0 : fullCreditCost;

    let amxTxId: string | null = null;
    if (creditCost > 0) {
      try {
        amxTxId = await spendCredits(db, {
          companyId,
          principalId: actorId,
          amount: creditCost,
          toPrincipalId: RQ_ESCROW_PRINCIPAL_ID,
          transactionType: "rq_factory_charge",
          metadata: chargeMetadata,
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          res.status(402).json({
            error: `Insufficient credits — this tier costs ${err.needed.toLocaleString()} credits and your balance is ${err.balance.toLocaleString()}. Buy a credit block to continue.`,
            needed: err.needed,
            balance: err.balance,
          });
          return;
        }
        throw err;
      }
    }

    const submission = await rqSvc.submitRQ(companyId, actorId, {
      tier: submissionTier,
      contextData: body.contextData,
      deploymentMode: body.deploymentMode,
      isSimulation,
      amountPaidCents: 0,
      creditCost,
      amxTxId,
    });

    res.status(201).json(submission);
  });

  /**
   * POST /api/companies/:companyId/amx/rq/:submissionId/refund
   * Admin-only: cancels a charged RQ and returns its escrowed credits to
   * the requester. Idempotent — an already-refunded or free submission
   * returns refunded: 0.
   */
  router.post("/companies/:companyId/amx/rq/:submissionId/refund", async (req, res) => {
    const { companyId, submissionId } = req.params as { companyId: string; submissionId: string };
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");

    const [submission] = await db.select().from(rqSubmissions)
      .where(and(eq(rqSubmissions.id, submissionId), eq(rqSubmissions.companyId, companyId)))
      .limit(1);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    if (submission.status === "cancelled" || submission.creditCost <= 0) {
      res.json({ submissionId, refunded: 0, status: submission.status });
      return;
    }

    const refundTxId = await refundCredits(db, {
      companyId,
      principalId: submission.userId,
      amount: submission.creditCost,
      fromPrincipalId: RQ_ESCROW_PRINCIPAL_ID,
      transactionType: "rq_factory_refund",
      metadata: { submissionId, tier: submission.tier },
    });

    await db.update(rqSubmissions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(rqSubmissions.id, submissionId));

    res.json({ submissionId, refunded: submission.creditCost, refundTxId, status: "cancelled" });
  });

  /**
   * GET /api/certificates/verify/:footprint
   * Verifies an AMX certificate footprint issued by the OPPRRC lifecycle
   * pipeline (CERTIFICATE phase). A footprint is an opaque SHA256 reference —
   * this route is intentionally unscoped (no company check), analogous to a
   * certificate "QR verify" code.
   */
  router.get("/certificates/verify/:footprint", async (req, res) => {
    const footprint = req.params.footprint as string;
    const result = await chainSvc.verifyCertificate(footprint);
    res.json(result);
  });

  return router;
}
