import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, BadgeCheck, Ban, Check, CheckCircle2, Circle, CircleAlert, Clock3, Download, FileCheck2, ListChecks,
  Pause, Play, Plus, Radio, ShieldCheck, SkipForward, TimerReset, Trash2, UserRoundCog, X,
} from "lucide-react";
import type { StageEventState } from "./stage-events";
import {
  completeStageRundownItem, normalizeStageShowWorkflow, reviseStageShowWorkflow, stageWorkflowReadiness, stageWorkflowReport,
  takeStageRundownItem, type StageApprovalStatus, type StageDeliverableStatus, type StageRundownItem, type StageShowWorkflow,
  type StageWorkflowPhase,
} from "./stage-show-workflow";

export interface StageWorkflowRuntimeCue {
  cue: StageRundownItem["cue"];
  shot: StageRundownItem["shot"];
  target: string;
}

interface StageShowWorkflowProps {
  room: string;
  tenantId: string;
  event: StageEventState;
  connectedPods: string[];
  workflow: StageShowWorkflow;
  operatorId: string;
  live: boolean;
  onWorkflowChange: (workflow: StageShowWorkflow, runtime?: StageWorkflowRuntimeCue) => void;
  onLiveChange: (live: boolean, workflow: StageShowWorkflow) => void;
}

type PersistenceState = "loading" | "syncing" | "durable" | "local";

const APPROVAL_SEQUENCE: StageApprovalStatus[] = ["pending", "approved", "blocked"];
const DELIVERABLE_SEQUENCE: StageDeliverableStatus[] = ["not-started", "working", "review", "complete"];

function durationLabel(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "stage-production";
}

export function StageShowWorkflow({ room, tenantId, event, connectedPods, workflow, operatorId, live, onWorkflowChange, onLiveChange }: StageShowWorkflowProps) {
  const [phase, setPhase] = useState<StageWorkflowPhase>(workflow.phase);
  const [persistence, setPersistence] = useState<PersistenceState>("loading");
  const [persistenceNote, setPersistenceNote] = useState("Loading durable production record");
  const [durableKey, setDurableKey] = useState("");
  const [now, setNow] = useState(Date.now());
  const workflowRef = useRef(workflow);
  const onWorkflowChangeRef = useRef(onWorkflowChange);
  const readiness = useMemo(() => stageWorkflowReadiness(workflow), [workflow]);
  const currentItem = workflow.rundown.find((item) => item.id === workflow.currentItemId) || null;
  const nextItem = workflow.rundown.find((item) => ["pending", "standby"].includes(item.status)) || null;
  const plannedDuration = workflow.rundown.reduce((total, item) => total + item.durationSec, 0);
  const showElapsed = workflow.showStartedAt ? Math.max(0, Math.floor(((workflow.showEndedAt ? Date.parse(workflow.showEndedAt) : now) - Date.parse(workflow.showStartedAt)) / 1000)) : 0;
  const itemElapsed = currentItem?.startedAt ? Math.max(0, Math.floor((now - Date.parse(currentItem.startedAt)) / 1000)) : 0;

  useEffect(() => { workflowRef.current = workflow; }, [workflow]);
  useEffect(() => { onWorkflowChangeRef.current = onWorkflowChange; }, [onWorkflowChange]);
  useEffect(() => {
    if (workflow.phase !== phase && ["on-air", "wrap", "archived"].includes(workflow.status)) setPhase(workflow.phase);
  }, [phase, workflow.phase, workflow.status]);
  useEffect(() => {
    if (!live && !workflow.showStartedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live, workflow.showStartedAt]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setPersistence("loading");
      setDurableKey("");
      setPersistenceNote("Loading durable production record");
      try {
        const response = await fetch(`/api/stage/workflows/${encodeURIComponent(room)}?tenantId=${encodeURIComponent(tenantId)}`, { headers: { Accept: "application/json" } });
        if (response.status === 404) {
          if (!(response.headers.get("Content-Type") || "").includes("application/json")) throw new Error("Durable Worker unavailable");
          if (!cancelled) { setDurableKey(`${tenantId}/${room}`); setPersistence("durable"); setPersistenceNote("New durable record ready"); }
          return;
        }
        const body = await response.json() as { workflow?: StageShowWorkflow; error?: string; updatedBy?: string };
        if (!response.ok || !body.workflow) throw new Error(body.error || "Durable workflow is unavailable");
        const remote = normalizeStageShowWorkflow(body.workflow, room);
        if (remote.revision > workflowRef.current.revision) onWorkflowChangeRef.current(remote);
        if (!cancelled) { setDurableKey(`${tenantId}/${room}`); setPersistence("durable"); setPersistenceNote(`D1 record loaded${body.updatedBy ? ` / ${body.updatedBy}` : ""}`); }
      } catch (error) {
        if (!cancelled) { setPersistence("local"); setPersistenceNote(error instanceof Error && error.message.includes("restricted") ? error.message : "Durable Worker unavailable / room sync active"); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [room, tenantId]);

  useEffect(() => {
    if (durableKey !== `${tenantId}/${room}`) return;
    const timer = window.setTimeout(async () => {
      setPersistence("syncing");
      try {
        const response = await fetch(`/api/stage/workflows/${encodeURIComponent(room)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, revision: workflow.revision, updatedBy: operatorId, workflow }),
        });
        const body = await response.json() as { error?: string };
        if (!response.ok) throw new Error(body.error || "Durable save failed");
        setPersistence("durable");
        setPersistenceNote(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      } catch (error) {
        setPersistence("local");
        setPersistenceNote(error instanceof Error && error.message.includes("restricted") ? error.message : "Durable save unavailable / room sync active");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [durableKey, operatorId, room, tenantId, workflow]);

  const commit = (patch: Partial<StageShowWorkflow>, action?: string, detail?: string) => {
    onWorkflowChange(reviseStageShowWorkflow(workflow, patch, action ? { action, detail: detail || "Workflow updated", actor: operatorId } : undefined));
  };

  const toggleCheck = (id: string) => {
    const check = workflow.preflight.find((item) => item.id === id);
    if (!check) return;
    const complete = !check.complete;
    commit({ preflight: workflow.preflight.map((item) => item.id === id ? { ...item, complete, completedAt: complete ? new Date().toISOString() : null } : item) }, "preflight.updated", `${check.label}: ${complete ? "complete" : "reopened"}`);
  };

  const cycleApproval = (id: string) => {
    const approval = workflow.approvals.find((item) => item.id === id);
    if (!approval) return;
    const status = APPROVAL_SEQUENCE[(APPROVAL_SEQUENCE.indexOf(approval.status) + 1) % APPROVAL_SEQUENCE.length];
    commit({ approvals: workflow.approvals.map((item) => item.id === id ? { ...item, status, approver: status === "pending" ? "" : operatorId, decidedAt: status === "pending" ? null : new Date().toISOString() } : item) }, "approval.updated", `${approval.label}: ${status}`);
  };

  const setCrew = (id: string, assignee: string) => {
    commit({ crew: workflow.crew.map((item) => item.id === id ? { ...item, assignee } : item) });
  };

  const lockReady = () => {
    if (!readiness.ready) return;
    commit({ status: "ready", phase: "pre" }, "production.ready", "All required gates approved; show locked ready");
  };

  const setLive = (nextLive: boolean) => {
    if (nextLive && (!readiness.ready || workflow.status !== "ready")) return;
    const timestamp = new Date().toISOString();
    const next = reviseStageShowWorkflow(workflow, nextLive ? {
      phase: "live", status: "on-air", showStartedAt: workflow.showStartedAt || timestamp, showEndedAt: null, holdStartedAt: null,
    } : {
      phase: "post", status: "wrap", showEndedAt: timestamp, holdStartedAt: null, holdReason: "", currentItemId: null,
      rundown: workflow.rundown.map((item) => item.status === "live" ? { ...item, status: "complete", completedAt: timestamp } : item),
    }, { action: nextLive ? "show.started" : "show.ended", detail: nextLive ? "Main Stage and connected Pod rundown started" : "Program ended and post-production handoff opened", actor: operatorId });
    setPhase(next.phase);
    onLiveChange(nextLive, next);
  };

  const toggleHold = () => {
    const holding = Boolean(workflow.holdStartedAt);
    commit({ holdStartedAt: holding ? null : new Date().toISOString(), holdReason: holding ? "" : workflow.holdReason || "Director hold" }, holding ? "show.resumed" : "show.held", holding ? "Program resumed" : workflow.holdReason || "Director hold");
  };

  const updateRundown = (id: string, patch: Partial<StageRundownItem>) => {
    commit({ rundown: workflow.rundown.map((item) => item.id === id ? { ...item, ...patch } : item) });
  };

  const addRundownItem = () => {
    if (workflow.rundown.length >= 48) return;
    const order = workflow.rundown.length + 1;
    const item: StageRundownItem = { id: `run-${crypto.randomUUID().slice(0, 8)}`, order, title: `Segment ${order}`, kind: "segment", target: "MAIN-STAGE", durationSec: 300, owner: "Producer", cue: "speaker", shot: "wide", status: "pending", startedAt: null, completedAt: null };
    commit({ rundown: [...workflow.rundown, item] }, "rundown.item_added", item.title);
  };

  const removeRundownItem = (id: string) => {
    const item = workflow.rundown.find((candidate) => candidate.id === id);
    if (!item || live) return;
    commit({ rundown: workflow.rundown.filter((candidate) => candidate.id !== id).map((candidate, index) => ({ ...candidate, order: index + 1 })) }, "rundown.item_removed", item.title);
  };

  const standbyItem = (item: StageRundownItem) => {
    const next = reviseStageShowWorkflow(workflow, { rundown: workflow.rundown.map((candidate) => candidate.id === item.id ? { ...candidate, status: "standby" } : candidate) }, { action: "rundown.standby", detail: `${item.title} standing by on ${item.target}`, actor: operatorId });
    onWorkflowChange(next);
  };

  const takeItem = (item: StageRundownItem) => {
    const next = takeStageRundownItem(workflow, item.id, operatorId);
    onWorkflowChange(next, { cue: item.cue, shot: item.shot, target: item.target });
  };

  const completeItem = (item: StageRundownItem) => onWorkflowChange(completeStageRundownItem(workflow, item.id, operatorId));

  const skipItem = (item: StageRundownItem) => {
    commit({ rundown: workflow.rundown.map((candidate) => candidate.id === item.id ? { ...candidate, status: "skipped", completedAt: new Date().toISOString() } : candidate), currentItemId: workflow.currentItemId === item.id ? null : workflow.currentItemId }, "rundown.skipped", item.title);
  };

  const cycleDeliverable = (id: string) => {
    const deliverable = workflow.deliverables.find((item) => item.id === id);
    if (!deliverable) return;
    const status = DELIVERABLE_SEQUENCE[(DELIVERABLE_SEQUENCE.indexOf(deliverable.status) + 1) % DELIVERABLE_SEQUENCE.length];
    commit({ deliverables: workflow.deliverables.map((item) => item.id === id ? { ...item, status } : item) }, "post.deliverable_updated", `${deliverable.label}: ${status}`);
  };

  const exportReport = () => {
    const report = stageWorkflowReport(workflow, { room, tenantId, event, connectedPods });
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(event.title)}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const archiveReady = workflow.deliverables.every((item) => item.status === "complete");
  const targets = ["MAIN-STAGE", ...connectedPods.filter((pod) => pod !== "MAIN-STAGE")];

  return <div className="stage-workflow">
    <section className="stage-workflow-command">
      <div className="stage-workflow-identity">
        <span className="eyebrow">ENTERPRISE SHOW WORKFLOW / V{workflow.version}</span>
        <h2>{event.title}</h2>
        <small>{workflow.productionId} / {room}</small>
      </div>
      <div className="stage-workflow-health">
        <span className={readiness.ready ? "ready" : "blocked"}>{readiness.ready ? <ShieldCheck/> : <CircleAlert/>}<b>{readiness.ready ? "GATES CLEAR" : `${readiness.blockers.length} BLOCKERS`}</b></span>
        <span className={persistence}><i/><b>{persistence.toUpperCase()}</b><small>{persistenceNote}</small></span>
      </div>
      <div className="stage-workflow-phases" role="tablist" aria-label="Production phase">
        {([ ["pre", "Pre", FileCheck2], ["live", "Run", Radio], ["post", "Post", Archive] ] as const).map(([id, label, Icon]) => <button key={id} className={phase === id ? "active" : ""} onClick={() => setPhase(id)}><Icon/><span>{label}</span></button>)}
      </div>
    </section>

    {phase === "pre" && <div className="stage-workflow-phase">
      <section className="stage-workflow-summary">
        <span><b>{readiness.checksComplete}/{readiness.checksRequired}</b><small>CHECKS</small></span>
        <span><b>{readiness.approvalsComplete}/{readiness.approvalsRequired}</b><small>APPROVALS</small></span>
        <span><b>{readiness.crewAssigned}/{readiness.crewRequired}</b><small>CREW</small></span>
        <span><b>{workflow.rundown.length}</b><small>CUES</small></span>
      </section>
      {readiness.blockers.length > 0 && <div className="stage-workflow-blockers"><CircleAlert/><span><b>Cannot lock ready</b><small>{readiness.blockers.join(" / ")}</small></span></div>}
      <section className="stage-workflow-section">
        <header><div><span className="eyebrow">PREFLIGHT GATES</span><h3>Required checks</h3></div><b>{readiness.checksComplete}/{readiness.checksRequired}</b></header>
        <div className="stage-workflow-checks">{workflow.preflight.map((item) => <button key={item.id} className={item.complete ? "complete" : ""} onClick={() => toggleCheck(item.id)}><span>{item.complete ? <Check/> : <Circle/>}</span><span><b>{item.label}</b><small>{item.owner}</small></span></button>)}</div>
      </section>
      <section className="stage-workflow-section">
        <header><div><span className="eyebrow">SIGN-OFF</span><h3>Approvals</h3></div><ShieldCheck/></header>
        <div className="stage-workflow-approvals">{workflow.approvals.map((item) => <button key={item.id} className={item.status} onClick={() => cycleApproval(item.id)}><span>{item.status === "approved" ? <BadgeCheck/> : item.status === "blocked" ? <Ban/> : <Circle/>}</span><span><b>{item.label}</b><small>{item.status === "pending" ? "Tap to approve" : `${item.status} / ${item.approver}`}</small></span></button>)}</div>
      </section>
      <section className="stage-workflow-section">
        <header><div><span className="eyebrow">CALL SHEET</span><h3>Crew ownership</h3></div><UserRoundCog/></header>
        <div className="stage-workflow-crew">{workflow.crew.map((item) => <label key={item.id}><span><b>{item.callSign}</b><small>{item.role}</small></span><input value={item.assignee} onChange={(event) => setCrew(item.id, event.target.value)} placeholder="Assign operator" maxLength={64}/></label>)}</div>
      </section>
      <div className="stage-workflow-pre-actions"><button onClick={() => commit({ status: "rehearsal", phase: "pre" }, "rehearsal.started", "Technical rehearsal opened")}><TimerReset/>BEGIN REHEARSAL</button><button className="primary" disabled={!readiness.ready} onClick={lockReady}><ShieldCheck/>LOCK SHOW READY</button></div>
    </div>}

    {phase === "live" && <div className="stage-workflow-phase">
      <section className={`stage-workflow-runtime ${live ? "live" : ""} ${workflow.holdStartedAt ? "hold" : ""}`}>
        <div><span className="eyebrow">SHOW CLOCK</span><b>{durationLabel(showElapsed)}</b><small>PLANNED {durationLabel(plannedDuration)}</small></div>
        <div><span className="eyebrow">PROGRAM</span><b>{workflow.holdStartedAt ? "HOLD" : live ? "ON AIR" : workflow.status.toUpperCase()}</b><small>{currentItem?.title || nextItem?.title || "No active cue"}</small></div>
        <div className="stage-workflow-runtime-actions">
          {!live ? <button className="go" disabled={!readiness.ready || workflow.status !== "ready"} onClick={() => setLive(true)}><Play/>GO LIVE</button> : <><button className={workflow.holdStartedAt ? "resume" : "hold"} onClick={toggleHold}>{workflow.holdStartedAt ? <Play/> : <Pause/>}{workflow.holdStartedAt ? "RESUME" : "HOLD"}</button><button className="end" onClick={() => setLive(false)}><X/>END</button></>}
        </div>
      </section>
      {workflow.holdStartedAt && <label className="stage-workflow-hold"><Pause/><span>HOLD REASON</span><input value={workflow.holdReason} onChange={(event) => commit({ holdReason: event.target.value })} maxLength={120}/></label>}
      {currentItem && <section className="stage-workflow-now"><span><Radio/><b>NOW</b></span><div><b>{currentItem.title}</b><small>{currentItem.target} / {currentItem.owner}</small></div><time className={itemElapsed > currentItem.durationSec ? "over" : ""}>{durationLabel(itemElapsed)} / {durationLabel(currentItem.durationSec)}</time></section>}
      <section className="stage-workflow-section stage-workflow-rundown">
        <header><div><span className="eyebrow">MASTER RUNDOWN</span><h3>Pods + Main Stage</h3></div><button onClick={addRundownItem} disabled={live || workflow.rundown.length >= 48}><Plus/>ADD</button></header>
        <div className="stage-rundown-head"><span>#</span><span>SEGMENT / OWNER</span><span>TARGET</span><span>TIME</span><span>ACTION</span></div>
        <div className="stage-rundown-list">{workflow.rundown.map((item) => <div key={item.id} className={`stage-rundown-row ${item.status}`}>
          <b className="stage-rundown-order">{String(item.order).padStart(2, "0")}</b>
          <span className="stage-rundown-title"><input value={item.title} onChange={(event) => updateRundown(item.id, { title: event.target.value })} maxLength={80}/><input value={item.owner} onChange={(event) => updateRundown(item.id, { owner: event.target.value })} maxLength={64}/></span>
          <span className="stage-rundown-target"><select value={item.target} onChange={(event) => updateRundown(item.id, { target: event.target.value })}>{!targets.includes(item.target) && <option value={item.target}>{item.target}</option>}{targets.map((target) => <option key={target} value={target}>{target}</option>)}</select><select value={item.cue} onChange={(event) => updateRundown(item.id, { cue: event.target.value as StageRundownItem["cue"] })}>{["standby", "opening", "speaker", "demo", "qa", "sponsor", "close"].map((cue) => <option key={cue} value={cue}>{cue}</option>)}</select></span>
          <label className="stage-rundown-duration"><input type="number" min="1" max="240" value={Math.round(item.durationSec / 60)} onChange={(event) => updateRundown(item.id, { durationSec: Math.max(10, Number(event.target.value) * 60) })}/><small>MIN</small></label>
          <span className="stage-rundown-actions">
            {item.status === "pending" && <button onClick={() => standbyItem(item)} title="Standby"><Clock3/></button>}
            {["pending", "standby"].includes(item.status) && <button className="take" disabled={!live || Boolean(workflow.holdStartedAt)} onClick={() => takeItem(item)} title="Take"><Play/></button>}
            {item.status === "live" && <button className="done" onClick={() => completeItem(item)} title="Complete"><CheckCircle2/></button>}
            {!(["complete", "skipped"].includes(item.status)) && <button onClick={() => skipItem(item)} title="Skip"><SkipForward/></button>}
            {!live && <button onClick={() => removeRundownItem(item.id)} title="Remove"><Trash2/></button>}
            {["complete", "skipped"].includes(item.status) && <b>{item.status}</b>}
          </span>
        </div>)}</div>
      </section>
    </div>}

    {phase === "post" && <div className="stage-workflow-phase">
      <section className="stage-workflow-summary">
        <span><b>{workflow.rundown.filter((item) => item.status === "complete").length}/{workflow.rundown.length}</b><small>SEGMENTS</small></span>
        <span><b>{workflow.deliverables.filter((item) => item.status === "complete").length}/{workflow.deliverables.length}</b><small>DELIVERED</small></span>
        <span><b>{workflow.activity.length}</b><small>AUDIT EVENTS</small></span>
        <span><b>{durationLabel(showElapsed)}</b><small>RUNTIME</small></span>
      </section>
      <section className="stage-workflow-section">
        <header><div><span className="eyebrow">POST-PRODUCTION</span><h3>Delivery ledger</h3></div><Archive/></header>
        <div className="stage-workflow-deliverables">{workflow.deliverables.map((item) => <button key={item.id} className={item.status} onClick={() => cycleDeliverable(item.id)}><span>{item.status === "complete" ? <Check/> : <Circle/>}</span><span><b>{item.label}</b><small>{item.owner} / DUE {new Date(item.dueAt).toLocaleDateString()}</small></span><strong>{item.status}</strong></button>)}</div>
      </section>
      <section className="stage-workflow-section stage-workflow-notes">
        <header><div><span className="eyebrow">HANDOFF NOTES</span><h3>Editorial, rights, and follow-up</h3></div><ListChecks/></header>
        <textarea value={workflow.postNotes} onChange={(event) => commit({ postNotes: event.target.value })} placeholder="Record edit decisions, incident references, rights restrictions, sponsor commitments, and owner handoffs." maxLength={4000}/>
      </section>
      <section className="stage-workflow-section stage-workflow-audit">
        <header><div><span className="eyebrow">ACTIVITY TRAIL</span><h3>Latest operator evidence</h3></div><b>{workflow.activity.length}</b></header>
        <div>{workflow.activity.slice(-12).reverse().map((item) => <span key={item.id}><time>{new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><b>{item.action}</b><small>{item.detail} / {item.actor}</small></span>)}</div>
      </section>
      <div className="stage-workflow-post-actions"><button onClick={exportReport}><Download/>EXPORT PRODUCTION REPORT</button><button className="primary" disabled={!archiveReady} onClick={() => commit({ status: "archived", phase: "post" }, "production.archived", "All deliverables completed; production record archived")}><Archive/>ARCHIVE RECORD</button></div>
    </div>}
  </div>;
}
