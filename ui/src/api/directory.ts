/**
 * Public directory API client
 *
 * Session-independent fetch module (mirrors publicCatalog.ts, not the
 * session-cookie ./client.ts wrapper) — a visitor browsing the company
 * directory or the cross-company catalog has no Paperclip account or
 * session.
 */

export interface PublicDirectoryCompany {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  brandColor: string | null;
  logoUrl: string | null;
}

export interface PublicDirectoryCompaniesResult {
  companies: PublicDirectoryCompany[];
  total: number;
}

export type PublicCatalogItemKind = "subscription_tier" | "marketplace_listing";

export interface PublicCatalogItem {
  id: string;
  kind: PublicCatalogItemKind;
  name: string;
  description: string | null;
  priceLabel: string;
  companyId: string;
  companyName: string;
  companyPrefix: string;
  imageUrl: string | null;
}

export interface PublicCatalogResult {
  items: PublicCatalogItem[];
  total: number;
}

export interface PublicCatalogFilters {
  kind?: PublicCatalogItemKind;
  companyId?: string;
  limit?: number;
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/public${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return res.json();
}

export const directoryApi = {
  getPublicCompanies: (): Promise<PublicDirectoryCompaniesResult> =>
    publicRequest<PublicDirectoryCompaniesResult>("/directory/companies"),

  getPublicCatalog: (filters?: PublicCatalogFilters): Promise<PublicCatalogResult> => {
    const params = new URLSearchParams();
    if (filters?.kind) params.set("kind", filters.kind);
    if (filters?.companyId) params.set("companyId", filters.companyId);
    if (filters?.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();
    return publicRequest<PublicCatalogResult>(`/directory/catalog${qs ? `?${qs}` : ""}`);
  },
};
