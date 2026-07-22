import { MISSION_WORLD_BADGES, MISSION_WORLDS } from "./catalog";
import type { MissionWorldId, MissionWorldMode, MissionWorldProgress } from "./types";

export const MISSION_WORLD_STORAGE_KEY = "amxMissionProgress";
export const EMPTY_MISSION_WORLD_PROGRESS: MissionWorldProgress = {
  xp: 0, coins: 0, streak: 0, completed: [], badges: [], mode: "solo", lessons: {}, attempts: {}, unlocks: [],
};

export function normalizeMissionWorldProgress(saved: Partial<MissionWorldProgress> = {}): MissionWorldProgress {
  const ids = MISSION_WORLDS.map((world) => world.id);
  const lessons = Object.fromEntries(ids.map((id) => {
    const valid = new Set(MISSION_WORLDS.find((world) => world.id === id)?.lessons.map((item) => item.id));
    return [id, [...new Set(saved.lessons?.[id] || [])].filter((lessonId) => valid.has(lessonId))];
  })) as Record<MissionWorldId, string[]>;
  const attempts = Object.fromEntries(ids.map((id) => [id, Math.max(0, Number(saved.attempts?.[id]) || 0)])) as Record<MissionWorldId, number>;
  return {
    xp: Math.max(0, Number(saved.xp) || 0),
    coins: Math.max(0, Number(saved.coins) || 0),
    streak: Math.max(0, Number(saved.streak) || 0),
    completed: ids.filter((id) => saved.completed?.includes(id)),
    badges: MISSION_WORLD_BADGES.filter((badge) => saved.badges?.includes(badge)),
    mode: (["solo", "co-op", "teams"].includes(saved.mode || "") ? saved.mode : "solo") as MissionWorldMode,
    lessons,
    attempts,
    unlocks: [...new Set((saved.unlocks || []).filter((item): item is string => typeof item === "string"))],
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
