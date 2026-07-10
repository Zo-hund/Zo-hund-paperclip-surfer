import { Router } from "express";
import { randomBytes } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import type { Db } from "@paperclipai/db";
import { companies, companyLogos, authUsers } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { notFound, unprocessable } from "../errors.js";
import { meetingGuestService, logActivity } from "../services/index.js";
import { publishLiveEvent } from "../services/live-events.js";
import { logger } from "../middleware/logger.js";
import { dispatchVoiceAgent } from "./livekit.js";

/** Simple sliding-window rate limiter, same shape as auth.ts/plugin-secrets-handler.ts. */
function createRateLimiter(maxAttempts: number, windowMs: number) {
  const attempts = new Map<string, number[]>();
  return {
    check(key: string): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;
      const existing = (attempts.get(key) ?? []).filter((ts) => ts > windowStart);
      if (existing.length >= maxAttempts) return false;
      existing.push(now);
      attempts.set(key, existing);
      return true;
    },
  };
}

function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * AMX LABS Meeting Guest Routes
 *
 * Fully public — no `assertBoard`/`assertCompanyAccess`/`getActorInfo` calls
 * anywhere in this file. Authentication is purely the guest invite token
 * itself (see meeting-guest-service.ts), matching the pattern used by
 * server/src/routes/access.ts's `/invites/:token` handlers and
 * server/src/routes/verify.ts's `/verify/pass/:passId`. Any invalid, expired,
 * or revoked token returns 404 — never 401/403 — to avoid leaking meeting or
 * company existence to an unauthenticated caller.
 */
export function meetingGuestRoutes(db: Db) {
  const router = Router();
  const guestSvc = meetingGuestService(db);

  // Resolve is generous (repeat page loads/reloads are normal); join is
  // tighter since it mints a real LiveKit grant and dispatches the voice agent.
  const resolveLimiter = createRateLimiter(30, 60_000);
  const joinLimiter = createRateLimiter(10, 60_000);

  router.get("/guest/meetings/:token", async (req, res) => {
    if (!resolveLimiter.check(clientIp(req))) {
      return res.status(429).json({ error: "Too many requests — try again later" });
    }

    const row = await guestSvc.resolveInvite(req.params.token);
    if (!row) throw notFound("Guest link not found");

    // Lobby enrichment — all public-safe branding/context for the pre-join
    // onboarding screen: company name + brand color + logo (served via the
    // public asset route), meeting type/pod, and who sent the invite.
    const [company] = await db
      .select({ name: companies.name, brandColor: companies.brandColor })
      .from(companies)
      .where(eq(companies.id, row.companyId))
      .limit(1);
    const [logo] = await db
      .select({ assetId: companyLogos.assetId })
      .from(companyLogos)
      .where(eq(companyLogos.companyId, row.companyId))
      .limit(1);
    let hostName: string | null = null;
    if (row.invite.createdByUserId) {
      const [host] = await db
        .select({ name: authUsers.name })
        .from(authUsers)
        .where(eq(authUsers.id, row.invite.createdByUserId))
        .limit(1);
      hostName = host?.name ?? null;
    }

    res.json({
      meetingId: row.meetingId,
      meetingTitle: row.meetingTitle,
      companyName: company?.name ?? null,
      companyBrandColor: company?.brandColor ?? null,
      companyLogoUrl: logo?.assetId ? `/api/public/assets/${logo.assetId}/content` : null,
      meetingType: row.meetingType,
      podKey: row.podKey,
      hostName,
      meetingStatus: row.meetingStatus,
      expiresAt: row.invite.expiresAt,
    });
  });

  router.post("/guest/meetings/:token/join", async (req, res) => {
    if (!joinLimiter.check(clientIp(req))) {
      return res.status(429).json({ error: "Too many requests — try again later" });
    }

    const row = await guestSvc.resolveInvite(req.params.token);
    if (!row) throw notFound("Guest link not found");
    if (row.meetingStatus !== "active") throw notFound("This meeting has ended");

    const guestName = typeof req.body?.guestName === "string" ? req.body.guestName.trim().slice(0, 100) : "";
    if (!guestName) throw unprocessable("guestName is required");

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !livekitUrl) {
      return res.status(503).json({ error: "LiveKit is not configured" });
    }

    await guestSvc.joinAsGuest(row.meetingId, row.invite.id, guestName);

    const roomName = `meeting-${row.meetingId}`;
    const identity = `guest-${randomBytes(6).toString("hex")}`;
    const ttlMs = Math.min(4 * 60 * 60 * 1000, row.invite.expiresAt.getTime() - Date.now());

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      // The guest's random identity can't be resolved back to a display name
      // by other participants — LiveKit's `name` claim carries it instead, so
      // remote clients can label the video tile correctly (see RemoteParticipant.name).
      name: guestName,
      ttl: Math.max(60, Math.floor(ttlMs / 1000)),
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    await dispatchVoiceAgent(db, { roomName, companyId: row.companyId });

    logger.info({ meetingId: row.meetingId, identity }, "guest joined meeting");
    publishLiveEvent({
      companyId: row.companyId,
      type: "meeting.participant.joined",
      payload: { meetingId: row.meetingId, guestInviteId: row.invite.id },
    });
    await logActivity(db, {
      companyId: row.companyId,
      actorType: "user",
      actorId: `guest:${identity}`,
      action: "meeting.guest_joined",
      entityType: "meeting",
      entityId: row.meetingId,
      details: { guestName },
    });

    res.json({ token, url: livekitUrl, roomName, identity, guestName });
  });

  return router;
}
