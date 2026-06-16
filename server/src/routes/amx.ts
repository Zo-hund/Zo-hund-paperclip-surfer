import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { amxChainEvents, amxCertificates, agents, issues } from "@paperclipai/db";
import { amxChainService } from "../services/amxChainService.js";
import { rqPortalService } from "../services/rqPortalService.js";
import { financeService } from "../services/finance.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { eq, desc, and, inArray } from "drizzle-orm";
import { renderCertificatePdf } from "../services/pdf-export.js";

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

  /**
   * GET /api/companies/:companyId/amx/exchange
   * Returns marketplace earners and stats.
   */
  router.get("/companies/:companyId/amx/exchange", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    
    // In a real implementation, this would fetch from an 'earners' table.
    // For the industrialization demo, we return the structured earner data.
    const earners = [
      {
        id: "U4",
        name: "User 4",
        title: "Master Earner",
        bio: "Innovation leader with expertise in AI and cloud architecture. Available for consulting.",
        skills: ["AWS", "Machine Learning", "System Design", "Leadership"],
        rating: 5.0,
        reviews: 45,
        projects: 25,
        badges: 9,
        rate: 100,
        location: "West Louisville FoodPort",
        status: "Available Now"
      },
      {
        id: "U2",
        name: "User 2",
        title: "Expert Earner",
        bio: "Full-stack developer specializing in AI-powered applications. Mentor for junior learners.",
        skills: ["React", "Node", "Python", "TensorFlow"],
        rating: 4.9,
        reviews: 28,
        projects: 15,
        badges: 8,
        rate: 75,
        location: "Jefferson Community College",
        status: "Available Now"
      },
      {
        id: "U5940022",
        name: "User 5940022",
        title: "Advanced Earner",
        bio: "Experienced AI/XR developer specializing in spatial computing.",
        skills: ["Unity", "C#", "XR", "Three.js"],
        rating: 4.5,
        reviews: 10,
        projects: 0,
        badges: 0,
        rate: 50,
        location: "Online",
        status: "Available Now"
      }
    ];

    res.json({
      earners,
      stats: {
        availableEarners: 7,
        projectsCompleted: 40,
        averageRating: 4.6
      }
    });
  });

  /**
   * GET /api/companies/:companyId/amx/wallet
   * Returns SIMS balance and transactions.
   */
  router.get("/companies/:companyId/amx/wallet", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    
    // Mock wallet data until full ledger integration
    res.json({
      balance: 12500,
      currency: "SIMS",
      transactions: [
        { id: "tx_1", type: "credit", amount: 5000, description: "Project Milestone: FoodPort AI", date: new Date().toISOString() },
        { id: "tx_2", type: "debit", amount: 1500, description: "Agent Swarm: SEO Analysis", date: new Date(Date.now() - 86400000).toISOString() },
        { id: "tx_3", type: "credit", amount: 200, description: "LMS Certification Reward", date: new Date(Date.now() - 172800000).toISOString() },
      ]
    });
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
   * POST /api/companies/:companyId/amx/rq-portal
   * Submits a context factory request.
   */
  router.post("/companies/:companyId/amx/rq-portal", validate(submitRqSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const submission = await rqSvc.submitRQ(companyId, actorId, {
      ...req.body,
      amountPaidCents: 0, // Injected for demo
    });

    res.status(201).json(submission);
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
