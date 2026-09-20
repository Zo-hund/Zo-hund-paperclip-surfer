// =====================================================================
// AMX 6.7 / 6.8B — shared meeting token service.
//
// ONE security implementation, TWO façades:
//   - POST /api/livekit/token   (existing board route; contract unchanged)
//   - POST /api/meeting/token   (thin Base44 bridge, 6.7)
//
// Identity and authority always come from the resolved actor
// (actorMiddleware), never from the request body. Client-supplied
// capabilities are a CEILING request, intersected with what the actor's
// DB-resolved company role allows.
// =====================================================================
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { and, eq } from "drizzle-orm";
import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import { meetings, meetingParticipants } from "@paperclipai/db";
import { hasCompanyRoleAtLeast } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { HttpError, forbidden } from "../errors.js";
import { assertBoard, assertCompanyAccess, assertCompanyRole, type ActorHolder } from "../routes/authz.js";
import { dispatchVoiceAgent } from "./livekit-agent-dispatch.js";

export type MeetingActor = Request["actor"];

export interface RequestedCapabilities {
  camera?: boolean;
  microphone?: boolean;
  screenShare?: boolean;
  chat?: boolean;
}

export interface LiveKitGrants {
  identity: string;
  roomName: string;
  canSubscribe: boolean;
  canPublish: boolean;
  canPublishData: boolean;
  /** When set, supersedes canPublish — only these sources may be published. */
  canPublishSources?: TrackSource[];
  ttl: string;
}

/**
 * Grant policy:
 *   "board_full"        — the historical /api/livekit/token behavior: full publish,
 *                         4h TTL, no source restriction. Preserved exactly so the
 *                         existing board/orb clients keep working.
 *   "capability_scoped" — 6.8B policy for external clients: 15-minute TTL and
 *                         per-source grants derived from the actor's company role.
 */
export type GrantPolicy = "board_full" | "capability_scoped";

/** Screen share is an elevated capability — admin/owner tier only. */
function canShareScreen(actor: MeetingActor, companyId: string | undefined): boolean {
  if (actor.source === "local_implicit" || actor.isInstanceAdmin) return true;
  if (!companyId) return false;
  return hasCompanyRoleAtLeast(actor.companyRoles?.[companyId], "admin");
}

/**
 * Pure policy: what THIS actor may do in THIS room, intersected with what the
 * client asked for. Exported so the security suite can assert on it directly.
 */
export function deriveGrants(input: {
  actor: MeetingActor;
  identity: string;
  roomName: string;
  companyId?: string;
  requestedCapabilities?: RequestedCapabilities;
  policy: GrantPolicy;
}): LiveKitGrants {
  const { actor, identity, roomName, companyId, policy } = input;

  if (policy === "board_full") {
    return {
      identity,
      roomName,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      ttl: "4h",
    };
  }

  const requested = input.requestedCapabilities ?? {};
  const sources: TrackSource[] = [];
  if (requested.camera) sources.push(TrackSource.CAMERA);
  if (requested.microphone) sources.push(TrackSource.MICROPHONE);
  if (requested.screenShare && canShareScreen(actor, companyId)) {
    sources.push(TrackSource.SCREEN_SHARE);
    sources.push(TrackSource.SCREEN_SHARE_AUDIO);
  }

  return {
    identity,
    roomName,
    canSubscribe: true,
    canPublish: sources.length > 0,
    // Chat (data channel) defaults on — it carries no media and is already
    // gated by room membership.
    canPublishData: requested.chat ?? true,
    canPublishSources: sources,
    ttl: "15m",
  };
}

/**
 * Room-level authorization. Extracted from the original /api/livekit/token
 * handler so both façades enforce the SAME rules: company-scoped rooms require
 * membership (or an explicit meeting invite); the global cross-company orb room
 * only requires board auth.
 */
export async function assertMeetingAccess(
  db: Db,
  actor: MeetingActor,
  params: { roomName: string; companyId?: string },
): Promise<void> {
  const holder: ActorHolder = { actor };
  const { roomName, companyId } = params;

  if (!companyId) {
    assertBoard(holder);
    return;
  }

  assertCompanyAccess(holder, companyId);

  // A user explicitly invited to a meeting (meeting_participants row) may join
  // that one room even below the `member` role tier — the invite route accepts
  // viewer/client members, so the token path must too.
  const meetingId = roomName.startsWith("meeting-") ? roomName.slice("meeting-".length) : null;
  let isInvitedParticipant = false;
  if (meetingId && actor.type === "board" && actor.userId) {
    const [row] = await db
      .select({ id: meetingParticipants.id })
      .from(meetingParticipants)
      .innerJoin(meetings, eq(meetingParticipants.meetingId, meetings.id))
      .where(and(
        eq(meetingParticipants.meetingId, meetingId),
        eq(meetingParticipants.userId, actor.userId),
        eq(meetings.companyId, companyId),
      ))
      .limit(1);
    isInvitedParticipant = !!row;
  }
  if (!isInvitedParticipant) {
    assertCompanyRole(holder, companyId, "member");
  }
}

/**
 * Resolves the owning company for a `meeting-<uuid>` room from the DB.
 * Used by the Base44 bridge, which must never take companyId from the body.
 */
export async function resolveRoomCompanyId(db: Db, roomName: string): Promise<string | null> {
  if (!roomName.startsWith("meeting-")) return null;
  const meetingId = roomName.slice("meeting-".length);
  const [row] = await db
    .select({ companyId: meetings.companyId })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .limit(1);
  return row?.companyId ?? null;
}

export interface MintMeetingTokenInput {
  actor: MeetingActor;
  roomName: string;
  companyId?: string;
  /**
   * Room identity. The board façade passes the caller-supplied identity to
   * preserve its historical contract; the external/bridge façade always passes
   * the actor's own userId (never a body value).
   */
  identity: string;
  requestedCapabilities?: RequestedCapabilities;
  policy: GrantPolicy;
  /** Scope required on the actor's token (external clients only). */
  requiredScope?: string;
  avatarEnabled?: boolean;
  /** Dispatch the AMX voice agent into the room after minting (default true). */
  dispatchAgent?: boolean;
}

export interface MintMeetingTokenResult {
  url: string;
  token: string;
  roomName: string;
  identity: string;
}

/** The one entry point both routes use. */
export async function mintMeetingToken(
  db: Db,
  input: MintMeetingTokenInput,
): Promise<MintMeetingTokenResult> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    throw new HttpError(
      503,
      "LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET to .env",
    );
  }

  if (input.requiredScope) {
    const scope = input.actor.scope ?? [];
    if (!scope.includes(input.requiredScope)) {
      throw forbidden(`Missing scope '${input.requiredScope}'`);
    }
  }

  await assertMeetingAccess(db, input.actor, {
    roomName: input.roomName,
    companyId: input.companyId,
  });

  const grants = deriveGrants({
    actor: input.actor,
    identity: input.identity,
    roomName: input.roomName,
    companyId: input.companyId,
    requestedCapabilities: input.requestedCapabilities,
    policy: input.policy,
  });

  const at = new AccessToken(apiKey, apiSecret, {
    identity: grants.identity,
    ttl: grants.ttl,
  });

  at.addGrant({
    roomJoin: true,
    room: grants.roomName,
    canPublish: grants.canPublish,
    canSubscribe: grants.canSubscribe,
    canPublishData: grants.canPublishData,
    ...(grants.canPublishSources ? { canPublishSources: grants.canPublishSources } : {}),
  });

  const token = await at.toJwt();
  logger.info(
    { roomName: grants.roomName, identity: grants.identity, policy: input.policy, source: input.actor.source },
    "livekit token issued",
  );

  if (input.dispatchAgent !== false) {
    await dispatchVoiceAgent(db, {
      roomName: input.roomName,
      companyId: input.companyId,
      avatarEnabled: input.avatarEnabled,
    });
  }

  return { url: livekitUrl, token, roomName: grants.roomName, identity: grants.identity };
}
