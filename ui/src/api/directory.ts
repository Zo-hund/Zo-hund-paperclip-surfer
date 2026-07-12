import { api } from "./client";

/**
 * Cross-company profile directory API client.
 *
 * Two backends, two transports:
 * - getPublicProfiles hits the fully public /public/directory/profiles
 *   route — no session cookie, no auth header, same fetch-based convention
 *   as publicCatalog.ts (a visitor browsing the directory has no Paperclip
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
};
