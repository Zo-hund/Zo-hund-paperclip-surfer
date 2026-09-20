// =====================================================================
// AMX 6.7 — thin Base44 meeting bridge.
//
//   POST /api/meeting/token    Base44-shaped façade over the SHARED
//                              meeting token service (no second token engine).
//   POST /api/meeting/events   meeting lifecycle evidence -> existing activity
//                              log (which already fans out to live events).
//
// IDENTITY RULE (hard): identity and company role come from req.actor
// (actorMiddleware), NEVER from the Base44 JSON. `participantId` / `role` /
// `displayName` in the body are PRESENTATION HINTS ONLY. `companyId` is
// resolved server-side from the room, never taken from the body.
//
// CORS (meeting/base44-cors.ts) is mounted earlier, BEFORE actorMiddleware,
// so the browser preflight never enters AMX authorization.
// =====================================================================
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { HttpError, forbidden } from "../errors.js";
import { getActorInfo } from "./authz.js";
import { logActivity } from "../services/activity-log.js";
import {
  assertMeetingAccess,
  mintMeetingToken,
  resolveRoomCompanyId,
  type RequestedCapabilities,
} from "../services/meeting-token-service.js";

/** Base44 request body — hints only, never trusted for identity. */
interface Base44TokenBody {
  roomId?: string;
  participantId?: string; // hint; ignored for identity — actor wins
  displayName?: string; // hint
  role?: string; // hint; ignored — the DB company role wins
  capabilities?: RequestedCapabilities;
}

/**
 * Event body. The Base44 client sends `{ roomId, event, ts, detail }`; `type` /
 * `payload` are accepted as aliases so a server-to-server caller can use the
 * naming from the integration spec.
 */
interface Base44EventBody {
  roomId?: string;
  event?: string;
  type?: string;
  ts?: string;
  detail?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

const MAX_ROOM_ID_LENGTH = 200;

/**
 * Scopes are only meaningful for external-client credentials. A first-party
 * board session already carries full authority and is not scope-limited.
 */
function requiredScopeFor(source: string | undefined, scope: string): string | undefined {
  return source === "external_client" ? scope : undefined;
}

export function meetingHubBridge(db: Db) {
  const router = Router();

  router.post("/meeting/token", async (req, res) => {
    try {
      const body = (req.body ?? {}) as Base44TokenBody;
      const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";

      if (!roomId || roomId.length > MAX_ROOM_ID_LENGTH) {
        return res.status(400).json({ error: "roomId required" });
      }
      // No verified AMX actor -> refuse. Base44 JSON alone is never identity.
      if (req.actor.type !== "board" || !req.actor.userId) {
        return res.status(401).json({ error: "unauthenticated" });
      }

      // The room's owning company is resolved from the DB, never from the body.
      // The bridge only ever issues tokens for real meeting rooms — the global
      // cross-company orb room is not an external-client surface.
      const companyId = await resolveRoomCompanyId(db, roomId);
      if (!companyId) {
        return res.status(404).json({ error: "meeting not found for room" });
      }

      const result = await mintMeetingToken(db, {
        actor: req.actor,
        roomName: roomId,
        companyId,
        // Identity is the AMX user, never body.participantId.
        identity: req.actor.userId,
        requestedCapabilities: body.capabilities ?? {},
        policy: "capability_scoped",
        requiredScope: requiredScopeFor(req.actor.source, "meeting:join"),
      });

      // Base44's preferred shape — carries no secret.
      return res.json({ url: result.url, token: result.token, room: { id: result.roomName } });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error({ err }, "meeting bridge token failed");
      return res.status(500).json({ error: "Failed to generate token" });
    }
  });

  /**
   * Meeting lifecycle evidence from the external client. Reuses the existing
   * activity log (which publishes the live event), so OPPRRC evidence keeps
   * flowing through one pipeline rather than a parallel one.
   */
  router.post("/meeting/events", async (req, res) => {
    try {
      const body = (req.body ?? {}) as Base44EventBody;
      const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
      const rawEvent = body.event ?? body.type;
      const eventName = typeof rawEvent === "string" ? rawEvent.trim() : "";

      if (!roomId || roomId.length > MAX_ROOM_ID_LENGTH) {
        return res.status(400).json({ error: "roomId required" });
      }
      if (!eventName) {
        return res.status(400).json({ error: "event required" });
      }
      if (req.actor.type !== "board" || !req.actor.userId) {
        return res.status(401).json({ error: "unauthenticated" });
      }

      const companyId = await resolveRoomCompanyId(db, roomId);
      if (!companyId) {
        return res.status(404).json({ error: "meeting not found for room" });
      }

      const scope = requiredScopeFor(req.actor.source, "meeting:events");
      if (scope && !(req.actor.scope ?? []).includes(scope)) {
        throw forbidden(`Missing scope '${scope}'`);
      }

      // Same room authorization as the token path — an actor who could not
      // join the room cannot write evidence about it either.
      await assertMeetingAccess(db, req.actor, { roomName: roomId, companyId });

      const actorInfo = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actorInfo.actorType,
        actorId: actorInfo.actorId,
        action: `meeting.${eventName}`,
        entityType: "meeting",
        entityId: roomId.startsWith("meeting-") ? roomId.slice("meeting-".length) : roomId,
        runId: actorInfo.runId,
        details: {
          roomId,
          source: req.actor.source ?? "unknown",
          ...(typeof body.ts === "string" ? { clientTs: body.ts } : {}),
          ...(body.detail ?? {}),
          ...(body.payload ?? {}),
        },
      });

      return res.status(202).json({ ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error({ err }, "meeting bridge event failed");
      return res.status(500).json({ error: "Failed to record meeting event" });
    }
  });

  return router;
}
