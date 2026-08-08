import { MISSION_WORLDS } from "./catalog";
import type { MissionWorldId, MissionWorldProgress } from "./types";

const RANKS = ["Explorer", "Creator", "Designer", "Developer", "Engineer", "World Architect"] as const;

export function missionWorldLevel(xp: number) { return Math.floor(Math.max(0, xp) / 250) + 1; }
export function missionWorldRank(level: number) { return RANKS[Math.min(RANKS.length - 1, Math.floor(Math.max(1, level) - 1) / 2)]; }

export function calculateMissionReward(worldId: MissionWorldId, progress: MissionWorldProgress) {
  const world = MISSION_WORLDS.find((entry) => entry.id === worldId) || MISSION_WORLDS[0];
  const first = progress.completed.length === 0;
  const mastery = progress.completed.length === MISSION_WORLDS.length - 1;
  return {
    xp: world.xp + (first ? 50 : 0) + (mastery ? 250 : 0),
    coins: Math.round(world.xp / 10) + (mastery ? 100 : 0),
    badges: [...(first ? ["First Launch"] : []), world.badge, ...(mastery ? ["Mission Master"] : [])],
    unlocks: [`${world.id}-toolbelt`, ...(mastery ? ["world-architect-kit", "mission-master-avatar"] : [])],
  };
}

export function applyMissionReward(progress: MissionWorldProgress, worldId: MissionWorldId) {
  if (progress.completed.includes(worldId)) return { progress, reward: null };
  const reward = calculateMissionReward(worldId, progress);
  return {
    reward,
    progress: {
      ...progress,
      xp: progress.xp + reward.xp,
      coins: progress.coins + reward.coins,
      streak: progress.streak + 1,
      completed: [...progress.completed, worldId],
      badges: [...new Set([...progress.badges, ...reward.badges])],
      unlocks: [...new Set([...progress.unlocks, ...reward.unlocks])],
      lastCompletedAt: new Date().toISOString(),
    },
  };
}
