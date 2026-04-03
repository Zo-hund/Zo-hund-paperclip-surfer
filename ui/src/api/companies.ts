import type {
  Company,
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
        "name" | "description" | "status" | "budgetMonthlyCents" | "requireBoardApprovalForNewAgents" | "brandColor" | "logoAssetId"
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
  reviewDeliverable: (id: string, data: { reviewState?: string; healthStatus?: string }) =>
    api.patch<any>(`/companies/board/deliverables/${id}/review`, data),
  getCompanyMetrics: (companyId: string) => api.get<any>(`/companies/${companyId}/metrics`),
  updateDeploymentTarget: (companyId: string, target: string) =>
    api.post<{ ok: true; target: string }>(`/companies/${companyId}/deployment-target`, { target }),
};
