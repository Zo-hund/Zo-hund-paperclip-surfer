import { MISSION_WORLD_BADGES, MISSION_WORLDS } from "./catalog";
import { EMPTY_SIMULATION_CONFIGURATION, runMissionSimulation, SIMULATOR_SCENARIOS, type SimulationConfiguration, type SimulationResult } from "./simulator";
import type { MissionWorldId, MissionWorldMode, MissionWorldProgress } from "./types";

export const MISSION_WORLD_STORAGE_KEY = "amxMissionProgress";
export const EMPTY_MISSION_WORLD_PROGRESS: MissionWorldProgress = {
  xp: 0, coins: 0, streak: 0, completed: [], badges: [], mode: "solo", lessons: {}, attempts: {}, unlocks: [], simulations: {},
};

export function normalizeMissionWorldProgress(saved: Partial<MissionWorldProgress> = {}): MissionWorldProgress {
  const ids = MISSION_WORLDS.map((world) => world.id);
  const mode = (["solo", "co-op", "teams"].includes(saved.mode || "") ? saved.mode : "solo") as MissionWorldMode;
  const lessons = Object.fromEntries(ids.map((id) => {
    const valid = new Set(MISSION_WORLDS.find((world) => world.id === id)?.lessons.map((item) => item.id));
    return [id, [...new Set(saved.lessons?.[id] || [])].filter((lessonId) => valid.has(lessonId))];
  })) as Record<MissionWorldId, string[]>;
  const attempts = Object.fromEntries(ids.map((id) => [id, Math.max(0, Number(saved.attempts?.[id]) || 0)])) as Record<MissionWorldId, number>;
  const simulations = Object.fromEntries(ids.flatMap((id) => {
    const stored = saved.simulations?.[id];
    if (!stored) return [];
    const scenario = SIMULATOR_SCENARIOS[id];
    const configuration: SimulationConfiguration = {
      role: scenario.roles.includes(stored.configuration?.role as never) ? stored.configuration.role : "",
      toolIds: scenario.tools.map((entry) => entry.id).filter((toolId) => stored.configuration?.toolIds?.includes(toolId)),
      safeguardIds: scenario.safeguards.map((entry) => entry.id).filter((guardId) => stored.configuration?.safeguardIds?.includes(guardId)),
      plan: String(stored.configuration?.plan || "").slice(0, 2000),
    };
    const runs = Math.max(0, Math.floor(Number(stored.runs) || 0));
    const lastResult = runs ? runMissionSimulation(scenario, configuration, mode, runs) : undefined;
    return [[id, { configuration, runs, bestScore: Math.max(lastResult?.score || 0, Math.min(100, Number(stored.bestScore) || 0)), approved: Boolean(stored.approved && lastResult?.deploymentEligible), lastResult }]];
  })) as MissionWorldProgress["simulations"];
  return {
    xp: Math.max(0, Number(saved.xp) || 0),
    coins: Math.max(0, Number(saved.coins) || 0),
    streak: Math.max(0, Number(saved.streak) || 0),
    completed: ids.filter((id) => saved.completed?.includes(id)),
    badges: MISSION_WORLD_BADGES.filter((badge) => saved.badges?.includes(badge)),
    mode,
    lessons,
    attempts,
    unlocks: [...new Set((saved.unlocks || []).filter((item): item is string => typeof item === "string"))],
    simulations,
    lastCompletedAt: saved.lastCompletedAt,
  };
}

export function readMissionWorldProgress(): MissionWorldProgress {
  try { return normalizeMissionWorldProgress(JSON.parse(localStorage.getItem(MISSION_WORLD_STORAGE_KEY) || "{}")); }
  catch { return normalizeMissionWorldProgress(); }
}

export function saveMissionWorldProgress(progress: MissionWorldProgress) {
  localStorage.setItem(MISSION_WORLD_STORAGE_KEY, JSON.stringify(progress));
}

export function completeLesson(progress: MissionWorldProgress, worldId: MissionWorldId, lessonId: string) {
  const lessons = [...new Set([...(progress.lessons[worldId] || []), lessonId])];
  return { ...progress, lessons: { ...progress.lessons, [worldId]: lessons } };
}

export function recordAttempt(progress: MissionWorldProgress, worldId: MissionWorldId) {
  return { ...progress, attempts: { ...progress.attempts, [worldId]: (progress.attempts[worldId] || 0) + 1 } };
}

export function recordSimulationRun(progress: MissionWorldProgress, worldId: MissionWorldId, configuration: SimulationConfiguration, result: SimulationResult) {
  const prior = progress.simulations[worldId];
  return { ...progress, simulations: { ...progress.simulations, [worldId]: { configuration, runs: result.run, bestScore: Math.max(prior?.bestScore || 0, result.score), approved: false, lastResult: result } } };
}

export function approveSimulation(progress: MissionWorldProgress, worldId: MissionWorldId) {
  const record = progress.simulations[worldId];
  if (!record?.lastResult?.deploymentEligible) return progress;
  return { ...progress, simulations: { ...progress.simulations, [worldId]: { ...record, approved: true } } };
}
