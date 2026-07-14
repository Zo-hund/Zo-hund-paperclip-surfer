import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, BadgeCheck, Bot, CircleDollarSign, Copy,
  GraduationCap, KeyRound, MapPin, Megaphone, QrCode, Rocket,
  ShieldCheck, Sparkles, Target, Trophy, Users, Zap,
} from "lucide-react";
import { agents, missions, roleExperienceMap, roles, type Role } from "../data";
import { useAMX } from "../AppContext";
import { getAnalytics, getBadges, getProofs, trackEvent } from "../platform";
import { getCampaigns, saveCampaign, type QRCampaign } from "../operations";
import { Metric, PageHeader, QRCodeCard, StatusPill, XPBar } from "../components";

const roleConfig: Record<Role, { icon: typeof GraduationCap; headline: string; summary: string; actions: Array<{ label: string; to: string }> }> = {
  Learner: { icon: GraduationCap, headline: "Your learning runway", summary: "Continue training, collect proof, and unlock the next guide.", actions: [{ label: "Start training", to: "/missions" }, { label: "Open certificates", to: "/wallet" }] },
  Earner: { icon: CircleDollarSign, headline: "Your earning runway", summary: "Complete sponsored missions and turn verified skills into opportunity.", actions: [{ label: "Find sponsored work", to: "/marketplace" }, { label: "View rewards", to: "/wallet" }] },
  Trainer: { icon: Users, headline: "Cohort command", summary: "Launch rooms, monitor learners, and approve post-run proof.", actions: [{ label: "Launch Skill Pod", to: "/pods" }, { label: "Review proof", to: "/wallet" }] },
  Sponsor: { icon: Megaphone, headline: "Activation command", summary: "Fund missions and measure scans, verified completions, and conversion.", actions: [{ label: "View sponsor ROI", to: "/sponsor" }, { label: "Create campaign", to: "/qr-studio" }] },
  Admin: { icon: ShieldCheck, headline: "System command", summary: "Publish missions, govern tenants, and inspect proof integrity.", actions: [{ label: "Build mission", to: "/admin" }, { label: "Manage tenants", to: "/tenants" }] },
};

export function RoleDashboardPage() {
  const { role, xp } = useAMX();
  const config = roleConfig[role];
  const RoleIcon = config.icon;
  const proofs = getProofs();
  const completed = proofs.filter((proof) => proof.status === "complete");
  const nextAgent = agents.find((agent) => agent.unlockAtXP > xp);
  const events = getAnalytics();
  return <div className="page section-wrap">
    <PageHeader eyebrow={`${role.toUpperCase()} DASHBOARD`} title={config.headline} description={config.summary} actions={<Link className="button secondary" to="/role"><Users/>Change role</Link>}/>
    <section className="role-command">
      <div className="role-command-copy"><span className="role-command-icon"><RoleIcon/></span><div><span className="eyebrow">ACTIVE EXPERIENCE</span><h2>{role}</h2><p>{roleExperienceMap[role].join(" / ")}</p></div></div>
      <XPBar value={xp}/>
      <div className="role-command-actions">{config.actions.map((action, index)=><Link className={index===0?"button primary":"button secondary"} to={action.to} key={action.to}>{action.label}<ArrowRight/></Link>)}</div>
    </section>
    <div className="admin-summary">
      <Metric label="Completed runs" value={completed.length} delta="Verified records" icon={BadgeCheck}/>
      <Metric label="Badges earned" value={getBadges().length} delta="Portable credentials" icon={Trophy}/>
      <Metric label="Runway XP" value={xp} delta={nextAgent ? `${nextAgent.unlockAtXP-xp} to unlock ${nextAgent.name}` : "All guides unlocked"} icon={Zap}/>
      <Metric label="Device events" value={events.length} delta="Local analytics" icon={Activity}/>
    </div>
    <div className="dashboard-grid">
      <section className="dashboard-panel"><span className="eyebrow">NEXT BEST ACTION</span><h2>{role === "Trainer" ? "Create a classroom pod" : role === "Sponsor" ? "Launch a tracked QR campaign" : role === "Admin" ? "Review mission publishing" : "Continue Project Checklist"}</h2><p>{role === "Trainer" ? "Invite learners with one room code, share progress, and approve the final report." : role === "Sponsor" ? "Connect a location and campaign name to scans, starts, completions, and certificates." : role === "Admin" ? "Turn a local mission draft into a governed, QR-launchable experience." : "TAZ will help you translate your XR foundation into a scoped delivery plan."}</p><Link className="button primary" to={config.actions[0].to}>{config.actions[0].label}<ArrowRight/></Link></section>
      <section className="dashboard-panel"><span className="eyebrow">AGENT UNLOCK PATH</span>{agents.map((agent)=><div className="unlock-row" key={agent.id}><span className="agent-dot" style={{background:agent.color}}/><div><b>{agent.name}</b><small>{agent.role}</small></div>{xp>=agent.unlockAtXP?<StatusPill tone="green">Unlocked</StatusPill>:<span className="unlock-xp"><KeyRound/> {agent.unlockAtXP} XP</span>}</div>)}</section>
    </div>
  </div>;
}

export function QRStudioPage() {
  const [campaigns, setCampaigns] = useState(getCampaigns);
  const [type, setType] = useState<QRCampaign["type"]>("mission");
  const [targetId, setTargetId] = useState("xrt-green-mode");
  const [name, setName] = useState("Community XRT Launch");
  const [locationTag, setLocationTag] = useState("main-hall");
  const [sponsor, setSponsor] = useState("AMX Labs");
  const [latest, setLatest] = useState<QRCampaign | null>(null);
  const route = useMemo(() => {
    const base = type === "sponsor" ? `/sponsor/${sponsor.toLowerCase().replace(/[^a-z0-9]+/g,"-")}/${targetId}` : type === "mission" ? `/scan/${targetId}` : `/scan/${type}/${targetId}`;
    return `${base}?campaign=${latest?.id || "new-campaign"}&location=${encodeURIComponent(locationTag)}`;
  }, [latest?.id, locationTag, sponsor, targetId, type]);
  const create = () => {
    const campaign = saveCampaign({ name, type, targetId, route: route.replace("new-campaign", "pending"), locationTag, sponsor });
    campaign.route = route.replace("new-campaign", campaign.id);
    localStorage.setItem("amx_qr_campaigns", JSON.stringify([campaign, ...getCampaigns().filter((item)=>item.id!==campaign.id)]));
    setLatest(campaign); setCampaigns(getCampaigns()); trackEvent("campaign_created", { campaignId: campaign.id, locationTag });
  };
  return <div className="page section-wrap">
    <PageHeader eyebrow="QR LAUNCH SYSTEM" title="Campaign launch studio" description="Generate tracked routes for missions, sponsors, badges, events, agents, and partners."/>
    <div className="qr-studio-layout">
      <section className="campaign-builder">
        <div className="builder-grid">
          <label>Launch type<select value={type} onChange={(event)=>setType(event.target.value as QRCampaign["type"])}>{["mission","sponsor","badge","event","agent","partner"].map((item)=><option key={item}>{item}</option>)}</select></label>
          <label>Campaign name<input value={name} onChange={(event)=>setName(event.target.value)}/></label>
          <label>Mission or target<select value={targetId} onChange={(event)=>setTargetId(event.target.value)}>{missions.map((mission)=><option value={mission.id} key={mission.id}>{mission.title}</option>)}{agents.map((agent)=><option value={agent.id} key={agent.id}>{agent.name} agent</option>)}</select></label>
          <label>Location / event tag<input value={locationTag} onChange={(event)=>setLocationTag(event.target.value)}/></label>
          <label>Sponsor or partner<input value={sponsor} onChange={(event)=>setSponsor(event.target.value)}/></label>
          <label>Generated route<input value={route} readOnly/></label>
        </div>
        <button className="button primary" onClick={create}><QrCode/>Generate tracked QR</button>
      </section>
      <aside>{latest ? <QRCodeCard route={latest.route} title={latest.name}/> : <div className="qr-preview-empty"><QrCode/><h3>QR preview</h3><p>Configure a launch route, then generate its campaign code.</p></div>}</aside>
    </div>
    <section className="campaign-table"><div className="table-head"><span>CAMPAIGN</span><span>TYPE</span><span>LOCATION</span><span>SCANS</span><span>COMPLETIONS</span></div>{campaigns.map((campaign)=><div className="table-row" key={campaign.id}><div><b>{campaign.name}</b><small>{campaign.route}</small></div><StatusPill tone={campaign.type==="sponsor"?"gold":"cyan"}>{campaign.type}</StatusPill><span><MapPin/> {campaign.locationTag}</span><b>{campaign.scans}</b><b>{campaign.completions}</b></div>)}</section>
  </div>;
}
