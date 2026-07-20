import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, ArrowRight, BadgeCheck, BarChart3, Building2, CalendarClock, Check, ChevronRight,
  Clipboard, Copy, Download, ExternalLink, FileBarChart, ImageUp, Link2, MailPlus, Megaphone,
  Pause, Play, Plus, QrCode, RefreshCw, Rocket, Save, Settings2, ShieldCheck, Target, Users, X,
} from "lucide-react";
import { agents, marketplaceOffers, missions } from "../data";
import { useAMX } from "../AppContext";
import { Metric, PageHeader, QRCodeCard, StatusPill } from "../components";
import { useMemberAuth } from "../member-auth";
import {
  activatePartnerCampaign, applyPartnerOrganizationScope, claimPartnerInvitation,
  createPartnerCampaign, createPartnerInvitation, createPartnerOrganization, exportPartnerReport,
  listPartnerCampaigns, listPartnerEvents, listPartnerInvitations, listPartnerMembers,
  loadPartnerWorkspace, partnerCampaignPath, partnerSlug, recordPartnerCampaignEvent,
  updatePartnerCampaign, updatePartnerMember, updatePartnerOrganization, uploadPartnerLogo,
  resolvePartnerCampaign,
  type PartnerCampaign, type PartnerCampaignEvent, type PartnerCampaignStatus, type PartnerInvitation,
  type PartnerMember, type PartnerOrganization, type PartnerRole, type PartnerWorkspace, type ResolvedPartnerCampaign,
} from "../partner-platform";
import { saveTenantRecord } from "../tenant-management";

type PortalTab = "overview" | "campaigns" | "team" | "brand";

const partnerRoles: PartnerRole[] = ["owner", "admin", "producer", "analyst", "viewer"];
const campaignStatuses: PartnerCampaignStatus[] = ["draft", "live", "paused", "complete"];

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "The partner operation could not be completed.";
}

function roleCanManage(role: PartnerRole | undefined, operator: boolean) {
  return operator || role === "owner" || role === "admin";
}

function roleCanProduce(role: PartnerRole | undefined, operator: boolean) {
  return roleCanManage(role, operator) || role === "producer";
}

function campaignTone(status: PartnerCampaignStatus) {
  if (status === "live") return "green" as const;
  if (status === "paused") return "gold" as const;
  if (status === "complete") return "neutral" as const;
  return "cyan" as const;
}

export function PartnerPortalPage() {
  const auth = useMemberAuth();
  const [workspace, setWorkspace] = useState<PartnerWorkspace>({ organizations: [], roles: {} });
  const [activeId, setActiveId] = useState(() => localStorage.getItem("amx_partner_organization") || "");
  const [campaigns, setCampaigns] = useState<PartnerCampaign[]>([]);
  const [members, setMembers] = useState<PartnerMember[]>([]);
  const [invitations, setInvitations] = useState<PartnerInvitation[]>([]);
  const [events, setEvents] = useState<PartnerCampaignEvent[]>([]);
  const [tab, setTab] = useState<PortalTab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareCampaign, setShareCampaign] = useState<PartnerCampaign | null>(null);

  const active = workspace.organizations.find((organization) => organization.id === activeId) || workspace.organizations[0];
  const role = active ? workspace.roles[active.id] : undefined;
  const operator = auth.profile?.membership_role === "operator";
  const canManage = roleCanManage(role, operator);
  const canProduce = roleCanProduce(role, operator);

  const loadWorkspace = useCallback(async () => {
    setError("");
    try {
      const next = await loadPartnerWorkspace();
      setWorkspace(next);
      setActiveId((current) => next.organizations.some((item) => item.id === current) ? current : next.organizations[0]?.id || "");
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrganization = useCallback(async (organizationId: string) => {
    setBusy("refresh");
    setError("");
    try {
      const [nextCampaigns, nextMembers, nextInvitations, nextEvents] = await Promise.all([
        listPartnerCampaigns(organizationId),
        listPartnerMembers(organizationId),
        listPartnerInvitations(organizationId).catch(() => []),
        listPartnerEvents(organizationId),
      ]);
      setCampaigns(nextCampaigns);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
      setEvents(nextEvents);
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => {
    if (!activeId) return;
    localStorage.setItem("amx_partner_organization", activeId);
    void loadOrganization(activeId);
  }, [activeId, loadOrganization]);

  const totals = useMemo(() => campaigns.reduce((sum, campaign) => ({
    scans: sum.scans + campaign.scan_count,
    starts: sum.starts + campaign.start_count,
    completions: sum.completions + campaign.completion_count,
    marketplace: sum.marketplace + campaign.marketplace_count,
  }), { scans: 0, starts: 0, completions: 0, marketplace: 0 }), [campaigns]);
  const completionRate = totals.starts ? Math.round(totals.completions / totals.starts * 100) : 0;
  const conversionRate = totals.completions ? Math.round(totals.marketplace / totals.completions * 100) : 0;

  const selectOrganization = (organization: PartnerOrganization) => {
    setActiveId(organization.id);
    applyPartnerOrganizationScope(organization);
    setNotice(`${organization.name} is now the active mission, proof, and marketplace scope.`);
  };

  const refreshAll = async () => {
    await loadWorkspace();
    if (activeId) await loadOrganization(activeId);
    setNotice("Partner workspace refreshed.");
  };

  const campaignChanged = async (campaign: PartnerCampaign, status: PartnerCampaignStatus) => {
    setBusy(campaign.id);
    setError("");
    try {
      const updated = await updatePartnerCampaign(campaign.id, { status });
      setCampaigns((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`${campaign.name} is ${status}.`);
    } catch (updateError) { setError(messageOf(updateError)); }
    finally { setBusy(""); }
  };

  if (loading) return <div className="page section-wrap partner-loading"><Activity/><span>Loading partner operations</span></div>;

  return <div className="page section-wrap partner-portal">
    <PageHeader eyebrow="PARTNER OPERATIONS" title="Organizations, campaigns, and outcomes" description="Run a partner from invitation through verified mission completion, reporting, and the next opportunity." actions={<>
      <button className="button secondary" onClick={() => void refreshAll()} disabled={Boolean(busy)}><RefreshCw/>Refresh</button>
      <button className="button primary" onClick={() => setOrganizationOpen(true)}><Plus/>New organization</button>
    </>}/>

    {error && <div className="partner-alert error" role="alert"><X/><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X/></button></div>}
    {notice && <div className="partner-alert success" role="status"><Check/><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X/></button></div>}

    {!active ? <section className="partner-empty"><Building2/><h2>Create your first partner organization</h2><p>Configure its mission catalog, people, brand identity, campaign route, and proof scope in one flow.</p><button className="button primary" onClick={() => setOrganizationOpen(true)}><Plus/>Create organization</button></section> : <>
      <div className="partner-command">
        <aside className="partner-org-rail" aria-label="Partner organizations">
          <div className="partner-org-rail-head"><span>Organizations</span><b>{workspace.organizations.length}</b></div>
          {workspace.organizations.map((organization) => <button key={organization.id} className={organization.id === active.id ? "active" : ""} onClick={() => selectOrganization(organization)}>
            <i style={{ background: organization.brand_color }}>{organization.logo_url ? <img src={organization.logo_url} alt=""/> : organization.name.slice(0, 2).toUpperCase()}</i>
            <span><b>{organization.name}</b><small>{workspace.roles[organization.id] || (operator ? "operator" : organization.organization_type)}</small></span>
            <ChevronRight/>
          </button>)}
        </aside>

        <section className="partner-workspace" style={{ "--partner": active.brand_color } as React.CSSProperties}>
          <header className="partner-workspace-head">
            <div className="partner-identity">{active.logo_url ? <img src={active.logo_url} alt={`${active.name} logo`}/> : <span>{active.name.slice(0, 2).toUpperCase()}</span>}<div><span className="eyebrow">ACTIVE PARTNER / {role || (operator ? "OPERATOR" : "MEMBER")}</span><h2>{active.name}</h2><p>{active.organization_type} / <code>{active.id}</code></p></div></div>
            <div className="partner-workspace-actions"><StatusPill tone={active.status === "active" ? "green" : "gold"}>{active.status}</StatusPill><button className="button secondary" onClick={() => { applyPartnerOrganizationScope(active); setNotice(`${active.name} scope applied.`); }}><Target/>Use scope</button></div>
          </header>

          <nav className="partner-tabs" aria-label="Partner workspace views">
            {(["overview", "campaigns", "team", "brand"] as PortalTab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
          </nav>

          {tab === "overview" && <PartnerOverview organization={active} campaigns={campaigns} events={events} totals={totals} completionRate={completionRate} conversionRate={conversionRate} members={members} onOpenCampaigns={() => setTab("campaigns")} onReport={() => exportPartnerReport(active, campaigns, members)}/>}
          {tab === "campaigns" && <CampaignWorkspace organization={active} campaigns={campaigns} canProduce={canProduce} busy={busy} onCreate={() => setCampaignOpen(true)} onStatus={campaignChanged} onShare={setShareCampaign}/>}
          {tab === "team" && <TeamWorkspace members={members} invitations={invitations} canManage={canManage} busy={busy} onInvite={() => setInviteOpen(true)} onMemberChange={async (member, nextRole, nextStatus) => { setBusy(member.id); try { await updatePartnerMember(member.id, { role: nextRole, status: nextStatus }); await loadOrganization(active.id); setNotice(`${member.display_name} access updated.`); } catch (memberError) { setError(messageOf(memberError)); } finally { setBusy(""); } }}/>}
          {tab === "brand" && <BrandWorkspace organization={active} canManage={canManage} onSaved={(saved) => { setWorkspace((current) => ({ ...current, organizations: current.organizations.map((item) => item.id === saved.id ? saved : item) })); applyPartnerOrganizationScope(saved); setNotice("Partner identity and proof configuration saved."); }} onError={setError}/>}
        </section>
      </div>
    </>}

    {organizationOpen && <OrganizationModal onClose={() => setOrganizationOpen(false)} onCreated={async (organization) => { setOrganizationOpen(false); await loadWorkspace(); setActiveId(organization.id); setNotice(`${organization.name} created with you as owner.`); }}/>}
    {campaignOpen && active && <CampaignModal organization={active} onClose={() => setCampaignOpen(false)} onCreated={async (campaign) => { setCampaignOpen(false); setCampaigns((current) => [campaign, ...current]); setShareCampaign(campaign); setNotice(`${campaign.name} campaign created.`); }}/>}
    {inviteOpen && active && <InviteModal organization={active} onClose={() => setInviteOpen(false)} onCreated={async () => { setInviteOpen(false); await loadOrganization(active.id); }}/>}
    {shareCampaign && active && <CampaignShareModal organization={active} campaign={shareCampaign} onClose={() => setShareCampaign(null)}/>}
  </div>;
}

function PartnerOverview({ organization, campaigns, events, totals, completionRate, conversionRate, members, onOpenCampaigns, onReport }: {
  organization: PartnerOrganization; campaigns: PartnerCampaign[]; events: PartnerCampaignEvent[];
  totals: { scans: number; starts: number; completions: number; marketplace: number };
  completionRate: number; conversionRate: number; members: PartnerMember[]; onOpenCampaigns: () => void; onReport: () => void;
}) {
  const max = Math.max(totals.scans, 1);
  return <div className="partner-overview">
    <div className="partner-metrics"><Metric label="Campaign scans" value={totals.scans.toLocaleString()} delta={`${campaigns.filter((item) => item.status === "live").length} live campaigns`} icon={QrCode}/><Metric label="Mission starts" value={totals.starts.toLocaleString()} delta={`${Math.round(totals.starts / max * 100)}% scan conversion`} icon={Rocket}/><Metric label="Verified outcomes" value={totals.completions.toLocaleString()} delta={`${completionRate}% completion`} icon={BadgeCheck}/><Metric label="Next-step actions" value={totals.marketplace.toLocaleString()} delta={`${conversionRate}% outcome conversion`} icon={Target}/></div>
    <div className="partner-overview-grid">
      <section className="partner-funnel"><div className="partner-section-head"><div><span className="eyebrow">LIVE OUTCOME FUNNEL</span><h3>Attention to verified action</h3></div><button className="button ghost compact" onClick={onOpenCampaigns}>Campaigns<ArrowRight/></button></div>
        {[{ label: "Scans", value: totals.scans, color: "#55e6ff" }, { label: "Starts", value: totals.starts, color: "#79eea8" }, { label: "Completions", value: totals.completions, color: "#f4c96b" }, { label: "Marketplace", value: totals.marketplace, color: "#ff7a66" }].map((item) => <div className="partner-funnel-row" key={item.label}><span>{item.label}</span><div><i style={{ width: `${Math.max(item.value ? 4 : 0, item.value / max * 100)}%`, background: item.color }}/></div><b>{item.value}</b></div>)}
      </section>
      <aside className="partner-readiness"><div className="partner-section-head"><div><span className="eyebrow">PARTNER READINESS</span><h3>Operational signals</h3></div><ShieldCheck/></div>
        <dl><div><dt>Brand identity</dt><dd>{organization.logo_url ? "Logo + color ready" : "Color configured"}</dd></div><div><dt>Mission scope</dt><dd>{organization.mission_ids.length} missions / {organization.agent_ids.length} agents</dd></div><div><dt>Team access</dt><dd>{members.filter((item) => item.status === "active").length} active members</dd></div><div><dt>Proof issuer</dt><dd>{organization.certificate_name}</dd></div></dl>
        <button className="button secondary full" onClick={onReport}><Download/>Export outcome report</button>
      </aside>
    </div>
    <section className="partner-activity"><div className="partner-section-head"><div><span className="eyebrow">RECENT SIGNALS</span><h3>Campaign activity</h3></div><Activity/></div>{events.length ? events.slice(0, 8).map((event) => <div key={event.id}><span className={`partner-event event-${event.event_type}`}/><b>{event.event_type}</b><span>{missions.find((mission) => mission.id === event.mission_id)?.title || event.mission_id}</span><small>{event.location_tag}</small><time>{new Date(event.occurred_at).toLocaleString()}</time></div>) : <p>No live campaign events yet. Share a campaign link to begin the funnel.</p>}</section>
  </div>;
}

function CampaignWorkspace({ organization, campaigns, canProduce, busy, onCreate, onStatus, onShare }: { organization: PartnerOrganization; campaigns: PartnerCampaign[]; canProduce: boolean; busy: string; onCreate: () => void; onStatus: (campaign: PartnerCampaign, status: PartnerCampaignStatus) => void; onShare: (campaign: PartnerCampaign) => void }) {
  return <section className="partner-campaigns"><div className="partner-section-head"><div><span className="eyebrow">CAMPAIGN CONTROL</span><h3>Launch routes and outcome targets</h3></div>{canProduce && <button className="button primary" onClick={onCreate}><Plus/>New campaign</button>}</div>
    {campaigns.length ? <div className="partner-campaign-table"><div className="partner-campaign-head"><span>Campaign</span><span>Mission</span><span>Funnel</span><span>Target</span><span>Status</span><span/></div>{campaigns.map((campaign) => <div className="partner-campaign-row" key={campaign.id}><div><b>{campaign.name}</b><small>/{organization.id}/{campaign.slug}</small></div><span>{missions.find((mission) => mission.id === campaign.mission_id)?.title || campaign.mission_id}</span><span><b>{campaign.completion_count}</b><small>{campaign.scan_count} scans / {campaign.start_count} starts</small></span><span>{Math.round(campaign.completion_count / Math.max(campaign.target_completions, 1) * 100)}%</span><span>{canProduce ? <select aria-label={`Status for ${campaign.name}`} value={campaign.status} disabled={busy === campaign.id} onChange={(event) => onStatus(campaign, event.target.value as PartnerCampaignStatus)}>{campaignStatuses.map((status) => <option key={status}>{status}</option>)}</select> : <StatusPill tone={campaignTone(campaign.status)}>{campaign.status}</StatusPill>}</span><button className="icon-button" title="Share campaign" onClick={() => onShare(campaign)}><Link2/></button></div>)}</div> : <div className="partner-empty compact"><Megaphone/><h3>No partner campaigns yet</h3><p>Create a trackable mission route with a target, location, and public QR.</p>{canProduce && <button className="button primary" onClick={onCreate}><Plus/>Create campaign</button>}</div>}
  </section>;
}

function TeamWorkspace({ members, invitations, canManage, busy, onInvite, onMemberChange }: { members: PartnerMember[]; invitations: PartnerInvitation[]; canManage: boolean; busy: string; onInvite: () => void; onMemberChange: (member: PartnerMember, role: PartnerRole, status: "active" | "suspended") => void }) {
  return <section className="partner-team"><div className="partner-section-head"><div><span className="eyebrow">TEAM ACCESS</span><h3>People and operating roles</h3></div>{canManage && <button className="button primary" onClick={onInvite}><MailPlus/>Invite member</button>}</div>
    <div className="partner-member-list">{members.map((member) => <div key={member.id}><span className="partner-member-avatar">{member.avatar_url ? <img src={member.avatar_url} alt=""/> : member.display_name.slice(0, 2).toUpperCase()}</span><div><b>{member.display_name}</b><small>{member.member_code} / joined {new Date(member.joined_at).toLocaleDateString()}</small></div>{canManage ? <select aria-label={`Role for ${member.display_name}`} value={member.role} disabled={busy === member.id} onChange={(event) => onMemberChange(member, event.target.value as PartnerRole, member.status)}>{partnerRoles.map((role) => <option key={role}>{role}</option>)}</select> : <StatusPill tone="cyan">{member.role}</StatusPill>}{canManage ? <button className={`partner-access-switch ${member.status}`} onClick={() => onMemberChange(member, member.role, member.status === "active" ? "suspended" : "active")} disabled={busy === member.id}>{member.status}</button> : <span>{member.status}</span>}</div>)}</div>
    {invitations.length > 0 && <div className="partner-invite-list"><span className="eyebrow">RECENT INVITATIONS</span>{invitations.map((invite) => <div key={invite.id}><MailPlus/><span><b>{invite.email}</b><small>{invite.role} / expires {new Date(invite.expires_at).toLocaleDateString()}</small></span><StatusPill tone={invite.status === "pending" ? "gold" : invite.status === "accepted" ? "green" : "neutral"}>{invite.status}</StatusPill></div>)}</div>}
  </section>;
}

function BrandWorkspace({ organization, canManage, onSaved, onError }: { organization: PartnerOrganization; canManage: boolean; onSaved: (organization: PartnerOrganization) => void; onError: (message: string) => void }) {
  const [draft, setDraft] = useState(organization);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(organization), [organization]);
  const patch = (value: Partial<PartnerOrganization>) => setDraft((current) => ({ ...current, ...value }));
  const save = async (event: FormEvent) => { event.preventDefault(); setBusy(true); try { onSaved(await updatePartnerOrganization(organization.id, draft)); } catch (error) { onError(messageOf(error)); } finally { setBusy(false); } };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); try { const url = await uploadPartnerLogo(organization.id, file); patch({ logo_url: url }); } catch (error) { onError(messageOf(error)); } finally { setBusy(false); event.target.value = ""; } };
  return <form className="partner-brand" onSubmit={save}><div className="partner-section-head"><div><span className="eyebrow">IDENTITY + PROOF</span><h3>Partner runtime configuration</h3></div>{canManage && <button className="button primary" disabled={busy}><Save/>Save configuration</button>}</div>
    <div className="partner-brand-layout"><div className="partner-brand-preview" style={{ "--partner": draft.brand_color } as React.CSSProperties}><div>{draft.logo_url ? <img src={draft.logo_url} alt="Partner logo preview"/> : draft.name.slice(0, 2).toUpperCase()}</div><span className="eyebrow">VERIFIED PARTNER</span><h2>{draft.name}</h2><p>{draft.certificate_name}</p><code>{draft.proof_scope}</code>{canManage && <label className="button secondary"><ImageUp/>Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label>}</div>
      <div className="partner-brand-fields"><label>Organization name<input disabled={!canManage} value={draft.name} onChange={(event) => patch({ name: event.target.value })}/></label><label>Organization type<input disabled={!canManage} value={draft.organization_type} onChange={(event) => patch({ organization_type: event.target.value })}/></label><label>Brand color<span><input disabled={!canManage} type="color" value={draft.brand_color} onChange={(event) => patch({ brand_color: event.target.value })}/><code>{draft.brand_color}</code></span></label><label>Website<input disabled={!canManage} type="url" value={draft.website_url || ""} onChange={(event) => patch({ website_url: event.target.value || null })}/></label><label>Partner contact<input disabled={!canManage} value={draft.contact_name || ""} onChange={(event) => patch({ contact_name: event.target.value || null })}/></label><label>Contact email<input disabled={!canManage} type="email" value={draft.contact_email || ""} onChange={(event) => patch({ contact_email: event.target.value || null })}/></label><label>Certificate identity<input disabled={!canManage} value={draft.certificate_name} onChange={(event) => patch({ certificate_name: event.target.value })}/></label><label>Certificate sponsor<input disabled={!canManage} value={draft.certificate_sponsor} onChange={(event) => patch({ certificate_sponsor: event.target.value })}/></label><label>Proof scope<input disabled={!canManage} value={draft.proof_scope} onChange={(event) => patch({ proof_scope: partnerSlug(event.target.value) })}/></label><label>Proof signature<input disabled={!canManage} value={draft.proof_signature} onChange={(event) => patch({ proof_signature: partnerSlug(event.target.value) })}/></label><label className="span-2">Report template<textarea disabled={!canManage} value={draft.report_template} onChange={(event) => patch({ report_template: event.target.value })}/></label></div>
    </div>
    <fieldset disabled={!canManage}><legend>Enabled missions</legend>{missions.map((mission) => <label key={mission.id}><input type="checkbox" checked={draft.mission_ids.includes(mission.id)} onChange={() => patch({ mission_ids: draft.mission_ids.includes(mission.id) ? draft.mission_ids.filter((id) => id !== mission.id) : [...draft.mission_ids, mission.id] })}/><span><b>{mission.title}</b><small>{mission.domain}</small></span></label>)}</fieldset>
    <fieldset disabled={!canManage}><legend>Agent roster</legend>{agents.map((agent) => <label key={agent.id}><input type="checkbox" checked={draft.agent_ids.includes(agent.id)} onChange={() => patch({ agent_ids: draft.agent_ids.includes(agent.id) ? draft.agent_ids.filter((id) => id !== agent.id) : [...draft.agent_ids, agent.id] })}/><span><b>{agent.name}</b><small>{agent.role}</small></span></label>)}</fieldset>
    <fieldset disabled={!canManage}><legend>Marketplace offers</legend>{marketplaceOffers.map((offer) => <label key={offer.id}><input type="checkbox" checked={draft.marketplace_offer_ids.includes(offer.id)} onChange={() => patch({ marketplace_offer_ids: draft.marketplace_offer_ids.includes(offer.id) ? draft.marketplace_offer_ids.filter((id) => id !== offer.id) : [...draft.marketplace_offer_ids, offer.id] })}/><span><b>{offer.title}</b><small>{offer.type}</small></span></label>)}</fieldset>
  </form>;
}

function OrganizationModal({ onClose, onCreated }: { onClose: () => void; onCreated: (organization: PartnerOrganization) => void }) {
  const [name, setName] = useState(""); const [id, setId] = useState(""); const [type, setType] = useState("Partner"); const [color, setColor] = useState("#55e6ff"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { onCreated(await createPartnerOrganization({ name, id, organizationType: type, brandColor: color })); } catch (submitError) { setError(messageOf(submitError)); } finally { setBusy(false); } };
  return <Modal title="Create partner organization" eyebrow="PARTNER ONBOARDING" onClose={onClose}><form onSubmit={submit} className="partner-modal-form"><label>Organization name<input autoFocus required value={name} onChange={(event) => { setName(event.target.value); setId(partnerSlug(event.target.value)); }}/></label><label>Organization ID<input required value={id} onChange={(event) => setId(partnerSlug(event.target.value))}/><small>Permanent URL and proof scope identifier.</small></label><label>Organization type<input required value={type} onChange={(event) => setType(event.target.value)}/></label><label>Brand color<span><input type="color" value={color} onChange={(event) => setColor(event.target.value)}/><code>{color}</code></span></label>{error && <p className="partner-modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || id.length < 3}><Building2/>Create organization</button></div></form></Modal>;
}

function CampaignModal({ organization, onClose, onCreated }: { organization: PartnerOrganization; onClose: () => void; onCreated: (campaign: PartnerCampaign) => void }) {
  const availableMissions = missions.filter((mission) => organization.mission_ids.includes(mission.id)); const firstMission = availableMissions[0] || missions[0];
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [summary, setSummary] = useState(""); const [missionId, setMissionId] = useState(firstMission.id); const [location, setLocation] = useState("partner-runway"); const [target, setTarget] = useState(100); const [status, setStatus] = useState<PartnerCampaignStatus>("draft"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { onCreated(await createPartnerCampaign({ organizationId: organization.id, name, slug, summary, missionId, locationTag: location, targetCompletions: target, status })); } catch (submitError) { setError(messageOf(submitError)); } finally { setBusy(false); } };
  return <Modal title="Build partner campaign" eyebrow="TRACKED MISSION ROUTE" onClose={onClose}><form onSubmit={submit} className="partner-modal-form campaign"><label>Campaign name<input autoFocus required value={name} onChange={(event) => { setName(event.target.value); setSlug(partnerSlug(event.target.value)); }}/></label><label>Public route<input required value={slug} onChange={(event) => setSlug(partnerSlug(event.target.value))}/><small>/partner/{organization.id}/{slug || "campaign"}</small></label><label className="span-2">Campaign summary<textarea value={summary} onChange={(event) => setSummary(event.target.value)}/></label><label>Mission<select value={missionId} onChange={(event) => setMissionId(event.target.value)}>{availableMissions.map((mission) => <option key={mission.id} value={mission.id}>{mission.title}</option>)}</select></label><label>Location tag<input value={location} onChange={(event) => setLocation(partnerSlug(event.target.value))}/></label><label>Completion target<input type="number" min="1" max="1000000" value={target} onChange={(event) => setTarget(Number(event.target.value))}/></label><label>Launch status<select value={status} onChange={(event) => setStatus(event.target.value as PartnerCampaignStatus)}>{campaignStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>{error && <p className="partner-modal-error span-2">{error}</p>}<div className="modal-actions span-2"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || slug.length < 3}><Rocket/>Create campaign</button></div></form></Modal>;
}

function InviteModal({ organization, onClose, onCreated }: { organization: PartnerOrganization; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<PartnerRole>("viewer"); const [result, setResult] = useState<{ shareUrl: string; expiresAt: string } | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { const invite = await createPartnerInvitation({ organizationId: organization.id, email, role }); setResult({ shareUrl: invite.shareUrl, expiresAt: invite.expires_at }); } catch (submitError) { setError(messageOf(submitError)); } finally { setBusy(false); } };
  const copy = async () => { if (!result) return; await navigator.clipboard.writeText(result.shareUrl); setCopied(true); };
  return <Modal title={result ? "Invitation ready" : "Invite partner team member"} eyebrow="ROLE-SCOPED ACCESS" onClose={() => { if (result) onCreated(); else onClose(); }}>{result ? <div className="partner-invite-result"><ShieldCheck/><p>Share this single-use link with <b>{email}</b>. It expires {new Date(result.expiresAt).toLocaleString()} and only works for that signed-in email address.</p><code>{result.shareUrl}</code><div className="modal-actions"><button className="button secondary" onClick={copy}>{copied ? <Check/> : <Copy/>}{copied ? "Copied" : "Copy invitation"}</button><button className="button primary" onClick={onCreated}>Done</button></div></div> : <form onSubmit={submit} className="partner-modal-form"><label>Member email<input autoFocus type="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label><label>Partner role<select value={role} onChange={(event) => setRole(event.target.value as PartnerRole)}>{partnerRoles.map((item) => <option key={item}>{item}</option>)}</select></label><div className="partner-role-guide"><b>{role}</b><span>{role === "owner" ? "Full organization control and member governance." : role === "admin" ? "Manage campaigns, people, brand, and reports." : role === "producer" ? "Build and operate partner campaigns." : role === "analyst" ? "Review campaign outcomes and reports." : "Read-only partner workspace access."}</span></div>{error && <p className="partner-modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}><MailPlus/>Create invitation</button></div></form>}</Modal>;
}

function CampaignShareModal({ organization, campaign, onClose }: { organization: PartnerOrganization; campaign: PartnerCampaign; onClose: () => void }) {
  const path = partnerCampaignPath(organization, campaign); const url = `${window.location.origin}${path}`; const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(url); setCopied(true); };
  return <Modal title="Share campaign" eyebrow="PUBLIC PARTNER ROUTE" onClose={onClose}><div className="partner-share-layout"><QRCodeCard route={path} title={campaign.name}/><div><StatusPill tone={campaignTone(campaign.status)}>{campaign.status}</StatusPill><h3>{campaign.name}</h3><p>{campaign.summary || "Partner mission activation"}</p><code>{url}</code><button className="button secondary full" onClick={copy}>{copied ? <Check/> : <Copy/>}{copied ? "Copied" : "Copy link"}</button><a className="button primary full" href={path} target="_blank" rel="noreferrer"><ExternalLink/>Open campaign</a></div></div></Modal>;
}

function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="builder-modal wide partner-modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X/></button></header>{children}</section></div>;
}

export function PartnerJoinPage() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const token = params.get("token") || ""; const [status, setStatus] = useState<"ready" | "claiming" | "complete" | "error">("ready"); const [message, setMessage] = useState("");
  const claim = async () => { if (!token) { setStatus("error"); setMessage("This partner invitation is missing its secure token."); return; } setStatus("claiming"); try { await claimPartnerInvitation(token); setStatus("complete"); setMessage("Partner access accepted. Your workspace is ready."); window.setTimeout(() => navigate("/partners", { replace: true }), 700); } catch (error) { setStatus("error"); setMessage(messageOf(error)); } };
  return <div className="page section-wrap partner-join"><ShieldCheck/><span className="eyebrow">PARTNER INVITATION</span><h1>Join the operating team</h1><p>{message || "Accept this role-scoped invitation to add the organization to your Partner Portal."}</p>{status === "complete" ? <StatusPill tone="green">Access accepted</StatusPill> : <button className="button primary large" onClick={() => void claim()} disabled={status === "claiming"}>{status === "claiming" ? <RefreshCw/> : <ArrowRight/>}{status === "claiming" ? "Checking invitation" : "Accept partner access"}</button>}{status === "error" && <Link className="button secondary" to="/partners">Open Partner Portal</Link>}</div>;
}

export function PartnerCampaignResolverPage() {
  const { organizationId = "", campaignSlug = "" } = useParams(); const navigate = useNavigate(); const { setActiveMissionId } = useAMX(); const [state, setState] = useState<"loading" | "error">("loading"); const [message, setMessage] = useState("Resolving partner, mission, and proof context.");
  useEffect(() => { let active = true; void resolvePartnerCampaign(organizationId, campaignSlug).then(async (campaign) => { if (!active) return; if (!campaign) throw new Error("This partner campaign is not live or could not be found."); const context = activatePartnerCampaign(campaign); savePublicPartnerScope(campaign); setActiveMissionId(campaign.mission_id); await recordPartnerCampaignEvent(context, "scan"); if (!active) return; setMessage(`${campaign.organization_name} / ${campaign.campaign_name}`); window.setTimeout(() => navigate(`/mission/${campaign.mission_id}/pre`, { replace: true }), 650); }).catch((error) => { if (!active) return; setState("error"); setMessage(messageOf(error)); }); return () => { active = false; }; }, [campaignSlug, navigate, organizationId, setActiveMissionId]);
  return <div className="partner-resolver" data-state={state}><div><span className="partner-resolver-mark">AMX</span><span className="eyebrow">PARTNER CAMPAIGN</span><h1>{state === "loading" ? "Loading your runway" : "Campaign unavailable"}</h1><p>{message}</p>{state === "loading" ? <div className="partner-resolver-line"><i/></div> : <Link className="button primary" to="/sponsor">Partner programs</Link>}</div></div>;
}

function savePublicPartnerScope(campaign: ResolvedPartnerCampaign) {
  const mission = missions.find((item) => item.id === campaign.mission_id) || missions[0];
  saveTenantRecord({ id: campaign.organization_id, name: campaign.organization_name, type: "Mission Partner", color: campaign.brand_color, missionIds: [campaign.mission_id], agentIds: [mission.agentId], proofScope: campaign.organization_id, reportTemplate: `${campaign.organization_name} verified mission outcome report.`, certificateName: campaign.organization_name, certificateSponsor: campaign.organization_name, proofSignature: `${campaign.organization_id}-proof`, marketplaceOfferIds: ["next", "cohort"], updatedAt: new Date().toISOString() });
  localStorage.setItem("amx_active_tenant", campaign.organization_id);
}
