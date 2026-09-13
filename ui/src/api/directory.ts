import type { DirectoryProfileFilters, DirectoryProfilesData } from "@paperclipai/shared";
import { api, ApiError, detachInflightGet } from "./client";

export type { DirectoryProfile, DirectoryProfileFilters, DirectoryProfilesData } from "@paperclipai/shared";

function query(filters: DirectoryProfileFilters): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.companyId) params.set("companyId", filters.companyId);
  if (filters.skill) params.set("skill", filters.skill);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  return params.size ? `?${params}` : "";
}

export const directoryApi = {
  async getPublicProfiles(filters: DirectoryProfileFilters = {}, signal?: AbortSignal): Promise<DirectoryProfilesData> {
    const response = await fetch(`/api/public/directory/profiles${query(filters)}`, {
      credentials: "omit",
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(body?.error ?? `Request failed: ${response.status}`, response.status, body);
    }
    return response.json();
  },
  getInstanceProfiles(filters: DirectoryProfileFilters = {}, signal?: AbortSignal) {
    const path = `/instance/directory/profiles${query(filters)}`;
    // React Query deduplicates within an account key. The lower-level client
    // keys only by path, so it must not join a previous account's request.
    detachInflightGet(path);
    return api.get<DirectoryProfilesData>(path, { signal });
  },
};
