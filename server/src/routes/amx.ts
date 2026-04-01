import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { amxChainService } from "../services/amxChainService.js";
import { rqPortalService } from "../services/rqPortalService.js";
import { financeService } from "../services/finance.js";
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
   * Returns ledger logs and certificates.
   */
  router.get("/companies/:companyId/amx/chain", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    
    // In a real implementation this would query amxChainEvents and amxCertificates
    res.json({
      logs: [
        { id: "log_1", action: "CREDENTIAL_GRANT", principal: "User 4", status: "VERIFIED", hash: "0x8f2d...4a1b", timestamp: new Date().toISOString() },
        { id: "log_2", action: "TASK_COMMIT", principal: "Agent SEO", status: "VERIFIED", hash: "0x3c1a...9e7f", timestamp: new Date(Date.now() - 3600000).toISOString() },
        { id: "log_3", action: "BUDGET_APPROVAL", principal: "CEO", status: "VERIFIED", hash: "0xad42...f2e0", timestamp: new Date(Date.now() - 7200000).toISOString() },
      ],
      certificates: [
        { id: "cert_1", title: "Master AI Architect", issuedTo: "User 4", date: "2026-03-25", footprint: "sha256:8f2d...4a1b" },
        { id: "cert_2", title: "XR Development Expert", issuedTo: "User 2", date: "2026-03-20", footprint: "sha256:3c1a...9e7f" },
      ]
    });
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

  return router;
}
