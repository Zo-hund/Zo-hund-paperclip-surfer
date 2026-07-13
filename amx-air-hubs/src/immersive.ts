import type { Agent, Mission, Role } from "./data";

export type ExperienceMode = "2d" | "3d" | "ar" | "vr" | "mr";
export type SocialMode = "solo" | "co-op" | "team";
export type PresenceState = "online" | "joining" | "active" | "speaking" | "working" | "idle" | "away" | "disconnected" | "needs-help";
export type TeamRole = "Mission Lead" | "Creator" | "Designer" | "Developer" | "Engineer" | "Researcher" | "Trainer" | "Reviewer" | "Reporter";

export interface ContinuityState {
  userId: string;
  runId: string;
  missionId: string;
  activeMode: ExperienceMode;
  previousMode: ExperienceMode | null;
  socialMode: SocialMode;
  currentStep: number;
  completedObjectives: string[];
  xp: number;
  agentId: string;
  teamId: string | null;
  roomId: string;
  proofStatus: "not_started" | "in_progress" | "complete";
  updatedAt: string;
}

export interface Participant {
  id: string;
  participantType: "human" | "agent";
  displayName: string;
  role: string;
  avatarColor: string;
  state: PresenceState;
  currentAction: string;
  currentStep: number;
  voiceEnabled: boolean;
  handTrackingEnabled: boolean;
  connectionStrength: number;
  toolInUse?: string;
}

export interface Room {
  id: string;
  code: string;
  missionId: string;
  runId: string;
  access: "private" | "invite" | "classroom" | "public" | "sponsored" | "tournament" | "trainer-led";
  socialMode: SocialMode;
  maxParticipants: number;
  participants: Participant[];
  readyParticipantIds: string[];
  voiceRoomId: string;
  status: "waiting" | "active" | "complete";
}

export interface SharedObjective {
  id: string;
  title: string;
  detail: string;
  xp: number;
  assignedRole: TeamRole;
  status: "locked" | "active" | "complete";
}

export interface TeamReward {
  xp: number;
  badge: string;
  certificate: boolean;
  unlocked: boolean;
}

export interface Team {
  id: string;
  name: string;
  organization: string;
  memberCount: number;
  agents: string[];
  teamXP: number;
  badges: string[];
  activeMissionId: string;
}

export interface QuestState {
  id: string;
  title: string;
  type: SocialMode;
  recommendedPlayers: number;
  objectives: SharedObjective[];
  reward: TeamReward;
}

export interface RunEvent {
  id: string;
  runId: string;
  timestamp: string;
  type: "system" | "mode" | "objective" | "presence" | "tool" | "agent" | "reward" | "recovery" | "proof";
  title: string;
  detail: string;
  actor: string;
  xp?: number;
}

export interface ComfortSettings {
  posture: "standing" | "seated";
  dominantHand: "left" | "right";
  movement: "smooth" | "teleport" | "guided";
  turning: "snap" | "smooth";
  movementSpeed: number;
  turnSpeed: number;
  snapAngle: 30 | 45 | 60;
  vignetteStrength: number;
  audioLevel: number;
  captions: boolean;
  reducedMotion: boolean;
  sessionMinutes: number;
}

export interface ImmersiveRecovery {
  id: string;
  runId: string;
  participantId: string;
  errorType: string;
  fallback: string;
  stateRestored: boolean;
  proofPreserved: boolean;
  escalated: boolean;
  timestamp: string;
}

const CONTINUITY_KEY = "amx_continuity";
const ROOMS_KEY = "amx_immersive_rooms";
const QUESTS_KEY = "amx_quest_state";
const EVENTS_KEY = "amx_run_timeline";
const COMFORT_KEY = "amx_comfort";
const RECOVERY_KEY = "amx_immersive_recovery";

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; }
  catch { return fallback; }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("amx:immersive", { detail: { key } }));
}

export const experienceModes: Array<{ id: ExperienceMode; label: string; short: string; detail: string; capability: string }> = [
  { id: "2d", label: "Immersive 2D", short: "2D", detail: "Cockpit dashboard, mission map, tools, chat, and proof.", capability: "Every screen" },
  { id: "3d", label: "Browser 3D", short: "3D", detail: "Navigate a shared spatial world with agents and portals.", capability: "WebGL" },
  { id: "ar", label: "Augmented Reality", short: "AR", detail: "Place agents and learning stations in your room.", capability: "Camera + WebXR" },
  { id: "vr", label: "Virtual Reality", short: "VR", detail: "Enter a full Skill Pod with controllers or hands.", capability: "Immersive VR" },
  { id: "mr", label: "Mixed Reality", short: "MR", detail: "Pin tools and agents into a passthrough workspace.", capability: "Immersive AR" },
];

export const levelPath = ["Explorer", "Creator", "Designer", "Developer", "Engineer", "Mission Lead", "Trainer", "Ambassador"];

export function getLevel(xp: number) {
  const index = Math.min(levelPath.length - 1, Math.floor(xp / 500));
  return { index, name: levelPath[index], next: levelPath[Math.min(index + 1, levelPath.length - 1)], progress: Math.round((xp % 500) / 5) };
}

export function modeRoute(mode: ExperienceMode, missionId: string) {
  return `/play/${mode}/${missionId}`;
}

export function getContinuity(missionId?: string, xp = 40, agentId = "jaz"): ContinuityState {
  const stored = read<ContinuityState | null>(CONTINUITY_KEY, null);
  if (stored && (!missionId || stored.missionId === missionId)) return stored;
  const activeMissionId = missionId || stored?.missionId || "xrt-green-mode";
  const runId = `run-${crypto.randomUUID().slice(0, 8)}`;
  const state: ContinuityState = {
    userId: "guest-user", runId, missionId: activeMissionId, activeMode: "2d", previousMode: null, socialMode: "solo",
    currentStep: 0, completedObjectives: [], xp, agentId, teamId: null, roomId: `room-${runId.slice(-8)}`,
    proofStatus: "not_started", updatedAt: new Date().toISOString(),
  };
  write(CONTINUITY_KEY, state);
  return state;
}

export function updateContinuity(patch: Partial<ContinuityState>) {
  const current = read<ContinuityState | null>(CONTINUITY_KEY, null) || getContinuity(patch.missionId);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  write(CONTINUITY_KEY, next);
  return next;
}

export function beginImmersiveRun(mission: Mission, mode: ExperienceMode, socialMode: SocialMode, xp: number) {
  const current = getContinuity(mission.id, xp, mission.agentId);
  const changed = current.activeMode !== mode || current.socialMode !== socialMode;
  const next = updateContinuity({
    missionId: mission.id,
    previousMode: current.activeMode === mode ? current.previousMode : current.activeMode,
    activeMode: mode,
    socialMode,
    agentId: mission.agentId,
    xp,
    proofStatus: current.proofStatus === "complete" ? "complete" : "in_progress",
  });
  ensureRoom(next, mission);
  if (changed) recordRunEvent(next.runId, "mode", `${mode.toUpperCase()} mode active`, `${mission.title} continued in ${mode.toUpperCase()}.`, "System");
  return next;
}

export function buildAgentParticipant(agent: Agent, currentStep = 0): Participant {
  return {
    id: `agent-${agent.id}`, participantType: "agent", displayName: agent.name, role: agent.role,
    avatarColor: agent.color, state: "active", currentAction: agent.specialty, currentStep,
    voiceEnabled: true, handTrackingEnabled: false, connectionStrength: 100,
  };
}

export function buildHumanParticipant(role: Role, currentStep = 0): Participant {
  return {
    id: "guest-user", participantType: "human", displayName: "Mario", role,
    avatarColor: "#f4c96b", state: "active", currentAction: "Building the mission", currentStep,
    voiceEnabled: true, handTrackingEnabled: false, connectionStrength: navigator.onLine ? 98 : 0,
  };
}

export function ensureRoom(continuity: ContinuityState, mission: Mission, role: Role = "Learner", crew: Agent[] = []): Room {
  const rooms = read<Room[]>(ROOMS_KEY, []);
  const existing = rooms.find((room) => room.id === continuity.roomId);
  const agentCrew = (crew.length ? crew : []).map((agent) => buildAgentParticipant(agent, continuity.currentStep));
  const room: Room = existing || {
    id: continuity.roomId,
    code: continuity.runId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase(),
    missionId: mission.id,
    runId: continuity.runId,
    access: continuity.socialMode === "team" ? "trainer-led" : "private",
    socialMode: continuity.socialMode,
    maxParticipants: continuity.socialMode === "solo" ? 1 : continuity.socialMode === "co-op" ? 4 : 12,
    participants: [buildHumanParticipant(role, continuity.currentStep), ...agentCrew],
    readyParticipantIds: [],
    voiceRoomId: `voice-${continuity.runId}`,
    status: "waiting",
  };
  const humans = room.participants.filter((participant) => participant.participantType === "human");
  const merged = { ...room, socialMode: continuity.socialMode, participants: agentCrew.length ? [...humans, ...agentCrew] : room.participants };
  write(ROOMS_KEY, [merged, ...rooms.filter((item) => item.id !== merged.id)]);
  return merged;
}

export function getRoom(roomId: string) {
  return read<Room[]>(ROOMS_KEY, []).find((room) => room.id === roomId);
}

export function updateRoom(roomId: string, patch: Partial<Room>) {
  const rooms = read<Room[]>(ROOMS_KEY, []);
  const room = rooms.find((item) => item.id === roomId);
  if (!room) return undefined;
  const next = { ...room, ...patch };
  write(ROOMS_KEY, rooms.map((item) => item.id === roomId ? next : item));
  return next;
}

function defaultQuest(mission: Mission): QuestState {
  const titles = mission.steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    detail: step.body,
    xp: step.xp,
    assignedRole: (["Mission Lead", "Creator", "Reviewer"] as TeamRole[])[index % 3],
    status: index === 0 ? "active" as const : "locked" as const,
  }));
  return {
    id: `quest-${mission.id}`,
    title: mission.title,
    type: "team",
    recommendedPlayers: Math.min(5, Math.max(1, mission.steps.length + 1)),
    objectives: titles,
    reward: { xp: mission.xp, badge: mission.badge, certificate: true, unlocked: false },
  };
}

export function getQuest(mission: Mission): QuestState {
  const quests = read<Record<string, QuestState>>(QUESTS_KEY, {});
  return quests[mission.id] || defaultQuest(mission);
}

export function completeQuestObjective(mission: Mission, objectiveId: string) {
  const quests = read<Record<string, QuestState>>(QUESTS_KEY, {});
  const quest = quests[mission.id] || defaultQuest(mission);
  const index = quest.objectives.findIndex((objective) => objective.id === objectiveId);
  if (index < 0 || quest.objectives[index].status === "complete") return { quest, xp: 0, complete: quest.reward.unlocked };
  const objectives = quest.objectives.map((objective, objectiveIndex) => {
    if (objectiveIndex === index) return { ...objective, status: "complete" as const };
    if (objectiveIndex === index + 1) return { ...objective, status: "active" as const };
    return objective;
  });
  const complete = objectives.every((objective) => objective.status === "complete");
  const next = { ...quest, objectives, reward: { ...quest.reward, unlocked: complete } };
  write(QUESTS_KEY, { ...quests, [mission.id]: next });
  return { quest: next, xp: quest.objectives[index].xp, complete };
}

export function recordRunEvent(runId: string, type: RunEvent["type"], title: string, detail: string, actor = "Mario", xp?: number) {
  const events = read<RunEvent[]>(EVENTS_KEY, []);
  const event: RunEvent = { id: crypto.randomUUID(), runId, timestamp: new Date().toISOString(), type, title, detail, actor, xp };
  write(EVENTS_KEY, [...events, event].slice(-200));
  return event;
}

export function getRunTimeline(runId: string) {
  return read<RunEvent[]>(EVENTS_KEY, []).filter((event) => event.runId === runId);
}

export const defaultComfort: ComfortSettings = {
  posture: "standing", dominantHand: "right", movement: "teleport", turning: "snap",
  movementSpeed: 45, turnSpeed: 40, snapAngle: 45, vignetteStrength: 35, audioLevel: 70,
  captions: true, reducedMotion: false, sessionMinutes: 25,
};

export function getComfort() { return read<ComfortSettings>(COMFORT_KEY, defaultComfort); }
export function updateComfort(patch: Partial<ComfortSettings>) {
  const next = { ...getComfort(), ...patch };
  write(COMFORT_KEY, next);
  return next;
}

export function saveRecovery(runId: string, errorType: string, fallback: string): ImmersiveRecovery {
  const items = read<ImmersiveRecovery[]>(RECOVERY_KEY, []);
  const recovery: ImmersiveRecovery = {
    id: crypto.randomUUID(), runId, participantId: "guest-user", errorType, fallback,
    stateRestored: true, proofPreserved: true, escalated: false, timestamp: new Date().toISOString(),
  };
  write(RECOVERY_KEY, [recovery, ...items].slice(0, 25));
  recordRunEvent(runId, "recovery", "Experience recovered", `${errorType} switched to ${fallback}. Progress and proof were preserved.`, "System");
  return recovery;
}

export const teams: Team[] = [
  { id: "runway-builders", name: "Runway Builders", organization: "Tech At Nite", memberCount: 5, agents: ["jaz", "taz", "naz"], teamXP: 1840, badges: ["Skill Pod Builder", "XR Flight Crew"], activeMissionId: "webxr-creator" },
  { id: "community-flight", name: "Community Flight", organization: "Community Runway", memberCount: 12, agents: ["jaz", "raz"], teamXP: 3220, badges: ["Green Mode Cohort"], activeMissionId: "xrt-green-mode" },
];

export const humanProfile = {
  id: "guest-user", name: "Mario Duerson", handle: "@zohund", role: "Creative Technical Engineer",
  organization: "Tech At Nite", skills: ["WebXR", "Creative Engineering", "Human-Agent Systems", "Spatial Storytelling"],
  toolbelts: ["Spatial Builder", "Mission Operator"], portfolio: ["AMX AIR Hubs", "XRT Green Mode", "WebXR Skill Pod"],
};

export const sharedTools = [
  { id: "whiteboard", name: "Spatial whiteboard", permission: "Crew", holder: "Available" },
  { id: "models", name: "3D model viewer", permission: "Builder", holder: "NAZ" },
  { id: "tasks", name: "Objective board", permission: "Crew", holder: "TAZ" },
  { id: "poll", name: "Team poll", permission: "Mission Lead", holder: "Available" },
  { id: "timer", name: "Challenge timer", permission: "Game Master", holder: "ZOHUND" },
  { id: "proof", name: "Proof camera", permission: "Crew", holder: "Mario" },
];
