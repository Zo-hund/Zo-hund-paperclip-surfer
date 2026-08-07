import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, BookOpenCheck, Check, Circle, Clock3, Download, ExternalLink, GraduationCap, Pause, Play, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { competencies, contingencyPlans, emptyTrainingState, learnerProgress, readTrainingState, saveTrainingState, sessionProgress, setupChecks, trainingSegments, type PathfinderTrainingState } from "../pathfinder-training";

const kitUrl = "/resources/xrt-pathfinder-training-kit.pdf";
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function useTrainingSession() {
  const [state, setState] = useState<PathfinderTrainingState>(readTrainingState);
  const update = (change: (current: PathfinderTrainingState) => PathfinderTrainingState) => setState((current) => { const next = change(current); saveTrainingState(next); return next; });
  useEffect(() => { if (!state.running) return; const timer = window.setInterval(() => update((current) => current.remainingSeconds <= 1 ? { ...current, running: false, remainingSeconds: 0 } : { ...current, remainingSeconds: current.remainingSeconds - 1 }), 1000); return () => clearInterval(timer); }, [state.running]);
  return { state, update };
}

export function PathfinderTrainingMissionPage() {
  const { state, update } = useTrainingSession();
  const completed = learnerProgress(state);
  const toggle = (index: number) => update((current) => ({ ...current, competencies: current.competencies.map((row, rowIndex) => rowIndex === 0 ? row.map((value, itemIndex) => itemIndex === index ? !value : value) : row) }));
  const evidenceLabels = ["Explain the landscape in your own words", "Paste your three-day lesson outline", "Record your XR safety observation", "Describe your integration triangle activity", "Capture your teach-back feedback", "Write your Ambassador reflection", "Trainer certification note"];
  return <div className="page section-wrap pathfinder-training-page">
    <PageHeader eyebrow="XRT PATHFINDER / STAFF + EDUCATOR MISSION" title="Learn it. Build it. Teach it back." description="A guided three-hour mission that turns educator practice into verified KNOW, DO, and BE evidence." actions={<a className="button secondary" href={kitUrl} download><Download/>Training kit</a>}/>
    <section className="training-hero-strip"><div><b>9:00 AM - 12:00 PM</b><small>Black Koffee / August 7, 2026</small></div><div><b>{completed}/7</b><small>competencies verified</small></div><div><b>{Math.round(completed / competencies.length * 100)}%</b><small>mission progress</small></div><StatusPill tone={completed === competencies.length ? "green" : "gold"}>{completed === competencies.length ? "CERTIFIED" : "IN TRAINING"}</StatusPill></section>
    <div className="training-pillar-grid">{(["KNOW", "DO", "BE"] as const).map((pillar) => <section className={`training-pillar ${pillar.toLowerCase()}`} key={pillar}><span>{pillar}</span><h2>{pillar === "KNOW" ? "See the landscape" : pillar === "DO" ? "Build with your hands" : "Lead in your voice"}</h2>{trainingSegments.filter((segment) => segment.pillar === pillar).map((segment) => <div key={segment.id}><Clock3/><p><b>{segment.title}</b><small>{segment.start} - {segment.end} / {segment.outcome}</small></p></div>)}</section>)}</div>
    <section className="training-evidence"><div className="section-heading"><div><span className="eyebrow">MISSION EVIDENCE</span><h2>Complete the seven readiness checks</h2></div></div>{competencies.map((item, index) => <article className={state.competencies[0][index] ? "complete" : ""} key={item}><button className="training-check" onClick={() => toggle(index)} aria-label={`Mark ${item} complete`}>{state.competencies[0][index] ? <Check/> : <Circle/>}</button><div><h3>{index + 1}. {item}</h3><textarea value={state.evidence[index]} placeholder={evidenceLabels[index]} onChange={(event) => update((current) => ({ ...current, evidence: current.evidence.map((value, itemIndex) => itemIndex === index ? event.target.value : value) }))}/></div></article>)}</section>
    <section className="training-finish"><GraduationCap/><div><span className="eyebrow">AMBASSADOR RELEASE</span><h2>{completed === competencies.length ? "Your evidence is ready for trainer sign-off." : `${competencies.length - completed} competencies remain.`}</h2><p>Certification is issued only after a trainer verifies the teach-back, reflection, and supervised XR practice.</p></div><Link className="button primary" to="/training/pathfinder/facilitator">Open facilitator view<ExternalLink/></Link></section>
  </div>;
}

export function PathfinderFacilitatorPage() {
  const { state, update } = useTrainingSession();
  const segment = trainingSegments[state.activeSegment];
  const setupReady = state.setup.every(Boolean);
  const total = sessionProgress(state);
  const selectSegment = (index: number) => update((current) => ({ ...current, activeSegment: index, running: false, remainingSeconds: trainingSegments[index].minutes * 60 }));
  const reset = () => { if (window.confirm("Reset the complete Pathfinder training session?")) update(() => emptyTrainingState()); };
  return <div className="page section-wrap pathfinder-facilitator-page">
    <PageHeader eyebrow="XRT PATHFINDER / FACILITATOR CONSOLE" title="Run the room with two voices and one rhythm." description="Control timing, setup, learner evidence, contingencies, and certification from a single live surface." actions={<><a className="button secondary" href={kitUrl} target="_blank" rel="noreferrer"><Download/>Print kit</a><button className="icon-button" title="Reset session" onClick={reset}><RotateCcw/></button></>}/>
    <section className="facilitator-live"><div><span className={`live-dot ${state.running ? "" : "paused"}`}/><p><small>{segment.pillar} / {segment.start} - {segment.end}</small><b>{segment.title}</b></p></div><strong>{clock(state.remainingSeconds)}</strong><button className="button primary" disabled={!setupReady} onClick={() => update((current) => ({ ...current, running: !current.running, startedAt: current.startedAt || Date.now() }))}>{state.running ? <Pause/> : <Play/>}{state.running ? "Pause" : "Run block"}</button></section>
    {!setupReady && <p className="training-alert"><ShieldCheck/>Complete the pre-session setup before starting the live timer.</p>}
    <div className="facilitator-layout"><section className="facilitator-agenda"><div className="section-heading"><div><span className="eyebrow">RUN OF TRAINING</span><h2>12 timed blocks</h2></div><StatusPill tone="cyan">{state.activeSegment + 1}/12</StatusPill></div>{trainingSegments.map((item, index) => <button className={index === state.activeSegment ? "active" : index < state.activeSegment ? "done" : ""} onClick={() => selectSegment(index)} key={item.id}><span>{item.start}</span><i>{item.pillar}</i><p><b>{item.title}</b><small>{item.outcome}</small></p>{index < state.activeSegment ? <Check/> : <Clock3/>}</button>)}</section>
    <aside className="facilitator-setup"><span className="eyebrow">8:30 AM PRE-FLIGHT</span><h2>{state.setup.filter(Boolean).length}/{setupChecks.length} ready</h2>{setupChecks.map((item, index) => <label key={item}><input type="checkbox" checked={state.setup[index]} onChange={() => update((current) => ({ ...current, setup: current.setup.map((value, itemIndex) => itemIndex === index ? !value : value) }))}/><span>{item}</span></label>)}<div className="trainer-roles"><p><b>Tech Lead</b><small>Content, AI/XR setup, accuracy, opening + closing</small></p><p><b>Jr Lead</b><small>Timing, logistics, hospitality, feedback + roster</small></p></div></aside></div>
    <section className="facilitator-roster"><div className="section-heading"><div><span className="eyebrow">LEARNER ROSTER + SIGN-OFF</span><h2>{total}/21 competency checks</h2></div></div>{state.learners.map((learner, learnerIndex) => <article key={learnerIndex}><header><input value={learner} onChange={(event) => update((current) => ({ ...current, learners: current.learners.map((value, index) => index === learnerIndex ? event.target.value : value) }))}/><b>{learnerProgress(state, learnerIndex)}/7</b></header><div>{competencies.map((item, competencyIndex) => <label title={item} key={item}><input type="checkbox" checked={state.competencies[learnerIndex][competencyIndex]} onChange={() => update((current) => ({ ...current, competencies: current.competencies.map((row, index) => index === learnerIndex ? row.map((value, checkIndex) => checkIndex === competencyIndex ? !value : value) : row) }))}/><span>{competencyIndex + 1}</span></label>)}</div><button className="button secondary full" disabled={learnerProgress(state, learnerIndex) !== competencies.length} onClick={() => update((current) => ({ ...current, certified: current.certified.map((value, index) => index === learnerIndex ? true : value) }))}><BadgeCheck/>{state.certified[learnerIndex] ? "Certificate issued" : "Issue certificate"}</button></article>)}</section>
    <section className="contingency-grid">{contingencyPlans.map((plan) => <article key={plan.title}><BookOpenCheck/><div><h3>{plan.title}</h3><p>{plan.action}</p></div></article>)}</section>
  </div>;
}
