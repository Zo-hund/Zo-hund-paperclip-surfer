import { api } from "./client.js";

/**
 * AMX LABS Meetings API Client
 */

export interface Meeting {
  id: string;
  companyId: string;
  title: string;
  type: string;
  status: string;
  recordingPath: string | null;
  durationSeconds: number | null;
  endedAt: string | null;
  issueId: string | null;
  /** Set once a real Google Calendar event has been created for this meeting. */
  calendarProvider: string | null;
  calendarEventId: string | null;
  /** Free-text label marking this meeting as part of a recurring series. */
  podKey: string | null;
  /** Restored on room entry for the next meeting sharing the same podKey. */
  lastActiveContext: { issueId: string } | null;
  createdAt: string;
  updatedAt: string;
  insightsCount?: number;
  approvedCount?: number;
  risksCount?: number;
  /** Real live participant count for active meetings, null once completed. */
  occupancy?: { count: number } | null;
}

export interface MeetingTranscript {
  id: string;
  meetingId: string;
  actorType: string;
  actorId: string;
  text: string;
  timestampOffset: number;
  createdAt: string;
}

export interface MeetingParticipant {
  id: string;
  agentId: string | null;
  userId: string | null;
  status: string;
  lastAction: string | null;
  participantType: "agent" | "staff" | "guest";
  name: string | null;
  guestName: string | null;
  role: string | null;
  title: string | null;
  icon: string | null;
}

export interface MeetingGuestInvite {
  id: string;
  meetingId: string;
  guestLabel: string | null;
  createdByUserId: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface MeetingOutcome {
  id: string;
  meetingId: string;
  type: string;
  content: string;
  agentId: string | null;
  status: string;
  createdAt: string;
}

export interface MeetingDetail extends Meeting {
  transcripts: MeetingTranscript[];
  participants: MeetingParticipant[];
  outcomes: MeetingOutcome[];
}

export const meetingsApi = {
  list: (companyId: string): Promise<Meeting[]> =>
    api.get<Meeting[]>(`/meetings?companyId=${encodeURIComponent(companyId)}`),

  start: (data: { companyId: string; title: string; type?: string; issueId?: string; podKey?: string }): Promise<Meeting & { calendarSyncWarning?: string }> =>
    api.post<Meeting & { calendarSyncWarning?: string }>(`/meetings`, data),

  getDetail: (id: string): Promise<MeetingDetail> =>
    api.get<MeetingDetail>(`/meetings/${id}`),

  addTranscript: (id: string, data: Partial<MeetingTranscript>): Promise<MeetingTranscript> =>
    api.post<MeetingTranscript>(`/meetings/${id}/transcript`, data),

  finalize: (id: string): Promise<{ success: boolean }> =>
    api.post<{ success: boolean }>(`/meetings/${id}/recording`, {}),

  inviteAgent: (id: string, agentId: string): Promise<MeetingParticipant> =>
    api.post<MeetingParticipant>(`/meetings/${id}/invite`, { agentId }),

  inviteStaff: (id: string, userId: string): Promise<MeetingParticipant> =>
    api.post<MeetingParticipant>(`/meetings/${id}/invite`, { userId }),

  getParticipants: (id: string): Promise<MeetingParticipant[]> =>
    api.get<MeetingParticipant[]>(`/meetings/${id}/participants`),

  getOutcomes: (id: string): Promise<MeetingOutcome[]> =>
    api.get<MeetingOutcome[]>(`/meetings/${id}/outcomes`),

  /** Run a governed in-meeting action (same endpoint the voice agent uses). */
  action: (id: string, action: string, params: Record<string, unknown> = {}): Promise<{ result: unknown; summary: string }> =>
    api.post<{ result: unknown; summary: string }>(`/meetings/${id}/actions`, { action, params }),

  /** Generate a reusable, time-limited guest magic link. Returns the raw token once — never retrievable again.
   *  Pass guestEmail to also deliver the link by email (emailSent reports whether a transport actually sent it). */
  createGuestInvite: (id: string, data: { guestLabel?: string; ttlHours?: number; guestEmail?: string } = {}): Promise<MeetingGuestInvite & { token: string; emailSent: boolean }> =>
    api.post<MeetingGuestInvite & { token: string; emailSent: boolean }>(`/meetings/${id}/guest-invites`, data),

  listGuestInvites: (id: string): Promise<MeetingGuestInvite[]> =>
    api.get<MeetingGuestInvite[]>(`/meetings/${id}/guest-invites`),

  revokeGuestInvite: (id: string, inviteId: string): Promise<MeetingGuestInvite> =>
    api.delete<MeetingGuestInvite>(`/meetings/${id}/guest-invites/${inviteId}`),
};
