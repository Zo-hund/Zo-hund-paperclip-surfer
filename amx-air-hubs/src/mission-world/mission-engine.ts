import type { MissionRuntimeState, MissionWorldDefinition, MissionWorldId, MissionWorldProgress } from "./types";

export const createMissionRuntime = (missionId: MissionWorldId): MissionRuntimeState => ({ missionId, startedAt: Date.now(), elapsedSeconds: 0, attempts: 0, status: "briefing" });

export function allLessonsComplete(world: MissionWorldDefinition, progress: MissionWorldProgress) {
  return world.lessons.every((lesson) => progress.lessons[world.id]?.includes(lesson.id));
}

export function objectiveProgress(world: MissionWorldDefinition, progress: MissionWorldProgress) {
  return { complete: progress.lessons[world.id]?.length || 0, total: world.lessons.length };
}

export function formatMissionTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${Math.max(0, seconds % 60).toString().padStart(2, "0")}`;
}
