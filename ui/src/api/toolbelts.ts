import { api } from "./client";

export interface Toolbelt {
  id: string;
  companyId: string | null;
  key: string;
  name: string;
  description: string | null;
  category: string;
  toolPermissions: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Harness {
  id: string;
  companyId: string | null;
  key: string;
  name: string;
  description: string | null;
  category: string;
  adapterType: string;
  model: string;
  toolbeltId: string | null;
  guardrails: Record<string, unknown>;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ToolbeltWriteRequest {
  key?: string;
  name?: string;
  description?: string | null;
  category?: string;
  toolPermissions?: string[];
  isPublic?: boolean;
}

export interface HarnessWriteRequest {
  key?: string;
  name?: string;
  description?: string | null;
  category?: string;
  adapterType?: string;
  model?: string;
  toolbeltId?: string | null;
  guardrails?: Record<string, unknown>;
  isPublic?: boolean;
}

export const toolbeltsApi = {
  list: (companyId: string) =>
    api.get<Toolbelt[]>(`/companies/${encodeURIComponent(companyId)}/toolbelts`),
  create: (companyId: string, data: ToolbeltWriteRequest) =>
    api.post<Toolbelt>(`/companies/${encodeURIComponent(companyId)}/toolbelts`, data),
  update: (companyId: string, toolbeltId: string, data: ToolbeltWriteRequest) =>
    api.patch<Toolbelt>(
      `/companies/${encodeURIComponent(companyId)}/toolbelts/${encodeURIComponent(toolbeltId)}`,
      data,
    ),

  listInstance: () => api.get<Toolbelt[]>("/instance/toolbelts"),
  createInstance: (data: ToolbeltWriteRequest) => api.post<Toolbelt>("/instance/toolbelts", data),
  updateInstance: (toolbeltId: string, data: ToolbeltWriteRequest) =>
    api.patch<Toolbelt>(`/instance/toolbelts/${encodeURIComponent(toolbeltId)}`, data),
};

export const harnessesApi = {
  list: (companyId: string) =>
    api.get<Harness[]>(`/companies/${encodeURIComponent(companyId)}/harnesses`),
  create: (companyId: string, data: HarnessWriteRequest) =>
    api.post<Harness>(`/companies/${encodeURIComponent(companyId)}/harnesses`, data),
  update: (companyId: string, harnessId: string, data: HarnessWriteRequest) =>
    api.patch<Harness>(
      `/companies/${encodeURIComponent(companyId)}/harnesses/${encodeURIComponent(harnessId)}`,
      data,
    ),

  listInstance: () => api.get<Harness[]>("/instance/harnesses"),
  createInstance: (data: HarnessWriteRequest) => api.post<Harness>("/instance/harnesses", data),
  updateInstance: (harnessId: string, data: HarnessWriteRequest) =>
    api.patch<Harness>(`/instance/harnesses/${encodeURIComponent(harnessId)}`, data),
};
