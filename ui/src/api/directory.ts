import { api } from "./client";

/**
 * Cross-company directory API client.
 *
 * Two transports:
 * - publicRequest hits the fully public /public/directory/* routes — no
 *   session cookie, no auth header, same fetch-based convention as
 *   publicCatalog.ts (a visitor browsing any directory has no Paperclip
 *   account).
 * - getInstanceProfiles hits the assertInstanceAdmin-gated
 *   /instance/directory/profiles route via the normal session-cookie `api`
 *   client, same as amxApi.getInstanceChainDirectory.
 */

export interface DirectoryProfile {
  id: string;
  type: "agent" | "human";
  name: string;
  title: string;
  companyId: string;
  companyName: string;
  companyPrefix: string;
  skills: string[];
  avatarUrl?: string;
  href: string;
  /** Only present on the instance-admin response. */
  isPublicProfile?: boolean;
}

export interface DirectoryProfilesData {
  profiles: DirectoryProfile[];
  total: number;
}

export interface DirectoryProfileFilters {
  type?: "agent" | "human";
  companyId?: string;
  skill?: string;
  limit?: number;
}

function buildQuery(filters: DirectoryProfileFilters): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.companyId) params.set("companyId", filters.companyId);
  if (filters.skill) params.set("skill", filters.skill);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

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

async function publicRequest<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return res.json();
}

export const directoryApi = {
  getPublicProfiles: (filters: DirectoryProfileFilters = {}) =>
    publicRequest<DirectoryProfilesData>(`/public/directory/profiles${buildQuery(filters)}`),

  getInstanceProfiles: (filters: DirectoryProfileFilters = {}) =>
    api.get<DirectoryProfilesData>(`/instance/directory/profiles${buildQuery(filters)}`),

  getPublicCompanies: (): Promise<PublicDirectoryCompaniesResult> =>
    publicRequest<PublicDirectoryCompaniesResult>("/public/directory/companies"),

  getPublicCatalog: (filters?: PublicCatalogFilters): Promise<PublicCatalogResult> => {
    const params = new URLSearchParams();
    if (filters?.kind) params.set("kind", filters.kind);
    if (filters?.companyId) params.set("companyId", filters.companyId);
    if (filters?.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();
    return publicRequest<PublicCatalogResult>(`/public/directory/catalog${qs ? `?${qs}` : ""}`);
  },
};
