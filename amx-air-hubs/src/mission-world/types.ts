export type MissionWorldId = "ai" | "xr" | "robotics" | "automation" | "builder";
export type MissionWorldMode = "solo" | "co-op" | "teams";
export type LeaderboardScope = "individual" | "team" | "school" | "organization" | "community" | "seasonal";

export interface LearningLesson {
  id: string;
  title: string;
  brief: string;
  practice: string;
}

export interface MissionWorldDefinition {
  id: MissionWorldId;
  slug: string;
  title: string;
  shortLabel: string;
  description: string;
  objective: string;
  xp: number;
  badge: string;
  color: string;
  agentId: string;
  activity: "choice" | "sequence" | "builder";
  prompt: string;
  options?: string[];
  correct?: string;
  sequence?: string[];
  modes: Array<"web" | "ar" | "vr" | "mr">;
  difficulty: number;
  objectives: string[];
  evidence: string[];
  lessons: LearningLesson[];
}

export interface MissionWorldProgress {
  xp: number;
  coins: number;
  streak: number;
  completed: MissionWorldId[];
  badges: string[];
  mode: MissionWorldMode;
  lessons: Partial<Record<MissionWorldId, string[]>>;
  attempts: Partial<Record<MissionWorldId, number>>;
  unlocks: string[];
  lastCompletedAt?: string;
}

export interface MissionRuntimeState {
  missionId: MissionWorldId;
  startedAt: number;
  elapsedSeconds: number;
  attempts: number;
  status: "briefing" | "active" | "ready" | "passed" | "retry";
}

export interface XRCapabilities {
  secureContext: boolean;
  webXR: boolean;
  immersiveVR: boolean;
  immersiveAR: boolean;
  gamepads: boolean;
  camera: boolean;
}
