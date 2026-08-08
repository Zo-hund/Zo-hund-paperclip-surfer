import { useMemo, useState } from "react";
import { BadgeCheck, BriefcaseBusiness, CalendarClock, CheckCircle2, CircleDollarSign, Clock3, LockKeyhole, ShieldCheck, Sparkles, Users } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { balancedTeam, balancedTeamCost, dailyCapacity, earnerLevels, eventPay, fundingPlan, marketRuns, modes, placementTargets, weeklyCapacity, workloadSchedules, type EarnerMode } from "../skill-market";

const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const storageKey = "amx_skill_market_application_v1";

type PlacementDraft = {
  levelId: number;
  scheduleId: string;
  mode: EarnerMode;
  runId: string;
  contractValue: number;
  simulationApproved: boolean;
  supervisorApproved: boolean;
};

const readDraft = (): Partial<PlacementDraft> => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    return {};
  }
};

export function SkillMarketPage() {
  const [draft] = useState(readDraft);
  const [levelId, setLevelId] = useState(draft.levelId || 1);
  const [scheduleId, setScheduleId] = useState(draft.scheduleId || "starter");
  const [mode, setMode] = useState<EarnerMode>(draft.mode || "solo");
  const [runId, setRunId] = useState(draft.runId || "event-1");
  const [contractValue, setContractValue] = useState(draft.contractValue ?? 2500);
  const [simulationApproved, setSimulationApproved] = useState(draft.simulationApproved || false);
  const [supervisorApproved, setSupervisorApproved] = useState(draft.supervisorApproved || false);
  const [notice, setNotice] = useState("");
  const level = earnerLevels[levelId - 1];
  const schedule = workloadSchedules.find((item) => item.id === scheduleId) || workloadSchedules[0];
  const funding = useMemo(() => fundingPlan(contractValue), [contractValue]);
  const ready = funding.funded && simulationApproved && supervisorApproved;
  const apply = () => {
    const record = { levelId, scheduleId, mode, runId, contractValue, simulationApproved, supervisorApproved, ready, updatedAt: new Date().toISOString() };
    localStorage.setItem(storageKey, JSON.stringify(record));
    setNotice(ready ? "Placement request saved for operator scheduling and proof review." : "Draft saved. Complete every release gate before live placement.");
  };

  return <div className="page section-wrap skill-market-page">
    <PageHeader eyebrow="AMX SKILL MARKET / EARNER BLOCK" title="Train in simulation. Deliver live. Build verified income." description="Four daily market runs connect certified skill, approved work hours, human supervision, proof, and funded placement. Published rates are gross capacity, not guaranteed income." actions={<StatusPill tone="green">12 LIVE MARKET HOURS</StatusPill>}/>

    <section className="skill-market-status"><div><CalendarClock/><span><b>DAY MARKET</b><small>9:00 AM - 4:00 PM</small></span></div><div><Clock3/><span><b>NIGHT MARKET</b><small>5:00 PM - 12:00 AM</small></span></div><div><Users/><span><b>10-PERSON BLOCK</b><small>Balanced multi-level team</small></span></div><div><ShieldCheck/><span><b>HUMAN RELEASE</b><small>Required before live work</small></span></div></section>

    <div className="skill-market-layout"><section className="market-console">
      <div className="section-heading"><div><span className="eyebrow">PLACEMENT BUILDER</span><h2>Configure your earning run</h2></div><StatusPill tone={ready ? "green" : "gold"}>{ready ? "READY FOR REVIEW" : "GATES OPEN"}</StatusPill></div>
      <label>Earning level<select value={levelId} onChange={(event) => setLevelId(Number(event.target.value))}>{earnerLevels.map((item) => <option value={item.id} key={item.id}>Level {item.id} / {item.name} / {money(item.rate)}/hr</option>)}</select></label>
      <label>Workload guardrail<select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>{workloadSchedules.map((item) => <option value={item.id} key={item.id}>{item.name} / {item.hours} paid hours</option>)}</select></label>
      <div className="market-run-grid">{marketRuns.map((run) => <button className={runId === run.id ? "active" : ""} onClick={() => setRunId(run.id)} key={run.id}><span>{run.period}</span><b>{run.label}</b><small>{run.window}</small></button>)}</div>
      <div className="market-mode-control" aria-label="Participant mode">{modes.map((item) => <button className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>{item}</button>)}</div>
      <label>Contracted event revenue<input type="number" min="0" step="100" value={contractValue} onChange={(event) => setContractValue(Math.max(0, Number(event.target.value)))}/><small>Events cannot open below the funded minimum.</small></label>
      <div className="release-gates"><label><input type="checkbox" checked={simulationApproved} onChange={(event) => setSimulationApproved(event.target.checked)}/><span><Sparkles/><b>Simulation approved</b><small>Required skill run and evidence completed</small></span></label><label><input type="checkbox" checked={supervisorApproved} onChange={(event) => setSupervisorApproved(event.target.checked)}/><span><BadgeCheck/><b>Human supervisor release</b><small>Hours, role, safety, and assignment approved</small></span></label></div>
      <button className="button primary full" onClick={apply}>{ready ? <CheckCircle2/> : <LockKeyhole/>}{ready ? "Submit placement request" : "Save gated draft"}</button>{notice && <p className="market-notice" aria-live="polite">{notice}</p>}
    </section>

    <aside className="earning-summary"><span className="eyebrow">SELECTED PATH</span><h2>Level {level.id}</h2><h3>{level.name}</h3><strong>{money(level.rate)}<small>/ hour</small></strong><div><span><b>{money(eventPay(level))}</b><small>3-hour event</small></span><span><b>{money(dailyCapacity(level))}</b><small>4-event capacity</small></span><span><b>{money(weeklyCapacity(level))}</b><small>5-day capacity</small></span></div><p>{schedule.name}: {schedule.purpose}. Capacity is subject to availability, age rules, classification, funding, and approval.</p><h4>Live responsibilities</h4><ul>{level.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul><h4>Advance to the next level</h4><ul>{level.advancement.map((item) => <li key={item}>{item}</li>)}</ul></aside></div>

    <section className="funding-board"><div className="section-heading"><div><span className="eyebrow">SMART-CONTRACTED EVENT</span><h2>Funding before activation</h2></div><StatusPill tone={funding.funded ? "green" : "red"}>{funding.funded ? "FUNDED" : "BLOCKED"}</StatusPill></div><div className="funding-metrics">{[{label:"Earner wages",value:funding.wages},{label:"Payroll / admin",value:funding.administration},{label:"Technology / venue",value:funding.technology},{label:"Community allocation",value:funding.community},{label:"Operating reserve",value:funding.reserve},{label:"Growth / placement",value:funding.growth}].map((item) => <div key={item.label}><span>{item.label}</span><b>{money(item.value)}</b></div>)}</div><p>Minimum contracted revenue: <b>{money(funding.minimum)}</b>. Recommended event range: <b>$2,500 - $3,000</b>.</p></section>

    <section className="earner-level-board"><div className="section-heading"><div><span className="eyebrow">FIVE EARNING LEVELS</span><h2>Verified progression and gross capacity</h2></div></div><div className="earner-level-grid">{earnerLevels.map((item) => <button className={levelId === item.id ? "active" : ""} onClick={() => setLevelId(item.id)} key={item.id}><span>LEVEL {item.id}</span><h3>{item.name}</h3><strong>{money(item.rate)}/hr</strong><small>{money(eventPay(item))} per event / {money(weeklyCapacity(item))} weekly maximum</small></button>)}</div></section>

    <section className="balanced-block"><div><span className="eyebrow">BALANCED TEN-PERSON TEAM</span><h2>{money(balancedTeamCost())} direct labor per event</h2><p>Three Green Mode earners, three DevOps earners, two specialists, one lead, and one ambassador deliver as a governed production block.</p></div><div>{balancedTeam.map((item) => <span key={item.level}><b>{item.count}x</b> Level {item.level}</span>)}</div></section>

    <section className="placement-roadmap"><div><span className="eyebrow">FIVE-YEAR PLACEMENT CONNECTION</span><h2>10,000 verified placements</h2></div>{placementTargets.map((target) => <div key={target.year}><span>YEAR {target.year}</span><b>{target.placements.toLocaleString()}</b><small>{target.cumulative.toLocaleString()} cumulative</small></div>)}</section>
    <section className="market-workflow"><span>Opportunity posted</span><i/><span>Skills and level matched</span><i/><span>Simulation proved</span><i/><span>Human release</span><i/><span>Live delivery</span><i/><span>Work verified</span><i/><span>Payment milestone</span><i/><span>Portfolio + proof</span></section>
  </div>;
}
