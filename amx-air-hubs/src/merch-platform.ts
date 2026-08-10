export interface MerchVariant {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  available: boolean;
}

export interface MerchProduct {
  id: string;
  name: string;
  description: string;
  category: "apparel" | "accessories" | "event";
  imageUrl: string;
  variants: MerchVariant[];
  partnerName: string;
  collectiveSharePercent: number;
}

export interface MerchCatalog {
  configured: boolean;
  checkoutConfigured: boolean;
  source: "printful" | "preview";
  products: MerchProduct[];
  message?: string;
}

export interface MerchOrder {
  id: string;
  eventId?: string;
  status: string;
  currency: string;
  totalCents: number;
  createdAt: string;
  trackingUrl?: string;
  items: Array<{ name: string; quantity: number }>;
}

export interface PrintfulRuntimeStatus {
  runtime: {
    tokenConfigured: boolean;
    storeConfigured: boolean;
    checkoutConfigured: boolean;
    paymentWebhookConfigured: boolean;
    fulfillmentWebhookConfigured: boolean;
    databaseConfigured: boolean;
    stripeConfigured: boolean;
  };
  printful: {
    connected: boolean;
    webhookConfigured: boolean;
    callbackHost?: string;
    eventTypes: string[];
    diagnostics?: Record<string, { ok: boolean; status: number; message: string }>;
    recommendedAction?: string;
    error?: string;
  };
}

export interface MerchPayoutProfile {
  tenantId: string;
  beneficiaryType: "creator" | "partner" | "organization" | "community_fund";
  beneficiaryId: string;
  displayName: string;
  contactEmail: string;
  stripeAccountId: string;
  onboardingStatus: "pending" | "restricted" | "active" | "disabled";
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
  updatedAt: string;
}

export interface MerchPayoutAllocation {
  id: string;
  orderId: string;
  beneficiaryType: MerchPayoutProfile["beneficiaryType"];
  beneficiaryId: string;
  displayName: string;
  amountCents: number;
  currency: string;
  allocationStatus: "payable" | "paid";
  onboardingStatus: MerchPayoutProfile["onboardingStatus"] | "not_started";
  payoutsEnabled: boolean;
  stripeTransferId?: string;
  transferStatus?: "pending" | "submitted" | "failed" | "reversed";
  eventId?: string;
  createdAt: string;
}

export interface MerchPayoutSummary {
  tenantId: string;
  connectConfigured: boolean;
  profiles: MerchPayoutProfile[];
  allocations: MerchPayoutAllocation[];
}

export const MERCH_CAMPAIGN_IMAGE = "/merch/amx-merch-collection.png";

export const previewMerchProducts: MerchProduct[] = [
  {
    id: "amx-air-hoodie",
    name: "AMX AIR Creator Hoodie",
    description: "Midweight creator hoodie for XR crews, builders, and live production teams.",
    category: "apparel",
    imageUrl: MERCH_CAMPAIGN_IMAGE,
    partnerName: "Community Runway",
    collectiveSharePercent: 15,
    variants: ["S", "M", "L", "XL", "2XL"].map((size) => ({ id: `hoodie-${size}`, name: `Black / ${size}`, priceCents: 6400, currency: "USD", available: true })),
  },
  {
    id: "amx-air-tee",
    name: "Create Curate Connect Tee",
    description: "Stage-ready AMX AIR Hubs tee supporting the featured event partner.",
    category: "apparel",
    imageUrl: MERCH_CAMPAIGN_IMAGE,
    partnerName: "Tech At Nite",
    collectiveSharePercent: 15,
    variants: ["S", "M", "L", "XL", "2XL"].map((size) => ({ id: `tee-${size}`, name: `Black / ${size}`, priceCents: 3400, currency: "USD", available: true })),
  },
  {
    id: "amx-air-cap",
    name: "XR Runway Cap",
    description: "Structured production cap with embroidered AMX AIR identity.",
    category: "accessories",
    imageUrl: MERCH_CAMPAIGN_IMAGE,
    partnerName: "AMX Labs",
    collectiveSharePercent: 12,
    variants: [{ id: "cap-standard", name: "Adjustable / Black", priceCents: 2900, currency: "USD", available: true }],
  },
  {
    id: "amx-air-tumbler",
    name: "Builder Studio Tumbler",
    description: "Insulated studio tumbler for workshops, podcasts, and event crews.",
    category: "event",
    imageUrl: MERCH_CAMPAIGN_IMAGE,
    partnerName: "Event Host",
    collectiveSharePercent: 10,
    variants: [{ id: "tumbler-20oz", name: "20 oz / Black", priceCents: 2600, currency: "USD", available: true }],
  },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Merch service is unavailable.");
  return body;
}

export async function loadMerchCatalog(tenantId: string, eventId?: string): Promise<MerchCatalog> {
  const query = new URLSearchParams({ tenantId });
  if (eventId) query.set("eventId", eventId);
  try {
    const catalog = await api<MerchCatalog>(`/api/merch/catalog?${query}`);
    return catalog.products.length ? catalog : { ...catalog, checkoutConfigured: false, source: "preview", products: previewMerchProducts };
  } catch (error) {
    return {
      configured: false,
      checkoutConfigured: false,
      source: "preview",
      products: previewMerchProducts,
      message: "Preview catalog active. Connect Printful to enable live inventory and secure checkout.",
    };
  }
}

export async function loadMerchOrders(tenantId: string): Promise<MerchOrder[]> {
  const result = await api<{ orders: MerchOrder[] }>(`/api/merch/orders?tenantId=${encodeURIComponent(tenantId)}`);
  return result.orders;
}

export async function createMerchCheckout(input: { tenantId: string; eventId?: string; items: Array<{ productId: string; variantId: string; quantity: number }> }) {
  return api<{ orderId: string; checkoutUrl: string; status: string }>("/api/merch/checkout", { method: "POST", body: JSON.stringify(input) });
}

export async function loadPrintfulRuntimeStatus() {
  return api<PrintfulRuntimeStatus>("/api/merch/admin/status");
}

export async function configurePrintfulWebhook() {
  return api<{ configured: boolean; callbackHost: string; eventTypes: string[] }>("/api/merch/admin/configure-webhook", { method: "POST", body: "{}" });
}

export async function loadMerchPayouts(tenantId: string) {
  return api<MerchPayoutSummary>(`/api/merch/admin/payouts?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function startStripeConnectOnboarding(input: { tenantId: string; beneficiaryType: MerchPayoutProfile["beneficiaryType"]; beneficiaryId: string; displayName: string; contactEmail: string }) {
  return api<{ beneficiaryId: string; stripeAccountId: string; onboardingStatus: string; onboardingUrl: string }>("/api/merch/admin/connect/onboard", { method: "POST", body: JSON.stringify(input) });
}

export async function openStripeConnectDashboard(input: { tenantId: string; beneficiaryType: MerchPayoutProfile["beneficiaryType"]; beneficiaryId: string }) {
  return api<{ dashboardUrl: string }>("/api/merch/admin/connect/dashboard", { method: "POST", body: JSON.stringify(input) });
}

export async function releaseMerchPayout(tenantId: string, allocationId: string) {
  return api<{ allocationId: string; transferId: string; status: string; idempotent: boolean }>(`/api/merch/admin/payouts/${encodeURIComponent(allocationId)}/release`, { method: "POST", body: JSON.stringify({ tenantId }) });
}

export async function reverseMerchPayout(tenantId: string, allocationId: string, reason: string) {
  return api<{ allocationId: string; transferId: string; reversalId: string; status: string; idempotent: boolean }>(`/api/merch/admin/payouts/${encodeURIComponent(allocationId)}/reverse`, { method: "POST", body: JSON.stringify({ tenantId, reason }) });
}
