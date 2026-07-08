import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { OPPRRC_CATEGORY_SLUGS, OPPRRC_AUDIENCES } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { opprrcStorageService, assertIssueReadyForOpprcDelivery } from "../services/opprrc-storage.js";
import { issueService, assetService, logActivity } from "../services/index.js";
import type { StorageService } from "../storage/types.js";
import { notFound, unprocessable } from "../errors.js";

const resetSchema = z.object({
  reason: z.string().min(1),
});

const deliverSchema = z.object({
  issueId: z.string().uuid(),
  assetId: z.string().uuid(),
  category: z.enum(OPPRRC_CATEGORY_SLUGS),
  audience: z.enum(OPPRRC_AUDIENCES).optional(),
  locationSlug: z.string().optional(),
  costEstimateTokens: z.number().nonnegative().optional(),
});

async function bufferStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function opprrcRoutes(db: Db, storage: StorageService): Router {
  const router = Router();
  const svc = opprrcStorageService(db);
  const issuesSvc = issueService(db);
  const assetsSvc = assetService(db);

  // List deliveries for a company (optionally filtered by issueId)
  router.get("/companies/:companyId/opprrc/deliveries", async (req, res, next) => {
    try {
      assertCompanyAccess(req, req.params.companyId);
      const deliveries = await svc.listDeliveries(req.params.companyId, req.query.issueId as string | undefined);
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  });

  // Deliver an already-uploaded asset into the OPPRRC system
  router.post(
    "/companies/:companyId/opprrc/deliveries",
    validate(deliverSchema),
    async (req, res, next) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);
        const actor = getActorInfo(req);

        const issue = await issuesSvc.getById(req.body.issueId);
        if (!issue) {
          throw notFound("Issue not found");
        }
        if (issue.companyId !== companyId) {
          throw unprocessable("Issue does not belong to company");
        }
        assertIssueReadyForOpprcDelivery(issue);

        const asset = await assetsSvc.getById(req.body.assetId);
        if (!asset) {
          throw notFound("Asset not found");
        }
        if (asset.companyId !== companyId) {
          throw unprocessable("Asset does not belong to company");
        }

        const object = await storage.getObject(companyId, asset.objectKey);
        const fileContent = await bufferStream(object.stream);

        const result = await svc.deliver({
          companyId,
          issueId: req.body.issueId,
          assetId: req.body.assetId,
          category: req.body.category,
          audience: req.body.audience,
          locationSlug: req.body.locationSlug,
          filename: asset.originalFilename ?? req.body.assetId,
          fileContent,
          costEstimateTokens: req.body.costEstimateTokens,
          agentId: actor.agentId ?? undefined,
        });

        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "opprrc.delivered",
          entityType: "opprrc_delivery",
          entityId: result.deliveryId,
          details: {
            issueId: req.body.issueId,
            assetId: req.body.assetId,
            category: req.body.category,
            audience: req.body.audience ?? "CLIENTS-EXTERNAL",
            runNumber: result.runNumber,
          },
        });

        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // Get storage details for a single delivery
  router.get("/companies/:companyId/opprrc/deliveries/:deliveryId/storage", async (req, res, next) => {
    try {
      assertCompanyAccess(req, req.params.companyId);
      const delivery = await svc.getDelivery(req.params.deliveryId);
      if (!delivery || delivery.companyId !== req.params.companyId) {
        res.status(404).json({ error: "Delivery not found" });
        return;
      }
      res.json({
        id: delivery.id,
        liveStorage: delivery.liveStorage,
        vpsFilePath: delivery.vpsFilePath,
        vpsFileUrl: delivery.vpsFileUrl,
        vpsVerifiedAt: delivery.vpsVerifiedAt,
        backupStorage: delivery.backupStorage,
        googleDriveFileId: delivery.googleDriveFileId,
        googleDriveFolderId: delivery.googleDriveFolderId,
        googleDriveFileUrl: delivery.googleDriveFileUrl,
        backupStatus: delivery.backupStatus,
        lastBackupAt: delivery.lastBackupAt,
        runNumber: delivery.runNumber,
      });
    } catch (err) {
      next(err);
    }
  });

  // Manually trigger Drive backup sync for a delivery
  router.post("/companies/:companyId/opprrc/deliveries/:deliveryId/sync-backup", async (req, res, next) => {
    try {
      assertCompanyAccess(req, req.params.companyId);
      const delivery = await svc.getDelivery(req.params.deliveryId);
      if (!delivery || delivery.companyId !== req.params.companyId) {
        res.status(404).json({ error: "Delivery not found" });
        return;
      }
      // Queue a new backup job (worker picks it up within 15 min)
      const { opprrcBackupJobs } = await import("@paperclipai/db");
      await db.insert(opprrcBackupJobs).values({
        deliveryId: delivery.id,
        companyId: req.params.companyId,
      });
      res.json({ queued: true, deliveryId: delivery.id });
    } catch (err) {
      next(err);
    }
  });

  // Get run control state (100-run batch status)
  router.get("/companies/:companyId/opprrc/run-control", async (req, res, next) => {
    try {
      assertCompanyAccess(req, req.params.companyId);
      const ctrl = await svc.getRunControl();
      res.json(ctrl);
    } catch (err) {
      next(err);
    }
  });

  // Reset run control (operator only — board actor required)
  router.post(
    "/companies/:companyId/opprrc/run-control/reset",
    validate(resetSchema),
    async (req, res, next) => {
      try {
        assertCompanyAccess(req, req.params.companyId as string);
        const actor = getActorInfo(req);
        if (actor.actorType !== "user") {
          res.status(403).json({ error: "Only board operators can reset the run control" });
          return;
        }
        await svc.resetRunControl(actor.actorId ?? "operator", req.body.reason);
        const ctrl = await svc.getRunControl();
        res.json({ reset: true, ...ctrl });
      } catch (err) {
        next(err);
      }
    },
  );

  // Backup status summary
  router.get("/companies/:companyId/opprrc/backups/status", async (req, res, next) => {
    try {
      assertCompanyAccess(req, req.params.companyId);
      const status = await svc.getBackupStatus(req.params.companyId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // Admin: trigger full backup run now (board only)
  router.post("/admin/backups/run", async (req, res, next) => {
    try {
      if (req.actor.type !== "board") {
        res.status(403).json({ error: "Board access required" });
        return;
      }
      // Queue backup jobs for all companies with pending deliveries
      const { opprrcDeliveries, opprrcBackupJobs } = await import("@paperclipai/db");
      const { eq } = await import("drizzle-orm");
      const pending = await db.query.opprrcDeliveries.findMany({
        where: eq(opprrcDeliveries.backupStatus, "not_started"),
        limit: 50,
      });
      if (pending.length > 0) {
        await db.insert(opprrcBackupJobs).values(
          pending.map((d) => ({ deliveryId: d.id, companyId: d.companyId })),
        );
      }
      res.json({ queued: pending.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
