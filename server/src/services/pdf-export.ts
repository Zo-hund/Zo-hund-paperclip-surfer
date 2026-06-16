import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Response } from "express";

export interface ReportExportAgentSummary {
  agentId: string;
  agentName: string;
  totalRuns: number;
  completionRate: number | null;
  avgSelfAssessment: number | null;
  avgCostCents: number | null;
  totalCostCents: number;
  avgDurationSeconds: number | null;
  avgErrors: number | null;
}

export interface ReportExportOpprrcReport {
  id: string;
  issueId: string;
  issueIdentifier: string | null;
  title: string;
  summary: string | null;
  generatedAt: string;
}

export interface ReportExportData {
  generatedAt: string;
  company: { id: string; name: string };
  analytics: {
    companyId: string;
    agentCount: number;
    totalRuns: number;
    avgCompletionRate: number;
    totalCostCents: number;
    activeAgents: number;
    agentSummaries: ReportExportAgentSummary[];
  };
  opprrcReports: ReportExportOpprrcReport[];
}

export interface CertificatePdfData {
  id: string;
  certificateFootprint: string;
  status: string;
  responsiblePrincipalId: string;
  responsiblePrincipalName?: string | null;
  completionTimeMs: number;
  finalCostTokens: number;
  commitHashes: string[];
  projects: string[];
  resources: string[];
  reports: string[];
  issuedAt: Date | string;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function renderCompanyReportPdf(res: Response, data: ReportExportData): void {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${slugify(data.company.name)}-report.pdf"`);
  doc.pipe(res);

  doc.fontSize(20).text(`${data.company.name}`, { continued: false });
  doc.fontSize(14).fillColor("#666").text("Company Analytics Report");
  doc.fontSize(9).fillColor("#999").text(`Generated: ${data.generatedAt}`);
  doc.fillColor("#000");
  doc.moveDown();

  doc.fontSize(13).text("Summary");
  doc.moveDown(0.25);
  doc.fontSize(10);
  doc.text(`Total Runs: ${data.analytics.totalRuns}`);
  doc.text(`Avg Completion Rate: ${(data.analytics.avgCompletionRate * 100).toFixed(1)}%`);
  doc.text(`Total Cost: ${formatCents(data.analytics.totalCostCents)}`);
  doc.text(`Active Agents: ${data.analytics.activeAgents} / ${data.analytics.agentCount}`);
  doc.moveDown();

  doc.fontSize(13).text("Agent Summaries");
  doc.moveDown(0.25);
  doc.fontSize(10);
  if (data.analytics.agentSummaries.length === 0) {
    doc.fillColor("#666").text("No agent data yet.");
    doc.fillColor("#000");
  } else {
    for (const agent of data.analytics.agentSummaries) {
      const completion = agent.completionRate != null ? `${Math.round(agent.completionRate * 100)}%` : "—";
      const avgCost = agent.avgCostCents != null ? formatCents(agent.avgCostCents) : "—";
      doc.font("Helvetica-Bold").text(agent.agentName, { continued: true });
      doc
        .font("Helvetica")
        .text(`  —  runs: ${agent.totalRuns}, completion: ${completion}, avg cost: ${avgCost}, total cost: ${formatCents(agent.totalCostCents)}`);
    }
  }
  doc.moveDown();

  doc.fontSize(13).text("OPPRRC Completion Reports");
  doc.moveDown(0.25);
  doc.fontSize(10);
  if (data.opprrcReports.length === 0) {
    doc.fillColor("#666").text("No OPPRRC reports generated yet.");
    doc.fillColor("#000");
  } else {
    for (const report of data.opprrcReports) {
      doc.font("Helvetica-Bold").text(`${report.issueIdentifier ?? report.issueId} — ${report.title}`);
      doc.font("Helvetica").fontSize(9).fillColor("#666");
      doc.text(report.summary ?? "(no summary)", { indent: 12 });
      doc.text(`Generated: ${report.generatedAt}`, { indent: 12 });
      doc.fillColor("#000").fontSize(10);
      doc.moveDown(0.25);
    }
  }

  doc.end();
}

export async function renderCertificatePdf(
  res: Response,
  cert: CertificatePdfData,
  verifyUrl: string,
): Promise<void> {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="certificate-${cert.id}.pdf"`);
  doc.pipe(res);

  doc.fontSize(22).text("Certificate of Completion", { align: "center" });
  doc.fontSize(10).fillColor("#666").text("AMX Chain — Proof of Work", { align: "center" });
  doc.fillColor("#000");
  doc.moveDown(1.5);

  const issuedAt = cert.issuedAt instanceof Date ? cert.issuedAt.toISOString() : cert.issuedAt;

  doc.fontSize(11);
  doc.font("Helvetica-Bold").text("Status: ", { continued: true }).font("Helvetica").text(cert.status);
  doc
    .font("Helvetica-Bold")
    .text("Issued: ", { continued: true })
    .font("Helvetica")
    .text(issuedAt);
  doc
    .font("Helvetica-Bold")
    .text("Responsible Principal: ", { continued: true })
    .font("Helvetica")
    .text(cert.responsiblePrincipalName ?? cert.responsiblePrincipalId);
  doc
    .font("Helvetica-Bold")
    .text("Completion Time: ", { continued: true })
    .font("Helvetica")
    .text(`${cert.completionTimeMs} ms`);
  doc
    .font("Helvetica-Bold")
    .text("Final Cost: ", { continued: true })
    .font("Helvetica")
    .text(`${cert.finalCostTokens} tokens`);
  doc.moveDown();

  doc.font("Helvetica-Bold").fontSize(11).text("Certificate Footprint (SHA-256)");
  doc.font("Courier").fontSize(9).text(cert.certificateFootprint);
  doc.font("Helvetica").fontSize(11);
  doc.moveDown();

  doc.font("Helvetica-Bold").text("OPPRRC Mapping");
  doc.font("Helvetica").fontSize(10);
  doc.text(`Projects: ${cert.projects.length}`);
  doc.text(`Resources: ${cert.resources.length}`);
  doc.text(`Reports: ${cert.reports.length}`);
  doc.moveDown();

  if (cert.commitHashes.length > 0) {
    doc.font("Helvetica-Bold").fontSize(11).text("Commit Hashes");
    doc.font("Courier").fontSize(9);
    for (const hash of cert.commitHashes) doc.text(hash);
    doc.font("Helvetica").fontSize(11);
    doc.moveDown();
  }

  const qrBuffer = await QRCode.toBuffer(verifyUrl, { type: "png", margin: 1, width: 150 });
  doc.font("Helvetica-Bold").text("Verify");
  doc.image(qrBuffer, { width: 120 });
  doc.font("Helvetica").fontSize(8).fillColor("#666").text(verifyUrl, { link: verifyUrl });

  doc.end();
}
