import { Router } from "express";
import { eq } from "drizzle-orm";
import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import type { Db } from "@paperclipai/db";
import { meetings } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { assertBoard, assertCompanyAccess, assertCompanyRole } from "./authz.js";
import { HttpError } from "../errors.js";
import { mintMeetingToken } from "../services/meeting-token-service.js";

// Voice-agent dispatch now lives in the service layer so the shared meeting
// token service can dispatch without importing a route module. Re-exported here
// because `meeting-guests.ts` (and its tests) import it from this path.
export { dispatchVoiceAgent, LIVEKIT_VOICE_AGENT_NAME } from "../services/livekit-agent-dispatch.js";

export function livekitRoutes(db: Db) {
  const router = Router();

  /**
   * POST /api/livekit/token
   * Generate a LiveKit access token for the board user to join a room.
   * Body: { roomName?: string; identity?: string; companyId?: string }
   *
   * Contract is unchanged — the authorization, grant, and dispatch logic now
   * lives in the shared meeting token service, which the Base44 bridge
   * (/api/meeting/token) also calls. One security implementation, two façades.
   */
  router.post("/livekit/token", async (req, res) => {
    try {
      const { roomName = "amx-command-room", identity = "board-user", companyId, avatarEnabled } = req.body as {
        roomName?: string;
        identity?: string;
        companyId?: string;
        avatarEnabled?: boolean;
      };

      if (!roomName || roomName.length > 200) {
        return res.status(400).json({ error: "Invalid roomName" });
      }
      if (!identity || identity.length > 100) {
        return res.status(400).json({ error: "Invalid identity" });
      }

      const result = await mintMeetingToken(db, {
        actor: req.actor,
        roomName,
        companyId,
        identity,
        // Historical board behavior: full publish rights, 4h TTL.
        policy: "board_full",
        avatarEnabled,
      });

      return res.json({
        token: result.token,
        url: result.url,
        roomName: result.roomName,
        identity: result.identity,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error({ err }, "Failed to generate LiveKit token");
      return res.status(500).json({ error: "Failed to generate token" });
    }
  });

  /**
   * POST /api/livekit/room-action
   * Push a data-channel message to all participants in a room via the server SDK.
   * Body: { roomName: string; action: object }
   * The action object is forwarded verbatim — use the same shape the frontend
   * DataReceived handler expects, e.g.:
   *   { type: "tool_call", name: "navigate_to", args: { path: "/AMXA/agents" } }
   */
  router.post("/livekit/room-action", async (req, res) => {
    try {
      const { roomName, action } = req.body as { roomName?: string; action?: unknown };
      if (!roomName || !action) {
        return res.status(400).json({ error: "roomName and action required" });
      }

      // Meeting rooms are named "meeting-<uuid>" (see GlobalVoiceMeetingOverlay.tsx);
      // resolve the meeting's company for scoping. The global cross-company orb
      // room ("amx-command-room") only requires board auth.
      if (roomName.startsWith("meeting-")) {
        const meetingId = roomName.slice("meeting-".length);
        const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, meetingId)).limit(1);
        if (!mtg) {
          return res.status(404).json({ error: "Meeting not found for room" });
        }
        assertCompanyAccess(req, mtg.companyId);
        assertCompanyRole(req, mtg.companyId, "member");
      } else {
        assertBoard(req);
      }

      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      const livekitUrl = process.env.LIVEKIT_URL;
      if (!apiKey || !apiSecret || !livekitUrl) {
        return res.status(503).json({ error: "LiveKit not configured" });
      }

      const httpUrl = livekitUrl.replace("wss://", "https://").replace("ws://", "http://");
      const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      const payload = Buffer.from(JSON.stringify(action));
      await roomService.sendData(roomName, payload, DataPacket_Kind.RELIABLE);

      logger.info({ roomName, action }, "room-action dispatched");
      return res.json({ ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error({ err }, "room-action failed");
      return res.status(500).json({ error: "Failed to send room action" });
    }
  });

  /**
   * GET /api/livekit/config
   * Returns public LiveKit URL for the browser client.
   */
  router.get("/livekit/config", (_req, res) => {
    const url = process.env.LIVEKIT_URL;
    if (!url) return res.json({ configured: false });
    return res.json({ configured: true, url });
  });

  return router;
}
