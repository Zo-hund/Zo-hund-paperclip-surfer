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
  createdAt: string;
  updatedAt: string;
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

export interface MeetingDetail extends Meeting {
  transcripts: MeetingTranscript[];
}

export const meetingsApi = {
  list: (companyId: string): Promise<Meeting[]> =>
    api.get<Meeting[]>(`/meetings?companyId=${encodeURIComponent(companyId)}`),

  start: (data: { companyId: string; title: string; type?: string }): Promise<Meeting> =>
    api.post<Meeting>(`/meetings`, data),

  getDetail: (id: string): Promise<MeetingDetail> =>
    api.get<MeetingDetail>(`/meetings/${id}`),

  addTranscript: (id: string, data: Partial<MeetingTranscript>): Promise<MeetingTranscript> =>
    api.post<MeetingTranscript>(`/meetings/${id}/transcript`, data),

  finalize: (id: string): Promise<{ success: boolean }> =>
    api.post<{ success: boolean }>(`/meetings/${id}/recording`, {}),
};
