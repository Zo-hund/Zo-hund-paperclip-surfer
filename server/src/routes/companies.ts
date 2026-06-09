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
    const existing = await workProducts.getById(req.params.id as string);
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

    let fileServed = false;

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
          res.sendFile(resolvedPath);
          fileServed = true;
          return;
        }
      } catch (err) {
        // ignore, will fallback
      }
    }

    if (!fileServed) {
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

      const meta = existing.metadata || {};
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
      res.redirect(`https://drive.google.com/drive/folders/${folderId}`);
    }
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
