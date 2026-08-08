import { useEffect, useState } from "react";
import { ArrowRight, Bot, BrainCircuit, BriefcaseBusiness, Check, Eye, GraduationCap, LoaderCircle, LockKeyhole, Network, Play, RadioTower, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, StatusPill } from "../components";
import { h3atAgents, h3atRemoteControls, h3atSimulationStages, h3atTracks } from "../h3at-partnership";
import { loadH3ATControlStatus, sendH3ATControlCommand, type H3ATControlStatus } from "../h3at-control-plane";

export function H3ATPartnerPage() {
  const [status, setStatus] = useState<H3ATControlStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Checking the AMX control plane...");
  const [target, setTarget] = useState("NEXUS1");
  const refresh = async () => {
    setBusy(true);
    try { const next = await loadH3ATControlStatus(); setStatus(next); setNotice(next.connected ? "AMX Hubs Connect is online and ready for governed commands." : "AMX Hubs Connect is not configured."); }
    catch (error) { setStatus(null); setNotice(error instanceof Error ? error.message : "Control-plane status is unavailable."); }
    finally { setBusy(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const run = async (action: string) => {
    setBusy(true);
    try { const result = await sendH3ATControlCommand({ action, target }); setStatus((current) => current ? { ...current, lastCommand: result.command } : current); setNotice(`${action} accepted for ${target}. The command was added to the tenant audit trail.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The command was not accepted."); }
    finally { setBusy(false); }
  };
  return <div className="page section-wrap h3at-partner-page">
    <PageHeader eyebrow="H3AT SOLUTIONS × AMX LAB × AMX AIR HUBS" title="Workforce innovation operating hub" description="Learning, simulations, expert agents, applied projects, employer connections, and verified economic pathways in one governed partner workspace." actions={<><a className="button secondary" href="https://www.h3atsolutions.com/" target="_blank" rel="noreferrer"><BriefcaseBusiness/>H3AT Solutions</a><Link className="button primary" to="/connections?provider=h3at-management"><Network/>Connect Management API</Link></>}/>
    <section className="h3at-value-chain">{["LEARN", "BUILD", "EXPERIENCE", "CONNECT", "WORK", "EARN", "GROW"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b>{index < 6 && <ArrowRight/>}</div>)}</section>
    <section className="h3at-operating-model"><div><span className="eyebrow">THE ECOSYSTEM</span><h2>H3AT Solutions</h2><p>Technology, business, implementation, employer, and client-project environment.</p></div><div><span className="eyebrow">THE WORKFORCE ENGINE</span><h2>AMX LAB</h2><p>Curriculum, applied learning, career readiness, talent development, and entrepreneurship.</p></div><div><span className="eyebrow">THE ACCESS GATEWAY</span><h2>AMX AIR HUBS</h2><p>Physical, virtual, mobile, and hybrid Pods connecting people to tools and opportunity.</p></div></section>
    <section className="h3at-section"><div className="section-heading"><div><span className="eyebrow">SKILLS + WORKSHOPS</span><h2>Workforce tracks</h2></div><StatusPill tone="green">4 TRACKS</StatusPill></div><div className="h3at-track-grid">{h3atTracks.map((track) => <article key={track.id}><header><GraduationCap/><span>{track.pod.toUpperCase()} POD</span></header><h3>{track.title}</h3>{track.skills.map((skill) => <p key={skill}><Check/>{skill}</p>)}<footer><b>{track.outcome}</b><Link to="/pods">Deploy Pod<ArrowRight/></Link></footer></article>)}</div></section>
    <section className="h3at-section"><div className="section-heading"><div><span className="eyebrow">SIMULATION TO LIVE</span><h2>Five governed release gates</h2></div></div><div className="h3at-sim-flow">{h3atSimulationStages.map((stage, index) => <article key={stage.id}><span>{index + 1}</span><h3>{stage.title}</h3><p>{stage.detail}</p><small><ShieldCheck/>{stage.gate}</small></article>)}</div></section>
    <section className="h3at-section"><div className="section-heading"><div><span className="eyebrow">GROUNDED BRAINS</span><h2>Expert agents with live, consented vision</h2></div><StatusPill tone="cyan">HUMAN APPROVAL</StatusPill></div><div className="h3at-agent-grid">{h3atAgents.map((agent) => <article key={agent.id}><Bot/><div><h3>{agent.name}</h3><p><BrainCircuit/><b>Brain:</b> {agent.brain}</p><p><Eye/><b>Vision:</b> {agent.vision}</p><div>{agent.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div></article>)}</div></section>
    <section className="h3at-control-plane"><header><div><RadioTower/><span><small>REMOTE CONTROL PROTOCOL</small><h2>Pod page and tool control</h2></span></div><StatusPill tone={status?.connected ? "green" : "gold"}>{status?.connected ? "CONNECTED" : "CONNECTION REQUIRED"}</StatusPill></header><p>Agents receive page context through an explicit shared-view session. Navigation, presentation, proof, and tool calls are tenant-scoped, logged, and approval-gated.</p><div className="h3at-control-command"><label>Pod or room target<input value={target} onChange={(event) => setTarget(event.target.value)} maxLength={80}/></label><button className="icon-button" title="Refresh connection" onClick={() => void refresh()} disabled={busy}>{busy ? <LoaderCircle className="spin"/> : <RefreshCw/>}</button><span>{notice}</span></div><div>{h3atRemoteControls.map((control) => <article key={control.action}><code>{control.action}</code><span>{control.detail}</span><b><LockKeyhole/>{control.approval}</b><button className="icon-button" title={`Run ${control.action}`} aria-label={`Run ${control.action}`} onClick={() => void run(control.action)} disabled={busy || !status?.connected || !target.trim()}><Play/></button></article>)}</div><footer><span><Users/>Human operator remains accountable</span><span><ShieldCheck/>RLS + vault + audit history</span><Link className="button secondary" to="/connections?provider=h3at-management">Connection settings<ArrowRight/></Link></footer></section>
  </div>;
}
