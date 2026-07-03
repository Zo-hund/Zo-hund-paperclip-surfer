import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { opprrcStorageService } from "../services/opprrc-storage.js";

const resetSchema = z.object({
  reason: z.string().min(1),
});

export function opprrcRoutes(db: Db): Router {
  const router = Router();
  const svc = opprrcStorageService(db);

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
