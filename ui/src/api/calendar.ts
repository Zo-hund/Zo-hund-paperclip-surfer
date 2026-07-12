import { api } from "./client";

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  kind: "company_event" | "marketplace_booking";
  eventType?: string | null;
  status?: string | null;
  href: string;
}

export interface CalendarData {
  events: CalendarEvent[];
}

export interface CalendarFilters {
  since?: string;
  until?: string;
}

export interface CompanyEventInput {
  title: string;
  subtitle?: string;
  startDate: string;
  endDate: string;
  description?: string;
  eventType?: string;
  isPublished?: boolean;
}

export const calendarApi = {
  getCalendar: (companyId: string, filters: CalendarFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.since) params.set("since", filters.since);
    if (filters.until) params.set("until", filters.until);
    const qs = params.toString();
    return api.get<CalendarData>(`/companies/${companyId}/calendar${qs ? `?${qs}` : ""}`);
  },

  createEvent: (companyId: string, body: CompanyEventInput) =>
    api.post<unknown>(`/companies/${companyId}/events`, body),

  updateEvent: (companyId: string, eventId: string, body: Partial<CompanyEventInput>) =>
    api.patch<unknown>(`/companies/${companyId}/events/${encodeURIComponent(eventId)}`, body),
};
