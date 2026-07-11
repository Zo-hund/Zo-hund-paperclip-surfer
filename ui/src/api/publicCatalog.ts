/**
 * Public storefront catalog API client
 *
 * Session-independent fetch module (mirrors guestMeetings.ts, not the
 * session-cookie ./client.ts wrapper) — a prospective subscriber viewing a
 * company's pricing page has no Paperclip account or session.
 */

export interface PublicCatalogTier {
  tier: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  features: string[];
  amount: number;
  currency: string;
  interval: string;
}

export interface PublicCatalog {
  companyName: string;
  brandColor: string | null;
  logoUrl: string | null;
  tiers: PublicCatalogTier[];
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

export const publicCatalogApi = {
  catalog: (companyId: string): Promise<PublicCatalog> =>
    publicRequest<PublicCatalog>(`/companies/${encodeURIComponent(companyId)}/stripe/catalog`),

  checkout: (companyId: string, tierName: string): Promise<{ url: string }> =>
    publicRequest<{ url: string }>(`/companies/${encodeURIComponent(companyId)}/stripe/checkout`, {
      method: "POST",
      body: JSON.stringify({ tierName }),
    }),
};
