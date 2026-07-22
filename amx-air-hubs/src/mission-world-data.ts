import type { Mission } from "./data";
import { MISSION_WORLD_BADGES, MISSION_WORLDS } from "./mission-world/catalog";
import { missionWorldLevel, missionWorldRank } from "./mission-world/gamification";
import { EMPTY_MISSION_WORLD_PROGRESS, readMissionWorldProgress } from "./mission-world/progress-store";
import type { MissionWorldDefinition } from "./mission-world/types";

export { MISSION_WORLD_BADGES, MISSION_WORLDS, missionWorldLevel, missionWorldRank, EMPTY_MISSION_WORLD_PROGRESS, readMissionWorldProgress };
export type { MissionWorldDefinition, MissionWorldId, MissionWorldMode, MissionWorldProgress } from "./mission-world/types";

export function missionWorldAsMission(world: MissionWorldDefinition): Mission {
  return {
    id: `mission-world-${world.id}`,
    title: world.title,
    domain: "AMX Mission World",
    description: world.description,
    agentId: world.agentId,
    duration: world.id === "builder" ? "8 min" : "4 min",
    difficulty: world.difficulty > 1 ? "Builder" : "Starter",
    badge: world.badge,
    xp: world.xp,
    roles: ["Learner", "Earner", "Trainer", "Admin"],
    access: { type: "member", price: 0, paymentRequired: false, x402Enabled: false },
    objective: world.objective,
    steps: world.lessons.map((lesson, index) => ({ id: lesson.id, title: lesson.title, body: lesson.brief, prompt: lesson.practice, xp: index === world.lessons.length - 1 ? world.xp : 0 })),
    quiz: { question: world.prompt, options: world.sequence || world.objectives, correct: 0 },
    published: true,
    color: world.color,
  };
}
