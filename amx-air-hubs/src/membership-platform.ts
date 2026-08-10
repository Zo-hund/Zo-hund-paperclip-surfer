export interface MembershipPlan {
  id: string;
  name: string;
  cadence: "free" | "month" | "year";
  benefits: string[];
  configured: boolean;
  amountCents: number | null;
  currency: string;
  interval: string | null;
  intervalCount?: number;
}

export interface MembershipCatalog {
  brand: string;
  tagline: string;
  billingConfigured: boolean;
  plans: MembershipPlan[];
}

export interface MemberSubscription {
  id?: string;
  tenantId?: string;
  planId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  managed: boolean;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Membership service is unavailable.");
  return body;
}

export async function loadMembershipCatalog() {
  return api<MembershipCatalog>("/api/membership/catalog");
}

export async function loadMemberSubscription(tenantId: string) {
  const result = await api<{ subscription: MemberSubscription }>(`/api/membership/me?tenantId=${encodeURIComponent(tenantId)}`);
  return result.subscription;
}

export async function createMembershipCheckout(tenantId: string, planId: string) {
  return api<{ checkoutUrl: string; planId: string }>("/api/membership/checkout", { method: "POST", body: JSON.stringify({ tenantId, planId }) });
}

export async function reconcileMembershipCheckout(tenantId: string, sessionId: string) {
  return api<{ subscription: MemberSubscription; status: string; planId: string }>("/api/membership/checkout-reconcile", { method: "POST", body: JSON.stringify({ tenantId, sessionId }) });
}

export async function createMembershipPortal(tenantId: string) {
  return api<{ portalUrl: string }>("/api/membership/portal", { method: "POST", body: JSON.stringify({ tenantId }) });
}
