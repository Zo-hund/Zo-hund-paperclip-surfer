import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { agentMemories, issues } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  companyPortabilityExportSchema,
  companyPortabilityImportSchema,
  companyPortabilityPreviewSchema,
  createCompanySchema,
  updateCompanyBrandingSchema,
  updateCompanySchema,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  accessService,
  agentService,
  budgetService,
  companyPortabilityService,
  companyService,
  logActivity,
  workProductService,
} from "../services/index.js";
import type { StorageService } from "../storage/types.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function companyRoutes(db: Db, storage?: StorageService) {
  const router = Router();
  const svc = companyService(db);
  const agents = agentService(db);
  const portability = companyPortabilityService(db, storage);
  const access = accessService(db);
  const budgets = budgetService(db);
  const workProducts = workProductService(db);

  async function assertCanUpdateBranding(req: Request, companyId: string) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "board") return;
    if (!req.actor.agentId) throw forbidden("Agent authentication required");

    const actorAgent = await agents.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden("Agent key cannot access another company");
    }
    if (actorAgent.role !== "ceo") {
      throw forbidden("Only CEO agents can update company branding");
    }
  }

  async function assertCanManagePortability(req: Request, companyId: string, capability: "imports" | "exports") {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "board") return;
    if (!req.actor.agentId) throw forbidden("Agent authentication required");

    const actorAgent = await agents.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden("Agent key cannot access another company");
    }
    if (actorAgent.role !== "ceo") {
      throw forbidden(`Only CEO agents can manage company ${capability}`);
    }
  }

  router.get("/", async (req, res) => {
    assertBoard(req);
    const result = await svc.list();
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
      res.json(result);
      return;
    }
    const allowed = new Set(req.actor.companyIds ?? []);
    res.json(result.filter((company) => allowed.has(company.id)));
  });

  router.get("/stats", async (req, res) => {
    assertBoard(req);
    const allowed = req.actor.source === "local_implicit" || req.actor.isInstanceAdmin
      ? null
      : new Set(req.actor.companyIds ?? []);
    const stats = await svc.stats();
    if (!allowed) {
      res.json(stats);
      return;
    }
    const filtered = Object.fromEntries(Object.entries(stats).filter(([companyId]) => allowed.has(companyId)));
    res.json(filtered);
  });

  // Common malformed path when companyId is empty in "/api/companies/{companyId}/issues".
  router.get("/issues", (_req, res) => {
    res.status(400).json({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });

  // ── Public portal — no board auth required ──────────────────────────────────
  router.get("/public/:slug/portal", async (req, res) => {
    const company = await svc.getByPrefix(req.params.slug as string);
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }

    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const allDeliverables = await workProducts.listCompanyDeliverables(company.id, search, type);
    const deliverables = allDeliverables.filter((d: any) => d.reviewState !== "rejected" && d.status !== "archived");

    res.json({
      company: {
        id: company.id,
        name: company.name,
        description: company.description,
        brandColor: company.brandColor,
        logoUrl: company.logoUrl,
        issuePrefix: company.issuePrefix,
      },
      deliverables,
    });
  });

  // Board deliverable routes must be before /:companyId to avoid "board" being treated as a companyId.
  router.get("/board/deliverables", async (req, res) => {
    assertBoard(req);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;

    if (companyId) {
      const result = await workProducts.listCompanyDeliverables(companyId, search, type);
      res.json(result);
      return;
    }
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
      const result = await workProducts.listGlobalDeliverables(search, type);
      res.json(result);
      return;
    }
    const companyIds = req.actor.companyIds ?? [];
    if (companyIds.length === 0) { res.json([]); return; }
    const result = await workProducts.listGlobalDeliverables(search, type);
    res.json(result);
  });

  router.get("/board/deliverables/:id", async (req, res) => {
    assertBoard(req);
    const detail = await workProducts.getDetailById(req.params.id as string);
    if (!detail) { res.status(404).json({ error: "Deliverable not found" }); return; }
    res.json(detail);
  });

  router.get("/board/deliverables/:id/asset", async (req, res) => {
    assertBoard(req);
    const existing = await workProducts.getDetailById(req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: "Deliverable not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "work_product.asset_accessed",
      entityType: "issue_work_products",
      entityId: existing.id,
      details: {
        title: existing.title,
        type: existing.type,
        url: existing.url || null,
        issueId: existing.issueId,
      },
    });

    // ── Folder resolution helpers ────────────────────────────────────────────
    const boardInternalFolders: Record<string, string> = {
      "01_organizations": "1mt1gW80-ifMs1YOi2VLUIK1-GKbtyj7D",
      "02_programs":      "1Lq7sUNGdmZWu8XL0wB4h6yOQIgJbLhIP",
      "03_projects":      "1WvapNf0sGQEm_fdeJBwE2hm63plxessX",
      "04_resources":     "1u0xWeSNcNbgEzkj7BSL_9NA7pcUespNl",
      "05_reports":       "1ZzE45t0ws8sKn1HimIR7Ty_c7hw4VHFQ",
      "06_certificates":  "1pveOQdJ-2WO3D7JPr6NOG_aVRnumaYOA",
    };
    const clientsExternalFolders: Record<string, string> = {
      "01_organizations": "1g7RwTOjyAwIDAqcfC459cqXiYFjYAruC",
      "02_programs":      "1U88FXmIvCA6gaA_b_LtbBuNlaY5VYKRs",
      "03_projects":      "1AWB4pMt5IU3APRq87ex3igKvgYgevJWG",
      "04_resources":     "1poJpArhsTjdd20v5sIW1C4UeJeMzqlX4",
      "05_reports":       "1I7LrWC-dLKoCIYK1HNt9_Ek1iRjOA2UD",
      "06_certificates":  "1-HhxtE39SD2q3rW79zA_mMM-Sew3kK8e",
    };
    const folderLabels: Record<string, string> = {
      "01_organizations": "01_ORGANIZATIONS",
      "02_programs":      "02_PROGRAMS",
      "03_projects":      "03_PROJECTS",
      "04_resources":     "04_RESOURCES",
      "05_reports":       "05_REPORTS",
      "06_certificates":  "06_CERTIFICATES",
    };

    const meta = existing.metadata as Record<string, unknown> || {};
    const isExternal =
      meta.audience === "external" ||
      meta.audience === "client" ||
      meta.clientVisible === true ||
      meta.isExternal === true ||
      meta.external === true;

    const folderIdMap = isExternal ? clientsExternalFolders : boardInternalFolders;
    const t = (existing.type ?? "").toLowerCase();
    let folderKey = "01_organizations";
    if (["document", "text"].includes(t)) folderKey = "05_reports";
    else if (["image", "artifact", "visual", "video", "preview_url"].includes(t)) folderKey = "02_programs";
    else if (["code", "pull_request", "branch", "commit"].includes(t)) folderKey = "03_projects";
    else if (["runtime_service"].includes(t)) folderKey = "04_resources";
    else if (["audit", "certificate"].includes(t)) folderKey = "06_certificates";

    const folderId = folderIdMap[folderKey] || "1mt1gW80-ifMs1YOi2VLUIK1-GKbtyj7D";
    const folderLabel = folderLabels[folderKey] || "01_ORGANIZATIONS";
    const driveFolderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    // ── ?export=metadata → download JSON metadata ─────────────────────────────
    if (req.query.export === "metadata") {
      const slugTitle = (existing.title ?? "untitled")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
      res.setHeader("Content-Disposition", `attachment; filename="${slugTitle}-metadata.json"`);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(JSON.stringify(existing, null, 2));
      return;
    }

    // ── ?download=1 or ?open=1 → serve the actual asset (direct file or Drive fallback) ────
    if (req.query.download === "1" || req.query.open === "1") {
      const isDownload = req.query.download === "1";
      if (existing.url) {
        if (existing.url.startsWith("http://") || existing.url.startsWith("https://")) {
          res.redirect(existing.url);
          return;
        }
        try {
          const { fileURLToPath } = await import("node:url");
          const fs = await import("node:fs/promises");
          const resolvedPath = fileURLToPath(existing.url);
          const stats = await fs.stat(resolvedPath);
          if (stats.isFile()) {
            const slugTitle = (existing.title ?? "untitled")
              .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
            const extMap: Record<string, string> = {
              document: "md", text: "md", image: "png", artifact: "png",
              visual: "png", video: "mp4", audio: "mp3", preview_url: "html",
              code: "ts", pull_request: "ts", branch: "ts", commit: "ts",
              runtime_service: "json", audit: "md", certificate: "md",
            };
            const ext = extMap[t] ?? "md";
            const filename = `${slugTitle}.${ext}`;

            if (isDownload) {
              res.download(resolvedPath, filename);
            } else {
              res.sendFile(resolvedPath);
            }
            return;
          }
        } catch {
          // fall through to Drive
        }
      }
      res.redirect(driveFolderUrl);
      return;
    }

    // ── Default → render Work Order page ───────────────────────────────────
    // HTML-escape helper — prevents XSS from user-controlled deliverable fields
    const esc = (s: unknown): string =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    const company = await svc.getById(existing.companyId);
    const companyName = company ? company.name : "AMX · AIR HUBS";
    const companyPrefix = company ? company.issuePrefix.toUpperCase() : "AMX";
    const companySlug = companyName.toUpperCase().replace(/[^A-Z0-9\s]+/g, "").replace(/\s+/g, "-");
    const brandColor = (company && company.brandColor) || "#a78bfa";
    let brandColorRgb = "167,139,250";
    if (brandColor.startsWith("#")) {
      try {
        const cleanHex = brandColor.replace("#", "");
        const num = parseInt(cleanHex, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        brandColorRgb = `${r},${g},${b}`;
      } catch (err) {}
    }

    const openUrl = `/api/companies/board/deliverables/${existing.id}/asset?open=1`;
    const downloadUrl = `/api/companies/board/deliverables/${existing.id}/asset?download=1`;
    const metadataUrl = `/api/companies/board/deliverables/${existing.id}/asset?export=metadata`;
    const hasDirectUrl = !!existing.url;
    const isLocalFile = typeof existing.url === "string" && existing.url.startsWith("file://");
    const isWebLink = typeof existing.url === "string" && (existing.url.startsWith("http://") || existing.url.startsWith("https://"));
    const reviewState = (existing as any).reviewState ?? "pending";
    const healthStatus = (existing as any).healthStatus ?? "unknown";
    const summary = existing.summary ?? "";

    const auditStatus = (existing as any).auditStatus ?? null;
    const auditVerdict = (existing as any).auditVerdict ?? null;
    const certificateFootprint = (existing as any).certificateFootprint ?? null;
    const auditorAgentId = (existing as any).auditorAgentId ?? null;
    const auditorAgentName = (existing as any).auditorAgentName ?? null;

    const auditBadge = (state: string | null) => {
      if (!state) return null;
      const map: Record<string, [string, string]> = {
        passed:             ["#22c55e", "AUDIT PASSED"],
        failed:             ["#ef4444", "AUDIT FAILED"],
        flagged:            ["#f59e0b", "AUDIT FLAGGED"],
        in_progress:        ["#3b82f6", "AUDITING"],
        pending:            ["#6b7280", "AUDIT PENDING"],
        none:               ["#6b7280", "NO AUDIT STATUS"],
      };
      const [color, label] = map[state] ?? ["#6b7280", `AUDIT: ${state.toUpperCase()}`];
      return { color, label };
    };
    const ab = auditBadge(auditStatus);

    const slugTitle = (existing.title ?? "untitled")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    const extMap: Record<string, string> = {
      document: "md", text: "md", image: "png", artifact: "png",
      visual: "png", video: "mp4", audio: "mp3", preview_url: "html",
      code: "ts", pull_request: "ts", branch: "ts", commit: "ts",
      runtime_service: "json", audit: "md", certificate: "md",
    };
    const ext = extMap[t] ?? "md";
    const filename = `${slugTitle}.${ext}`;
    const tickerPrefix = companySlug.endsWith("OPPRRC") ? companySlug : `${companySlug}-OPPRRC`;
    const fullPath = `${tickerPrefix} / ${folderLabel} / ${filename}`;

    // Read local file preview for text/code/document/audit types
    let fileContentPreview = "";
    const isPreviewableText = ["document", "text", "code", "pull_request", "branch", "commit", "audit", "certificate"].includes(t);
    if (isPreviewableText && existing.url && isLocalFile) {
      try {
        const { fileURLToPath } = await import("node:url");
        const fs = await import("node:fs/promises");
        const resolvedPath = fileURLToPath(existing.url);
        const stats = await fs.stat(resolvedPath);
        if (stats.isFile() && stats.size < 1024 * 1024) { // Limit to 1MB
          fileContentPreview = await fs.readFile(resolvedPath, "utf-8");
        }
      } catch (err) {
        console.error("Error loading file content preview:", err);
      }
    }

    const reviewBadge = (state: string) => {
      const map: Record<string, [string, string]> = {
        approved:         ["#22c55e", "APPROVED"],
        pending:          ["#f59e0b", "PENDING"],
        needs_board_review: ["#a78bfa", "NEEDS REVIEW"],
        changes_requested:  ["#ef4444", "CHANGES REQUESTED"],
        rejected:         ["#dc2626", "REJECTED"],
      };
      const [color, label] = map[state] ?? ["#6b7280", state.toUpperCase()];
      return { color, label };
    };
    const healthBadge = (state: string) => {
      const map: Record<string, [string, string]> = {
        healthy:   ["#22c55e", "HEALTHY"],
        warning:   ["#f59e0b", "WARNING"],
        unhealthy: ["#ef4444", "UNHEALTHY"],
        unknown:   ["#6b7280", "UNKNOWN"],
      };
      const [color, label] = map[state] ?? ["#6b7280", state.toUpperCase()];
      return { color, label };
    };
    const typeIcon: Record<string, string> = {
      document: "📄", text: "📄", image: "🖼️", artifact: "🎨",
      visual: "🎨", video: "🎬", preview_url: "🌐", code: "💻",
      pull_request: "🔀", branch: "🌿", commit: "📝",
      runtime_service: "⚙️", audit: "🔍", certificate: "🏆",
    };
    const icon = typeIcon[t] ?? "📦";
    const rb = reviewBadge(reviewState);
    const hb = healthBadge(healthStatus);
    const routeLabel = isExternal ? "CLIENTS · EXTERNAL" : "BOARD · INTERNAL";
    const routeColor = isExternal ? "#06b6d4" : brandColor;
    const openBtnLabel = isLocalFile ? "Open Local File" : isWebLink ? "Open Link" : "View in Google Drive";
    const openBtnSub = isLocalFile ? "Served from VPS filesystem" : isWebLink ? "External resource URL" : "Fallback — OPPRRC Drive folder";
    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Work Order · ${esc(existing.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
:root {
  --brand-color: ${brandColor};
  --brand-color-rgb: ${brandColorRgb};
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px}
body{background:#07070e;color:#e2e8f0;font-family:'Inter',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 16px 64px}
.page{width:100%;max-width:760px;display:flex;flex-direction:column;gap:0}
/* Header */
.header{display:flex;align-items:center;justify-content:space-between;padding:20px 0 24px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:28px}
.brand{display:flex;flex-direction:column;gap:3px}
.brand-name{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--brand-color)}
.brand-sub{font-size:10px;color:#4b5563;letter-spacing:.06em;text-transform:uppercase}
.route-pill{font-size:10px;font-weight:700;letter-spacing:.12em;padding:4px 10px;border-radius:99px;border:1px solid;text-transform:uppercase}
/* Work order card */
.card{background:linear-gradient(135deg,rgba(20,18,40,.9) 0%,rgba(10,9,24,.9) 100%);border:1px solid rgba(var(--brand-color-rgb),.12);border-radius:20px;overflow:hidden;box-shadow:0 0 60px rgba(var(--brand-color-rgb),.08),0 2px 40px rgba(0,0,0,.5)}
/* OPPRRC path ticker */
.ticker-wrap{background:rgba(0,0,0,.4);border-bottom:1px solid rgba(255,255,255,.06);height:32px;display:flex;align-items:center;overflow:hidden;position:relative}
.ticker-fade-l,.ticker-fade-r{position:absolute;top:0;bottom:0;width:40px;z-index:2;pointer-events:none}
.ticker-fade-l{left:0;background:linear-gradient(to right,rgba(0,0,0,.8),transparent)}
.ticker-fade-r{right:0;background:linear-gradient(to left,rgba(0,0,0,.8),transparent)}
.ticker{display:flex;align-items:center;gap:0;animation:tick 22s linear infinite;white-space:nowrap;padding:0 20px}
@keyframes tick{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.ticker-text{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;color:var(--brand-color);letter-spacing:.08em;text-transform:uppercase;opacity:.85}
/* Card body */
.card-body{padding:28px 32px}
/* Title row */
.title-row{display:flex;align-items:flex-start;gap:14px;margin-bottom:24px}
.type-icon{font-size:40px;line-height:1;flex-shrink:0;margin-top:2px}
.title-group{flex:1;min-width:0}
.deliverable-title{font-size:22px;font-weight:800;color:#f1f5f9;line-height:1.3;word-break:break-word}
.deliverable-type{font-size:10px;font-weight:700;letter-spacing:.14em;color:#6b7280;text-transform:uppercase;margin-top:5px}
/* Badges row */
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
.badge{font-size:9px;font-weight:700;letter-spacing:.12em;padding:4px 10px;border-radius:6px;text-transform:uppercase;border:1px solid}
/* Meta grid */
.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
.meta-item{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:14px 16px}
.meta-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4b5563;margin-bottom:5px}
.meta-value{font-size:12px;font-weight:600;color:#cbd5e1;font-family:'JetBrains Mono',monospace;word-break:break-all}
/* Summary */
.summary-block{background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:16px;margin-bottom:28px}
.summary-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4b5563;margin-bottom:8px}
.summary-text{font-size:13px;color:#94a3b8;line-height:1.6}
/* Divider */
.divider{height:1px;background:linear-gradient(to right,transparent,rgba(167,139,250,.15),transparent);margin-bottom:28px}
/* Open section */
.open-section{display:flex;flex-direction:column;align-items:center;gap:14px}
.open-label{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4b5563}
.open-btn{display:inline-flex;flex-direction:column;align-items:center;gap:5px;padding:18px 40px;border-radius:14px;text-decoration:none;transition:all .2s;cursor:pointer;background:linear-gradient(135deg,var(--brand-color),rgba(var(--brand-color-rgb),0.7));border:1px solid rgba(var(--brand-color-rgb),.3);box-shadow:0 0 30px rgba(var(--brand-color-rgb),.25),0 4px 20px rgba(0,0,0,.4)}
.open-btn:hover{background:linear-gradient(135deg,rgba(var(--brand-color-rgb),0.95),rgba(var(--brand-color-rgb),0.65));box-shadow:0 0 50px rgba(var(--brand-color-rgb),.4),0 4px 24px rgba(0,0,0,.5);transform:translateY(-1px)}
.open-btn-main{font-size:15px;font-weight:800;color:#fff;letter-spacing:.02em}
.open-btn-sub{font-size:10px;font-weight:500;color:rgba(255,255,255,.55);letter-spacing:.04em}
.drive-note{font-size:10px;color:#374151;text-align:center;letter-spacing:.03em}
/* Footer */
.footer{margin-top:28px;padding-top:20px;border-top:1px solid rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.footer-left{font-size:9px;color:#1f2937;letter-spacing:.06em;font-family:'JetBrains Mono',monospace}
.footer-right{font-size:9px;color:#374151;letter-spacing:.06em}

/* Export options card */
.export-card{background:rgba(var(--brand-color-rgb),.04);border:1px solid rgba(var(--brand-color-rgb),.15);border-radius:16px;padding:24px;margin-bottom:28px}
.export-header{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.export-icon{font-size:24px}
.export-title-group{display:flex;flex-direction:column;gap:2px}
.export-title{font-size:13px;font-weight:800;letter-spacing:.05em;color:#f1f5f9;text-transform:uppercase}
.export-subtitle{font-size:10px;color:#6b7280}
.export-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.export-option-btn{display:flex;flex-direction:column;gap:4px;padding:16px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.05);border-radius:12px;text-decoration:none;transition:all .2s;cursor:pointer;text-align:left}
.export-option-btn:hover{background:rgba(var(--brand-color-rgb),.08);border-color:rgba(var(--brand-color-rgb),.3);transform:translateY(-1px)}
.export-btn-title-row{display:flex;align-items:center;gap:8px}
.export-btn-icon{font-size:16px}
.export-btn-text{font-size:12px;font-weight:700;color:#e2e8f0}
.export-btn-desc{font-size:10px;color:#6b7280;line-height:1.4;margin-top:2px}

/* Preview container */
.preview-container{background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:20px;margin-bottom:28px}
.preview-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.05)}
.preview-title{font-size:11px;font-weight:700;letter-spacing:.05em;color:#94a3b8;text-transform:uppercase}
.copy-btn{background:rgba(var(--brand-color-rgb),.1);border:1px solid rgba(var(--brand-color-rgb),.25);color:var(--brand-color);font-size:10px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer;transition:all .2s}
.copy-btn:hover{background:rgba(var(--brand-color-rgb),.2);border-color:rgba(var(--brand-color-rgb),.4);color:#fff}
pre{background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.03);border-radius:8px;padding:16px;max-height:350px;overflow:auto;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.5;color:#cbd5e1;white-space:pre-wrap;word-break:break-all}

/* Media previews */
.media-preview-box{display:flex;justify-content:center;align-items:center;padding:24px;background:rgba(0,0,0,.25);border-radius:12px;border:1px solid rgba(255,255,255,.04);overflow:hidden}

/* Back button */
.back-link-container{margin-bottom:16px;display:flex}
.back-link{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#6b7280;text-decoration:none;transition:color .2s;letter-spacing:.08em;text-transform:uppercase}
.back-link:hover{color:var(--brand-color)}

@media print{
  body{background:#fff;color:#000;padding:0}
  .card{box-shadow:none;border:none;background:none}
  .ticker-wrap,.open-section,.export-card,.copy-btn,.header,.footer,.back-link-container{display:none !important}
  .preview-container{border:1px solid #ccc;background:none;page-break-inside:avoid}
  pre{background:none;border:none;max-height:none;overflow:visible;color:#000}
  .meta-item{border:1px solid #ccc;background:none}
  .meta-value,.deliverable-title{color:#000}
}
</style>
<script>
function copyToClipboard(btn) {
  const codeBlock = document.getElementById('preview-code');
  if (!codeBlock) return;
  navigator.clipboard.writeText(codeBlock.innerText).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '📋 Copied!';
    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
  }).catch(err => {
    console.error('Failed to copy text:', err);
  });
}
</script>
</head>
<body>
<div class="page">
  <!-- Back Link -->
  <div class="back-link-container">
    <a href="/${companyPrefix}/briefcase" class="back-link">← Back to AMX</a>
  </div>

  <!-- Header -->
  <header class="header">
    <div class="brand">
      <div class="brand-name">${esc(companyName)}</div>
      <div class="brand-sub">OPPRRC Work Order</div>
    </div>
    <div class="route-pill" style="color:${routeColor};border-color:${routeColor}30;background:${routeColor}10">${routeLabel}</div>
  </header>

  <!-- Main card -->
  <div class="card">
    <!-- OPPRRC path ticker -->
    <div class="ticker-wrap" aria-hidden="true">
      <div class="ticker-fade-l"></div>
      <div class="ticker">
        <span class="ticker-text">${fullPath}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;${fullPath}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;${fullPath}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;${fullPath}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;${fullPath}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;${fullPath}</span>
      </div>
      <div class="ticker-fade-r"></div>
    </div>

    <div class="card-body">
      <!-- Title -->
      <div class="title-row">
        <div class="type-icon">${icon}</div>
        <div class="title-group">
          <div class="deliverable-title">${esc(existing.title) || "Untitled Deliverable"}</div>
          <div class="deliverable-type">${esc(existing.type) || "unknown"} · ${folderLabel}</div>
        </div>
      </div>

      <!-- Badges -->
      <div class="badges">
        <span class="badge" style="color:${rb.color};border-color:${rb.color}40;background:${rb.color}12">⬤ ${rb.label}</span>
        <span class="badge" style="color:${hb.color};border-color:${hb.color}40;background:${hb.color}12">${hb.label}</span>
        <span class="badge" style="color:${routeColor};border-color:${routeColor}40;background:${routeColor}12">${routeLabel}</span>
        ${hasDirectUrl ? `<span class="badge" style="color:#34d399;border-color:#34d39940;background:#34d39912">FILE LINKED</span>` : `<span class="badge" style="color:#f59e0b;border-color:#f59e0b40;background:#f59e0b12">DRIVE FALLBACK</span>`}
        ${ab ? `<span class="badge" style="color:${ab.color};border-color:${ab.color}40;background:${ab.color}12">⬤ ${ab.label}</span>` : ""}
      </div>

      <!-- Meta grid -->
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">Deliverable ID</div>
          <div class="meta-value">${esc(existing.id.slice(0, 8))}…</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Issue</div>
          <div class="meta-value">${existing.issueId ? esc(existing.issueId.slice(0, 12)) + "…" : "—"}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Folder</div>
          <div class="meta-value">${folderLabel}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">File</div>
          <div class="meta-value">${esc(filename)}</div>
        </div>
        ${existing.projectId ? `<div class="meta-item"><div class="meta-label">Project</div><div class="meta-value">${esc((existing.projectId as string).slice(0,12))}…</div></div>` : ""}
        <div class="meta-item">
          <div class="meta-label">Source</div>
          <div class="meta-value">${isLocalFile ? "VPS filesystem" : isWebLink ? "External URL" : "Drive folder"}</div>
        </div>
        ${existing.agentName ? `<div class="meta-item"><div class="meta-label">Agent</div><div class="meta-value">${esc(existing.agentName)}</div></div>` : ""}
        ${existing.createdByRunId && existing.agentId ? `<div class="meta-item"><div class="meta-label">Run Trace</div><div class="meta-value"><a href="/${companyPrefix}/agents/${existing.agentId}/runs/${existing.createdByRunId}" target="_blank" style="color:var(--brand-color);text-decoration:none;border-bottom:1px dashed var(--brand-color)">${esc((existing.createdByRunId as string).slice(0, 8))}</a></div></div>` : ""}
      </div>

      ${auditStatus || certificateFootprint || auditVerdict ? `
      <div class="summary-block" style="border-color: rgba(34, 197, 94, 0.25); background: rgba(34, 197, 94, 0.03); border-radius: 12px; padding: 18px; margin-bottom: 24px;">
        <div style="font-size: 10px; font-weight: 800; letter-spacing: 0.15em; color: #22c55e; text-transform: uppercase; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
          🛡️ SECURITY & AUDIT VERIFICATION TRACE
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
          ${auditorAgentName ? `
          <div class="meta-item" style="background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.03);">
            <div class="meta-label">Audit Agent</div>
            <div class="meta-value">${esc(auditorAgentName)}</div>
          </div>` : ""}
          ${auditorAgentId ? `
          <div class="meta-item" style="background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.03);">
            <div class="meta-label">Audit Run Trace</div>
            <div class="meta-value">
              <a href="/${companyPrefix}/agents/${auditorAgentId}/runs" target="_blank" style="color:var(--brand-color);text-decoration:none;border-bottom:1px dashed var(--brand-color)">
                Runs History
              </a>
            </div>
          </div>` : ""}
          ${certificateFootprint ? `
          <div class="meta-item" style="background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.03); grid-column: span 2;">
            <div class="meta-label">AMX Chain Certificate Footprint</div>
            <div class="meta-value" style="color: #22c55e; font-family: 'JetBrains Mono', monospace; font-size: 11px; word-break: break-all;">${esc(certificateFootprint)}</div>
          </div>` : ""}
          ${auditVerdict ? `
          <div class="meta-item" style="background: rgba(0,0,0,0.2); border-color: rgba(255,255,255,0.03); grid-column: span 2;">
            <div class="meta-label">Auditor Verdict Summary</div>
            <div class="meta-value" style="font-family: inherit; font-size: 12px; color: #94a3b8; line-height: 1.5; white-space: pre-wrap; word-break: normal;">${esc(auditVerdict)}</div>
          </div>` : ""}
        </div>
      </div>
      ` : ""}

      ${summary ? `
      <div class="summary-block">
        <div class="summary-label">Summary</div>
        <div class="summary-text">${esc(summary)}</div>
      </div>` : ""}

      <!-- Previews -->
      ${["image", "visual", "artifact"].includes(t) && existing.url ? `
      <div class="preview-container">
        <div class="preview-header">
          <span class="preview-title">🖼️ Image Preview</span>
        </div>
        <div class="media-preview-box">
          <img src="/api/companies/board/deliverables/${existing.id}/asset?open=1" style="max-width:100%;max-height:360px;object-fit:contain;border-radius:6px;" alt="Image Preview"/>
        </div>
      </div>` : ""}

      ${["video"].includes(t) && existing.url ? `
      <div class="preview-container">
        <div class="preview-header">
          <span class="preview-title">🎬 Video Preview</span>
        </div>
        <div class="media-preview-box">
          <video controls style="max-width:100%;max-height:360px;border-radius:6px;">
            <source src="/api/companies/board/deliverables/${existing.id}/asset?open=1" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </div>
      </div>` : ""}

      ${["audio"].includes(t) && existing.url ? `
      <div class="preview-container">
        <div class="preview-header">
          <span class="preview-title">🎵 Audio Preview</span>
        </div>
        <div class="media-preview-box">
          <audio controls style="width:100%;">
            <source src="/api/companies/board/deliverables/${existing.id}/asset?open=1" type="audio/mpeg">
            Your browser does not support the audio tag.
          </audio>
        </div>
      </div>` : ""}

      ${fileContentPreview ? `
      <div class="preview-container">
        <div class="preview-header">
          <span class="preview-title">📄 File Content Preview (${esc(filename)})</span>
          <button class="copy-btn" onclick="copyToClipboard(this)">📋 Copy Content</button>
        </div>
        <pre id="preview-code"><code>${esc(fileContentPreview)}</code></pre>
      </div>` : ""}

      <!-- Export Options -->
      <div class="export-card">
        <div class="export-header">
          <div class="export-icon">💾</div>
          <div class="export-title-group">
            <div class="export-title">Export &amp; Download Options</div>
            <div class="export-subtitle">Choose format or download options below</div>
          </div>
        </div>
        <div class="export-grid">
          ${hasDirectUrl ? `
          <a href="${downloadUrl}" class="export-option-btn">
            <div class="export-btn-title-row">
              <span class="export-btn-icon">📥</span>
              <span class="export-btn-text">Download Raw File</span>
            </div>
            <span class="export-btn-desc">Download original file as ${ext.toUpperCase()}</span>
          </a>
          ` : `
          <a href="${driveFolderUrl}" target="_blank" class="export-option-btn">
            <div class="export-btn-title-row">
              <span class="export-btn-icon">📁</span>
              <span class="export-btn-text">Open Drive Folder</span>
            </div>
            <span class="export-btn-desc">Browse files in the mapped Google Drive folder</span>
          </a>
          `}
          <a href="${metadataUrl}" class="export-option-btn">
            <div class="export-btn-title-row">
              <span class="export-btn-icon">📊</span>
              <span class="export-btn-text">Export Metadata JSON</span>
            </div>
            <span class="export-btn-desc">Download structured work product metadata</span>
          </a>
          <button onclick="window.print()" class="export-option-btn">
            <div class="export-btn-title-row">
              <span class="export-btn-icon">🖨️</span>
              <span class="export-btn-text">Print / Save as PDF</span>
            </div>
            <span class="export-btn-desc">Generate print-ready copy of this work order</span>
          </button>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Open button -->
      <div class="open-section">
        <div class="open-label">Access Deliverable</div>
        <a href="${openUrl}" id="open-asset-btn" class="open-btn">
          <span class="open-btn-main">→ ${openBtnLabel}</span>
          <span class="open-btn-sub">${openBtnSub}</span>
        </a>
        ${!hasDirectUrl ? `<div class="drive-note">No direct file URL registered · Opens OPPRRC Drive folder for manual lookup</div>` : ""}
      </div>
    </div>

    <!-- Footer -->
    <div class="footer" style="padding:0 32px 24px;margin-top:0">
      <div class="footer-left">WO · ${esc(existing.id)}</div>
      <div class="footer-right">Generated ${now}</div>
    </div>
  </div>
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });


  router.patch("/board/deliverables/:id/review", async (req, res) => {
    assertBoard(req);
    const existing = await workProducts.getById(req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: "Deliverable not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const { reviewState, healthStatus, comment } = req.body as {
      reviewState?: string;
      healthStatus?: string;
      comment?: string;
    };

    const patch: Record<string, unknown> = {};
    if (reviewState) patch.reviewState = reviewState;
    if (healthStatus) patch.healthStatus = healthStatus;
    if (comment) {
      patch.metadata = {
        ...(existing.metadata || {}),
        lastReviewComment: comment,
      };
    }

    const updated = await workProducts.update(req.params.id as string, patch as any);
    if (!updated) {
      res.status(404).json({ error: "Deliverable not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "deliverable.reviewed",
      entityType: "issue_work_products",
      entityId: existing.id,
      agentId: actor.agentId,
      runId: actor.runId,
      details: {
        title: existing.title,
        reviewState,
        healthStatus,
        comment: comment || null,
      },
    });

    const issue = await db
      .select({ assigneeAgentId: issues.assigneeAgentId, projectId: issues.projectId })
      .from(issues)
      .where(eq(issues.id, existing.issueId))
      .then((rows) => rows[0] ?? null);

    if (issue?.assigneeAgentId) {
      const statusLabel =
        reviewState === "approved"
          ? "Approved"
          : reviewState === "changes_requested"
          ? "Changes Requested"
          : reviewState === "rejected"
          ? "Rejected"
          : reviewState;

      const memoryContent = [
        `Deliverable: ${existing.title} (${existing.type})`,
        `Review Action: ${statusLabel}`,
        comment ? `Feedback Comment: ${comment}` : "No comments provided.",
        existing.summary ? `Deliverable Summary: ${existing.summary}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      await db.insert(agentMemories).values({
        agentId: issue.assigneeAgentId,
        companyId: existing.companyId,
        scope: "project",
        projectId: existing.projectId ?? issue.projectId ?? null,
        category: "feedback",
        title: `Board Review: ${statusLabel} - ${existing.title}`,
        content: memoryContent,
        source: "board",
        confidence: 1.0,
      });
    }

    res.json(updated);
  });

  router.get("/:companyId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    // Allow agents (CEO) to read their own company; board always allowed
    if (req.actor.type !== "agent") {
      assertBoard(req);
    }
    const company = await svc.getById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  });

  router.post("/:companyId/export", validate(companyPortabilityExportSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await portability.exportBundle(companyId, req.body);
    res.json(result);
  });

  router.post("/import/preview", validate(companyPortabilityPreviewSchema), async (req, res) => {
    assertBoard(req);
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    }
    const preview = await portability.previewImport(req.body);
    res.json(preview);
  });

  router.post("/import", validate(companyPortabilityImportSchema), async (req, res) => {
    assertBoard(req);
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    }
    const actor = getActorInfo(req);
    const result = await portability.importBundle(req.body, req.actor.type === "board" ? req.actor.userId : null);
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.imported",
      entityType: "company",
      entityId: result.company.id,
      agentId: actor.agentId,
      runId: actor.runId,
      details: {
        include: req.body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
      },
    });
    res.json(result);
  });

  router.post("/:companyId/exports/preview", validate(companyPortabilityExportSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanManagePortability(req, companyId, "exports");
    const preview = await portability.previewExport(companyId, req.body);
    res.json(preview);
  });

  router.post("/:companyId/exports", validate(companyPortabilityExportSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanManagePortability(req, companyId, "exports");
    const result = await portability.exportBundle(companyId, req.body);
    res.json(result);
  });

  router.post("/:companyId/imports/preview", validate(companyPortabilityPreviewSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanManagePortability(req, companyId, "imports");
    if (req.body.target.mode === "existing_company" && req.body.target.companyId !== companyId) {
      throw forbidden("Safe import route can only target the route company");
    }
    if (req.body.collisionStrategy === "replace") {
      throw forbidden("Safe import route does not allow replace collision strategy");
    }
    const preview = await portability.previewImport(req.body, {
      mode: "agent_safe",
      sourceCompanyId: companyId,
    });
    res.json(preview);
  });

  router.post("/:companyId/imports/apply", validate(companyPortabilityImportSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanManagePortability(req, companyId, "imports");
    if (req.body.target.mode === "existing_company" && req.body.target.companyId !== companyId) {
      throw forbidden("Safe import route can only target the route company");
    }
    if (req.body.collisionStrategy === "replace") {
      throw forbidden("Safe import route does not allow replace collision strategy");
    }
    const actor = getActorInfo(req);
    const result = await portability.importBundle(req.body, req.actor.type === "board" ? req.actor.userId : null, {
      mode: "agent_safe",
      sourceCompanyId: companyId,
    });
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      entityType: "company",
      entityId: result.company.id,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.imported",
      details: {
        include: req.body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
        importMode: "agent_safe",
      },
    });
    res.json(result);
  });

  router.post("/", validate(createCompanySchema), async (req, res) => {
    assertBoard(req);
    if (!(req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) {
      throw forbidden("Instance admin required");
    }
    const company = await svc.create(req.body);
    await access.ensureMembership(company.id, "user", req.actor.userId ?? "local-board", "owner", "active");
    await logActivity(db, {
      companyId: company.id,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      details: { name: company.name },
    });
    if (company.budgetMonthlyCents > 0) {
      await budgets.upsertPolicy(
        company.id,
        {
          scopeType: "company",
          scopeId: company.id,
          amount: company.budgetMonthlyCents,
          windowKind: "calendar_month_utc",
        },
        req.actor.userId ?? "board",
      );
    }
    res.status(201).json(company);
  });

  router.patch("/:companyId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const actor = getActorInfo(req);
    let body: Record<string, unknown>;

    if (req.actor.type === "agent") {
      // Only CEO agents may update company branding fields
      const agentSvc = agentService(db);
      const actorAgent = req.actor.agentId ? await agentSvc.getById(req.actor.agentId) : null;
      if (!actorAgent || actorAgent.role !== "ceo") {
        throw forbidden("Only CEO agents or board users may update company settings");
      }
      if (actorAgent.companyId !== companyId) {
        throw forbidden("Agent key cannot access another company");
      }
      body = updateCompanyBrandingSchema.parse(req.body);
    } else {
      assertBoard(req);
      body = updateCompanySchema.parse(req.body);
    }

    const company = await svc.update(companyId, body);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.updated",
      entityType: "company",
      entityId: companyId,
      details: body,
    });
    res.json(company);
  });

  router.patch("/:companyId/branding", validate(updateCompanyBrandingSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanUpdateBranding(req, companyId);
    const company = await svc.update(companyId, req.body);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.branding_updated",
      entityType: "company",
      entityId: companyId,
      details: req.body,
    });
    res.json(company);
  });

  router.post("/:companyId/archive", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.archive(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.archived",
      entityType: "company",
      entityId: companyId,
    });
    res.json(company);
  });

  router.delete("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.remove(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.get("/:companyId/metrics", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const metrics = await workProducts.getCompanyMetrics(companyId);
    res.json(metrics);
  });
 
  router.post("/:companyId/deployment-target", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { target } = req.body;
    if (!["local", "cloud"].includes(target)) {
      res.status(400).json({ error: "Invalid target. Must be 'local' or 'cloud'." });
      return;
    }
    
    await svc.update(companyId, { deploymentTarget: target });
    
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.deployment_target_updated",
      entityType: "company",
      entityId: companyId,
      details: { target },
    });
 
    res.json({ ok: true, target });
  });
 
  return router;
}
