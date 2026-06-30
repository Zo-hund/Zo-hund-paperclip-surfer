import { api } from "./client";

export interface CompanyStaffRow {
  id: string;
  companyId: string;
  name: string;
  title: string;
  photoAssetId: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CompanyEventRow {
  id: string;
  companyId: string;
  title: string;
  subtitle: string | null;
  startDate: string;
  endDate: string;
  timeRange: string | null;
  ageRange: string | null;
  description: string | null;
  flyerAssetId: string | null;
  registrationUrl: string | null;
  qrCodeAssetId: string | null;
  isPublished: boolean;
}

export const companyContentApi = {
  listStaff: (companyId: string) => api.get<CompanyStaffRow[]>(`/companies/${companyId}/staff`),
  createStaff: (
    companyId: string,
    data: { name: string; title: string; photoAssetId?: string | null; sortOrder?: number },
  ) => api.post<CompanyStaffRow>(`/companies/${companyId}/staff`, data),
  updateStaff: (companyId: string, staffId: string, data: Partial<CompanyStaffRow>) =>
    api.patch<CompanyStaffRow>(`/companies/${companyId}/staff/${staffId}`, data),
  deleteStaff: (companyId: string, staffId: string) =>
    api.delete(`/companies/${companyId}/staff/${staffId}`),

  listEvents: (companyId: string) => api.get<CompanyEventRow[]>(`/companies/${companyId}/events`),
  createEvent: (
    companyId: string,
    data: {
      title: string;
      subtitle?: string | null;
      startDate: string;
      endDate: string;
      timeRange?: string | null;
      ageRange?: string | null;
      description?: string | null;
      flyerAssetId?: string | null;
      registrationUrl?: string | null;
    },
  ) => api.post<CompanyEventRow>(`/companies/${companyId}/events`, data),
  updateEvent: (companyId: string, eventId: string, data: Partial<CompanyEventRow>) =>
    api.patch<CompanyEventRow>(`/companies/${companyId}/events/${eventId}`, data),
  deleteEvent: (companyId: string, eventId: string) =>
    api.delete(`/companies/${companyId}/events/${eventId}`),
};
