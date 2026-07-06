import { eq } from "drizzle-orm";
import webpush from "web-push";
import type { Db } from "@paperclipai/db";
import { pushSubscriptions } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:support@amx-air-hubs.cc";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export type PushNotificationPayload = {
  title: string;
  body: string;
  url?: string;
};

export function pushNotificationService(db: Db) {
  return {
    isConfigured: () => Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),

    getPublicKey: () => VAPID_PUBLIC_KEY ?? null,

    subscribe: async (input: {
      userId: string;
      companyId?: string | null;
      endpoint: string;
      p256dh: string;
      authKey: string;
      userAgent?: string | null;
    }) => {
      // One row per endpoint (a browser's push subscription is unique per
      // endpoint) — replace any stale row for this exact endpoint rather
      // than accumulating duplicates across reconnects.
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint));
      const [row] = await db
        .insert(pushSubscriptions)
        .values({
          userId: input.userId,
          companyId: input.companyId ?? null,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          authKey: input.authKey,
          userAgent: input.userAgent ?? null,
        })
        .returning();
      return row;
    },

    unsubscribe: async (endpoint: string) => {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    },

    /**
     * Sends a push notification to every subscription scoped to a company.
     * Stale/expired subscriptions (410 Gone / 404) are pruned automatically.
     * No-ops (logs once) if VAPID keys aren't configured — the caller
     * should not treat this as a hard failure since push is best-effort.
     */
    notifyCompany: async (companyId: string, payload: PushNotificationPayload) => {
      if (!ensureConfigured()) {
        logger.debug("push notification skipped: VAPID keys not configured");
        return;
      }
      const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.companyId, companyId));
      await Promise.all(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.authKey },
              },
              JSON.stringify(payload),
            );
          } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
            } else {
              logger.warn({ err, subscriptionId: sub.id }, "push notification send failed");
            }
          }
        }),
      );
    },
  };
}
