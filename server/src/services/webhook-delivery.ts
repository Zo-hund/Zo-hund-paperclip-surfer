import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyWebhooks, companyWebhookDeliveries } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

export const WEBHOOK_EVENTS = [
  "agent.run.completed",
  "agent.run.failed",
  "agent.status_changed",
  "issue.status_changed",
  "approval.decided",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

function signPayload(secret: string, payload: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function webhookDeliveryService(db: Db) {
  async function deliver(companyId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    let hooks;
    try {
      hooks = await db
        .select()
        .from(companyWebhooks)
        .where(and(eq(companyWebhooks.companyId, companyId), eq(companyWebhooks.enabled, true)));
    } catch (err) {
      logger.warn({ err, companyId, eventType }, "webhook-delivery: failed to query webhooks");
      return;
    }

    const matching = hooks.filter((h) => h.events.length === 0 || h.events.includes(eventType));
    if (matching.length === 0) return;

    const deliveryId = crypto.randomUUID();
    const bodyStr = JSON.stringify({ event: eventType, deliveryId, ...payload, timestamp: new Date().toISOString() });

    await Promise.allSettled(
      matching.map(async (hook) => {
        const signature = signPayload(hook.secret, bodyStr);
        const start = Date.now();
        let statusCode: number | null = null;
        let responseBody: string | null = null;
        let error: string | null = null;

        try {
          const response = await fetch(hook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Paperclip-Event": eventType,
              "X-Paperclip-Signature": signature,
              "X-Paperclip-Delivery": deliveryId,
            },
            body: bodyStr,
            signal: AbortSignal.timeout(10_000),
          });
          statusCode = response.status;
          const raw = await response.text().catch(() => "");
          responseBody = raw.slice(0, 500);

          if (response.ok) {
            await db
              .update(companyWebhooks)
              .set({ failureCount: 0, lastDeliveredAt: new Date(), updatedAt: new Date() })
              .where(eq(companyWebhooks.id, hook.id));
          } else {
            error = `HTTP ${response.status}`;
            await db
              .update(companyWebhooks)
              .set({ failureCount: hook.failureCount + 1, updatedAt: new Date() })
              .where(eq(companyWebhooks.id, hook.id));
          }
        } catch (err: unknown) {
          error = err instanceof Error ? err.message : "Unknown error";
          await db
            .update(companyWebhooks)
            .set({ failureCount: hook.failureCount + 1, updatedAt: new Date() })
            .where(eq(companyWebhooks.id, hook.id));
          logger.warn({ err, hookId: hook.id, url: hook.url, eventType }, "webhook delivery failed");
        }

        await db.insert(companyWebhookDeliveries).values({
          webhookId: hook.id,
          companyId,
          eventType,
          payload: payload,
          statusCode,
          responseBody,
          error,
          durationMs: Date.now() - start,
          deliveredAt: new Date(),
        });
      }),
    );
  }

  function create(companyId: string, data: { url: string; secret?: string; events?: string[]; description?: string }) {
    return db
      .insert(companyWebhooks)
      .values({
        companyId,
        url: data.url,
        secret: data.secret ?? crypto.randomUUID(),
        events: (data.events ?? []) as string[],
        description: data.description ?? null,
      })
      .returning()
      .then((r) => r[0]!);
  }

  function list(companyId: string) {
    return db
      .select()
      .from(companyWebhooks)
      .where(eq(companyWebhooks.companyId, companyId))
      .orderBy(desc(companyWebhooks.createdAt));
  }

  function get(id: string) {
    return db
      .select()
      .from(companyWebhooks)
      .where(eq(companyWebhooks.id, id))
      .then((r) => r[0] ?? null);
  }

  function update(
    id: string,
    patch: { url?: string; events?: string[]; enabled?: boolean; description?: string | null },
  ) {
    return db
      .update(companyWebhooks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(companyWebhooks.id, id))
      .returning()
      .then((r) => r[0] ?? null);
  }

  function remove(id: string) {
    return db
      .delete(companyWebhooks)
      .where(eq(companyWebhooks.id, id))
      .returning()
      .then((r) => r[0] ?? null);
  }

  function listDeliveries(webhookId: string, limit = 50) {
    return db
      .select()
      .from(companyWebhookDeliveries)
      .where(eq(companyWebhookDeliveries.webhookId, webhookId))
      .orderBy(desc(companyWebhookDeliveries.createdAt))
      .limit(limit);
  }

  return { deliver, create, list, get, update, remove, listDeliveries };
}
