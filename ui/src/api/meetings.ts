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
  issueId: string | null;
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
  participantType: "agent" | "staff";
  name: string | null;
  role: string | null;
  title: string | null;
  icon: string | null;
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

  start: (data: { companyId: string; title: string; type?: string; issueId?: string }): Promise<Meeting> =>
    api.post<Meeting>(`/meetings`, data),

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
};
