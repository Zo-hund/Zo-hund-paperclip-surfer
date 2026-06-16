import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { webhookDeliveryService, WEBHOOK_EVENTS } from "../services/webhook-delivery.js";
import { assertCompanyAccess } from "./authz.js";
import { requireCompanyRole } from "../middleware/require-company-role.js";

export function webhookRoutes(db: Db) {
  const router = Router();
  const svc = webhookDeliveryService(db);

  router.get("/companies/:companyId/webhooks/events", (req, res) => {
    assertCompanyAccess(req, req.params.companyId as string);
    res.json({ events: WEBHOOK_EVENTS });
  });

  router.get("/companies/:companyId/webhooks", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const hooks = await svc.list(companyId);
    // Redact secret — only expose last 8 chars for identification
    res.json(hooks.map((h) => ({ ...h, secret: `...${h.secret.slice(-8)}` })));
  });

  router.post(
    "/companies/:companyId/webhooks",
    requireCompanyRole("admin"),
    async (req, res) => {
      const { companyId } = req.params as { companyId: string };
      assertCompanyAccess(req, companyId);
      const { url, secret, events, description } = req.body as {
        url?: string;
        secret?: string;
        events?: string[];
        description?: string;
      };
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "url is required" });
        return;
      }
      // Validate events if provided
      if (events && Array.isArray(events)) {
        const invalid = events.filter((e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e));
        if (invalid.length > 0) {
          res.status(400).json({ error: `Unknown event types: ${invalid.join(", ")}` });
          return;
        }
      }
      const hook = await svc.create(companyId, { url, secret, events, description });
      res.status(201).json(hook);
    },
  );

  router.patch(
    "/companies/:companyId/webhooks/:id",
    requireCompanyRole("admin"),
    async (req, res) => {
      const { companyId, id } = req.params as { companyId: string; id: string };
      assertCompanyAccess(req, companyId);
      const existing = await svc.get(id);
      if (!existing || existing.companyId !== companyId) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }
      const { url, events, enabled, description } = req.body as {
        url?: string;
        events?: string[];
        enabled?: boolean;
        description?: string | null;
      };
      const updated = await svc.update(id, { url, events, enabled, description });
      if (!updated) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }
      res.json({ ...updated, secret: `...${updated.secret.slice(-8)}` });
    },
  );

  router.delete(
    "/companies/:companyId/webhooks/:id",
    requireCompanyRole("admin"),
    async (req, res) => {
      const { companyId, id } = req.params as { companyId: string; id: string };
      assertCompanyAccess(req, companyId);
      const existing = await svc.get(id);
      if (!existing || existing.companyId !== companyId) {
        res.status(404).json({ error: "Webhook not found" });
        return;
      }
      await svc.remove(id);
      res.json({ ok: true });
    },
  );

  router.get("/companies/:companyId/webhooks/:id/deliveries", async (req, res) => {
    const { companyId, id } = req.params as { companyId: string; id: string };
    assertCompanyAccess(req, companyId);
    const existing = await svc.get(id);
    if (!existing || existing.companyId !== companyId) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }
    const limit = Math.min(Number(req.query["limit"]) || 50, 200);
    const deliveries = await svc.listDeliveries(id, limit);
    res.json(deliveries);
  });

  return router;
}
