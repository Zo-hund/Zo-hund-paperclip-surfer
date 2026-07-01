import { Router } from "express";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { agentService, companyService } from "../services/index.js";

const LIVEKIT_VOICE_AGENT_NAME = "amx-voice-agent";

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
      logger.error({ err }, "Failed to generate LiveKit token");
      return res.status(500).json({ error: "Failed to generate token" });
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
