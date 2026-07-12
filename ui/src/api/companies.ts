import type {
  Company,
  CompanyMembershipRole,
  CompanyPortabilityExportRequest,
  CompanyPortabilityExportPreviewResult,
  CompanyPortabilityExportResult,
  CompanyPortabilityImportRequest,
  CompanyPortabilityImportResult,
  CompanyPortabilityPreviewRequest,
  CompanyPortabilityPreviewResult,
  UpdateCompanyBranding,
} from "@paperclipai/shared";
import { api } from "./client";

export type CompanyStats = Record<string, { agentCount: number; issueCount: number }>;

export const companiesApi = {
  list: () => api.get<Company[]>("/companies"),
  get: (companyId: string) => api.get<Company>(`/companies/${companyId}`),
  stats: () => api.get<CompanyStats>("/companies/stats"),
  myRole: (companyId: string) =>
    api.get<{ role: CompanyMembershipRole | null; isInstanceAdmin: boolean }>(`/companies/${companyId}/my-role`),
  create: (data: {
    name: string;
    description?: string | null;
    budgetMonthlyCents?: number;
  }) =>
    api.post<Company>("/companies", data),
  update: (
    companyId: string,
    data: Partial<
      Pick<
        Company,
        | "name"
        | "description"
        | "status"
        | "budgetMonthlyCents"
        | "requireBoardApprovalForNewAgents"
        | "brandColor"
        | "logoAssetId"
        | "isPublic"
        | "tagline"
      >
    >,
  ) => api.patch<Company>(`/companies/${companyId}`, data),
  updateBranding: (companyId: string, data: UpdateCompanyBranding) =>
    api.patch<Company>(`/companies/${companyId}/branding`, data),
  archive: (companyId: string) => api.post<Company>(`/companies/${companyId}/archive`, {}),
  remove: (companyId: string) => api.delete<{ ok: true }>(`/companies/${companyId}`),
  exportBundle: (
    companyId: string,
    data: CompanyPortabilityExportRequest,
  ) =>
    api.post<CompanyPortabilityExportResult>(`/companies/${companyId}/export`, data),
  exportPreview: (
    companyId: string,
    data: CompanyPortabilityExportRequest,
  ) =>
    api.post<CompanyPortabilityExportPreviewResult>(`/companies/${companyId}/exports/preview`, data),
  exportPackage: (
    companyId: string,
    data: CompanyPortabilityExportRequest,
  ) =>
    api.post<CompanyPortabilityExportResult>(`/companies/${companyId}/exports`, data),
  importPreview: (data: CompanyPortabilityPreviewRequest) =>
    api.post<CompanyPortabilityPreviewResult>("/companies/import/preview", data),
  importBundle: (data: CompanyPortabilityImportRequest) =>
    api.post<CompanyPortabilityImportResult>("/companies/import", data),
 
  listBoardDeliverables: (opts?: { search?: string; type?: string; companyId?: string }) => {
    const params = new URLSearchParams();
    if (opts?.search) params.set("search", opts.search);
    if (opts?.type) params.set("type", opts.type);
    if (opts?.companyId) params.set("companyId", opts.companyId);
    const qs = params.toString();
    return api.get<any[]>(`/companies/board/deliverables${qs ? `?${qs}` : ""}`);
  },
  listCompanyDeliverables: (companyId: string, opts?: { search?: string; type?: string }) => {
    const params = new URLSearchParams({ companyId });
    if (opts?.search) params.set("search", opts.search);
    if (opts?.type) params.set("type", opts.type);
    return api.get<any[]>(`/companies/board/deliverables?${params.toString()}`);
  },
  getDeliverableDetail: (id: string) => api.get<any>(`/companies/board/deliverables/${id}`),
  reviewDeliverable: (id: string, data: { reviewState?: string; healthStatus?: string; comment?: string }) =>
    api.patch<any>(`/companies/board/deliverables/${id}/review`, data),
  getCompanyMetrics: (companyId: string) => api.get<any>(`/companies/${companyId}/metrics`),
  updateDeploymentTarget: (companyId: string, target: string) =>
    api.post<{ ok: true; target: string }>(`/companies/${companyId}/deployment-target`, { target }),

  getMemberCredential: (companyId: string, userId: string) =>
    api.get<{
      membershipId: string;
      credentialId: string | null;
      credentialData: Record<string, unknown> | null;
      status: string;
      role: string | null;
      companyId: string;
      createdAt: string;
    }>(`/companies/${companyId}/members/${userId}/credential`),

  getMyCredential: () =>
    api.get<{
      userName: string | null;
      userEmail: string | null;
      credentialId: string | null;
      credentialData: Record<string, unknown> | null;
      role: string | null;
      status: string | null;
      companyId: string | null;
      createdAt: string | null;
    }>(`/me/credential`),

  verifyPass: (passId: string) =>
    api.get<{
      valid: boolean;
      passId: string;
      memberName: string | null;
      tier: string;
      role: string | null;
      status: string;
      company: string | null;
      issuedAt: string | null;
    }>(`/verify/pass/${encodeURIComponent(passId)}`),

  getPublicPortal: (slug: string, opts?: { search?: string; type?: string }) => {
    const params = new URLSearchParams();
    if (opts?.search) params.set("search", opts.search);
    if (opts?.type) params.set("type", opts.type);
    const qs = params.toString();
    return api.get<{
      company: { id: string; name: string; description: string | null; brandColor: string | null; logoUrl: string | null; issuePrefix: string };
      deliverables: any[];
    }>(`/companies/public/${slug}/portal${qs ? `?${qs}` : ""}`);
  },

  getPublicContent: (slug: string) =>
    api.get<{
      company: { id: string; name: string; description: string | null; brandColor: string | null };
      staff: Array<{ id: string; name: string; title: string; photoUrl: string | null; sortOrder: number }>;
      events: Array<{
        id: string;
        title: string;
        subtitle: string | null;
        startDate: string;
        endDate: string;
        timeRange: string | null;
        ageRange: string | null;
        description: string | null;
        flyerUrl: string | null;
        registrationUrl: string | null;
        qrCodeUrl: string | null;
      }>;
    }>(`/companies/public/${slug}/content`),
};
