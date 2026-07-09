import type { Db } from "@paperclipai/db";
import { secretService } from "./secrets.js";
import { logger } from "../middleware/logger.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const REFRESH_TOKEN_SECRET_NAME = "GOOGLE_WORKSPACE_REFRESH_TOKEN";
const PLACEHOLDER_DURATION_MS = 60 * 60 * 1000; // 1h — corrected by completeEventForMeeting on real end.

/**
 * AMX LABS Google Calendar Sync Service
 *
 * Write-only: mirrors real Paperclip meetings into the company's linked
 * Google Calendar (see server/src/routes/mcp-servers.ts's OAuth flow, which
 * already stores a refresh token as the GOOGLE_WORKSPACE_REFRESH_TOKEN
 * company secret — this service is the first thing that actually calls the
 * Calendar REST API with it). No caching of access tokens: meeting start/end
 * events are infrequent, so re-exchanging the refresh token on every call
 * avoids stale-token complexity for negligible extra cost.
 *
 * Every method here is meant to be called best-effort by callers — failures
 * should never block a meeting from starting or ending.
 */
export function googleCalendarService(db: Db) {
  const secretsSvc = secretService(db);

  async function isLinked(companyId: string): Promise<boolean> {
    const secret = await secretsSvc.getByName(companyId, REFRESH_TOKEN_SECRET_NAME);
    return !!secret;
  }

  async function getAccessToken(companyId: string): Promise<string | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const secret = await secretsSvc.getByName(companyId, REFRESH_TOKEN_SECRET_NAME);
    if (!secret) return null;
    const refreshToken = await secretsSvc.resolveSecretValue(companyId, secret.id, "latest");

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      logger.warn({ companyId, status: res.status }, "Google Calendar: failed to refresh access token");
      return null;
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  /** Creates a real Calendar event for a meeting that just started. Returns the event id, or null if not linked/failed. */
  async function createEventForMeeting(
    companyId: string,
    meeting: { id: string; title: string; createdAt: Date },
  ): Promise<string | null> {
    const accessToken = await getAccessToken(companyId);
    if (!accessToken) return null;

    const start = meeting.createdAt;
    // Calendar requires an end even for in-progress events — placeholder,
    // corrected to the real end time by completeEventForMeeting.
    const end = new Date(start.getTime() + PLACEHOLDER_DURATION_MS);

    const res = await fetch(CALENDAR_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        summary: meeting.title,
        description: `Synced from a Paperclip meeting (id: ${meeting.id})`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn({ companyId, meetingId: meeting.id, status: res.status, errText }, "Google Calendar: failed to create event");
      return null;
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  /** Updates a previously-created event's end time to the meeting's real end. Best-effort — logs and returns on failure. */
  async function completeEventForMeeting(companyId: string, calendarEventId: string, endedAt: Date): Promise<void> {
    const accessToken = await getAccessToken(companyId);
    if (!accessToken) return;

    const res = await fetch(`${CALENDAR_EVENTS_URL}/${encodeURIComponent(calendarEventId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ end: { dateTime: endedAt.toISOString() } }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn({ companyId, calendarEventId, status: res.status, errText }, "Google Calendar: failed to update event end time");
    }
  }

  return { isLinked, getAccessToken, createEventForMeeting, completeEventForMeeting };
}
