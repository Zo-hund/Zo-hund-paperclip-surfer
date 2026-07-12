/**
 * Public skills directory API client
 *
 * Session-independent fetch module (mirrors publicCatalog.ts, not the
 * session-cookie ./client.ts wrapper) — the directory page has no dependency
 * on an authenticated session or a selected company.
 */

export interface PublicSkillDirectoryEntry {
  name: string;
  sourceCount: number;
  sources: string[];
}

export interface PublicSkillDirectory {
  skills: PublicSkillDirectoryEntry[];
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

export const skillsDirectoryApi = {
  list: (): Promise<PublicSkillDirectory> => publicRequest<PublicSkillDirectory>("/directory/skills"),
};
