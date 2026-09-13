import { type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bot, CheckCircle2, ClipboardCheck, Eye, FileDown, GraduationCap, MessageSquareText,
  Printer, QrCode, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import { PageHeader, QRCodeCard, StatusPill } from "../components";
import { agents, missions } from "../data";
import { getActiveTenant } from "../operations";
import { getTenantRecord } from "../tenant-management";

const journey = [
  ["Discover", "Choose a role, goal, and organization pathway."],
  ["Learn", "Follow an agent-guided lesson or workshop."],
  ["Build", "Create a project, simulation, or spatial experience."],
  ["Practice", "Use a Solo, Co-op, or Team Pod to rehearse the skill."],
  ["Prove", "Submit checkpoints, reflection, and completion evidence."],
  ["Connect", "Share work with trainers, partners, and showcases."],
  ["Earn", "Unlock XP, badges, certificates, opportunities, and rewards."],
] as const;

const printables = [
  { id: "quick-start", icon: GraduationCap, title: "Participant quick start", detail: "A one-page arrival path for account access, missions, Pods, agents, and proof." },
  { id: "trainer-checklist", icon: ClipboardCheck, title: "Trainer launch checklist", detail: "Room, devices, accessibility, agent, mission, safety, and evidence checks." },
  { id: "prompt-cards", icon: MessageSquareText, title: "Agent prompt cards", detail: "Ready-to-use prompts for guidance, feedback, project planning, and reflection." },
  { id: "proof-sheet", icon: ShieldCheck, title: "Evidence and proof worksheet", detail: "Objective, action, artifact, reflection, approval, and proof-signature fields." },
  { id: "access-poster", icon: QrCode, title: "QR access poster", detail: "Scannable routes for the tenant guide, missions, Pods, and proof wallet." },
] as const;

export function TenantLaunchKitPage() {
  const { tenantId } = useParams();
  const tenant = getTenantRecord(tenantId || getActiveTenant());
  const tenantAgents = agents.filter((agent) => tenant.agentIds.includes(agent.id));
  const tenantMissions = missions.filter((mission) => tenant.missionIds.includes(mission.id));
  const style = { "--tenant": tenant.color } as CSSProperties;

  return <div className="page section-wrap tenant-launch-kit" style={style}>
    <PageHeader eyebrow="TENANT LAUNCH KIT" title={`${tenant.name}: How it works`} description="Agent-guided onboarding and print-ready workshop materials, automatically scoped to this organization." actions={<><Link className="button secondary no-print" to="/tenants">Organization console</Link><button className="button primary no-print" onClick={() => window.print()}><Printer/>Print launch kit</button></>}/>

    <section className="tenant-kit-hero printable-sheet">
      <div><StatusPill tone="green">{tenant.type}</StatusPill><span className="tenant-kit-mark">{tenant.name.slice(0, 2).toUpperCase()}</span><h2>Learn. Build. Practice. Prove.</h2><p>{tenant.name} uses AMX AIR Hubs to move members from guided learning into real projects, shared Pods, verified proof, and earning pathways.</p></div>
      <dl><div><dt>Missions</dt><dd>{tenantMissions.length}</dd></div><div><dt>Agent guides</dt><dd>{tenantAgents.length}</dd></div><div><dt>Proof scope</dt><dd>{tenant.proofScope}</dd></div><div><dt>Certificate</dt><dd>{tenant.certificateName}</dd></div></dl>
    </section>

    <section className="tenant-kit-section printable-sheet">
      <div className="section-heading"><div><span className="eyebrow">NEW ARRIVAL PATH</span><h2>How it works</h2></div><Sparkles/></div>
      <ol className="tenant-journey">{journey.map(([title, detail], index) => <li key={title}><b>{index + 1}</b><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ol>
    </section>

    <section className="tenant-kit-section printable-sheet">
      <div className="section-heading"><div><span className="eyebrow">HUMAN + AGENT TEAM</span><h2>Agent guide</h2></div><Bot/></div>
      <p className="tenant-kit-intro">Tell an agent your goal, current step, and what a useful result looks like. Agents can guide, explain, review, and call approved tools. Camera, microphone, page vision, external connections, and consequential actions always require visible permission and operator policy.</p>
      <div className="tenant-agent-grid">{tenantAgents.map((agent) => <article key={agent.id} style={{ "--agent": agent.color } as CSSProperties}><div className="tenant-agent-head"><span>{agent.name}</span><div><h3>{agent.role}</h3><p>{agent.specialty}</p></div></div><ul><li><MessageSquareText/>Ask: “Help me complete the next checkpoint.”</li><li><Eye/>Context: current mission, submitted work, and shared Pod state.</li><li><ShieldCheck/>Boundary: confirm before camera, tools, publishing, or external actions.</li></ul></article>)}</div>
    </section>

    <section className="tenant-kit-section printable-sheet">
      <div className="section-heading"><div><span className="eyebrow">ENABLED PATHWAYS</span><h2>Mission and skill guide</h2></div><CheckCircle2/></div>
      <div className="tenant-mission-list">{tenantMissions.map((mission, index) => <article key={mission.id}><b>{String(index + 1).padStart(2, "0")}</b><div><h3>{mission.title}</h3><p>{mission.objective}</p><span>{mission.domain} · {mission.duration} · {mission.xp} XP</span></div><Link className="button secondary compact no-print" to={`/mission/${mission.id}/pre`}>Open mission</Link></article>)}</div>
    </section>

    <section className="tenant-kit-section printable-sheet">
      <div className="section-heading"><div><span className="eyebrow">PRINTABLE TOOLKIT</span><h2>Workshop handouts</h2></div><FileDown/></div>
      <div className="tenant-printables">{printables.map(({ id, icon: Icon, title, detail }) => <article key={id} id={id}><Icon/><div><h3>{title}</h3><p>{detail}</p></div><span>Included</span></article>)}</div>
      <div className="tenant-prompt-sheet">
        <h3>Agent prompt cards</h3><p>“Guide me through this mission one checkpoint at a time.”</p><p>“Review my work against the objective and tell me what is missing.”</p><p>“Help our team divide this project into roles, actions, and proof.”</p><p>“Summarize what I learned, did, and can now demonstrate.”</p>
      </div>
      <div className="tenant-proof-sheet"><h3>Evidence and proof worksheet</h3><label>Objective <span/></label><label>What I did <span/></label><label>Artifact or link <span/></label><label>What I learned <span/></label><label>Trainer approval <span/></label><small>Proof scope: {tenant.proofScope} · Signature: {tenant.proofSignature} · Sponsor: {tenant.certificateSponsor || tenant.name}</small></div>
    </section>

    <section className="tenant-kit-section printable-sheet tenant-access-sheet">
      <div className="section-heading"><div><span className="eyebrow">SCAN TO START</span><h2>{tenant.name} access poster</h2></div><Users/></div>
      <div className="tenant-qr-grid"><QRCodeCard route={`/tenants/${tenant.id}/guide`} title={`${tenant.name} guide`}/><QRCodeCard route="/missions" title="Mission catalog"/><QRCodeCard route="/pods" title="Skill Pods"/><QRCodeCard route="/wallet" title="Proof wallet"/></div>
    </section>
  </div>;
}
