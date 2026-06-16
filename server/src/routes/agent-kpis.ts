import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents, companies } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { postRunEvalService } from "../services/agent-runtime/post-run-eval.js";
import { kpiAnalyticsService } from "../services/agent-runtime/kpi-analytics.js";
import { assertCompanyAccess } from "./authz.js";
import {
  renderCompanyReportPdf,
  formatCents,
  slugify,
  type ReportExportData,
} from "../services/pdf-export.js";

export function agentKpiRoutes(db: Db) {
  const router = Router();
  const postRun = postRunEvalService(db);
  const analytics = kpiAnalyticsService(db);

  async function getAgentCompanyId(agentId: string): Promise<string | null> {
    const [agent] = await db
      .select({ companyId: agents.companyId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    return agent?.companyId ?? null;
  }

  // List KPIs for an agent
  router.get("/agents/:agentId/kpis", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const projectId = req.query.projectId as string | undefined;

    const kpis = await postRun.getAgentKpis(agentId, { from, to, projectId });
    res.json(kpis);
  });

  // Get trend data for an agent
  router.get("/agents/:agentId/kpis/trends", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const windowSize = req.query.windowSize ? parseInt(req.query.windowSize as string, 10) : 10;
    const trends = await postRun.getAgentTrends(agentId, windowSize);
    res.json(trends);
  });

  // Company-wide analytics
  router.get("/companies/:companyId/analytics", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const result = await analytics.getCompanyAnalytics(companyId);
    res.json(result);
  });

  // Company report export (Phase F: json | csv | markdown | pdf)
  router.get("/companies/:companyId/reports/export", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const [company] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [companyAnalytics, opprrcReports] = await Promise.all([
      analytics.getCompanyAnalytics(companyId),
      analytics.listOpprrcReports(companyId),
    ]);

    const data: ReportExportData = {
      generatedAt: new Date().toISOString(),
      company,
      analytics: companyAnalytics,
      opprrcReports,
    };

    const format = (req.query.format as string | undefined) ?? "json";
    const download = req.query.download === "1";
    const filenameBase = slugify(company.name);

    switch (format) {
      case "pdf":
        renderCompanyReportPdf(res, data);
        return;
      case "csv":
        res.setHeader("Content-Type", "text/csv");
        if (download) res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}-report.csv"`);
        res.send(renderReportCsv(data));
        return;
      case "markdown":
        res.setHeader("Content-Type", "text/markdown");
        if (download) res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}-report.md"`);
        res.send(renderReportMarkdown(data));
        return;
      default:
        if (download) res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}-report.json"`);
        res.json(data);
        return;
    }
  });

  // List observations
  router.get("/companies/:companyId/analytics/observations", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const observations = await analytics.listObservations(companyId);
    res.json(observations);
  });

  // Create observation
  router.post("/companies/:companyId/analytics/observations", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const { observerType, observerAgentId, observerUserId, observation, agentIds, actionTaken, actionNotes } =
      req.body;

    if (!observerType || !observation) {
      res.status(400).json({ error: "Missing required fields: observerType, observation" });
      return;
    }

    const result = await analytics.createObservation({
      companyId,
      observerType,
      observerAgentId,
      observerUserId,
      observation,
      agentIds,
      actionTaken,
      actionNotes,
    });

    res.status(201).json(result);
  });

  // Delete observation
  router.delete("/companies/:companyId/analytics/observations/:id", async (req, res) => {
    const { companyId, id } = req.params;
    assertCompanyAccess(req, companyId);

    const deleted = await analytics.deleteObservation(id);
    if (!deleted) {
      res.status(404).json({ error: "Observation not found" });
      return;
    }

    res.json({ success: true });
  });

  return router;
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function renderReportCsv(data: ReportExportData): string {
  const lines: string[] = [];
  lines.push(`Report,${escapeCsv(data.company.name)}`);
  lines.push(`Generated,${data.generatedAt}`);
  lines.push("");
  lines.push(
    "Agent,Total Runs,Completion Rate,Avg Self Assessment,Avg Cost Cents,Total Cost Cents,Avg Duration Seconds,Avg Errors",
  );
  for (const a of data.analytics.agentSummaries) {
    lines.push(
      [
        escapeCsv(a.agentName),
        a.totalRuns,
        a.completionRate ?? "",
        a.avgSelfAssessment ?? "",
        a.avgCostCents ?? "",
        a.totalCostCents,
        a.avgDurationSeconds ?? "",
        a.avgErrors ?? "",
      ].join(","),
    );
  }
  lines.push("");
  lines.push("OPPRRC Report,Issue,Generated At,Summary");
  for (const r of data.opprrcReports) {
    lines.push(
      [
        escapeCsv(r.title),
        escapeCsv(r.issueIdentifier ?? r.issueId),
        r.generatedAt,
        escapeCsv(r.summary ?? ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function renderReportMarkdown(data: ReportExportData): string {
  const lines: string[] = [];
  lines.push(`# ${data.company.name} — Company Report`);
  lines.push("");
  lines.push(`Generated: ${data.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total Runs: ${data.analytics.totalRuns}`);
  lines.push(`- Avg Completion Rate: ${(data.analytics.avgCompletionRate * 100).toFixed(1)}%`);
  lines.push(`- Total Cost: ${formatCents(data.analytics.totalCostCents)}`);
  lines.push(`- Active Agents: ${data.analytics.activeAgents} / ${data.analytics.agentCount}`);
  lines.push("");
  lines.push("## Agent Summaries");
  lines.push("");
  if (data.analytics.agentSummaries.length === 0) {
    lines.push("_No agent data yet._");
  } else {
    lines.push("| Agent | Runs | Completion | Avg Cost | Total Cost |");
    lines.push("|---|---|---|---|---|");
    for (const a of data.analytics.agentSummaries) {
      const completion = a.completionRate != null ? `${Math.round(a.completionRate * 100)}%` : "—";
      const avgCost = a.avgCostCents != null ? formatCents(a.avgCostCents) : "—";
      lines.push(`| ${a.agentName} | ${a.totalRuns} | ${completion} | ${avgCost} | ${formatCents(a.totalCostCents)} |`);
    }
  }
  lines.push("");
  lines.push("## OPPRRC Completion Reports");
  lines.push("");
  if (data.opprrcReports.length === 0) {
    lines.push("_No OPPRRC reports generated yet._");
  } else {
    for (const r of data.opprrcReports) {
      lines.push(`### ${r.issueIdentifier ?? r.issueId} — ${r.title}`);
      lines.push("");
      lines.push(r.summary ?? "(no summary)");
      lines.push("");
      lines.push(`_Generated: ${r.generatedAt}_`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
