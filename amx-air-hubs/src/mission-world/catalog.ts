import missionContracts from "./missions.json";
import { LEARNING_CATALOG } from "./learning-catalog";
import type { MissionWorldDefinition } from "./types";

export const MISSION_WORLDS = missionContracts.map((mission) => ({
  ...mission,
  lessons: LEARNING_CATALOG[mission.id as keyof typeof LEARNING_CATALOG],
})) as MissionWorldDefinition[];

export const MISSION_WORLD_BADGES = ["First Launch", ...MISSION_WORLDS.map((world) => world.badge), "Mission Master"];

export function getMissionWorld(id: string) {
  return MISSION_WORLDS.find((world) => world.id === id) || MISSION_WORLDS[0];
}
