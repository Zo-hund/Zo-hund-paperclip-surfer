import { useEffect, useMemo, useReducer } from "react";
import type { AgentToolTrace } from "./agent-runtime";

export type LearningStage = "know" | "do" | "be";

export interface ProjectLearningState {
  version: 1;
  projectId: "mini-dc-thermal-response";
  tenantId: string;
  learnerId: string;
  stage: LearningStage;
  knowledgeConfirmed: boolean;
  toolRuns: AgentToolTrace[];
  reflection: string;
  status: "in_progress" | "complete";
  updatedAt: string;
}

type Action =
  | { type: "hydrate"; state: ProjectLearningState }
  | { type: "confirm-know" }
  | { type: "tool-run"; trace: AgentToolTrace }
  | { type: "reflection"; value: string }
  | { type: "complete" };

export const requiredProjectTools = ["dcim.inspect", "rack.thermal-map", "incident.runbook"] as const;

function initialState(tenantId: string): ProjectLearningState {
  return {
    version: 1,
    projectId: "mini-dc-thermal-response",
    tenantId,
    learnerId: localStorage.getItem("amx_learner_id") || "guest-user",
    stage: "know",
    knowledgeConfirmed: false,
    toolRuns: [],
    reflection: "",
    status: "in_progress",
    updatedAt: new Date().toISOString(),
  };
}

function hasRequiredTools(runs: AgentToolTrace[]) {
  return requiredProjectTools.every((name) => runs.some((run) => run.name === name && run.status === "complete"));
}

function reducer(state: ProjectLearningState, action: Action): ProjectLearningState {
  const updatedAt = new Date().toISOString();
  if (action.type === "hydrate") return action.state;
  if (action.type === "confirm-know") return { ...state, knowledgeConfirmed: true, stage: "do", updatedAt };
  if (action.type === "tool-run") {
    const toolRuns = [...state.toolRuns.filter((run) => run.name !== action.trace.name), action.trace].slice(-24);
    return { ...state, toolRuns, stage: hasRequiredTools(toolRuns) ? "be" : state.stage, updatedAt };
  }
  if (action.type === "reflection") return { ...state, reflection: action.value.slice(0, 600), updatedAt };
  if (action.type === "complete" && state.knowledgeConfirmed && hasRequiredTools(state.toolRuns) && state.reflection.trim().length >= 20) {
    return { ...state, stage: "be", status: "complete", updatedAt };
  }
  return state;
}

export function useProjectLearning(tenantId: string) {
  const storageKey = `amx_project_learning_${tenantId}`;
  const [state, dispatch] = useReducer(reducer, tenantId, (id) => {
    try { return JSON.parse(localStorage.getItem(`amx_project_learning_${id}`) || "") as ProjectLearningState; }
    catch { return initialState(id); }
  });

  useEffect(() => {
    if (state.tenantId === tenantId) return;
    try { dispatch({ type: "hydrate", state: JSON.parse(localStorage.getItem(storageKey) || "") as ProjectLearningState }); }
    catch { dispatch({ type: "hydrate", state: initialState(tenantId) }); }
  }, [state.tenantId, storageKey, tenantId]);

  useEffect(() => {
    if (state.tenantId !== tenantId) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/learning/projects/state?tenantId=${encodeURIComponent(tenantId)}&projectId=mini-dc-thermal-response&learnerId=${encodeURIComponent(state.learnerId)}`);
        if (!response.ok) return;
        const payload = await response.json() as { item?: ProjectLearningState | null };
        if (active && payload.item && Date.parse(payload.item.updatedAt) > Date.parse(state.updatedAt)) dispatch({ type: "hydrate", state: payload.item });
      } catch { /* Device state remains authoritative while offline. */ }
    };
    void load();
    return () => { active = false; };
  }, [state.learnerId, state.updatedAt, tenantId]);

  useEffect(() => {
    if (state.tenantId !== tenantId) return;
    localStorage.setItem(storageKey, JSON.stringify(state));
    const timer = window.setTimeout(() => {
      void fetch("/api/learning/projects/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state, storageKey, tenantId]);

  const completedTools = useMemo(() => new Set(state.toolRuns.filter((run) => run.status === "complete").map((run) => run.name)), [state.toolRuns]);
  const progress = Math.round((Number(state.knowledgeConfirmed) + requiredProjectTools.filter((tool) => completedTools.has(tool)).length + Number(state.status === "complete")) / 5 * 100);
  const complete = () => {
    const eligible = state.knowledgeConfirmed && requiredProjectTools.every((tool) => completedTools.has(tool)) && state.reflection.trim().length >= 20;
    if (!eligible || state.status === "complete") return;
    dispatch({ type: "complete" });
    const timestamp = new Date().toISOString();
    void fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        type: "proof:complete",
        payload: {
          id: crypto.randomUUID(), tenantId, learnerId: state.learnerId, missionId: state.projectId, status: "complete", timestamp,
          report: { framework: "Know-Do-Be", reflection: state.reflection.trim(), tools: state.toolRuns, project: "Mini data center hot-aisle response" },
        },
      }),
    }).catch(() => undefined);
  };
  return {
    state,
    progress,
    completedTools,
    confirmKnow: () => dispatch({ type: "confirm-know" }),
    recordTool: (trace: AgentToolTrace) => dispatch({ type: "tool-run", trace }),
    setReflection: (value: string) => dispatch({ type: "reflection", value }),
    complete,
  };
}
