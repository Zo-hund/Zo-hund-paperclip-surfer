import { AgentDispatchClient } from "livekit-server-sdk";
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { agentService } from "./agents.js";
import { companyService } from "./companies.js";

// Agent name the server dispatches to (and matches personas against). Overridable
// via LIVEKIT_AGENT_NAME so a local dev stack can register an isolated worker
// (e.g. "amx-voice-agent-dev") on the shared LiveKit Cloud project without
// intercepting production meeting dispatches.
export const LIVEKIT_VOICE_AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? "amx-voice-agent";

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

/**
 * Dispatches the AMX voice agent into a room so JAZ auto-joins. If the room's
 * company has a designated voice-persona agent, its name/title/persona
 * instructions are passed through dispatch metadata so the single shared
 * voice-agent process can answer in that persona for this room only — no new
 * agent identity or registry needed. Non-blocking: callers should not let a
 * dispatch failure fail the whole request (matches prior inline behavior).
 *
 * Lives in the service layer (not routes/livekit.ts) so the shared meeting
 * token service can dispatch without importing a route module. routes/livekit.ts
 * re-exports it so existing importers and their module mocks keep working.
 */
export async function dispatchVoiceAgent(
  db: Db,
  params: { roomName: string; companyId?: string; avatarEnabled?: boolean },
) {
  const { roomName, companyId, avatarEnabled } = params;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !livekitUrl) return;

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
}
