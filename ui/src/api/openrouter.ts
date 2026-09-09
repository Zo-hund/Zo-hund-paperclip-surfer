import type { OpenRouterCredentialStatus, OpenRouterCredentialValidation } from "@paperclipai/shared";
import { api } from "./client";

const path = (companyId: string) => `/companies/${companyId}/openrouter-credentials`;
export const openRouterApi = {
  status: (companyId: string) => api.get<OpenRouterCredentialStatus>(path(companyId)),
  save: (companyId: string, value: string) => api.put<OpenRouterCredentialStatus>(path(companyId), { value }),
  validate: (companyId: string) => api.post<OpenRouterCredentialValidation>(`${path(companyId)}/validate`, {}),
  remove: (companyId: string) => api.delete<OpenRouterCredentialStatus>(path(companyId)),
};
