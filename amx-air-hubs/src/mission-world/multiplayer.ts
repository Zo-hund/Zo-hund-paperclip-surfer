import type { LeaderboardScope, MissionWorldMode } from "./types";

export const SESSION_MODES: Array<{ id: MissionWorldMode; label: string; description: string; live: boolean }> = [
  { id: "solo", label: "Solo", description: "Private device progress", live: true },
  { id: "co-op", label: "Co-op", description: "Shared Skill Pod session", live: false },
  { id: "teams", label: "Teams", description: "Organization cohort room", live: false },
];

export const LEADERBOARD_SCOPES: LeaderboardScope[] = ["individual", "team", "school", "organization", "community", "seasonal"];

export function multiplayerStatus(mode: MissionWorldMode) {
  return mode === "solo" ? "Local progress is active." : "Connect this mission to a live Skill Pod to synchronize participants, voice, and shared state.";
}
