import type { Role } from "./data";

export interface QRCampaign {
  id: string;
  name: string;
  type: "mission" | "sponsor" | "badge" | "event" | "agent" | "partner";
  targetId: string;
  route: string;
  locationTag: string;
  sponsor?: string;
  createdAt: string;
  scans: number;
  starts: number;
  completions: number;
}

export interface SkillPod {
  id: string;
  code: string;
  name: string;
  type: string;
  missionId: string;
  trainerId: string;
  participants: Array<{ id: string; name: string; role: Role; progress: number; status: "active" | "complete" }>;
  agents: string[];
  status: "draft" | "active" | "review" | "complete";
  trainerApproved: boolean;
  createdAt: string;
}

export interface MissionDraft {
  id: string;
  title: string;
  description: string;
  domain: string;
  roles: Role[];
  agentId: string;
  steps: string[];
  quiz: string;
  badge: string;
  rewardXP: number;
  sponsor: string;
  opprrcCategory: string;
  accessType: string;
  modelName?: string;
  published: boolean;
  createdAt: string;
}

const CAMPAIGNS = "amx_qr_campaigns";
const PODS = "amx_skill_pods";
const DRAFTS = "amx_mission_drafts";
const TENANT = "amx_active_tenant";
const OFFLINE = "amx_offline_queue";

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("amx:store", { detail: { key } }));
}

export function getCampaigns(): QRCampaign[] {
  return read<QRCampaign[]>(CAMPAIGNS, [{
    id: "campaign-xrt-launch", name: "XRT Green Mode Launch", type: "mission", targetId: "xrt-green-mode",
    route: "/scan/xrt-green-mode?campaign=campaign-xrt-launch&location=main-runway", locationTag: "main-runway",
    sponsor: "AMX Labs", createdAt: new Date().toISOString(), scans: 1284, starts: 946, completions: 812,
  }]);
}

export function saveCampaign(input: Omit<QRCampaign, "id" | "createdAt" | "scans" | "starts" | "completions">) {
  const campaign: QRCampaign = { ...input, id: `campaign-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString(), scans: 0, starts: 0, completions: 0 };
  write(CAMPAIGNS, [campaign, ...getCampaigns()]);
  return campaign;
}

export function recordCampaignEvent(id: string, field: "scans" | "starts" | "completions") {
  write(CAMPAIGNS, getCampaigns().map((campaign) => campaign.id === id ? { ...campaign, [field]: campaign[field] + 1 } : campaign));
}

export function getPods(): SkillPod[] {
  return read<SkillPod[]>(PODS, []);
}

export function savePod(input: Pick<SkillPod, "name" | "type" | "missionId" | "agents">) {
  const pod: SkillPod = {
    ...input, id: `pod-${crypto.randomUUID().slice(0, 8)}`, code: Math.random().toString(36).slice(2, 8).toUpperCase(),
    trainerId: "trainer-001", participants: [], status: "active", trainerApproved: false, createdAt: new Date().toISOString(),
  };
  write(PODS, [pod, ...getPods()]);
  return pod;
}

export function updatePod(id: string, patch: Partial<SkillPod>) {
  write(PODS, getPods().map((pod) => pod.id === id ? { ...pod, ...patch } : pod));
}

export function joinPod(code: string, name = "Guest Learner") {
  const normalizedCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) return undefined;

  const participant = { id: crypto.randomUUID(), name, role: "Learner" as const, progress: 0, status: "active" as const };
  const pods = getPods();
  let joined = pods.find((pod) => pod.code === normalizedCode);

  if (joined) {
    joined = { ...joined, participants: [...joined.participants, participant] };
    write(PODS, pods.map((pod) => pod.id === joined?.id ? joined : pod));
  } else {
    joined = {
      id: `pod-remote-${normalizedCode.toLowerCase()}`,
      code: normalizedCode,
      name: `Remote Skill Pod / ${normalizedCode}`,
      type: "remote",
      missionId: "xrt-green-mode",
      trainerId: "remote",
      participants: [participant],
      agents: ["jaz", "taz"],
      status: "active",
      trainerApproved: false,
      createdAt: new Date().toISOString(),
    };
    write(PODS, [joined, ...pods]);
  }

  return joined;
}

export function getMissionDrafts(): MissionDraft[] {
  return read<MissionDraft[]>(DRAFTS, []);
}

export function saveMissionDraft(input: Omit<MissionDraft, "id" | "createdAt">) {
  const draft: MissionDraft = { ...input, id: `mission-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString() };
  write(DRAFTS, [draft, ...getMissionDrafts()]);
  return draft;
}

export function updateMissionDraft(id: string, patch: Partial<MissionDraft>) {
  write(DRAFTS, getMissionDrafts().map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
}

export function getActiveTenant() { return localStorage.getItem(TENANT) || "tech-at-nite"; }
export function setActiveTenant(id: string) { localStorage.setItem(TENANT, id); window.dispatchEvent(new CustomEvent("amx:tenant", { detail: id })); }

export function queueOffline(type: string, payload: unknown) {
  const queue = read<Array<{ id: string; type: string; payload: unknown; createdAt: string }>>(OFFLINE, []);
  write(OFFLINE, [...queue, { id: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString() }]);
}

export function getOfflineQueue() { return read<Array<{ id: string; type: string; payload: unknown; createdAt: string }>>(OFFLINE, []); }

export async function syncOfflineQueue() {
  if (!navigator.onLine) return { synced: 0, remaining: getOfflineQueue().length };
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return { synced: 0, remaining: getOfflineQueue().length };
  const queue = getOfflineQueue();
  let synced = 0;
  for (const item of queue) {
    try {
      const response = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
      if (!response.ok) break;
      synced += 1;
    } catch { break; }
  }
  if (synced) write(OFFLINE, queue.slice(synced));
  return { synced, remaining: queue.length - synced };
}

export function canAccess(role: Role, resource: "publish" | "approve" | "sponsor" | "mission") {
  if (role === "Admin") return true;
  if (resource === "approve") return role === "Trainer";
  if (resource === "sponsor") return role === "Sponsor";
  return resource === "mission";
}
