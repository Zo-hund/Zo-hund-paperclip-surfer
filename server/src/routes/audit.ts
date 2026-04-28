import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { auditService } from "../services/auditService.js";

const startSchema = z.object({
  auditorAgentId: z.string().uuid(),
  targetType: z.enum(["issue", "agent", "task"]),
  targetId: z.string().min(1),
  targetLabel: z.string().optional(),
});

const passSchema = z.object({
  auditorAgentId: z.string().uuid(),
  verdict: z.string().min(1),
  commitHashes: z.array(z.string()).optional(),
  taskLogsSummary: z.string().optional(),
  completionTimeMs: z.number().int().optional(),
  finalCostTokens: z.number().int().optional(),
});

const failSchema = z.object({
  auditorAgentId: z.string().uuid(),
  verdict: z.string().min(1),
  flagged: z.boolean().optional(),
  findings: z.array(z.object({
    severity: z.enum(["critical", "major", "minor"]),
    category: z.string().min(1),
    description: z.string().min(1),
    evidence: z.string().optional(),
  })).min(1),
});

export function auditRoutes(db: Db) {
  const router = Router();
  const svc = auditService(db);

  /**
   * GET /api/companies/:companyId/audit/team
   * Returns all agents with role="auditor".
   */
  router.get("/companies/:companyId/audit/team", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const team = await svc.getAuditTeam(companyId);
    res.json({ team });
  });

  /**
   * GET /api/companies/:companyId/audit/stats
   * Verification summary stats.
   */
  router.get("/companies/:companyId/audit/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const stats = await svc.getStats(companyId);
    res.json(stats);
  });

  /**
   * GET /api/companies/:companyId/audit/verifications
   * All verifications, newest first.
   */
  router.get("/companies/:companyId/audit/verifications", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const limit = Number(req.query.limit) || 50;
    const verifications = await svc.listVerifications(companyId, limit);
    res.json({ verifications });
  });

  /**
   * POST /api/companies/:companyId/audit/verifications
   * Start a new verification.
   */
  router.post("/companies/:companyId/audit/verifications", validate(startSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const verification = await svc.startVerification(companyId, req.body as z.infer<typeof startSchema>);
    res.status(201).json(verification);
  });

  /**
   * POST /api/companies/:companyId/audit/verifications/:id/pass
   * Mark a verification as passed; issues AMX certificate.
   */
  router.post("/companies/:companyId/audit/verifications/:id/pass", validate(passSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const verificationId = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.passVerification(companyId, verificationId, req.body as z.infer<typeof passSchema>);
    res.json(result);
  });

  /**
   * POST /api/companies/:companyId/audit/verifications/:id/fail
   * Mark a verification as failed/flagged with findings.
   */
  router.post("/companies/:companyId/audit/verifications/:id/fail", validate(failSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const verificationId = req.params.id as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.failVerification(companyId, verificationId, req.body as z.infer<typeof failSchema>);
    res.json(result);
  });

  return router;
}
