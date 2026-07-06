import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { pushNotificationService } from "../services/index.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { forbidden } from "../errors.js";

/**
 * Web Push subscription management for mobile/desktop dispatch notifications.
 * Board (human) users only — agents don't have phones to notify.
 */
export function pushRoutes(db: Db) {
  const router = Router();
  const svc = pushNotificationService(db);

  /**
   * GET /api/push/vapid-public-key
   * Returns the VAPID public key the client needs to call
   * PushManager.subscribe(). No secret exposed — public keys are meant to
   * ship to the client.
   */
  router.get("/push/vapid-public-key", (_req, res) => {
    const key = svc.getPublicKey();
    if (!key) {
      res.status(503).json({ error: "Push notifications are not configured on this instance" });
      return;
    }
    res.json({ publicKey: key });
  });

  /**
   * POST /api/push/subscribe
   * Body: { companyId?: string, subscription: { endpoint, keys: { p256dh, auth } } }
   */
  router.post("/push/subscribe", async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) throw forbidden("A signed-in user is required to subscribe");

    const { companyId, subscription } = req.body as {
      companyId?: string;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    };

    if (companyId) assertCompanyAccess(req, companyId);

    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const authKey = subscription?.keys?.auth;
    if (!endpoint || !p256dh || !authKey) {
      res.status(400).json({ error: "subscription.endpoint and subscription.keys are required" });
      return;
    }

    const row = await svc.subscribe({
      userId: req.actor.userId,
      companyId: companyId ?? null,
      endpoint,
      p256dh,
      authKey,
      userAgent: req.get("user-agent") ?? null,
    });
    res.status(201).json({ id: row.id });
  });

  /**
   * POST /api/push/unsubscribe
   * Body: { endpoint: string }
   */
  router.post("/push/unsubscribe", async (req, res) => {
    assertBoard(req);
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      res.status(400).json({ error: "endpoint is required" });
      return;
    }
    await svc.unsubscribe(endpoint);
    res.json({ ok: true });
  });

  return router;
}
