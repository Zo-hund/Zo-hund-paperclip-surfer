import { attachProofMedia, createProofRecord, updateProofRecord } from "../platform";
import { missionWorldAsMission } from "../mission-world-data";
import type { Role } from "../data";
import type { MissionWorldDefinition, MissionWorldMode } from "./types";

export function issueMissionWorldProof({ world, role, rewardXP, startedAt, mode, completedLessons, canvas }: {
  world: MissionWorldDefinition;
  role: Role;
  rewardXP: number;
  startedAt: number;
  mode: MissionWorldMode;
  completedLessons: string[];
  canvas: HTMLCanvasElement | null;
}) {
  const proof = createProofRecord(missionWorldAsMission(world), role, rewardXP, startedAt);
  const completedSteps = ["pre", ...completedLessons.map((lessonId) => `lesson:${lessonId}`), `mode:${mode}`, `quest:${world.id}`, "post"];
  const scoped = updateProofRecord(proof.id, { report: { ...proof.report, completedSteps } }) || proof;
  return canvas ? attachProofMedia(scoped.id, canvas.toDataURL("image/jpeg", 0.62)) || scoped : scoped;
}
