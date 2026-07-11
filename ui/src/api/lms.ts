import { api } from "./client";

export interface LmsWorkshop {
  id: string;
  companyId: string;
  name: string;
  description: string;
  format: "in_person" | "online" | "metaverse";
  category: "AI" | "Simulation" | "Leadership" | "XR" | "Business";
  level: "Beginner" | "Intermediate" | "Advanced" | "Master";
  creditsRequired: number;
  creditsAwarded: number;
  status: "active" | "draft" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface LmsDashboard {
  workshops: LmsWorkshop[];
  userLevel: number;
  userCredits: number;
  tokenBalance: number;
  progressionStage: string;
  stats: {
    certificates: number;
    simulationsCompleted: number;
    hoursTrained: number;
  };
}

export interface LmsMarketplaceBooking {
  id: string;
  companyId: string;
  listingId: string;
  clientMemberId: string;
  projectTitle: string;
  description: string | null;
  budgetSims: number;
  status: "pending" | "active" | "completed" | "cancelled";
  createdAt: string;
}

export const lmsApi = {
  getDashboard: (companyId: string) =>
    api.get<LmsDashboard>(`/companies/${companyId}/lms/dashboard`),

  createMarketplaceBooking: (companyId: string, data: {
    listingId: string;
    clientMemberId: string;
    projectTitle: string;
    description?: string;
    budgetSims: number;
  }) => api.post<LmsMarketplaceBooking>(`/companies/${companyId}/lms/marketplace/bookings`, data),

  createWorkshop: (companyId: string, data: {
    name: string;
    description: string;
    format?: string;
    category?: string;
    level?: string;
    creditsRequired?: number;
    creditsAwarded?: number;
    status?: string;
  }) => api.post<LmsWorkshop>(`/companies/${companyId}/lms/workshops`, data),

  updateWorkshop: (companyId: string, workshopId: string, data: Record<string, unknown>) =>
    api.patch<LmsWorkshop>(`/companies/${companyId}/lms/workshops/${workshopId}`, data),

  enroll: (companyId: string, workshopId: string) =>
    api.post(`/companies/${companyId}/lms/enroll`, { workshopId }),
};
