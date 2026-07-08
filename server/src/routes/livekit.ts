import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { AccessToken, AgentDispatchClient, RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk";
import type { Db } from "@paperclipai/db";
import { meetings, meetingParticipants } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { agentService, companyService } from "../services/index.js";
import { assertBoard, assertCompanyAccess, assertCompanyRole } from "./authz.js";
import { HttpError } from "../errors.js";

// Agent name the server dispatches to (and matches personas against). Overridable
// via LIVEKIT_AGENT_NAME so a local dev stack can register an isolated worker
// (e.g. "amx-voice-agent-dev") on the shared LiveKit Cloud project without
// intercepting production meeting dispatches.
const LIVEKIT_VOICE_AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? "amx-voice-agent";

/**
 * Looks up the company's designated LiveKit voice persona (an agent row
 * tagged metadata.livekitAgentName === "amx-voice-agent"), if any. Used to
 * give the single shared voice-agent process a per-company persona via
 * dispatch metadata instead of registering a separate agent identity.
 */
async function findVoicePersonaAgent(db: Db, companyId: string) {
  const agents = agentService(db);
  const companyAgents = await agents.list(companyId);
  return (
    companyAgents.find(
      (agent: any) => agent.metadata?.livekitAgentName === LIVEKIT_VOICE_AGENT_NAME,
    ) ?? null
  );
}

export function livekitRoutes(db: Db) {
  const router = Router();

  /**
   * POST /api/livekit/token
   * Generate a LiveKit access token for the board user to join a room.
   * Body: { roomName?: string; identity?: string; companyId?: string }
   */
  router.post("/livekit/token", async (req, res) => {
    try {
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;
      const livekitUrl = process.env.LIVEKIT_URL;

      if (!apiKey || !apiSecret || !livekitUrl) {
        return res.status(503).json({
          error: "LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET to .env",
        });
      }

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

      // Company-scoped rooms require membership; the global cross-company
      // orb room ("amx-command-room", no companyId) only requires board auth.
      // Exception: a user explicitly invited to a meeting (meeting_participants
      // row) may join that one room even below the `member` role tier — the
      // invite route accepts viewer/client members, so the token route must too.
      if (companyId) {
        assertCompanyAccess(req, companyId);
        const meetingId = roomName.startsWith("meeting-") ? roomName.slice("meeting-".length) : null;
        let isInvitedParticipant = false;
        if (meetingId && req.actor.type === "board" && req.actor.userId) {
          const [row] = await db
            .select({ id: meetingParticipants.id })
            .from(meetingParticipants)
            .innerJoin(meetings, eq(meetingParticipants.meetingId, meetings.id))
            .where(and(
              eq(meetingParticipants.meetingId, meetingId),
              eq(meetingParticipants.userId, req.actor.userId),
              eq(meetings.companyId, companyId),
            ))
            .limit(1);
          isInvitedParticipant = !!row;
        }
        if (!isInvitedParticipant) {
          assertCompanyRole(req, companyId, "member");
        }
      } else {
        assertBoard(req);
      }

      const at = new AccessToken(apiKey, apiSecret, {
        identity,
        ttl: "4h",
      });

      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();
      logger.info({ roomName, identity }, "livekit token issued");

      // Dispatch the AMX voice agent into this room so JAZ auto-joins.
      // If the room's company has a designated voice-persona agent, pass its
      // name/title/persona instructions through dispatch metadata so the
      // single shared voice-agent process can answer in that persona for
      // this room only — no new agent identity or registry needed.
      try {
        const httpUrl = livekitUrl.replace("wss://", "https://").replace("ws://", "http://");
        const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);

        // Fetch all companies so JAZ can navigate cross-company by voice
        const allCompanies = await companyService(db).list().catch(() => []);
        const companyRoster = allCompanies.map((c) => ({
          name: c.name,
          prefix: c.issuePrefix.toUpperCase(),
        }));

        // Active company prefix — lets JAZ know which company it's talking to
        const activeCompanyPrefix =
          allCompanies.find((c: any) => c.id === companyId)?.issuePrefix?.toUpperCase() ?? null;

        let dispatchMetadata: string | undefined;
        if (companyId) {
          const personaAgent = await findVoicePersonaAgent(db, companyId);
          if (personaAgent) {
            dispatchMetadata = JSON.stringify({
              companyId,
              companyPrefix: activeCompanyPrefix,
              companies: companyRoster,
              agentPersonaName: personaAgent.name,
              agentPersonaTitle: personaAgent.title ?? null,
              systemPromptOverride:
                (personaAgent.metadata as Record<string, unknown> | null)?.voiceSystemPrompt ?? null,
              avatarEnabled: avatarEnabled === true,
            });
          } else if (avatarEnabled) {
            dispatchMetadata = JSON.stringify({ companyId, companyPrefix: activeCompanyPrefix, companies: companyRoster, avatarEnabled: true });
          } else {
            dispatchMetadata = JSON.stringify({ companyId, companyPrefix: activeCompanyPrefix, companies: companyRoster });
          }
        } else if (companyRoster.length > 0) {
          dispatchMetadata = JSON.stringify({ companies: companyRoster });
        }

        await dispatchClient.createDispatch(
          roomName,
          LIVEKIT_VOICE_AGENT_NAME,
          dispatchMetadata ? { metadata: dispatchMetadata } : undefined,
        );
        logger.info({ roomName, companyId, hasPersona: Boolean(dispatchMetadata) }, "dispatched amx-voice-agent to room");
      } catch (dispatchErr) {
        logger.warn({ err: dispatchErr, roomName }, "agent dispatch failed (non-blocking)");
      }

      return res.json({ token, url: livekitUrl, roomName, identity });
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
