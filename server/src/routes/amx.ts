import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { amxChainEvents, amxCertificates, amxLedger, amxTransactions, agentMemories, agents } from "@paperclipai/db";
import { and, desc, eq, or } from "drizzle-orm";
import { amxChainService } from "../services/amxChainService.js";
import { rqPortalService } from "../services/rqPortalService.js";
import { financeService } from "../services/finance.js";
import { marketplaceService } from "../services/marketplace.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

const submitRqSchema = z.object({
  tier: z.enum(["starter", "pro", "enterprise"]),
  contextData: z.object({
    userContext: z.string().optional(),
    domainContext: z.string().optional(),
    institutionalMemory: z.string().optional(),
  }),
  deploymentMode: z.enum(["cloud", "on-prem", "hybrid"]),
});

export function amxRoutes(db: Db) {
  const router = Router();
  const chainSvc = amxChainService(db);
  const rqSvc = rqPortalService(db);
  const financeSvc = financeService(db);
  const marketplace = marketplaceService(db);

  /**
   * GET /api/companies/:companyId/amx/exchange
   * Returns marketplace earners and stats.
   */
  router.get("/companies/:companyId/amx/exchange", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const userId = req.actor.type === "board" ? req.actor.userId ?? null : null;
    const listings = await marketplace.listListings(companyId, userId);
    const activeListings = listings.filter(
      (listing): listing is typeof listing & { status: string } =>
        typeof (listing as { status?: unknown }).status === "string" &&
        (listing as { status: string }).status === "active",
    );

    res.json({
      listings,
      stats: {
        availableEarners: activeListings.length,
        projectsCompleted: activeListings.length,
        averageRating: activeListings.length > 0 ? 5 : 0,
      },
    });
  });

  /**
   * GET /api/companies/:companyId/amx/wallet
   * Returns real ledger balance and transaction history from DB.
   */
  router.get("/companies/:companyId/amx/wallet", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const requestedEnvironment =
      req.query.environment === "simulation" || req.query.environment === "live"
        ? (req.query.environment as "simulation" | "live")
        : null;

    const [ledger, simulationLedger, liveLedger] = await Promise.all([
      financeSvc.ensureLedger(companyId, "company", companyId, null),
      financeSvc.ensureLedger(companyId, "company", companyId, "simulation"),
      financeSvc.ensureLedger(companyId, "company", companyId, "live"),
    ]);

    // Fetch real transaction history
    const transactions = await db
      .select()
      .from(amxTransactions)
      .where(or(eq(amxTransactions.fromCompanyId, companyId), eq(amxTransactions.toCompanyId, companyId)))
      .orderBy(desc(amxTransactions.occurredAt))
      .limit(50);

    // Fetch finance event summary for AI spend tracking
    const financeSummary = await financeSvc.summary(companyId, undefined, requestedEnvironment);

    res.json({
      ledgerId: ledger.id,
      tokenBalance: ledger.tokenBalance,
      creditBalance: ledger.creditBalance,
      currency: "AMX",
      environment: requestedEnvironment,
      subledgers: {
        simulation: {
          ledgerId: simulationLedger.id,
          tokenBalance: simulationLedger.tokenBalance,
          creditBalance: simulationLedger.creditBalance,
        },
        live: {
          ledgerId: liveLedger.id,
          tokenBalance: liveLedger.tokenBalance,
          creditBalance: liveLedger.creditBalance,
        },
      },
      financeSummary: {
        debitCents: financeSummary.debitCents,
        creditCents: financeSummary.creditCents,
        netCents: financeSummary.netCents,
        eventCount: financeSummary.eventCount,
      },
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.transactionType,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        fromPrincipal: `${tx.fromPrincipalType}:${tx.fromPrincipalId}`,
        toPrincipal: `${tx.toPrincipalType}:${tx.toPrincipalId}`,
        metadata: tx.metadata,
        date: tx.occurredAt,
      })),
    });
  });

  /**
   * POST /api/companies/:companyId/amx/wallet/credit
   * Tops up token balance for a company (store credit purchase).
   */
  router.post("/companies/:companyId/amx/wallet/credit", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { amount, note, environment } = req.body as {
      amount: number;
      note?: string;
      environment?: "simulation" | "live" | null;
    };
    if (!amount || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive integer" });
      return;
    }

    const ledger = await financeSvc.ensureLedger(companyId, "company", companyId, environment ?? null);

    await db
      .update(amxLedger)
      .set({ tokenBalance: ledger.tokenBalance + amount, updatedAt: new Date() })
      .where(eq(amxLedger.id, ledger.id));

    await chainSvc.recordSecurityEvent(companyId, "company", companyId, "LEDGER_CREDIT", {
      amount,
      note: note ?? "Store credit purchase",
    });

    res.json({
      ok: true,
      environment: environment ?? null,
      tokenBalance: ledger.tokenBalance + amount,
    });
  });

  /**
   * GET /api/companies/:companyId/amx/chain
   * Returns real AMX Chain events and certificates from DB.
   */
  router.get("/companies/:companyId/amx/chain", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const [events, certificates] = await Promise.all([
      db
        .select()
        .from(amxChainEvents)
        .where(eq(amxChainEvents.companyId, companyId))
        .orderBy(desc(amxChainEvents.createdAt))
        .limit(100),
      db
        .select()
        .from(amxCertificates)
        .where(eq(amxCertificates.companyId, companyId))
        .orderBy(desc(amxCertificates.issuedAt))
        .limit(50),
    ]);

    res.json({
      logs: events.map((e) => ({
        id: e.id,
        action: e.action,
        principal: `${e.principalType}:${e.principalId}`,
        principalType: e.principalType,
        principalId: e.principalId,
        payload: e.payload,
        status: "VERIFIED",
        hash: e.signature
          ? `sha256:${e.signature.slice(0, 8)}...${e.signature.slice(-4)}`
          : null,
        timestamp: e.createdAt,
      })),
      certificates: certificates.map((c) => ({
        id: c.id,
        issueId: c.issueId,
        issuedTo: c.responsiblePrincipalId,
        footprint: c.certificateFootprint,
        completionTimeMs: c.completionTimeMs,
        finalCostTokens: c.finalCostTokens,
        date: c.issuedAt,
      })),
      totals: { logCount: events.length, certCount: certificates.length },
    });
  });

  /**
   * POST /api/companies/:companyId/amx/rq-portal
   * Submits a context factory request and logs to the AMX Chain.
   */
  router.post("/companies/:companyId/amx/rq-portal", validate(submitRqSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const submission = await rqSvc.submitRQ(companyId, actorId, {
      ...req.body,
      amountPaidCents: 0,
    });

    // Record the RQ submission on the AMX Chain
    await chainSvc.recordSecurityEvent(companyId, "company", companyId, "RQ_SUBMITTED", {
      submissionId: submission.id,
      tier: req.body.tier,
      deploymentMode: req.body.deploymentMode,
    });

    res.status(201).json(submission);
  });

  router.get("/companies/:companyId/amx/memories", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const requestedEnvironment =
      req.query.environment === "simulation" || req.query.environment === "live"
        ? (req.query.environment as "simulation" | "live")
        : null;

    const mems = await db.select({
      id: agentMemories.id,
      agentId: agentMemories.agentId,
      agentName: agents.name,
      companyId: agentMemories.companyId,
      operatingEnvironment: agentMemories.operatingEnvironment,
      scope: agentMemories.scope,
      projectId: agentMemories.projectId,
      category: agentMemories.category,
      title: agentMemories.title,
      content: agentMemories.content,
      source: agentMemories.source,
      confidence: agentMemories.confidence,
      createdAt: agentMemories.createdAt,
      updatedAt: agentMemories.updatedAt,
    })
      .from(agentMemories)
      .innerJoin(agents, eq(agentMemories.agentId, agents.id))
      .where(
        requestedEnvironment
          ? and(
              eq(agentMemories.companyId, companyId),
              eq(agentMemories.operatingEnvironment, requestedEnvironment),
            )
          : eq(agentMemories.companyId, companyId),
      )
      .orderBy(desc(agentMemories.createdAt));

    res.json(mems);
  });

  return router;
}
