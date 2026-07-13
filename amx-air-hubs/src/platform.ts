import type { Mission, Role } from "./data";
import { getActiveTenant, queueOffline } from "./operations";

export interface ProofRecord {
  id: string;
  org: string;
  program: string;
  project: string;
  resource: string;
  tenantId: string;
  learnerId: string;
  role: Role;
  agentId: string;
  missionId: string;
  device: string;
  report: { completedSteps: string[]; score: number; xp: number; durationSeconds: number };
  certificate: { badge: string; issued: boolean; status: "ready" | "pending" };
  sponsorTag?: string;
  mediaProofUrl?: string;
  status: "in_progress" | "complete";
  signature: string;
  timestamp: string;
  syncStatus: "local" | "synced" | "queued";
}

export interface AnalyticsEvent {
  id: string;
  eventName: string;
  missionId?: string;
  role?: Role;
  campaignId?: string;
  locationTag?: string;
  tenantId?: string;
  timestamp: string;
}

const PROOFS_KEY = "amx_proof_vault";
const EVENTS_KEY = "amx_analytics";
const XP_KEY = "amx_xp";
const BADGES_KEY = "amx_badges";

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function isLocalHost() {
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

function proofForServer(proof: ProofRecord) {
  if (!proof.mediaProofUrl?.startsWith("data:") || JSON.stringify(proof).length < 850_000) return proof;
  const { mediaProofUrl: _mediaProofUrl, ...bounded } = proof;
  return bounded;
}

function syncProofRecord(type: "proof:create" | "proof:update" | "proof:complete", proof: ProofRecord) {
  const payload = proofForServer(proof);
  if (!navigator.onLine) {
    queueOffline(type, payload);
    return;
  }
  if (isLocalHost()) return;
  void fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), type, payload }) })
    .then((response) => { if (!response.ok) queueOffline(type, payload); })
    .catch(() => queueOffline(type, payload));
}

export function trackEvent(eventName: string, payload: Omit<AnalyticsEvent, "id" | "eventName" | "timestamp"> = {}) {
  const events = read<AnalyticsEvent[]>(EVENTS_KEY, []);
  const event = { id: crypto.randomUUID(), eventName, tenantId: getActiveTenant(), ...payload, timestamp: new Date().toISOString() };
  events.push(event);
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-500)));
  if (!navigator.onLine) queueOffline("analytics:event", event);
  else if (!["localhost", "127.0.0.1"].includes(location.hostname)) void fetch("/api/analytics/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) }).catch(() => undefined);
}

function proofSignature(proof: Pick<ProofRecord, "id" | "tenantId" | "learnerId" | "missionId" | "timestamp">) {
  const source = `${proof.id}:${proof.tenantId}:${proof.learnerId}:${proof.missionId}:${proof.timestamp}:amx-v1`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `amx-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function startProofRecord(mission: Mission, role: Role): ProofRecord {
  const timestamp = new Date().toISOString();
  const base = {
    id: `opprrc-${crypto.randomUUID().slice(0, 8)}`, org: "Tech At Nite", program: "AMX AIR HUB",
    project: mission.title, resource: "AMX WebXR Mission", tenantId: getActiveTenant(), learnerId: "guest-user",
    role, agentId: mission.agentId, missionId: mission.id,
    device: /Mobi|Android/i.test(navigator.userAgent) ? "mobile-web" : "desktop-web",
    report: { completedSteps: ["pre"], score: 0, xp: 0, durationSeconds: 0 },
    certificate: { badge: mission.badge, issued: false, status: "pending" as const },
    sponsorTag: mission.access.sponsorId, status: "in_progress" as const, timestamp,
    syncStatus: navigator.onLine ? "local" as const : "queued" as const,
  };
  const proof: ProofRecord = { ...base, signature: proofSignature(base) };
  localStorage.setItem("amx_active_proof", proof.id);
  localStorage.setItem(PROOFS_KEY, JSON.stringify([proof, ...getProofs().filter((item) => !(item.missionId === mission.id && item.status === "in_progress"))]));
  syncProofRecord("proof:create", proof);
  return proof;
}

export function updateProofRecord(id: string, patch: Partial<ProofRecord>) {
  const proofs = getProofs();
  const next = proofs.map((proof) => proof.id === id ? { ...proof, ...patch } : proof);
  localStorage.setItem(PROOFS_KEY, JSON.stringify(next));
  const updated = next.find((proof) => proof.id === id);
  if (updated) syncProofRecord("proof:update", updated);
  return updated;
}

export function attachProofMedia(id: string, dataUrl: string) {
  const proofs = getProofs();
  const next = proofs.map((proof) => proof.id === id ? { ...proof, mediaProofUrl: dataUrl } : proof);
  localStorage.setItem(PROOFS_KEY, JSON.stringify(next));
  const updated = next.find((proof) => proof.id === id);
  if (!updated) return undefined;
  if (!window.__AMX_CONFIG__?.mediaStorageConfigured || isLocalHost()) {
    syncProofRecord("proof:update", updated);
    return updated;
  }
  void fetch(dataUrl).then((response) => response.blob()).then(async (blob) => {
    const response = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": blob.type || "image/jpeg", "X-AMX-Filename": `${updated.missionId}-evidence.jpg`, "X-AMX-Tenant": updated.tenantId },
      body: blob,
    });
    if (!response.ok) throw new Error("Proof media upload failed");
    const stored = await response.json() as { url?: string };
    if (!stored.url) throw new Error("Proof media URL is missing");
    updateProofRecord(id, { mediaProofUrl: stored.url });
  }).catch(() => syncProofRecord("proof:update", updated));
  return updated;
}

export function getAnalytics() {
  return read<AnalyticsEvent[]>(EVENTS_KEY, []);
}

export function createProofRecord(mission: Mission, role: Role, xp: number, startedAt: number): ProofRecord {
  const existingId = localStorage.getItem("amx_active_proof");
  const existing = getProofs().find((item) => item.id === existingId && item.missionId === mission.id);
  const timestamp = existing?.timestamp || new Date().toISOString();
  const base = {
    ...(existing || startProofRecord(mission, role)),
    report: { completedSteps: ["pre", "pro", "post"], score: 92, xp, durationSeconds: Math.max(60, Math.round((Date.now() - startedAt) / 1000)) },
    certificate: { badge: mission.badge, issued: true, status: "ready" as const },
    status: "complete" as const, timestamp, syncStatus: navigator.onLine ? "synced" as const : "queued" as const,
  };
  const proof: ProofRecord = { ...base, signature: proofSignature(base) };
  const proofs = read<ProofRecord[]>(PROOFS_KEY, []);
  localStorage.setItem(PROOFS_KEY, JSON.stringify([proof, ...proofs.filter((item) => item.id !== proof.id)]));
  localStorage.removeItem("amx_active_proof");
  syncProofRecord("proof:complete", proof);
  awardBadge(mission.badge);
  trackEvent("mission_completed", { missionId: mission.id, role });
  return proof;
}

export function getProofs() { return read<ProofRecord[]>(PROOFS_KEY, []); }
export function validateProof(proof: ProofRecord) { return proof.signature === proofSignature(proof); }
export function getXP() { return read<number>(XP_KEY, 40); }
export function addXP(amount: number) {
  const total = getXP() + amount;
  localStorage.setItem(XP_KEY, JSON.stringify(total));
  return total;
}
export function getBadges() { return read<string[]>(BADGES_KEY, ["Agent Lab Explorer"]); }
export function awardBadge(badge: string) {
  const badges = getBadges();
  if (!badges.includes(badge)) localStorage.setItem(BADGES_KEY, JSON.stringify([badge, ...badges]));
}
export function getEvents() { return read<AnalyticsEvent[]>(EVENTS_KEY, []); }

export function speak(text: string, enabled = true) {
  if (!enabled || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.02;
  speechSynthesis.speak(utterance);
}

export async function shareCertificate(proof: ProofRecord) {
  const text = `AMX AIR Hubs Certificate\n\n${proof.certificate.badge}\nIssued to ${proof.learnerId}\nProof: ${proof.id}\n${new Date(proof.timestamp).toLocaleDateString()}`;
  if (navigator.share) {
    await navigator.share({ title: `${proof.certificate.badge} Certificate`, text });
    return;
  }
  const blob = new Blob([`<!doctype html><title>AMX Certificate</title><style>body{font-family:system-ui;background:#071017;color:white;display:grid;place-items:center;min-height:100vh}.c{border:2px solid #55e6ff;padding:64px;text-align:center}h1{color:#f4c96b}</style><div class="c"><p>AMX AIR HUBS</p><h1>${proof.certificate.badge}</h1><p>Issued to ${proof.learnerId}</p><p>${proof.id}</p></div>`], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `${proof.missionId}-certificate.html`; anchor.click();
  URL.revokeObjectURL(url);
}

export function missionCopilot(input: string, mission: Mission, stepIndex: number) {
  const topic = input.toLowerCase();
  if (topic.includes("safe") || topic.includes("space")) return "Keep a clear walking area, hold the device comfortably, and stay aware of people and objects around you.";
  if (topic.includes("proof") || topic.includes("record")) return "Your OPPRRC record stores the organization, program, project, resource, report, and certificate for this run.";
  if (topic.includes("xp") || topic.includes("badge")) return `This mission awards up to ${mission.xp} XP and the ${mission.badge} badge.`;
  return `For step ${stepIndex + 1}, focus on the completion signal: ${mission.steps[stepIndex]?.prompt || mission.objective}`;
}
