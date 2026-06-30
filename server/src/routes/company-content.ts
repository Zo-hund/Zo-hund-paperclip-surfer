import { Router } from "express";
import QRCode from "qrcode";
import type { Db } from "@paperclipai/db";
import {
  createCompanyStaffSchema,
  updateCompanyStaffSchema,
  createCompanyEventSchema,
  updateCompanyEventSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assetService, companyContentService, companyService, logActivity } from "../services/index.js";
import type { StorageService } from "../storage/types.js";
import { assertCompanyAccess, assertCompanyRole, getActorInfo } from "./authz.js";

function assetUrl(assetId: string | null | undefined): string | null {
  return assetId ? `/api/public/assets/${assetId}/content` : null;
}

export function companyContentRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const content = companyContentService(db);
  const assets = assetService(db);
  const companies = companyService(db);

  async function generateQrAsset(companyId: string, registrationUrl: string, actorUserId: string | null) {
    const buffer = await QRCode.toBuffer(registrationUrl, { type: "png", margin: 1, width: 480 });
    const stored = await storage.putFile({
      companyId,
      namespace: "assets/events",
      originalFilename: "registration-qr.png",
      contentType: "image/png",
      body: buffer,
    });
    return assets.create(companyId, {
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: null,
      createdByUserId: actorUserId,
    });
  }

  // ── Public, unauthenticated content for a company's marketing page ─────────
  router.get("/companies/public/:slug/content", async (req, res) => {
    const company = await companies.getByPrefix(req.params.slug as string);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [staff, events] = await Promise.all([
      content.listPublishedStaff(company.id),
      content.listPublishedEvents(company.id),
    ]);

    res.json({
      company: {
        id: company.id,
        name: company.name,
        description: company.description,
        brandColor: company.brandColor,
      },
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        title: s.title,
        photoUrl: assetUrl(s.photoAssetId),
        sortOrder: s.sortOrder,
      })),
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        startDate: e.startDate,
        endDate: e.endDate,
        timeRange: e.timeRange,
        ageRange: e.ageRange,
        description: e.description,
        flyerUrl: assetUrl(e.flyerAssetId),
        registrationUrl: e.registrationUrl,
        qrCodeUrl: assetUrl(e.qrCodeAssetId),
      })),
    });
  });

  // ── Admin: staff ─────────────────────────────────────────────────────────
  router.get("/companies/:companyId/staff", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await content.listStaff(companyId));
  });

  router.post(
    "/companies/:companyId/staff",
    validate(createCompanyStaffSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertCompanyRole(req, companyId, "admin");

      const created = await content.createStaff(companyId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company_staff.created",
        entityType: "company_staff",
        entityId: created.id,
        details: { name: created.name, title: created.title },
      });
      res.status(201).json(created);
    },
  );

  router.patch(
    "/companies/:companyId/staff/:staffId",
    validate(updateCompanyStaffSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertCompanyRole(req, companyId, "admin");

      const existing = await content.getStaffById(req.params.staffId as string);
      if (!existing || existing.companyId !== companyId) {
        res.status(404).json({ error: "Staff member not found" });
        return;
      }
      const updated = await content.updateStaff(existing.id, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company_staff.updated",
        entityType: "company_staff",
        entityId: existing.id,
        details: req.body,
      });
      res.json(updated);
    },
  );

  router.delete("/companies/:companyId/staff/:staffId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");

    const existing = await content.getStaffById(req.params.staffId as string);
    if (!existing || existing.companyId !== companyId) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }
    await content.deleteStaff(existing.id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company_staff.deleted",
      entityType: "company_staff",
      entityId: existing.id,
    });
    res.status(204).send();
  });

  // ── Admin: events ────────────────────────────────────────────────────────
  router.get("/companies/:companyId/events", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await content.listEvents(companyId));
  });

  router.post(
    "/companies/:companyId/events",
    validate(createCompanyEventSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertCompanyRole(req, companyId, "admin");

      const actor = getActorInfo(req);
      let qrCodeAssetId: string | null = null;
      if (req.body.registrationUrl) {
        const qrAsset = await generateQrAsset(
          companyId,
          req.body.registrationUrl,
          actor.actorType === "user" ? actor.actorId : null,
        );
        qrCodeAssetId = qrAsset.id;
      }

      const created = await content.createEvent(companyId, { ...req.body, qrCodeAssetId });
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company_event.created",
        entityType: "company_event",
        entityId: created.id,
        details: { title: created.title },
      });
      res.status(201).json(created);
    },
  );

  router.patch(
    "/companies/:companyId/events/:eventId",
    validate(updateCompanyEventSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertCompanyRole(req, companyId, "admin");

      const existing = await content.getEventById(req.params.eventId as string);
      if (!existing || existing.companyId !== companyId) {
        res.status(404).json({ error: "Event not found" });
        return;
      }

      const actor = getActorInfo(req);
      const updates: Record<string, unknown> = { ...req.body };
      if (req.body.registrationUrl && req.body.registrationUrl !== existing.registrationUrl) {
        const qrAsset = await generateQrAsset(
          companyId,
          req.body.registrationUrl,
          actor.actorType === "user" ? actor.actorId : null,
        );
        updates.qrCodeAssetId = qrAsset.id;
      }

      const updated = await content.updateEvent(existing.id, updates as any);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company_event.updated",
        entityType: "company_event",
        entityId: existing.id,
        details: req.body,
      });
      res.json(updated);
    },
  );

  router.delete("/companies/:companyId/events/:eventId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");

    const existing = await content.getEventById(req.params.eventId as string);
    if (!existing || existing.companyId !== companyId) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    await content.deleteEvent(existing.id);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company_event.deleted",
      entityType: "company_event",
      entityId: existing.id,
    });
    res.status(204).send();
  });

  return router;
}

// ── Scoped public asset route ─────────────────────────────────────────────
// Serves an asset with NO board auth, but only if it's referenced by a
// published company_staff/company_events row. Keeps the general
// `/api/assets/:assetId/content` route's auth intact for everything else.
export function publicCompanyContentAssetRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const content = companyContentService(db);
  const assets = assetService(db);

  router.get("/public/assets/:assetId/content", async (req, res, next) => {
    const assetId = req.params.assetId as string;
    const asset = await assets.getById(assetId);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const isPublic = await content.isAssetPubliclyReferenced(assetId);
    if (!isPublic) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const object = await storage.getObject(asset.companyId, asset.objectKey);
    const responseContentType = asset.contentType || object.contentType || "application/octet-stream";
    res.setHeader("Content-Type", responseContentType);
    res.setHeader("Content-Length", String(asset.byteSize || object.contentLength || 0));
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");

    object.stream.on("error", (err) => {
      next(err);
    });
    object.stream.pipe(res);
  });

  return router;
}
