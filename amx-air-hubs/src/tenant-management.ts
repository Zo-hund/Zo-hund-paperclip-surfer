import { marketplaceOffers, tenants } from "./data";

export interface TenantRecord {
  id: string;
  name: string;
  type: string;
  color: string;
  missionIds: string[];
  agentIds: string[];
  proofScope: string;
  reportTemplate: string;
  certificateName: string;
  certificateSponsor: string;
  proofSignature: string;
  marketplaceOfferIds: string[];
  updatedAt: string;
}

const TENANTS_KEY = "amx_tenant_records";

function defaults(): TenantRecord[] {
  return tenants.map((tenant) => ({
    ...tenant,
    proofScope: tenant.id,
    reportTemplate: `${tenant.name} completion and cohort outcome report.`,
    certificateName: tenant.name,
    certificateSponsor: tenant.id === "tech-at-nite" ? "AMX Labs" : tenant.name,
    proofSignature: `${tenant.id}-proof`,
    marketplaceOfferIds: marketplaceOffers.map((offer) => offer.id),
    updatedAt: new Date(0).toISOString(),
  }));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalize(value: Partial<TenantRecord>, fallback?: TenantRecord): TenantRecord {
  const base = fallback || defaults()[0];
  const name = String(value.name || base.name).trim().slice(0, 80);
  const id = slugify(value.id || name) || base.id;
  return {
    id,
    name,
    type: String(value.type || base.type).trim().slice(0, 80),
    color: /^#[0-9a-f]{6}$/i.test(value.color || "") ? String(value.color) : base.color,
    missionIds: unique(Array.isArray(value.missionIds) ? value.missionIds : base.missionIds),
    agentIds: unique(Array.isArray(value.agentIds) ? value.agentIds : base.agentIds),
    proofScope: slugify(value.proofScope || id) || id,
    reportTemplate: String(value.reportTemplate || `${name} completion and cohort outcome report.`).trim().slice(0, 500),
    certificateName: String(value.certificateName || name).trim().slice(0, 100),
    certificateSponsor: String(value.certificateSponsor || name).trim().slice(0, 100),
    proofSignature: slugify(value.proofSignature || `${id}-proof`) || `${id}-proof`,
    marketplaceOfferIds: unique(Array.isArray(value.marketplaceOfferIds) ? value.marketplaceOfferIds : base.marketplaceOfferIds),
    updatedAt: value.updatedAt || new Date().toISOString(),
  };
}

export function slugify(value: string) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export function createTenantDraft(): TenantRecord {
  return normalize({
    id: "new-organization",
    name: "New organization",
    type: "Partner",
    color: "#55e6ff",
    missionIds: [],
    agentIds: [],
    proofScope: "new-organization",
    reportTemplate: "Completion and cohort outcome report.",
    certificateName: "New organization",
    certificateSponsor: "",
    proofSignature: "new-organization-proof",
    marketplaceOfferIds: [],
  });
}

export function getTenantRecords(): TenantRecord[] {
  const seeded = defaults();
  try {
    const stored = JSON.parse(localStorage.getItem(TENANTS_KEY) || "[]") as Partial<TenantRecord>[];
    const records = stored.map((item) => normalize(item, seeded.find((tenant) => tenant.id === item.id)));
    const customIds = new Set(records.map((tenant) => tenant.id));
    return [...records, ...seeded.filter((tenant) => !customIds.has(tenant.id))];
  } catch {
    return seeded;
  }
}

export function saveTenantRecord(input: TenantRecord) {
  const item = normalize({ ...input, updatedAt: new Date().toISOString() });
  const records = getTenantRecords();
  const next = records.some((tenant) => tenant.id === item.id)
    ? records.map((tenant) => tenant.id === item.id ? item : tenant)
    : [item, ...records];
  localStorage.setItem(TENANTS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("amx:tenants", { detail: item.id }));
  return item;
}

export function getTenantRecord(id: string) {
  const records = getTenantRecords();
  return records.find((tenant) => tenant.id === id) || records[0];
}
