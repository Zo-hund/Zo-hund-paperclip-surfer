import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, BookOpenCheck, CalendarClock, Check, CircleDollarSign, ClipboardCheck, GraduationCap, LockKeyhole, Play, Radio, Rocket, Save, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader, StatusPill } from "../components";
import { useMemberAuth } from "../member-auth";
import { getActiveTenant } from "../operations";
import { defaultLmsPrograms, enrollLmsLearner, lmsStages, loadLms, moduleUnlocked, nextModule, programProgress, saveLmsProgram, updateLmsProgress, type LmsEnrollment, type LmsProgram } from "../lms";

function destination(module: LmsProgram["modules"][number]) {
  if (module.missionId) return `/mission/${module.missionId}/pre`;
  if (module.liveRoom === "AMXSTAGE") return "/venues/theater?room=AMXSTAGE";
  if (module.liveRoom) return `/nexus?room=${encodeURIComponent(module.liveRoom)}`;
  if (module.stage === "prove") return "/wallet";
  if (module.stage === "earn") return "/marketplace/earn";
  return "/missions";
}

function useLmsState() {
  const auth = useMemberAuth();
  const tenantId = getActiveTenant();
  const learnerId = auth.session?.user.id || "local-learner";
  const learnerName = auth.profile?.display_name || "AMX Learner";
  const [programs, setPrograms] = useState<LmsProgram[]>(defaultLmsPrograms);
  const [enrollments, setEnrollments] = useState<LmsEnrollment[]>([]);
  const [notice, setNotice] = useState("Loading learning state...");
  const refresh = async () => {
    try { const result = await loadLms(tenantId, learnerId); setPrograms(result.programs.length ? result.programs : defaultLmsPrograms); setEnrollments(result.enrollments); setNotice(result.persisted ? "Learning record synced" : "Preview learning record"); }
    catch { setPrograms(defaultLmsPrograms); setNotice("Preview curriculum active"); }
  };
  useEffect(() => { void refresh(); }, [tenantId, learnerId]);
  return { auth, tenantId, learnerId, learnerName, programs, setPrograms, enrollments, setEnrollments, notice, refresh };
}

export function LearnModePage() {
  const state = useLmsState();
  const [selectedId, setSelectedId] = useState(state.programs[0]?.id || "");
  useEffect(() => { if (!state.programs.some((item) => item.id === selectedId)) setSelectedId(state.programs[0]?.id || ""); }, [state.programs, selectedId]);
  const program = state.programs.find((item) => item.id === selectedId) || state.programs[0];
  const enrollment = state.enrollments.find((item) => item.programId === program?.id) || null;
  const next = program ? nextModule(program, enrollment) : null;
  const join = async () => { if (!program) return; const result = await enrollLmsLearner({ tenantId: state.tenantId, programId: program.id, learnerId: state.learnerId, learnerName: state.learnerName }); state.setEnrollments((items) => [...items.filter((item) => item.id !== result.enrollment.id), result.enrollment]); };
  const complete = async (moduleId: string) => { if (!enrollment) return; const result = await updateLmsProgress(enrollment, moduleId, "complete"); state.setEnrollments((items) => items.map((item) => item.id === result.enrollment.id ? result.enrollment : item)); };
  if (!program) return <div className="page section-wrap"><PageHeader eyebrow="LEARN MODE" title="No programs published" description="An operator can publish the first program from Learning Control."/></div>;
  return <div className="page section-wrap lms-page">
    <PageHeader eyebrow="AMX LEARN MODE / LMS" title="Learn. Practice. Prove. Go live. Earn." description="One pathway connects training, workshops, market simulations, verified work, live showcases, and approved earning." actions={<Link className="button secondary" to="/missions"><GraduationCap/>Mission catalog</Link>}/>
    <section className="lms-status-band"><span><Radio/><b>{state.notice}</b></span><span><BookOpenCheck/><b>{state.programs.length} programs</b></span><span><BadgeCheck/><b>{enrollment?.evidenceCount || 0} proofs</b></span><span><CircleDollarSign/><b>${((enrollment?.earnedCents || 0) / 100).toFixed(2)} earned</b></span></section>
    <div className="lms-layout"><aside className="lms-program-list"><span className="eyebrow">YOUR PROGRAMS</span>{state.programs.filter((item) => item.status === "published").map((item) => { const record = state.enrollments.find((entry) => entry.programId === item.id) || null; return <button className={item.id === program.id ? "active" : ""} onClick={() => setSelectedId(item.id)} key={item.id}><span>{item.mode.replace("_", " ")}</span><b>{item.title}</b><progress value={programProgress(item, record)} max="100"/><small>{programProgress(item, record)}% complete</small></button>; })}</aside>
      <section className="lms-program-main"><header><div><span className="eyebrow">{program.mode.replace("_", " ")} / {program.facilitator}</span><h2>{program.title}</h2><p>{program.summary}</p></div><StatusPill tone={enrollment?.status === "complete" ? "green" : enrollment ? "cyan" : "gold"}>{enrollment?.status || "NOT ENROLLED"}</StatusPill></header>
        {!enrollment ? <div className="lms-enroll"><Users/><div><h3>Join this learning runway</h3><p>Enrollment activates module unlocks, attendance, evidence, facilitator sign-off, and earning eligibility.</p></div><button className="button primary" onClick={() => void join()}>Enroll now<ArrowRight/></button></div> : next && <div className="lms-next"><Rocket/><div><span className="eyebrow">NEXT ACTION / {next.stage}</span><h3>{next.title}</h3><p>{next.summary}</p></div><Link className="button primary" to={destination(next)}><Play/>Open</Link></div>}
        <div className="lms-stage-flow">{lmsStages.map((stage) => <article key={stage.id}><header><span>{stage.label}</span><small>{stage.detail}</small></header>{program.modules.filter((module) => module.stage === stage.id).map((module) => { const done = Boolean(enrollment?.completedModuleIds.includes(module.id)); const unlocked = moduleUnlocked(module, enrollment); const learnerCanComplete = ["learn", "practice"].includes(module.stage); return <div className={`${done ? "complete" : ""} ${!unlocked ? "locked" : ""}`} key={module.id}>{done ? <Check/> : unlocked ? <Play/> : <LockKeyhole/>}<span><b>{module.title}</b><small>{module.durationMinutes} min · {module.rewardXp} XP{module.rewardCents ? ` · $${(module.rewardCents / 100).toFixed(2)}` : ""}{unlocked && !done && !learnerCanComplete ? " · approval required" : ""}</small></span>{unlocked && !done && enrollment && (learnerCanComplete ? <button className="icon-button" title="Mark module complete" aria-label={`Mark ${module.title} complete`} onClick={() => void complete(module.id)}><ClipboardCheck/></button> : <Link className="icon-button" title={`Open ${module.title}`} aria-label={`Open ${module.title}`} to={destination(module)}><ArrowRight/></Link>)}</div>; })}</article>)}</div>
      </section></div>
  </div>;
}

export function LearningControlPage() {
  const state = useLmsState();
  const [selectedId, setSelectedId] = useState(state.programs[0]?.id || "");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!state.programs.some((item) => item.id === selectedId)) setSelectedId(state.programs[0]?.id || ""); }, [state.programs, selectedId]);
  const program = state.programs.find((item) => item.id === selectedId) || state.programs[0];
  const roster = useMemo(() => state.enrollments.filter((item) => item.programId === program?.id), [state.enrollments, program?.id]);
  const patchProgram = (patch: Partial<LmsProgram>) => state.setPrograms((items) => items.map((item) => item.id === program.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
  const save = async () => { try { const result = await saveLmsProgram(program); state.setPrograms((items) => items.map((item) => item.id === result.program.id ? result.program : item)); setNotice("Program saved and available to the tenant."); } catch (error) { setNotice(error instanceof Error ? error.message : "Program could not be saved"); } };
  const updateRoster = async (enrollment: LmsEnrollment, action: "complete" | "attendance", moduleId: string, value = 1) => { try { const result = await updateLmsProgress(enrollment, moduleId, action, value); state.setEnrollments((items) => items.map((item) => item.id === result.enrollment.id ? result.enrollment : item)); setNotice(action === "attendance" ? "Attendance added." : "Module approved and the next stage evaluated."); } catch (error) { setNotice(error instanceof Error ? error.message : "Roster update failed"); } };
  if (!program) return <div className="page section-wrap"><PageHeader eyebrow="LEARNING CONTROL" title="Create the first program"/></div>;
  return <div className="page section-wrap lms-page lms-control-page"><PageHeader eyebrow="OPERATOR / LEARNING CONTROL" title="Program operations" description="Author pathways, manage cohorts, control drip unlocks, verify evidence, promote live work, and release approved earnings." actions={<><Link className="button secondary" to="/learn"><BookOpenCheck/>Learner view</Link><button className="button primary" onClick={() => void save()}><Save/>Save program</button></>}/>
    {notice && <div className="lms-notice" role="status">{notice}</div>}
    <section className="lms-control-grid"><label>Program<select value={program.id} onChange={(event) => setSelectedId(event.target.value)}>{state.programs.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Title<input value={program.title} onChange={(event) => patchProgram({ title: event.target.value })}/></label><label>Format<select value={program.mode} onChange={(event) => patchProgram({ mode: event.target.value as LmsProgram["mode"] })}><option value="training">Training</option><option value="workshop">Workshop</option><option value="market_sim">Market simulation</option></select></label><label>Status<select value={program.status} onChange={(event) => patchProgram({ status: event.target.value as LmsProgram["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label className="span-2">Summary<textarea value={program.summary} onChange={(event) => patchProgram({ summary: event.target.value })}/></label></section>
    <section className="lms-ops-metrics"><div><b>{roster.length}</b><span>Enrolled</span></div><div><b>{roster.filter((item) => item.status === "complete").length}</b><span>Completed</span></div><div><b>{roster.reduce((sum, item) => sum + item.attendanceMinutes, 0)}</b><span>Attendance minutes</span></div><div><b>{roster.reduce((sum, item) => sum + item.evidenceCount, 0)}</b><span>Evidence records</span></div><div><b>${(roster.reduce((sum, item) => sum + item.earnedCents, 0) / 100).toFixed(2)}</b><span>Released earnings</span></div></section>
    <section className="lms-module-table"><header><div><span className="eyebrow">CURRICULUM + DRIP</span><h2>Program modules</h2></div><CalendarClock/></header>{program.modules.map((module, index) => <article key={module.id}><b>{String(index + 1).padStart(2, "0")}</b><div><span>{module.stage}</span><h3>{module.title}</h3><p>{module.summary}</p></div><label>Unlock after<select value={module.unlockAfterModuleId || ""} onChange={(event) => patchProgram({ modules: program.modules.map((item) => item.id === module.id ? { ...item, unlockAfterModuleId: event.target.value || null } : item) })}><option value="">Immediate</option>{program.modules.slice(0, index).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Release date<input type="datetime-local" value={module.availableAt?.slice(0, 16) || ""} onChange={(event) => patchProgram({ modules: program.modules.map((item) => item.id === module.id ? { ...item, availableAt: event.target.value ? new Date(event.target.value).toISOString() : null } : item) })}/></label></article>)}</section>
    <section className="lms-roster"><header><div><span className="eyebrow">COHORT / REAL-TIME STATE</span><h2>Roster and outcomes</h2></div><Users/></header>{roster.length ? roster.map((item) => { const pending = nextModule(program, item); return <article key={item.id}><div><b>{item.learnerName}</b><small>{pending ? `Next: ${pending.title}` : "Path complete"}</small></div><span>{programProgress(program, item)}%</span><span>{item.attendanceMinutes} min</span><span>{item.evidenceCount} proofs</span><div className="lms-roster-actions"><button className="button secondary compact" disabled={!pending} onClick={() => pending && void updateRoster(item, "attendance", pending.id, 30)}>+30 min</button><button className="button primary compact" disabled={!pending} onClick={() => pending && void updateRoster(item, "complete", pending.id)}>{pending?.stage === "prove" ? "Approve proof" : pending?.stage === "live" ? "Approve live" : pending?.stage === "earn" ? "Release earn" : "Approve"}</button></div></article>; }) : <p>No learners enrolled yet. Published programs appear immediately in Learn Mode.</p>}</section>
  </div>;
}
