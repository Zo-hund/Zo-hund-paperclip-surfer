import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bot, Box, CheckCircle2, ChevronRight, CircleAlert, ClipboardCheck, FileBadge2, FilePlus2, Gauge, History, LockKeyhole, RefreshCw, Search, ShieldCheck, Siren, UserCheck, XCircle } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { approveTrustLive, bootstrapTrustRegistry, createTrustPassport, decideTrustReview, loadTrustState, previewTrustState, type TrustPassport, type TrustRisk, type TrustState } from "../trust-platform";
import "../trust-control.css";

type TrustView = "overview" | "passports" | "reviews" | "registry" | "audit";
const riskTone = (risk: TrustRisk) => risk === "R4" || risk === "R5" ? "red" : risk === "R3" ? "gold" : risk === "R0" || risk === "R1" ? "green" : "cyan";
const relativeTime = (value: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  return new Date(value).toLocaleDateString();
};

export function TrustControlPage() {
  const [view, setView] = useState<TrustView>("overview");
  const [state, setState] = useState<TrustState>(previewTrustState);
  const [tenantId, setTenantId] = useState(() => localStorage.getItem("amx_active_tenant") || "tech-at-nite");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("Loading governance ledger...");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadTrustState(tenantId);
      setState(next);
      setNotice(next.persisted ? "Tenant trust ledger connected." : "Trust ledger is running in preview mode.");
    } catch (error) {
      setState({ ...previewTrustState, tenantId });
      setNotice(error instanceof Error ? `${error.message}. Showing a safe preview.` : "Showing a safe preview.");
    } finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const pending = state.reviews.filter((item) => item.status === "pending");
  const live = state.passports.filter((item) => item.deploymentStage === "live");
  const verified = state.passports.filter((item) => item.evidenceStatus === "verified");
  const highRisk = state.passports.filter((item) => item.riskLevel === "R4" || item.riskLevel === "R5");
  const trustScore = state.passports.length ? Math.round((verified.length / state.passports.length) * 45 + (state.passports.filter((item) => item.disclosureStatus === "complete").length / state.passports.length) * 35 + (state.agents.filter((item) => item.status === "active").length / Math.max(1, state.agents.length)) * 20) : 0;
  const filteredPassports = useMemo(() => state.passports.filter((item) => `${item.name} ${item.owner} ${item.systemType}`.toLowerCase().includes(query.toLowerCase())), [query, state.passports]);

  const reloadAfter = async (task: Promise<unknown>, success: string) => {
    setLoading(true);
    try { await task; setNotice(success); await refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The trust action failed."); setLoading(false); }
  };

  const bootstrap = () => reloadAfter(bootstrapTrustRegistry(tenantId), "AMX baseline registry created.");
  const decide = (id: string, decision: "approved" | "rejected") => reloadAfter(decideTrustReview(tenantId, id, decision, decision === "approved" ? "Evidence and controls reviewed by operator." : "Returned for remediation by operator."), `Review ${decision}.`);
  const approveLive = (passport: TrustPassport) => reloadAfter(approveTrustLive(tenantId, passport.id, "Operator approved after disclosure, evidence, and Pit Stop review."), `${passport.name} approved for Live.`);
  const createPassport = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const input = { name: String(data.get("name") || ""), systemType: String(data.get("systemType") || "agent"), owner: String(data.get("owner") || "AMX LABS"), riskLevel: String(data.get("riskLevel") || "R2") as TrustRisk, modelProvider: String(data.get("modelProvider") || "AMX Agent Gateway"), dataClassification: String(data.get("dataClassification") || "internal") };
    await reloadAfter(createTrustPassport(tenantId, input), `${input.name} passport created.`);
    setCreating(false);
  };

  return <div className="page trust-page">
    <div className="section-wrap"><PageHeader eyebrow="AMX TRUST / OPERATOR" title="AI Trust Command Center" description="Govern AI systems from registration through simulation, human review, live deployment, and signed evidence." actions={<div className="trust-header-actions"><label><span>Tenant</span><select value={tenantId} onChange={(event) => { localStorage.setItem("amx_active_tenant", event.target.value); setTenantId(event.target.value); }}><option value="tech-at-nite">Tech At Nite</option><option value="amx-labs">AMX Labs</option><option value="northside-school">Northside School</option><option value="community-runway">Community Runway</option></select></label><button type="button" className="icon-button" onClick={() => void refresh()} disabled={loading} title="Refresh trust ledger" aria-label="Refresh trust ledger"><RefreshCw/></button></div>}/></div>
    <section className="trust-status-band"><div className="section-wrap"><div><ShieldCheck/><span><b>{trustScore}%</b><small>TRUST SCORE</small></span></div><div><ClipboardCheck/><span><b>{pending.length}</b><small>PENDING REVIEW</small></span></div><div><Gauge/><span><b>{live.length}/{state.passports.length}</b><small>LIVE SYSTEMS</small></span></div><div><Siren/><span><b>{highRisk.length}</b><small>R4-R5 CONTROLLED</small></span></div><StatusPill tone={pending.length ? "gold" : "green"}>{pending.length ? "review required" : "gate clear"}</StatusPill></div></section>
    <div className="section-wrap">
      <div className={`trust-notice ${state.persisted ? "connected" : "preview"}`}><Activity/><span>{notice}</span>{!state.persisted || !state.passports.length ? <button type="button" onClick={bootstrap} disabled={loading}>Initialize tenant ledger</button> : null}</div>
      <nav className="trust-tabs" aria-label="Trust command views">{([ ["overview", Gauge, "Overview"], ["passports", FileBadge2, "AI Passports"], ["reviews", UserCheck, `Reviews ${pending.length ? `(${pending.length})` : ""}`], ["registry", Bot, "Registry"], ["audit", History, "Audit"] ] as const).map(([id, Icon, label]) => <button type="button" key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon/><span>{label}</span></button>)}</nav>

      {view === "overview" ? <div className="trust-overview">
        <section className="trust-gate"><div className="section-heading"><div><span className="eyebrow">DEPLOYMENT CONTROL</span><h2>Sim to Live gate</h2></div><LockKeyhole/></div><div className="trust-gate-track"><article className="complete"><span>01</span><b>SIM</b><small>Isolated tests and red-team scenarios</small></article><ChevronRight/><article className={pending.length ? "current" : "complete"}><span>02</span><b>PIT STOP</b><small>Human review, evidence, disclosure</small></article><ChevronRight/><article className={!pending.length && state.passports.length ? "current" : "locked"}><span>03</span><b>LIVE</b><small>Scoped tools, monitoring, rollback</small></article></div>{pending[0] ? <div className="trust-next-action"><div><CircleAlert/><span><b>{pending[0].subjectName}</b><small>{pending[0].reviewType} requires an operator decision.</small></span></div><button type="button" onClick={() => setView("reviews")}>Open review queue</button></div> : <div className="trust-next-action clear"><div><CheckCircle2/><span><b>Deployment gate clear</b><small>No outstanding human review requests.</small></span></div></div>}</section>
        <section className="trust-risk"><div className="section-heading"><div><span className="eyebrow">RISK & POLICY</span><h2>Portfolio classification</h2></div><ShieldCheck/></div>{(["R0", "R1", "R2", "R3", "R4", "R5"] as TrustRisk[]).map((risk) => { const count = state.passports.filter((item) => item.riskLevel === risk).length; return <div key={risk}><StatusPill tone={riskTone(risk)}>{risk}</StatusPill><span>{["Informational", "Assistive", "Member context", "Operational", "High impact", "Prohibited"][Number(risk.slice(1))]}</span><b>{count}</b><i style={{ width: `${Math.max(4, count / Math.max(1, state.passports.length) * 100)}%` }}/></div>; })}</section>
        <section className="trust-operations"><div className="section-heading"><div><span className="eyebrow">LIVE OPERATIONS</span><h2>Registered systems</h2></div><Bot/></div>{state.passports.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => { setQuery(item.name); setView("passports"); }}><StatusPill tone={riskTone(item.riskLevel)}>{item.riskLevel}</StatusPill><span><b>{item.name}</b><small>{item.owner} / {item.systemType}</small></span><StatusPill tone={item.deploymentStage === "live" ? "green" : item.deploymentStage === "held" ? "red" : "cyan"}>{item.deploymentStage}</StatusPill><ChevronRight/></button>)}</section>
        <section className="trust-nodes"><div className="section-heading"><div><span className="eyebrow">AIR BOX NODES</span><h2>Governed edge runtime</h2></div><Box/></div>{state.nodes.map((node) => <article key={node.id}><span className={`trust-node-light ${node.status}`}/><div><b>{node.name}</b><small>{node.location}</small></div><span>{relativeTime(node.lastHeartbeatAt)}</span></article>)}</section>
      </div> : null}

      {view === "passports" ? <section className="trust-workspace"><div className="trust-toolbar"><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search AI systems, owner, or type"/></label><button type="button" onClick={() => setCreating(true)}><FilePlus2/>New passport</button></div><div className="trust-table" role="table"><div className="trust-table-head" role="row"><span>System</span><span>Risk</span><span>Evidence</span><span>Stage</span><span>Action</span></div>{filteredPassports.map((item) => <div className="trust-table-row" role="row" key={item.id}><span><b>{item.name}</b><small>{item.owner} / {item.modelProvider}</small></span><StatusPill tone={riskTone(item.riskLevel)}>{item.riskLevel}</StatusPill><span><b>{item.evidenceStatus}</b><small>{item.disclosureStatus} disclosure</small></span><StatusPill tone={item.deploymentStage === "live" ? "green" : item.deploymentStage === "held" ? "red" : "cyan"}>{item.deploymentStage}</StatusPill><button type="button" disabled={item.deploymentStage === "live" || item.evidenceStatus !== "verified"} onClick={() => approveLive(item)}>{item.deploymentStage === "live" ? <CheckCircle2/> : <LockKeyhole/>}{item.deploymentStage === "live" ? "Live" : "Approve Live"}</button></div>)}{!filteredPassports.length ? <div className="trust-empty"><FileBadge2/><b>No passports match this view</b><span>Create the first governed AI system or clear the search.</span></div> : null}</div></section> : null}

      {view === "reviews" ? <section className="trust-review-queue"><div className="section-heading"><div><span className="eyebrow">HUMAN OVERSIGHT</span><h2>Decision queue</h2></div><span>{pending.length} open</span></div>{state.reviews.map((review) => <article key={review.id}><div className="trust-review-main"><StatusPill tone={riskTone(review.riskLevel)}>{review.riskLevel}</StatusPill><span><b>{review.subjectName}</b><small>{review.reviewType} / requested by {review.requestedBy} / {relativeTime(review.createdAt)}</small></span></div><StatusPill tone={review.status === "approved" ? "green" : review.status === "rejected" ? "red" : "gold"}>{review.status}</StatusPill>{review.status === "pending" ? <div className="trust-review-actions"><button type="button" className="reject" onClick={() => decide(review.id, "rejected")}><XCircle/>Return</button><button type="button" onClick={() => decide(review.id, "approved")}><CheckCircle2/>Approve</button></div> : null}</article>)}{!state.reviews.length ? <div className="trust-empty"><ClipboardCheck/><b>No reviews yet</b><span>Review requests appear when systems approach a governed gate.</span></div> : null}</section> : null}

      {view === "registry" ? <section className="trust-registry"><div className="section-heading"><div><span className="eyebrow">AGENT REGISTRY</span><h2>Runtime, tools, and policy state</h2></div><Bot/></div>{state.agents.map((agent) => <article key={agent.id}><div className="trust-agent-icon"><Bot/></div><span><b>{agent.name}</b><small>{agent.role}</small></span><span><b>{agent.runtime}</b><small>{agent.toolCount} governed tools</small></span><StatusPill tone={riskTone(agent.riskLevel)}>{agent.riskLevel}</StatusPill><StatusPill tone={agent.status === "active" ? "green" : agent.status === "held" ? "gold" : "red"}>{agent.status}</StatusPill><time>{relativeTime(agent.lastSeenAt)}</time></article>)}</section> : null}

      {view === "audit" ? <section className="trust-audit"><div className="section-heading"><div><span className="eyebrow">IMMUTABLE EVIDENCE</span><h2>Operator audit stream</h2></div><button type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(state.audit, null, 2))}><History/>Copy JSON</button></div>{state.audit.map((event) => <article key={event.id}><span className={`trust-audit-mark ${event.outcome}`}/><time>{new Date(event.createdAt).toLocaleString()}</time><StatusPill tone={riskTone(event.riskLevel)}>{event.riskLevel}</StatusPill><div><b>{event.eventType}</b><span>{event.subjectName}</span><small>{event.detail}</small></div><code>{event.actorId}</code></article>)}</section> : null}
    </div>

    {creating ? <div className="trust-modal-backdrop" role="presentation" onMouseDown={() => setCreating(false)}><form className="trust-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void createPassport(event.currentTarget); }}><div className="section-heading"><div><span className="eyebrow">REGISTER SYSTEM</span><h2>New AI passport</h2></div><button type="button" className="icon-button" onClick={() => setCreating(false)} aria-label="Close passport form"><XCircle/></button></div><label>System name<input name="name" required placeholder="Example: Partner coaching agent"/></label><div><label>System type<select name="systemType"><option>voice-agent</option><option>vision-agent</option><option>tool-agent</option><option>digital-twin</option><option>recommendation</option></select></label><label>Risk level<select name="riskLevel" defaultValue="R2">{(["R0", "R1", "R2", "R3", "R4", "R5"] as TrustRisk[]).map((risk) => <option key={risk}>{risk}</option>)}</select></label></div><label>Accountable owner<input name="owner" defaultValue="AMX LABS" required/></label><label>Model or runtime provider<input name="modelProvider" defaultValue="AMX Agent Gateway" required/></label><label>Data classification<select name="dataClassification" defaultValue="internal"><option>public</option><option>internal</option><option>member-context</option><option>camera-stream</option><option>operator-private</option></select></label><div className="trust-modal-actions"><button type="button" onClick={() => setCreating(false)}>Cancel</button><button type="submit" disabled={loading}><FilePlus2/>Create draft passport</button></div></form></div> : null}
  </div>;
}
