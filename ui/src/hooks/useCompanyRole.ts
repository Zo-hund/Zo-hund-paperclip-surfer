import { useQuery } from "@tanstack/react-query";
import { hasCompanyRoleAtLeast, type CompanyMembershipRole } from "@paperclipai/shared";
import { companiesApi } from "../api/companies";

/**
 * Returns the current actor's effective role for a company, and a helper to
 * check whether it meets a minimum tier. Mirrors the server-side
 * `assertCompanyRole` bypass rules (instance admin / local_trusted / agent).
 */
export function useCompanyRole(companyId: string | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ["company-my-role", companyId],
    queryFn: () => companiesApi.myRole(companyId as string),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const role = data?.role ?? null;
  const isInstanceAdmin = data?.isInstanceAdmin ?? false;

  const hasRoleAtLeast = (minRole: CompanyMembershipRole) =>
    isInstanceAdmin || hasCompanyRoleAtLeast(role, minRole);

  return { role, isInstanceAdmin, hasRoleAtLeast, isLoading };
}
