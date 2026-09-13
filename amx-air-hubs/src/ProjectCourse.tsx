import { BadgeCheck, BookOpenCheck, Check, CircleDot, LockKeyhole, ShieldCheck, Wrench } from "lucide-react";
import { requiredProjectTools, type ProjectLearningState } from "./project-learning";
import { StatusPill } from "./components";

interface Props {
  state: ProjectLearningState;
  progress: number;
  completedTools: Set<string>;
  onConfirmKnow: () => void;
  onRunTool: (toolName: string) => void;
  onReflection: (value: string) => void;
  onComplete: () => void;
}

const toolLabels: Record<string, string> = {
  "dcim.inspect": "Establish the operating baseline",
  "rack.thermal-map": "Find the highest thermal risk",
  "incident.runbook": "Build a human-governed response",
};

export function ProjectCourse({ state, progress, completedTools, onConfirmKnow, onRunTool, onReflection, onComplete }: Props) {
  const doUnlocked = state.knowledgeConfirmed;
  const beUnlocked = requiredProjectTools.every((tool) => completedTools.has(tool));
  const canComplete = beUnlocked && state.reflection.trim().length >= 20;
  return <section className="dc-project-course" aria-label="Know Do Be operator mini course">
    <div className="dc-panel-title"><span><BookOpenCheck/>Thermal response project</span><StatusPill tone={state.status === "complete" ? "green" : "cyan"}>{state.status === "complete" ? "PROJECT PROOF" : `${progress}%`}</StatusPill></div>
    <div className="dc-course-progress"><span style={{ width: `${progress}%` }}/></div>
    <div className="dc-course-stages">
      <article className={state.knowledgeConfirmed ? "complete" : "active"}>
        <header><span>01 / KNOW</span>{state.knowledgeConfirmed ? <Check/> : <CircleDot/>}</header>
        <h4>Read before recommending</h4>
        <p>Separate live evidence from simulation, identify the tenant SLA, and name the highest-risk signal.</p>
        <button disabled={state.knowledgeConfirmed} onClick={onConfirmKnow}><BookOpenCheck/>{state.knowledgeConfirmed ? "Model confirmed" : "Confirm operating model"}</button>
      </article>
      <article className={!doUnlocked ? "locked" : beUnlocked ? "complete" : "active"}>
        <header><span>02 / DO</span>{doUnlocked ? beUnlocked ? <Check/> : <Wrench/> : <LockKeyhole/>}</header>
        <h4>Diagnose a hot aisle</h4>
        <p>Use actual tool traces to establish baseline, thermal evidence, and a guarded incident plan.</p>
        <div>{requiredProjectTools.map((tool) => <button key={tool} disabled={!doUnlocked || completedTools.has(tool)} onClick={() => onRunTool(tool)}>{completedTools.has(tool) ? <Check/> : <Wrench/>}<span>{toolLabels[tool]}</span></button>)}</div>
      </article>
      <article className={!beUnlocked ? "locked" : state.status === "complete" ? "complete" : "active"}>
        <header><span>03 / BE</span>{beUnlocked ? state.status === "complete" ? <BadgeCheck/> : <ShieldCheck/> : <LockKeyhole/>}</header>
        <h4>Act as a responsible operator</h4>
        <textarea disabled={!beUnlocked || state.status === "complete"} value={state.reflection} onChange={(event) => onReflection(event.target.value)} placeholder="State the principle that governs your recommendation..." aria-label="Operator decision principle"/>
        <button disabled={!canComplete || state.status === "complete"} onClick={onComplete}><BadgeCheck/>{state.status === "complete" ? "Evidence recorded" : "Issue project proof"}</button>
      </article>
    </div>
  </section>;
}
