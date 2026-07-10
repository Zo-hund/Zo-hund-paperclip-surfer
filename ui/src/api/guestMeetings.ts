/**
 * AMX LABS Guest Meetings API Client
 *
 * Thin, session-independent fetch module — mirrors ui/src/api/auth.ts, not
 * the session-cookie-dependent ./client.ts wrapper. A guest has no Paperclip
 * account and no session cookie; the meeting-scoped magic-link token is the
 * only credential these calls carry.
 */

export interface GuestMeetingSummary {
  meetingId: string;
  meetingTitle: string;
  companyName: string | null;
  companyBrandColor: string | null;
  companyLogoUrl: string | null;
  meetingType: string;
  podKey: string | null;
  hostName: string | null;
  meetingStatus: string;
  expiresAt: string;
}

export interface GuestJoinResult {
  token: string;
  url: string;
  roomName: string;
  identity: string;
  guestName: string;
}

async function guestRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/guest${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return res.json();
}

export const guestMeetingsApi = {
  resolve: (token: string): Promise<GuestMeetingSummary> =>
    guestRequest<GuestMeetingSummary>(`/meetings/${encodeURIComponent(token)}`),

  join: (token: string, guestName: string): Promise<GuestJoinResult> =>
    guestRequest<GuestJoinResult>(`/meetings/${encodeURIComponent(token)}/join`, {
      method: "POST",
      body: JSON.stringify({ guestName }),
    }),
};
