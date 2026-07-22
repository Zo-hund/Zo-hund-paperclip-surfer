import { attachProofMedia, createProofRecord, updateProofRecord } from "../platform";
import { missionWorldAsMission } from "../mission-world-data";
import type { Role } from "../data";
import type { MissionWorldDefinition, MissionWorldMode } from "./types";
import type { MissionSimulationRecord } from "./types";

export function issueMissionWorldProof({ world, role, rewardXP, startedAt, mode, completedLessons, simulation, canvas }: {
  world: MissionWorldDefinition;
  role: Role;
  rewardXP: number;
  startedAt: number;
  mode: MissionWorldMode;
  completedLessons: string[];
  simulation: MissionSimulationRecord;
  canvas: HTMLCanvasElement | null;
}) {
  const proof = createProofRecord(missionWorldAsMission(world), role, rewardXP, startedAt);
  const result = simulation.lastResult;
  const completedSteps = ["pre", ...completedLessons.map((lessonId) => `lesson:${lessonId}`), `mode:${mode}`, `quest:${world.id}`, `role:${simulation.configuration.role}`, `score:${result?.score || 0}`, ...simulation.configuration.toolIds.map((id) => `tool:${id}`), ...simulation.configuration.safeguardIds.map((id) => `safety:${id}`), `event:${result?.event.id || "none"}`, `approval:${simulation.approved ? "pit-stop" : "missing"}`, "post"];
  const scoped = updateProofRecord(proof.id, { report: { ...proof.report, completedSteps } }) || proof;
  return canvas ? attachProofMedia(scoped.id, canvas.toDataURL("image/jpeg", 0.62)) || scoped : scoped;
}
