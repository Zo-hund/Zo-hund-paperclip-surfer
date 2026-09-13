import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, BookOpenCheck, Check, Circle, Clock3, CloudOff, Download, GraduationCap, LockKeyhole, Pause, Play, RotateCcw, ShieldCheck, UnlockKeyhole, Upload, Users, WandSparkles, Wifi } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, QRCodeCard, StatusPill } from "../components";
import { useMemberAuth } from "../member-auth";
import { getActiveTenant } from "../operations";
import { issueNamedPathfinderProof } from "../platform";
import { certifyLiveParticipant, createLiveTraining, joinLiveTraining, loadLiveTraining, subscribeLiveTraining, updateLiveParticipant, updateLiveTraining, type LiveTrainingParticipant, type LiveTrainingSession } from "../pathfinder-training-live";
import { competencies, contingencyPlans, emptyTrainingState, evidenceStarters, parsePathfinderProgram, pathfinderPrograms, readTrainingState, saveTrainingState, setupChecks, trackUnlockState, trainingSegments, type PathfinderProgram, type PathfinderTrainingState } from "../pathfinder-training";

const kitUrl = "/resources/xrt-pathfinder-training-kit.pdf";
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const sessionState = (session: LiveTrainingSession, participants: LiveTrainingParticipant[]): PathfinderTrainingState => ({
  activeSegment: session.active_segment, running: session.running, startedAt: session.started_at ? Date.parse(session.started_at) : null,
  remainingSeconds: session.remaining_seconds, setup: session.setup, learners: participants.map((item) => item.display_name),
  evidence: participants[0]?.evidence || competencies.map(() => ""), competencies: participants.map((item) => item.competencies),
  certified: participants.map((item) => Boolean(item.certified_at)),
});

function useTrainingSession(mode: "learner" | "facilitator") {
  const auth = useMemberAuth();
  const [state, setState] = useState<PathfinderTrainingState>(readTrainingState);
  const [session, setSession] = useState<LiveTrainingSession | null>(null);
  const [participants, setParticipants] = useState<LiveTrainingParticipant[]>([]);
  const [notice, setNotice] = useState("Loading live session...");
  const tenantId = getActiveTenant();
  const refresh = useCallback(async () => {
    if (!auth.session || !auth.profile) return;
    try {
      const result = await loadLiveTraining(tenantId);
      let liveSession = result.session;
      let roster = result.participants;
      if (!liveSession && mode === "facilitator") liveSession = await createLiveTraining(tenantId, auth.session.user.id);
      if (liveSession && mode === "learner" && !roster.some((item) => item.user_id === auth.session?.user.id)) {
        const joined = await joinLiveTraining(liveSession.id, auth.session.user.id, auth.profile.display_name);
        roster = [...roster, joined];
      }
      setSession(liveSession); setParticipants(roster);
      if (liveSession) { const next = sessionState(liveSession, roster); setState(next); saveTrainingState(next); setNotice(navigator.onLine ? "Live sync connected" : "Offline copy active"); }
      else setNotice("Waiting for a facilitator to open the live session");
    } catch { setNotice("Offline copy active; changes will remain on this device"); }
  }, [auth.session?.user.id, auth.profile?.display_name, mode, tenantId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!session) return; let close = () => {}; void subscribeLiveTraining(session.id, refresh).then((unsubscribe) => { close = unsubscribe; }); return () => close(); }, [session?.id, refresh]);
  const update = (change: (current: PathfinderTrainingState) => PathfinderTrainingState) => setState((current) => {
    const next = change(current); saveTrainingState(next);
    if (session && mode === "facilitator") void updateLiveTraining(session, { active_segment: next.activeSegment, running: next.running, started_at: next.startedAt ? new Date(next.startedAt).toISOString() : null, remaining_seconds: next.remainingSeconds, setup: next.setup }).then(setSession).catch(() => setNotice("Live update queued on this device"));
    if (session && mode === "learner") {
      const participant = participants.find((item) => item.user_id === auth.session?.user.id);
      if (participant) void updateLiveParticipant(participant, { evidence: next.evidence, competencies: next.competencies[0] }).then((saved) => setParticipants((items) => items.map((item) => item.id === saved.id ? saved : item))).catch(() => setNotice("Evidence saved offline"));
    }
    return next;
  });
  useEffect(() => { if (!state.running || mode !== "facilitator") return; const timer = window.setInterval(() => update((current) => current.remainingSeconds <= 1 ? { ...current, running: false, remainingSeconds: 0 } : { ...current, remainingSeconds: current.remainingSeconds - 1 }), 1000); return () => clearInterval(timer); }, [state.running, mode, session?.revision]);
  return { state, update, session, participants, notice, refresh };
}

export function PathfinderTrainingMissionPage() {
  const { state, update, session, notice } = useTrainingSession("learner");
  const completed = state.competencies[0]?.filter(Boolean).length || 0;
  const toggle = (index: number) => update((current) => { const checked = !current.competencies[0]?.[index]; return { ...current, evidence: competencies.map((_, itemIndex) => itemIndex === index && checked && !current.evidence[itemIndex]?.trim() ? evidenceStarters[itemIndex] : current.evidence[itemIndex] || ""), competencies: [competencies.map((_, itemIndex) => itemIndex === index ? checked : Boolean(current.competencies[0]?.[itemIndex]))] }; });
  const evidenceLabels = ["Explain the landscape in your own words", "Paste your three-day lesson outline", "Record your XR safety observation", "Describe your integration triangle activity", "Capture your teach-back feedback", "Write your Ambassador reflection", "Trainer certification note"];
  return <div className="page section-wrap pathfinder-training-page">
    <PageHeader eyebrow="XRT PATHFINDER / STAFF + EDUCATOR MISSION" title="Learn it. Build it. Teach it back." description="A guided three-hour mission that turns educator practice into verified KNOW, DO, and BE evidence." actions={<a className="button secondary" href={kitUrl} download><Download/>Training kit</a>}/>
    <div className="training-sync-status">{session ? <Wifi/> : <CloudOff/>}<b>{notice}</b>{session && <code>SESSION {session.session_code}</code>}</div>
    <section className="training-hero-strip"><div><b>9:00 AM - 12:00 PM</b><small>Live educator cohort</small></div><div><b>{completed}/7</b><small>competencies verified</small></div><div><b>{Math.round(completed / competencies.length * 100)}%</b><small>mission progress</small></div><StatusPill tone={completed === competencies.length ? "green" : "gold"}>{completed === competencies.length ? "READY FOR SIGN-OFF" : "IN TRAINING"}</StatusPill></section>
    <div className="training-pillar-grid">{(["KNOW", "DO", "BE"] as const).map((pillar) => <section className={`training-pillar ${pillar.toLowerCase()}`} key={pillar}><span>{pillar}</span><h2>{pillar === "KNOW" ? "See the landscape" : pillar === "DO" ? "Build with your hands" : "Lead in your voice"}</h2>{trainingSegments.filter((segment) => segment.pillar === pillar).map((segment) => <div key={segment.id}><Clock3/><p><b>{segment.title}</b><small>{segment.start} - {segment.end} / {segment.outcome}</small></p></div>)}</section>)}</div>
    <section className="pathfinder-track"><div className="section-heading"><div><span className="eyebrow">DRIP SKILL TRACK</span><h2>Modules unlock as your evidence grows</h2></div><StatusPill tone="cyan">{trackUnlockState(completed).filter((item) => item.unlocked).length}/6 OPEN</StatusPill></div><div className="pathfinder-track-flow">{trackUnlockState(completed).map((item, index) => <article className={`${item.unlocked ? "unlocked" : "locked"} ${item.completed ? "complete" : ""}`} key={item.id}><header><span>{String(index + 1).padStart(2, "0")}</span><i>{item.pillar}</i>{item.unlocked ? <UnlockKeyhole/> : <LockKeyhole/>}</header><small>{item.kind.toUpperCase()} / {item.mode.toUpperCase()}</small><h3>{item.title}</h3><p>{item.outcome}</p>{item.unlocked ? <Link className="button secondary full" to={item.route}>{item.completed ? <Check/> : <Play/>}{item.completed ? "Revisit" : "Enter"}</Link> : <div className="track-requirement">Complete {item.requiredCompetencies} competencies</div>}</article>)}</div></section>
    <section className="training-evidence"><div className="section-heading"><div><span className="eyebrow">MISSION EVIDENCE</span><h2>Complete the seven readiness checks</h2></div></div>{competencies.map((item, index) => <article className={state.competencies[0]?.[index] ? "complete" : ""} key={item}><button className="training-check" onClick={() => toggle(index)} aria-label={`Mark ${item} complete`}>{state.competencies[0]?.[index] ? <Check/> : <Circle/>}</button><div><h3>{index + 1}. {item}</h3><textarea value={state.evidence[index] || ""} placeholder={evidenceLabels[index]} onChange={(event) => update((current) => ({ ...current, evidence: competencies.map((_, itemIndex) => itemIndex === index ? event.target.value : current.evidence[itemIndex] || "") }))}/></div></article>)}</section>
    <section className="training-finish"><GraduationCap/><div><span className="eyebrow">AMBASSADOR RELEASE</span><h2>{completed === competencies.length ? "Your evidence is ready for trainer sign-off." : `${competencies.length - completed} competencies remain.`}</h2><p>Your named OPPRRC certificate appears in Proof Vault after trainer verification.</p></div></section>
  </div>;
}

export function PathfinderFacilitatorPage() {
  const { state, update, session, participants, notice, refresh } = useTrainingSession("facilitator");
  const segment = trainingSegments[state.activeSegment] || trainingSegments[0];
  const setupReady = state.setup.every(Boolean);
  const total = participants.reduce((sum, item) => sum + item.competencies.filter(Boolean).length, 0);
  const [program, setProgram] = useState<PathfinderProgram>(pathfinderPrograms[0]);
  const [programNotice, setProgramNotice] = useState("");
  const applyProgram = (next: PathfinderProgram) => { setProgram(next); update((current) => ({ ...current, setup: next.setup })); setProgramNotice(`${next.name} loaded for ${next.learnerTarget} learners.`); };
  const uploadProgram = async (file?: File) => { if (!file) return; try { applyProgram(parsePathfinderProgram(await file.text())); } catch (error) { setProgramNotice(error instanceof Error ? error.message : "Program could not be loaded."); } };
  const selectSegment = (index: number) => update((current) => ({ ...current, activeSegment: index, running: false, remainingSeconds: trainingSegments[index].minutes * 60 }));
  const certify = async (participant: LiveTrainingParticipant) => { const proofId = `opprrc-${crypto.randomUUID().slice(0, 8)}`; await certifyLiveParticipant(participant.id, proofId); issueNamedPathfinderProof(participant.user_id, participant.display_name, competencies, proofId); await refresh(); };
  const reset = () => { if (window.confirm("Reset timing and setup for this Pathfinder session?")) update(() => ({ ...emptyTrainingState(), learners: state.learners, competencies: state.competencies, certified: state.certified })); };
  return <div className="page section-wrap pathfinder-facilitator-page">
    <PageHeader eyebrow="XRT PATHFINDER / FACILITATOR CONSOLE" title="Run the room with two voices and one rhythm." description="Live timing, learner evidence, role-governed sign-off, and named OPPRRC certification." actions={<><a className="button secondary" href={kitUrl} target="_blank" rel="noreferrer"><Download/>Print kit</a><button className="icon-button" title="Reset session" onClick={reset}><RotateCcw/></button></>}/>
    <section className="training-program-loader"><div><WandSparkles/><span><b>Quick program deployment</b><small>{program.venue} / {program.schedule}</small></span></div><select aria-label="Program preset" value={program.id} onChange={(event) => applyProgram(pathfinderPrograms.find((item) => item.id === event.target.value) || pathfinderPrograms[0])}>{pathfinderPrograms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><label className="button secondary"><Upload/>Upload program<input type="file" accept="application/json,.json" onChange={(event) => void uploadProgram(event.target.files?.[0])}/></label>{programNotice && <p role="status">{programNotice}</p>}</section>
    <section className="training-launch-panel"><div><span className="eyebrow">MULTI-DEVICE SESSION</span><h2>{session ? session.session_code : "CREATING"}</h2><p>{notice}</p></div>{session && <QRCodeCard route={`/missions/pathfinder-educator?session=${session.session_code}`} title={`Pathfinder ${session.session_code}`}/>}</section>
    <section className="facilitator-live"><div><span className={`live-dot ${state.running ? "" : "paused"}`}/><p><small>{segment.pillar} / {segment.start} - {segment.end}</small><b>{segment.title}</b></p></div><strong>{clock(state.remainingSeconds)}</strong><button className="button primary" disabled={!setupReady || !session} onClick={() => update((current) => ({ ...current, running: !current.running, startedAt: current.startedAt || Date.now() }))}>{state.running ? <Pause/> : <Play/>}{state.running ? "Pause" : "Run block"}</button></section>
    {!setupReady && <p className="training-alert"><ShieldCheck/>Complete pre-flight before starting the timer.</p>}
    <div className="facilitator-layout"><section className="facilitator-agenda"><div className="section-heading"><div><span className="eyebrow">RUN OF TRAINING</span><h2>12 timed blocks</h2></div><StatusPill tone="cyan">{state.activeSegment + 1}/12</StatusPill></div>{trainingSegments.map((item, index) => <button className={index === state.activeSegment ? "active" : index < state.activeSegment ? "done" : ""} onClick={() => selectSegment(index)} key={item.id}><span>{item.start}</span><i>{item.pillar}</i><p><b>{item.title}</b><small>{item.outcome}</small></p>{index < state.activeSegment ? <Check/> : <Clock3/>}</button>)}</section>
    <aside className="facilitator-setup"><span className="eyebrow">8:30 AM PRE-FLIGHT</span><h2>{state.setup.filter(Boolean).length}/{setupChecks.length} ready</h2>{setupChecks.map((item, index) => <label key={item}><input type="checkbox" checked={state.setup[index]} onChange={() => update((current) => ({ ...current, setup: current.setup.map((value, itemIndex) => itemIndex === index ? !value : value) }))}/><span>{item}</span></label>)}</aside></div>
    <section className="facilitator-roster"><div className="section-heading"><div><span className="eyebrow">LIVE ROSTER + SIGN-OFF</span><h2>{total}/{Math.max(1, participants.length) * 7} competency checks</h2></div><StatusPill tone={participants.length ? "green" : "gold"}>{participants.length} CONNECTED</StatusPill></div>{participants.length ? participants.map((learner) => <article key={learner.id}><header><b>{learner.display_name}</b><strong>{learner.competencies.filter(Boolean).length}/7</strong></header><div>{learner.competencies.map((done, index) => <span className={done ? "complete" : ""} title={competencies[index]} key={competencies[index]}>{done ? <Check/> : index + 1}</span>)}</div><button className="button secondary full" disabled={learner.competencies.some((item) => !item) || Boolean(learner.certified_at)} onClick={() => void certify(learner)}><BadgeCheck/>{learner.certified_at ? `Issued ${new Date(learner.certified_at).toLocaleDateString()}` : "Issue named certificate"}</button></article>) : <div className="training-empty-roster"><Users/><h3>Waiting for learners</h3><p>Ask learners to scan the session QR and sign in.</p></div>}</section>
    {participants.length > 0 && <section className="facilitator-track-summary"><span className="eyebrow">COHORT UNLOCK MAP</span>{participants.map((learner) => { const completed = learner.competencies.filter(Boolean).length; const open = trackUnlockState(completed).filter((item) => item.unlocked).length; return <div key={learner.id}><b>{learner.display_name}</b><span>{open}/6 modules and Pods unlocked</span><progress max="6" value={open}/></div>; })}</section>}
    <section className="contingency-grid">{contingencyPlans.map((plan) => <article key={plan.title}><BookOpenCheck/><div><h3>{plan.title}</h3><p>{plan.action}</p></div></article>)}</section>
  </div>;
}
