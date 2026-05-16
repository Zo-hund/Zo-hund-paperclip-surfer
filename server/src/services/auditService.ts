import { eq, desc, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { auditVerifications, agents } from "@paperclipai/db";
import { amxChainService } from "./amxChainService.js";
import { logActivity } from "./activity-log.js";

export function auditService(db: Db) {
  const chain = amxChainService(db);

  /**
   * Returns all auditor-role agents for a company — the Audit Team roster.
   */
  async function getAuditTeam(companyId: string) {
    return db
      .select()
      .from(agents)
      .where(and(eq(agents.companyId, companyId), eq(agents.role, "auditor")));
  }

  /**
   * Lists all verifications for a company, newest first.
   */
  async function listVerifications(companyId: string, limit = 50) {
    return db
      .select()
      .from(auditVerifications)
      .where(eq(auditVerifications.companyId, companyId))
      .orderBy(desc(auditVerifications.createdAt))
      .limit(limit);
  }

  /**
   * Opens a new verification record (status = in_progress).
   */
  async function startVerification(companyId: string, input: {
    auditorAgentId: string;
    targetType: "issue" | "agent" | "task";
    targetId: string;
    targetLabel?: string;
  }) {
    const [row] = await db
      .insert(auditVerifications)
      .values({
        companyId,
        auditorAgentId: input.auditorAgentId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetLabel: input.targetLabel,
        status: "in_progress",
        startedAt: new Date(),
      })
      .returning();

    await logActivity(db, {
      companyId,
      actorType: "agent",
      actorId: input.auditorAgentId,
      action: "audit_verification_started",
      entityType: "audit_verification",
      entityId: row.id,
      details: { targetType: input.targetType, targetId: input.targetId },
    });

    return row;
  }

  /**
   * Marks a verification as passed, issues an AMX certificate, and logs the event.
   */
  async function passVerification(companyId: string, verificationId: string, input: {
    auditorAgentId: string;
    verdict: string;
    commitHashes?: string[];
    taskLogsSummary?: string;
    completionTimeMs?: number;
    finalCostTokens?: number;
  }) {
    const cert = await chain.issueCertificate(companyId, {
      responsiblePrincipalId: input.auditorAgentId,
      commitHashes: input.commitHashes ?? [],
      taskLogsSummary: input.taskLogsSummary,
      completionTimeMs: input.completionTimeMs ?? 0,
      finalCostTokens: input.finalCostTokens ?? 0,
      projects: [],
      resources: [],
      reports: [],
    });

    const [row] = await db
      .update(auditVerifications)
      .set({
        status: "passed",
        verdict: input.verdict,
        findings: [],
        certificateFootprint: cert.certificateFootprint,
        completedAt: new Date(),
      })
      .where(and(
        eq(auditVerifications.id, verificationId),
        eq(auditVerifications.companyId, companyId),
      ))
      .returning();

    await logActivity(db, {
      companyId,
      actorType: "agent",
      actorId: input.auditorAgentId,
      action: "audit_verification_passed",
      entityType: "audit_verification",
      entityId: verificationId,
      details: { certificateFootprint: cert.certificateFootprint },
    });

    return { verification: row, certificate: cert };
  }

  /**
   * Marks a verification as failed/flagged with structured findings.
   */
  async function failVerification(companyId: string, verificationId: string, input: {
    auditorAgentId: string;
    verdict: string;
    flagged?: boolean;
    findings: Array<{
      severity: "critical" | "major" | "minor";
      category: string;
      description: string;
      evidence?: string;
    }>;
  }) {
    const status = input.flagged ? "flagged" : "failed";

    const [row] = await db
      .update(auditVerifications)
      .set({
        status,
        verdict: input.verdict,
        findings: input.findings,
        completedAt: new Date(),
      })
      .where(and(
        eq(auditVerifications.id, verificationId),
        eq(auditVerifications.companyId, companyId),
      ))
      .returning();

    await chain.recordSecurityEvent(companyId, "agent", input.auditorAgentId, "AUDIT_FINDING", {
      verificationId,
      status,
      findingCount: input.findings.length,
      verdict: input.verdict,
    });

    await logActivity(db, {
      companyId,
      actorType: "agent",
      actorId: input.auditorAgentId,
      action: "audit_verification_failed",
      entityType: "audit_verification",
      entityId: verificationId,
      details: { status, findings: input.findings },
    });

    return row;
  }

  /**
   * Summary stats for the audit dashboard header.
   */
  async function getStats(companyId: string) {
    const all = await listVerifications(companyId, 500);
    const total = all.length;
    const passed = all.filter((v) => v.status === "passed").length;
    const failed = all.filter((v) => v.status === "failed" || v.status === "flagged").length;
    const pending = all.filter((v) => v.status === "pending" || v.status === "in_progress").length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    return { total, passed, failed, pending, passRate };
  }

  return {
    getAuditTeam,
    listVerifications,
    startVerification,
    passVerification,
    failVerification,
    getStats,
  };
}
