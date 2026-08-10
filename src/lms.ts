export type LmsProgramMode = "training" | "workshop" | "market_sim";
export type LmsStage = "learn" | "practice" | "prove" | "live" | "earn";

export type LmsModule = {
  id: string;
  title: string;
  stage: LmsStage;
  summary: string;
  durationMinutes: number;
  unlockAfterModuleId: string | null;
  availableAt: string | null;
  missionId: string | null;
  liveRoom: string | null;
  rewardXp: number;
  rewardCents: number;
};

export type LmsProgram = {
  id: string;
  tenantId: string;
  title: string;
  summary: string;
  mode: LmsProgramMode;
  status: "draft" | "published" | "archived";
  facilitator: string;
  modules: LmsModule[];
  updatedAt: string;
};

export type LmsEnrollment = {
  id: string;
  tenantId: string;
  programId: string;
  learnerId: string;
  learnerName: string;
  status: "invited" | "active" | "complete";
  completedModuleIds: string[];
  attendanceMinutes: number;
  evidenceCount: number;
  score: number;
  earnedCents: number;
  updatedAt: string;
};

export const lmsStages: Array<{ id: LmsStage; label: string; detail: string }> = [
  { id: "learn", label: "Learn", detail: "Guided concepts and agent coaching" },
  { id: "practice", label: "Practice", detail: "Workshop and Pod application" },
  { id: "prove", label: "Prove", detail: "Evidence, rubric, and human sign-off" },
  { id: "live", label: "Live", detail: "Publish qualified work to rooms and Stage" },
  { id: "earn", label: "Earn", detail: "Release approved rewards and opportunities" },
];

const now = new Date().toISOString();
export const defaultLmsPrograms: LmsProgram[] = [
  {
    id: "future-skills-live-runway", tenantId: "tech-at-nite", title: "Future Skills Live Runway",
    summary: "Train, rehearse, prove, and promote a community production team into a paid XR showcase.",
    mode: "market_sim", status: "published", facilitator: "JAZ + AMX Operator", updatedAt: now,
    modules: [
      { id: "ai-production-brief", title: "AI Production Brief", stage: "learn", summary: "Build a responsible show brief with agent guidance.", durationMinutes: 35, unlockAfterModuleId: null, availableAt: null, missionId: "ai-101", liveRoom: null, rewardXp: 100, rewardCents: 0 },
      { id: "pod-rehearsal", title: "Pod Rehearsal", stage: "practice", summary: "Assign roles, route media, and rehearse cues in a live Pod.", durationMinutes: 55, unlockAfterModuleId: "ai-production-brief", availableAt: null, missionId: "automations", liveRoom: "NEXUS1", rewardXp: 140, rewardCents: 0 },
      { id: "operator-proof", title: "Operator Proof", stage: "prove", summary: "Submit run-of-show, tool traces, and reflection for approval.", durationMinutes: 30, unlockAfterModuleId: "pod-rehearsal", availableAt: null, missionId: null, liveRoom: null, rewardXp: 175, rewardCents: 0 },
      { id: "expo-showcase", title: "Expo Showcase", stage: "live", summary: "Promote the approved run to the AMX XR Stage.", durationMinutes: 45, unlockAfterModuleId: "operator-proof", availableAt: null, missionId: null, liveRoom: "AMXSTAGE", rewardXp: 225, rewardCents: 0 },
      { id: "paid-production-run", title: "Paid Production Run", stage: "earn", summary: "Operator-approved project settlement through the earning ledger.", durationMinutes: 60, unlockAfterModuleId: "expo-showcase", availableAt: null, missionId: null, liveRoom: null, rewardXp: 250, rewardCents: 7500 },
    ],
  },
];

export function moduleUnlocked(module: LmsModule, enrollment: LmsEnrollment | null, at = Date.now()) {
  if (module.availableAt && Date.parse(module.availableAt) > at) return false;
  return !module.unlockAfterModuleId || Boolean(enrollment?.completedModuleIds.includes(module.unlockAfterModuleId));
}

export function programProgress(program: LmsProgram, enrollment: LmsEnrollment | null) {
  if (!program.modules.length || !enrollment) return 0;
  return Math.round(enrollment.completedModuleIds.filter((id) => program.modules.some((module) => module.id === id)).length / program.modules.length * 100);
}

export function nextModule(program: LmsProgram, enrollment: LmsEnrollment | null) {
  return program.modules.find((module) => !enrollment?.completedModuleIds.includes(module.id) && moduleUnlocked(module, enrollment)) || null;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Learning service is unavailable");
  return payload;
}

export async function loadLms(tenantId: string, learnerId?: string) {
  const query = new URLSearchParams({ tenantId });
  if (learnerId) query.set("learnerId", learnerId);
  return jsonRequest<{ programs: LmsProgram[]; enrollments: LmsEnrollment[]; persisted: boolean }>(`/api/lms/programs?${query}`);
}

export async function saveLmsProgram(program: LmsProgram) {
  return jsonRequest<{ program: LmsProgram }>("/api/lms/programs", { method: "PUT", body: JSON.stringify(program) });
}

export async function enrollLmsLearner(input: Pick<LmsEnrollment, "tenantId" | "programId" | "learnerId" | "learnerName">) {
  return jsonRequest<{ enrollment: LmsEnrollment }>("/api/lms/enrollments", { method: "POST", body: JSON.stringify(input) });
}

export async function updateLmsProgress(enrollment: LmsEnrollment, moduleId: string, action: "complete" | "attendance" | "evidence", value = 1) {
  return jsonRequest<{ enrollment: LmsEnrollment }>(`/api/lms/enrollments/${encodeURIComponent(enrollment.id)}/progress`, { method: "POST", body: JSON.stringify({ tenantId: enrollment.tenantId, moduleId, action, value }) });
}
