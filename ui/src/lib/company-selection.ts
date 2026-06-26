export type CompanySelectionSource = "manual" | "route_sync" | "bootstrap";

export function shouldSyncCompanySelectionFromRoute(params: {
  // Retained for call-site compatibility; the URL is now always authoritative so
  // the source no longer gates the sync.
  selectionSource: CompanySelectionSource;
  selectedCompanyId: string | null;
  routeCompanyId: string;
}): boolean {
  const { selectedCompanyId, routeCompanyId } = params;

  if (selectedCompanyId === routeCompanyId) return false;

  // The route prefix is the single source of truth for which company is active.
  // Any mismatch (including after a manual switch) must resync `selectedCompanyId`
  // to the URL so data queries can never drift to a company the URL isn't showing.
  return true;
}
