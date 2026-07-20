import { getMemberDataClient } from "./member-auth";
import { setActiveTenant } from "./operations";
import { saveTenantRecord } from "./tenant-management";

export type PartnerRole = "owner" | "admin" | "producer" | "analyst" | "viewer";
export type PartnerCampaignStatus = "draft" | "live" | "paused" | "complete";
export type PartnerEventType = "scan" | "start" | "completion" | "marketplace";

export interface PartnerOrganization {
  id: string;
  name: string;
  organization_type: string;
  status: "draft" | "active" | "archived";
  brand_color: string;
  logo_url: string | null;
  website_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  mission_ids: string[];
  agent_ids: string[];
  proof_scope: string;
  report_template: string;
  certificate_name: string;
  certificate_sponsor: string;
  proof_signature: string;
  marketplace_offer_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface PartnerCampaign {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  summary: string;
  mission_id: string;
  location_tag: string;
  status: PartnerCampaignStatus;
  target_completions: number;
  scan_count: number;
  start_count: number;
  completion_count: number;
  marketplace_count: number;
  starts_at: string | null;
  ends_at: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: PartnerRole;
  status: "active" | "suspended";
  joined_at: string;
  display_name: string;
  member_code: string;
  avatar_url: string | null;
}

export interface PartnerInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: PartnerRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
}

export interface PartnerCampaignEvent {
  id: string;
  campaign_id: string;
  organization_id: string;
  event_type: PartnerEventType;
  mission_id: string;
  location_tag: string;
  occurred_at: string;
}

export interface PartnerWorkspace {
  organizations: PartnerOrganization[];
  roles: Record<string, PartnerRole>;
}

export interface ResolvedPartnerCampaign {
  campaign_id: string;
  organization_id: string;
  organization_name: string;
  brand_color: string;
  logo_url: string | null;
  mission_id: string;
  campaign_name: string;
  campaign_summary: string;
  location_tag: string;
}

interface ActiveCampaignContext {
  campaignId: string;
  organizationId: string;
  missionId: string;
  locationTag: string;
}

const ACTIVE_PARTNER_CAMPAIGN = "amx_partner_campaign";

function assertResult(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function singleRpcRow<T>(data: unknown, operation: string): T {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error(`${operation} did not return a record.`);
  return row as T;
}

export function partnerSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

export async function loadPartnerWorkspace(): Promise<PartnerWorkspace> {
  const client = await getMemberDataClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  assertResult(userError);
  if (!userData.user) throw new Error("Sign in to load partner organizations.");
  const [organizationsResult, membershipsResult] = await Promise.all([
    client.from("partner_organizations").select("*").order("name"),
    client.from("partner_memberships").select("organization_id,role").eq("user_id", userData.user.id).eq("status", "active"),
  ]);
  assertResult(organizationsResult.error);
  assertResult(membershipsResult.error);
  const roles = Object.fromEntries((membershipsResult.data || []).map((item) => [String(item.organization_id), item.role as PartnerRole]));
  return { organizations: (organizationsResult.data || []) as PartnerOrganization[], roles };
}

export async function createPartnerOrganization(input: { name: string; id: string; organizationType: string; brandColor: string }) {
  const client = await getMemberDataClient();
  const { data, error } = await client.rpc("create_partner_organization", {
    organization_name: input.name,
    organization_id: input.id,
    organization_type: input.organizationType,
    brand_color: input.brandColor,
  });
  assertResult(error);
  return singleRpcRow<PartnerOrganization>(data, "Partner organization creation");
}

export async function updatePartnerOrganization(id: string, patch: Partial<PartnerOrganization>) {
  const client = await getMemberDataClient();
  const allowed = {
    name: patch.name,
    organization_type: patch.organization_type,
    status: patch.status,
    brand_color: patch.brand_color,
    logo_url: patch.logo_url,
    website_url: patch.website_url,
    contact_name: patch.contact_name,
    contact_email: patch.contact_email,
    mission_ids: patch.mission_ids,
    agent_ids: patch.agent_ids,
    proof_scope: patch.proof_scope,
    report_template: patch.report_template,
    certificate_name: patch.certificate_name,
    certificate_sponsor: patch.certificate_sponsor,
    proof_signature: patch.proof_signature,
    marketplace_offer_ids: patch.marketplace_offer_ids,
  };
  const payload = Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined));
  const { data, error } = await client.from("partner_organizations").update(payload).eq("id", id).select("*").single();
  assertResult(error);
  return data as PartnerOrganization;
}

export async function uploadPartnerLogo(organizationId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Partner logos are limited to 5 MB.");
  const response = await fetch("/api/media", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-AMX-Filename": file.name,
      "X-AMX-Tenant": organizationId,
    },
    body: file,
  });
  const result = await response.json() as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error || "Partner logo upload failed.");
  return result.url;
}

export async function listPartnerCampaigns(organizationId: string) {
  const client = await getMemberDataClient();
  const { data, error } = await client.from("partner_campaigns").select("*").eq("organization_id", organizationId).order("updated_at", { ascending: false });
  assertResult(error);
  return (data || []) as PartnerCampaign[];
}

export async function createPartnerCampaign(input: {
  organizationId: string;
  name: string;
  slug: string;
  summary: string;
  missionId: string;
  locationTag: string;
  targetCompletions: number;
  status: PartnerCampaignStatus;
}) {
  const client = await getMemberDataClient();
  const { data, error } = await client.from("partner_campaigns").insert({
    organization_id: input.organizationId,
    name: input.name.trim(),
    slug: partnerSlug(input.slug),
    summary: input.summary.trim(),
    mission_id: input.missionId,
    location_tag: partnerSlug(input.locationTag),
    target_completions: Math.max(1, Math.round(input.targetCompletions)),
    status: input.status,
  }).select("*").single();
  assertResult(error);
  return data as PartnerCampaign;
}

export async function updatePartnerCampaign(id: string, patch: Partial<PartnerCampaign>) {
  const client = await getMemberDataClient();
  const allowed = {
    slug: patch.slug === undefined ? undefined : partnerSlug(patch.slug),
    name: patch.name,
    summary: patch.summary,
    mission_id: patch.mission_id,
    location_tag: patch.location_tag === undefined ? undefined : partnerSlug(patch.location_tag),
    status: patch.status,
    target_completions: patch.target_completions,
    starts_at: patch.starts_at,
    ends_at: patch.ends_at,
  };
  const payload = Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined));
  const { data, error } = await client.from("partner_campaigns").update(payload).eq("id", id).select("*").single();
  assertResult(error);
  return data as PartnerCampaign;
}

export async function listPartnerMembers(organizationId: string) {
  const client = await getMemberDataClient();
  const { data: memberships, error } = await client.from("partner_memberships").select("*").eq("organization_id", organizationId).order("joined_at");
  assertResult(error);
  const rows = memberships || [];
  const ids = rows.map((item) => String(item.user_id));
  const profilesResult = ids.length
    ? await client.from("member_profiles").select("id,display_name,member_code,avatar_url").in("id", ids)
    : { data: [], error: null };
  assertResult(profilesResult.error);
  const profiles = new Map((profilesResult.data || []).map((profile) => [String(profile.id), profile]));
  return rows.map((membership) => {
    const profile = profiles.get(String(membership.user_id));
    return {
      ...membership,
      display_name: String(profile?.display_name || "AMX Member"),
      member_code: String(profile?.member_code || String(membership.user_id).slice(0, 8).toUpperCase()),
      avatar_url: profile?.avatar_url ? String(profile.avatar_url) : null,
    } as PartnerMember;
  });
}

export async function updatePartnerMember(id: string, patch: Pick<PartnerMember, "role" | "status">) {
  const client = await getMemberDataClient();
  const { data, error } = await client.rpc("update_partner_membership", {
    target_membership_id: id,
    target_role: patch.role,
    target_status: patch.status,
  });
  assertResult(error);
  return singleRpcRow<PartnerMember>(data, "Partner membership update");
}

export async function listPartnerInvitations(organizationId: string) {
  const client = await getMemberDataClient();
  const { data, error } = await client.from("partner_invitations").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(20);
  assertResult(error);
  return (data || []) as PartnerInvitation[];
}

export async function createPartnerInvitation(input: { organizationId: string; email: string; role: PartnerRole; expiresInHours?: number }) {
  const client = await getMemberDataClient();
  const { data, error } = await client.rpc("create_partner_invitation", {
    target_organization_id: input.organizationId,
    target_email: input.email.trim(),
    target_role: input.role,
    expires_in_hours: input.expiresInHours || 168,
  });
  assertResult(error);
  const result = (Array.isArray(data) ? data[0] : data) as { invitation_id: string; invite_token: string; expires_at: string };
  return {
    ...result,
    shareUrl: `${window.location.origin}/partners/join?token=${encodeURIComponent(result.invite_token)}`,
  };
}

export async function claimPartnerInvitation(token: string) {
  const client = await getMemberDataClient();
  const { data, error } = await client.rpc("claim_partner_invitation", { invite_token: token.trim() });
  assertResult(error);
  return singleRpcRow<PartnerMember>(data, "Partner invitation claim");
}

export async function listPartnerEvents(organizationId: string, campaignId?: string) {
  const client = await getMemberDataClient();
  let query = client.from("partner_campaign_events").select("*").eq("organization_id", organizationId).order("occurred_at", { ascending: false }).limit(30);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query;
  assertResult(error);
  return (data || []) as PartnerCampaignEvent[];
}

export async function resolvePartnerCampaign(organizationId: string, campaignSlug: string) {
  const client = await getMemberDataClient();
  const { data, error } = await client.rpc("resolve_partner_campaign", { partner_slug: organizationId, campaign_slug: campaignSlug });
  assertResult(error);
  return ((Array.isArray(data) ? data[0] : data) || null) as ResolvedPartnerCampaign | null;
}

export async function recordPartnerCampaignEvent(context: ActiveCampaignContext, eventType: PartnerEventType) {
  const client = await getMemberDataClient();
  const { error } = await client.rpc("record_partner_campaign_event", {
    target_organization_id: context.organizationId,
    target_campaign_id: context.campaignId,
    target_event_type: eventType,
    target_mission_id: context.missionId,
    target_location_tag: context.locationTag,
  });
  assertResult(error);
}

export function activatePartnerCampaign(campaign: ResolvedPartnerCampaign) {
  const context: ActiveCampaignContext = {
    campaignId: campaign.campaign_id,
    organizationId: campaign.organization_id,
    missionId: campaign.mission_id,
    locationTag: campaign.location_tag,
  };
  localStorage.setItem(ACTIVE_PARTNER_CAMPAIGN, JSON.stringify(context));
  localStorage.setItem("amx_active_campaign", campaign.campaign_id);
  localStorage.setItem("amx_active_location", campaign.location_tag);
  return context;
}

export async function recordActivePartnerCampaignEvent(eventType: Exclude<PartnerEventType, "scan">, missionId?: string) {
  try {
    const raw = localStorage.getItem(ACTIVE_PARTNER_CAMPAIGN);
    if (!raw) return;
    const context = JSON.parse(raw) as ActiveCampaignContext;
    if (missionId && context.missionId !== missionId) return;
    await recordPartnerCampaignEvent(context, eventType);
  } catch {
    // Campaign attribution should never block a mission run.
  }
}

export function applyPartnerOrganizationScope(organization: PartnerOrganization) {
  saveTenantRecord({
    id: organization.id,
    name: organization.name,
    type: organization.organization_type,
    color: organization.brand_color,
    missionIds: organization.mission_ids,
    agentIds: organization.agent_ids,
    proofScope: organization.proof_scope,
    reportTemplate: organization.report_template,
    certificateName: organization.certificate_name,
    certificateSponsor: organization.certificate_sponsor,
    proofSignature: organization.proof_signature,
    marketplaceOfferIds: organization.marketplace_offer_ids,
    updatedAt: organization.updated_at,
  });
  setActiveTenant(organization.id);
}

export function partnerCampaignPath(organization: PartnerOrganization, campaign: PartnerCampaign) {
  return `/partner/${encodeURIComponent(organization.id)}/${encodeURIComponent(campaign.slug)}`;
}

export function exportPartnerReport(organization: PartnerOrganization, campaigns: PartnerCampaign[], members: PartnerMember[]) {
  const totals = campaigns.reduce((sum, campaign) => ({
    scans: sum.scans + campaign.scan_count,
    starts: sum.starts + campaign.start_count,
    completions: sum.completions + campaign.completion_count,
    marketplace: sum.marketplace + campaign.marketplace_count,
  }), { scans: 0, starts: 0, completions: 0, marketplace: 0 });
  const report = {
    schema: "amx.partner.outcome-report.v1",
    generatedAt: new Date().toISOString(),
    organization: {
      id: organization.id,
      name: organization.name,
      type: organization.organization_type,
      proofScope: organization.proof_scope,
      certificateIdentity: organization.certificate_name,
      sponsor: organization.certificate_sponsor,
    },
    summary: { ...totals, activeMembers: members.filter((member) => member.status === "active").length },
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      missionId: campaign.mission_id,
      status: campaign.status,
      targetCompletions: campaign.target_completions,
      scans: campaign.scan_count,
      starts: campaign.start_count,
      completions: campaign.completion_count,
      marketplaceConversions: campaign.marketplace_count,
    })),
    template: organization.report_template,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${organization.id}-partner-report.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
