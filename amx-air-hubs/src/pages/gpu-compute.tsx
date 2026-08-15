import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Archive, Ban, Boxes, CircleDollarSign, CloudCog, ExternalLink, Gauge, Play, RadioTower, RefreshCw, Save, Send, ServerCog, ShieldCheck, Video } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { getActiveTenant } from "../operations";
import { storeStageMediaAsset } from "../StageProgramMediaDeck";
import {
  cancelRunpodJob, createRunpodJob, deliverRunpodJob, loadRunpodHealth, loadRunpodJobs,
  loadRunpodPolicy, refreshRunpodJob, saveRunpodPolicy,
  type RunpodHealth, type RunpodJob, type RunpodPolicy, type RunpodUsage,
} from "../runpod-compute";

const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]);

function money(cents: number | null) {
  return cents == null ? "PENDING" : (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function GPUComputePage() {
  const tenantId = getActiveTenant();
  const [health, setHealth] = useState<RunpodHealth | null>(null);
  const [policy, setPolicy] = useState<RunpodPolicy | null>(null);
  const [usage, setUsage] = useState<RunpodUsage>({ spentCents: 0, activeJobs: 0 });
  const [jobs, setJobs] = useState<RunpodJob[]>([]);
  const [workload, setWorkload] = useState("render");
  const [prompt, setPrompt] = useState("Render a polished 16:9 AMX XR Stage establishing shot with production-safe lighting.");
  const [sourceUrl, setSourceUrl] = useState("");
  const [deliveryTarget, setDeliveryTarget] = useState<"archive" | "stage" | "livekit">("stage");
  const [stageRoom, setStageRoom] = useState("AMXSTAGE");
  const [operatorApproved, setOperatorApproved] = useState(false);
  const [lowPriority, setLowPriority] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = health?.workloads.find((item) => item.id === workload);
  const budgetPercent = policy ? Math.min(100, Math.round(usage.spentCents / Math.max(1, policy.monthlyBudgetCents) * 100)) : 0;
  const activeJobs = useMemo(() => jobs.filter((job) => !terminal.has(job.status)), [jobs]);

  const refresh = async () => {
    setBusy(true);
    try {
      const [healthResult, policyResult, jobsResult] = await Promise.all([loadRunpodHealth(), loadRunpodPolicy(tenantId), loadRunpodJobs(tenantId)]);
      setHealth(healthResult); setPolicy(policyResult.policy); setUsage(policyResult.usage); setJobs(jobsResult.jobs); setNotice("");
      if (!healthResult.workloads.find((item) => item.id === workload)?.configured) {
        const first = healthResult.workloads.find((item) => item.configured);
        if (first) setWorkload(first.id);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "GPU compute status is unavailable."); }
    finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, [tenantId]);
  useEffect(() => {
    if (!activeJobs.length) return;
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(timer);
  }, [activeJobs.length]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true); setNotice("Submitting governed GPU workload...");
    try {
      const result = await createRunpodJob({ tenantId, workload, prompt, sourceUrl: sourceUrl.trim() || undefined, deliveryTarget, stageRoom, maxSeconds: selected.maxSeconds, lowPriority, operatorApproved });
      setJobs((current) => [result.job, ...current]);
      setNotice(`${selected.label} accepted as ${result.job.id}.`);
      setOperatorApproved(false);
    } catch (error) { setNotice(error instanceof Error ? error.message : "GPU job could not be submitted."); }
    finally { setBusy(false); }
  };

  const savePolicy = async () => {
    if (!policy) return;
    setBusy(true);
    try { const result = await saveRunpodPolicy(policy); setPolicy(result.policy); setNotice("Tenant GPU policy saved and audited."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "GPU policy could not be saved."); }
    finally { setBusy(false); }
  };

  const updateJob = async (job: RunpodJob) => {
    setBusy(true);
    try { const result = await refreshRunpodJob(job.id); setJobs((current) => current.map((item) => item.id === job.id ? result.job : item)); setNotice(`${job.id} refreshed.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "GPU job could not be refreshed."); }
    finally { setBusy(false); }
  };

  const cancel = async (job: RunpodJob) => {
    setBusy(true);
    try { const result = await cancelRunpodJob(job.id); setJobs((current) => current.map((item) => item.id === job.id ? result.job : item)); setNotice(`${job.id} cancelled.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "GPU job could not be cancelled."); }
    finally { setBusy(false); }
  };

  const deliver = async (job: RunpodJob, target: "stage" | "livekit") => {
    setBusy(true);
    try {
      const result = await deliverRunpodJob(job.id, target, stageRoom);
      if (result.delivery.stageAsset) storeStageMediaAsset(tenantId, result.delivery.stageAsset);
      setNotice(result.delivery.detail);
    } catch (error) { setNotice(error instanceof Error ? error.message : "GPU output delivery failed."); }
    finally { setBusy(false); }
  };

  return <div className="page section-wrap gpu-compute-page">
    <PageHeader eyebrow="AMX COMPUTE / RUNPOD" title="Blackwell workload control" description="Route approved vision, rendering, digital twin, and agent workloads to tenant-scoped GPU endpoints with budgets, audit trails, and durable Stage delivery." actions={<><Link className="button secondary" to="/connections?provider=runpod"><ServerCog/>Connection</Link><button className="button primary" onClick={() => void refresh()} disabled={busy}><RefreshCw/>Refresh</button></>}/>
    {notice && <div className="gpu-notice" role="status"><Activity/>{notice}</div>}
    <section className="gpu-status-band">
      <div><CloudCog/><span>PROVIDER</span><b>{health?.configured ? "CONNECTED" : "CONFIGURE"}</b><small>{health?.endpointCount || 0} allowlisted endpoints</small></div>
      <div><Boxes/><span>JOBS</span><b>{usage.activeJobs} ACTIVE</b><small>{jobs.length} recent records</small></div>
      <div><CircleDollarSign/><span>MONTHLY USE</span><b>{money(usage.spentCents)}</b><small>{budgetPercent}% of {money(policy?.monthlyBudgetCents || 0)}</small></div>
      <div><Archive/><span>OUTPUT CAPTURE</span><b>{health?.durableCapture ? "DURABLE" : "TEMPORARY"}</b><small>{health?.retentionMinutes || 30} minute provider window</small></div>
    </section>

    <div className="gpu-operator-layout">
      <section className="gpu-launcher">
        <header><div><span className="eyebrow">WORKLOAD ROUTER</span><h2>Launch compute</h2></div><StatusPill tone={health?.configured ? "green" : "gold"}>{health?.configured ? "READY" : "RUNTIME KEY NEEDED"}</StatusPill></header>
        <div className="gpu-workload-grid">{health?.workloads.map((item) => <button key={item.id} className={workload === item.id ? "active" : ""} disabled={!item.configured} onClick={() => { setWorkload(item.id); setOperatorApproved(false); }}><span>{item.outputKind.toUpperCase()}</span><b>{item.label}</b><small>{item.gpu} / {Math.round(item.maxSeconds / 60)} min max</small>{item.approvalRequired && <i><ShieldCheck/>APPROVAL</i>}</button>)}</div>
        <label>Production instruction<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={8_000}/></label>
        <label>HTTPS source image or video <span>optional</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://media.example/source.mp4"/></label>
        <div className="gpu-route-row"><label>Result route<select value={deliveryTarget} onChange={(event) => setDeliveryTarget(event.target.value as typeof deliveryTarget)}><option value="stage">Stage hot-load</option><option value="livekit">LiveKit ingress</option><option value="archive">AMX archive</option></select></label><label>Room code<input value={stageRoom} onChange={(event) => setStageRoom(event.target.value.toUpperCase())} maxLength={64}/></label></div>
        <div className="gpu-checks"><label><input type="checkbox" checked={lowPriority} onChange={(event) => setLowPriority(event.target.checked)}/><Gauge/>Cost-optimized queue</label>{selected?.approvalRequired && <label className="approval"><input type="checkbox" checked={operatorApproved} onChange={(event) => setOperatorApproved(event.target.checked)}/><ShieldCheck/>I approve this training workload and budget</label>}</div>
        <button className="button primary full" onClick={() => void submit()} disabled={busy || !health?.configured || !selected?.configured || !prompt.trim() || Boolean(selected?.approvalRequired && !operatorApproved)}><Play/>Launch {selected?.label || "GPU workload"}</button>
      </section>

      <aside className="gpu-policy">
        <header><div><span className="eyebrow">TENANT GUARDRAILS</span><h2>Usage policy</h2></div><StatusPill tone={policy?.status === "active" ? "green" : "gold"}>{policy?.status || "LOADING"}</StatusPill></header>
        {policy && <><label>Monthly budget <span>{money(policy.monthlyBudgetCents)}</span><input type="range" min="1000" max="100000" step="1000" value={policy.monthlyBudgetCents} onChange={(event) => setPolicy({ ...policy, monthlyBudgetCents: Number(event.target.value), perJobLimitCents: Math.min(policy.perJobLimitCents, Number(event.target.value)) })}/></label><label>Per-job limit <span>{money(policy.perJobLimitCents)}</span><input type="range" min="100" max={policy.monthlyBudgetCents} step="100" value={policy.perJobLimitCents} onChange={(event) => setPolicy({ ...policy, perJobLimitCents: Number(event.target.value) })}/></label><label>Concurrent jobs<select value={policy.maxConcurrentJobs} onChange={(event) => setPolicy({ ...policy, maxConcurrentJobs: Number(event.target.value) })}>{[1,2,3,4,5,8,10].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="gpu-policy-toggle"><input type="checkbox" checked={policy.status === "active"} onChange={(event) => setPolicy({ ...policy, status: event.target.checked ? "active" : "paused" })}/><RadioTower/>{policy.status === "active" ? "Tenant compute active" : "Tenant compute paused"}</label><button className="button secondary full" onClick={() => void savePolicy()} disabled={busy}><Save/>Save policy</button></>}
        <div className="gpu-budget-meter"><i style={{ width: `${budgetPercent}%` }}/></div><small>Actual execution is metered after completion. Every terminal state writes a usage ledger event.</small>
      </aside>
    </div>

    <section className="gpu-job-ledger">
      <header><div><span className="eyebrow">AUDIT LEDGER</span><h2>Recent GPU jobs</h2></div><span>{activeJobs.length} active / {jobs.length} total</span></header>
      {jobs.length ? <div className="gpu-job-list">{jobs.map((job) => <article key={job.id}><div className="gpu-job-icon">{job.outputContentType.startsWith("video/") ? <Video/> : <ServerCog/>}</div><div className="gpu-job-main"><span>{job.workload.replaceAll("-", " ")} / {job.gpuType}</span><b>{job.id}</b><small>{new Date(job.createdAt).toLocaleString()} / estimate {money(job.estimatedCents)} / actual {money(job.actualCents)}</small>{job.error && <em>{job.error}</em>}</div><StatusPill tone={job.status === "COMPLETED" ? "green" : ["FAILED","TIMED_OUT"].includes(job.status) ? "gold" : "cyan"}>{job.status}</StatusPill><div className="gpu-job-actions"><button className="icon-button" title="Refresh provider status" onClick={() => void updateJob(job)} disabled={busy || terminal.has(job.status)}><RefreshCw/></button>{!terminal.has(job.status) && <button className="icon-button danger" title="Cancel job" onClick={() => void cancel(job)} disabled={busy}><Ban/></button>}{job.status === "COMPLETED" && job.outputUrl && <><button className="icon-button" title="Send video to Stage" onClick={() => void deliver(job, "stage")} disabled={busy}><Send/></button><button className="icon-button" title="Prepare LiveKit ingress" onClick={() => void deliver(job, "livekit")} disabled={busy}><RadioTower/></button>{/^https:\/\//.test(job.outputUrl) && <a className="icon-button" href={job.outputUrl} target="_blank" rel="noreferrer" title="Open output"><ExternalLink/></a>}</>}</div></article>)}</div> : <div className="gpu-empty"><CloudCog/><b>No GPU jobs yet</b><span>Launch an approved workload to create the first tenant ledger record.</span></div>}
    </section>
  </div>;
}
