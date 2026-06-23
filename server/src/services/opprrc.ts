import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { amxCertificates, heartbeatRuns, issueWorkProducts, issues } from "@paperclipai/db";

export interface OpprrcBinding {
  lifecycleStage: string | null;
  projects: string[];
  resources: string[];
  reports: string[];
  orphanCount: number;
  certificateId: string;
}

export interface OpprrcReport {
  id: string;
  summary: string;
  content: string;
}

export interface OpprrcLearning {
  observe: { outcome: string; completionTimeMs: number; costTokens: number };
  reflect: string;
  improve: string;
  coach: string;
  reward: number;
  recordedAt: string;
}

/**
 * Phase E–H of the AMX-AIR-HUBS lifecycle: binds generated artifacts to OPPRRC
 * records, generates a completion report, and persists SEL learning metrics.
 * Certificate issuance is handled separately via amxChainService, using the
 * projects/resources/reports produced here.
 */
export function opprrcService(db: Db) {
  /**
   * Phase E: "no orphan resources" — every issue_work_products row for this
   * issue must be attached to a project (the OPPRRC "Project"/"Resource"
   * mapping). Backfills missing project links from the issue itself, and
   * upserts a draft amx_certificates row carrying the OPPRRC mapping arrays.
   */
  async function bindArtifacts(companyId: string, issueId: string): Promise<OpprrcBinding> {
    const issue = await db
      .select({
        id: issues.id,
        projectId: issues.projectId,
        lifecycleStage: issues.lifecycleStage,
      })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
    if (!issue) throw new Error(`OPPRRC: issue ${issueId} not found`);

    if (issue.projectId) {
      await db
        .update(issueWorkProducts)
        .set({ projectId: issue.projectId, updatedAt: new Date() })
        .where(and(eq(issueWorkProducts.issueId, issueId), isNull(issueWorkProducts.projectId)));
    }

    const products = await db
      .select({ id: issueWorkProducts.id, projectId: issueWorkProducts.projectId })
      .from(issueWorkProducts)
      .where(eq(issueWorkProducts.issueId, issueId));

    const orphanCount = products.filter((p) => !p.projectId).length;
    const projects = Array.from(
      new Set([issue.projectId, ...products.map((p) => p.projectId)].filter((v): v is string => !!v)),
    );
    const resources = products.map((p) => p.id);

    const existing = await db
      .select({ id: amxCertificates.id, reports: amxCertificates.reports })
      .from(amxCertificates)
      .where(and(eq(amxCertificates.issueId, issueId), eq(amxCertificates.status, "draft")))
      .then((rows) => rows[0] ?? null);

    let certificateId: string;
    let reports: string[];
    if (existing) {
      reports = existing.reports ?? [];
      await db
        .update(amxCertificates)
        .set({ projects, resources })
        .where(eq(amxCertificates.id, existing.id));
      certificateId = existing.id;
    } else {
      const certificateFootprint = createHash("sha256").update(`opprrc-draft:${issueId}`).digest("hex");
      const inserted = await db
        .insert(amxCertificates)
        .values({
          companyId,
          issueId,
          responsiblePrincipalId: "system",
          commitHashes: [],
          completionTimeMs: 0,
          finalCostTokens: 0,
          projects,
          resources,
          reports: [],
          certificateFootprint,
          status: "draft",
        })
        .returning({ id: amxCertificates.id });
      certificateId = inserted[0].id;
      reports = [];
    }

    return {
      lifecycleStage: issue.lifecycleStage,
      projects,
      resources,
      reports,
      orphanCount,
      certificateId,
    };
  }

  /**
   * Phase F: generates a markdown completion report for the issue, stores it
   * as an issue_work_products "report" artifact, and appends it to the
   * draft certificate's reports mapping.
   */
  async function generateReport(
    companyId: string,
    issueId: string,
    runId: string,
    binding: OpprrcBinding,
  ): Promise<OpprrcReport> {
    const issue = await db
      .select({ id: issues.id, identifier: issues.identifier, title: issues.title })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
    if (!issue) throw new Error(`OPPRRC: issue ${issueId} not found`);

    const generatedAt = new Date();
    const identifier = issue.identifier ?? issueId;
    const summary = `OPPRRC completion report for ${identifier} — ${binding.resources.length} resource(s), ${binding.projects.length} project mapping(s).`;
    const content = [
      "# OPPRRC Completion Report",
      "",
      `**Issue:** ${identifier} — ${issue.title}`,
      `**Generated:** ${generatedAt.toISOString()}`,
      `**Run:** ${runId}`,
      "",
      `## Resources (${binding.resources.length})`,
      ...(binding.resources.length ? binding.resources.map((id) => `- \`${id}\``) : ["- (none)"]),
      "",
      `## Projects (${binding.projects.length})`,
      ...(binding.projects.length ? binding.projects.map((id) => `- \`${id}\``) : ["- (none)"]),
    ].join("\n");

    const opprrcExternalId = `opprrc-report:${issueId}`;
    const existing = await db
      .select({ id: issueWorkProducts.id })
      .from(issueWorkProducts)
      .where(
        and(
          eq(issueWorkProducts.issueId, issueId),
          eq(issueWorkProducts.provider, "system"),
          eq(issueWorkProducts.externalId, opprrcExternalId),
        ),
      )
      .then((rows) => rows[0] ?? null);

    let row: { id: string };
    if (existing) {
      await db
        .update(issueWorkProducts)
        .set({
          title: `OPPRRC Report — ${identifier}`,
          summary,
          metadata: { format: "markdown", content, generatedAt: generatedAt.toISOString() },
          createdByRunId: runId,
          updatedAt: new Date(),
        })
        .where(eq(issueWorkProducts.id, existing.id));
      row = existing;
    } else {
      const [inserted] = await db
        .insert(issueWorkProducts)
        .values({
          companyId,
          issueId,
          type: "document",
          provider: "system",
          externalId: opprrcExternalId,
          title: `OPPRRC Report — ${identifier}`,
          status: "completed",
          reviewState: "none",
          isPrimary: false,
          healthStatus: "healthy",
          summary,
          metadata: { format: "markdown", content, generatedAt: generatedAt.toISOString() },
          createdByRunId: runId,
        })
        .returning({ id: issueWorkProducts.id });
      row = inserted;
    }

    await db
      .update(amxCertificates)
      .set({ reports: [...binding.reports, row.id] })
      .where(eq(amxCertificates.id, binding.certificateId));

    return { id: row.id, summary, content };
  }

  /**
   * Phase H: persists SEL (observe/reflect/improve/coach/reward) learning
   * metrics for this run onto heartbeat_runs.result_json, alongside the
   * existing agent KPI feedback loop (postRunEvalService).
   */
  async function recordLearning(
    runId: string,
    metrics: { outcome: string; completionTimeMs: number; finalCostTokens: number },
  ): Promise<OpprrcLearning> {
    const learning: OpprrcLearning = {
      observe: {
        outcome: metrics.outcome,
        completionTimeMs: metrics.completionTimeMs,
        costTokens: metrics.finalCostTokens,
      },
      reflect:
        metrics.outcome === "succeeded"
          ? "Task completed and certified through the OPPRRC pipeline."
          : "Task did not complete successfully.",
      improve:
        metrics.finalCostTokens > 0
          ? "Monitor token usage trends for this agent/issue type."
          : "No cost data captured for this run.",
      coach: "Continue applying SIM -> PIT STOP review before LIVE execution for higher-risk tasks.",
      reward: metrics.outcome === "succeeded" ? 1 : 0,
      recordedAt: new Date().toISOString(),
    };

    const run = await db
      .select({ resultJson: heartbeatRuns.resultJson })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .then((rows) => rows[0] ?? null);

    const resultJson = { ...((run?.resultJson as Record<string, unknown> | null) ?? {}), learning };

    await db.update(heartbeatRuns).set({ resultJson }).where(eq(heartbeatRuns.id, runId));

    return learning;
  }

  return { bindArtifacts, generateReport, recordLearning };
}
