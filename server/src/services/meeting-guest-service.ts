import { createHash, randomBytes } from "node:crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { meetingGuestInvites, meetingParticipants, meetings } from "@paperclipai/db";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function generateGuestToken() {
  return randomBytes(32).toString("base64url");
}

const DEFAULT_TTL_HOURS = 24;
const MAX_TTL_HOURS = 24 * 7;
const INVITE_TOKEN_MAX_RETRIES = 3;

/**
 * AMX LABS Meeting Guest Service
 * Issues, resolves, and revokes reusable magic links that let an external
 * human with no Paperclip account join a meeting's LiveKit room. Mirrors the
 * `invites` table's hash-only-storage convention (see access.ts's
 * hashToken/createInviteToken) — the raw token is only ever returned once,
 * at creation time.
 */
export function meetingGuestService(db: Db) {
  return {
    /**
     * Create a new reusable guest invite link for a meeting. Returns the raw
     * token (caller must build the shareable URL and never persist it).
     */
    async createInvite(meetingId: string, opts: { guestLabel?: string; createdByUserId?: string; ttlHours?: number }) {
      const ttlHours = Math.min(Math.max(opts.ttlHours ?? DEFAULT_TTL_HOURS, 1), MAX_TTL_HOURS);
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      let token: string | null = null;
      let created: typeof meetingGuestInvites.$inferSelect | null = null;
      for (let attempt = 0; attempt < INVITE_TOKEN_MAX_RETRIES; attempt += 1) {
        const candidateToken = generateGuestToken();
        try {
          const row = await db.insert(meetingGuestInvites).values({
            meetingId,
            tokenHash: hashToken(candidateToken),
            guestLabel: opts.guestLabel ?? null,
            createdByUserId: opts.createdByUserId ?? null,
            expiresAt,
          }).returning().then((rows) => rows[0]);
          token = candidateToken;
          created = row;
          break;
        } catch {
          // Extremely unlikely tokenHash collision — retry with a fresh token.
          continue;
        }
      }
      if (!token || !created) throw new Error("Failed to generate a unique guest invite token");

      return { invite: created, token };
    },

    async listInvites(meetingId: string) {
      const rows = await db.select().from(meetingGuestInvites).where(eq(meetingGuestInvites.meetingId, meetingId));
      // Never return tokenHash to the client.
      return rows.map(({ tokenHash: _tokenHash, ...rest }) => rest);
    },

    async revokeInvite(meetingId: string, inviteId: string) {
      const [row] = await db.update(meetingGuestInvites)
        .set({ revokedAt: new Date() })
        .where(and(eq(meetingGuestInvites.id, inviteId), eq(meetingGuestInvites.meetingId, meetingId)))
        .returning();
      return row ?? null;
    },

    /**
     * Resolve a raw guest token to its invite + parent meeting, or null if
     * the token is unknown, revoked, or expired. Callers must map a null
     * result to a 404 — never distinguish the reason in the response, to
     * avoid leaking meeting/company existence via token brute-forcing.
     */
    async resolveInvite(token: string) {
      const tokenHash = hashToken(token);
      const [row] = await db.select({
        invite: meetingGuestInvites,
        meetingId: meetings.id,
        meetingTitle: meetings.title,
        meetingStatus: meetings.status,
        companyId: meetings.companyId,
      })
        .from(meetingGuestInvites)
        .innerJoin(meetings, eq(meetingGuestInvites.meetingId, meetings.id))
        .where(and(
          eq(meetingGuestInvites.tokenHash, tokenHash),
          isNull(meetingGuestInvites.revokedAt),
          gt(meetingGuestInvites.expiresAt, new Date()),
        ))
        .limit(1);
      return row ?? null;
    },

    /** Insert a meetingParticipants row for a guest joining via an invite. */
    async joinAsGuest(meetingId: string, guestInviteId: string, guestName: string) {
      const [participant] = await db.insert(meetingParticipants).values({
        meetingId,
        guestInviteId,
        guestName,
        status: "active",
        lastAction: "Joined session",
      }).returning();
      return participant;
    },
  };
}
