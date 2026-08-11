export type TrustRisk = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
export type TrustStage = "simulation" | "pit-stop" | "live" | "held";

export interface TrustPassport {
  id: string;
  name: string;
  systemType: string;
  owner: string;
  riskLevel: TrustRisk;
  lifecycleStatus: "draft" | "active" | "suspended" | "retired";
  deploymentStage: TrustStage;
  modelProvider: string;
  dataClassification: string;
  disclosureStatus: "complete" | "incomplete";
  evidenceStatus: "verified" | "pending" | "expired";
  updatedAt: string;
}

export interface TrustAgentRecord {
  id: string;
  name: string;
  role: string;
  runtime: string;
  riskLevel: TrustRisk;
  toolCount: number;
  status: "active" | "held" | "offline";
  lastSeenAt: string;
}

export interface TrustReview {
  id: string;
  subjectId: string;
  subjectName: string;
  reviewType: string;
  riskLevel: TrustRisk;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  createdAt: string;
}

export interface TrustAuditEvent {
  id: string;
  eventType: string;
  actorId: string;
  subjectName: string;
  riskLevel: TrustRisk;
  outcome: string;
  detail: string;
  createdAt: string;
}

export interface TrustNode {
  id: string;
  name: string;
  location: string;
  status: "online" | "degraded" | "offline";
  lastHeartbeatAt: string;
}

export interface TrustState {
  tenantId: string;
  passports: TrustPassport[];
  agents: TrustAgentRecord[];
  reviews: TrustReview[];
  audit: TrustAuditEvent[];
  nodes: TrustNode[];
  persisted: boolean;
  requestId?: string;
}

const now = Date.now();
export const previewTrustState: TrustState = {
  tenantId: "tech-at-nite",
  persisted: false,
  passports: [
    { id: "pass-jaz", name: "JAZ Learning Guide", systemType: "voice-agent", owner: "AMX LABS", riskLevel: "R2", lifecycleStatus: "active", deploymentStage: "live", modelProvider: "LiveKit Agents", dataClassification: "member-context", disclosureStatus: "complete", evidenceStatus: "verified", updatedAt: new Date(now - 18 * 60_000).toISOString() },
    { id: "pass-stage-vision", name: "Stage Vision Operator", systemType: "vision-agent", owner: "AMX XR Stage", riskLevel: "R3", lifecycleStatus: "active", deploymentStage: "pit-stop", modelProvider: "AMX Vision Gateway", dataClassification: "camera-stream", disclosureStatus: "complete", evidenceStatus: "pending", updatedAt: new Date(now - 52 * 60_000).toISOString() },
    { id: "pass-zero", name: "Zero Operator Runtime", systemType: "tool-agent", owner: "AMX Control Plane", riskLevel: "R4", lifecycleStatus: "draft", deploymentStage: "simulation", modelProvider: "Agent Zero", dataClassification: "operator-private", disclosureStatus: "incomplete", evidenceStatus: "pending", updatedAt: new Date(now - 2 * 3_600_000).toISOString() },
  ],
  agents: [
    { id: "jaz", name: "JAZ", role: "Learning guide", runtime: "LiveKit", riskLevel: "R2", toolCount: 6, status: "active", lastSeenAt: new Date(now - 90_000).toISOString() },
    { id: "taz", name: "TAZ", role: "Production manager", runtime: "AMX Agent Gateway", riskLevel: "R3", toolCount: 11, status: "active", lastSeenAt: new Date(now - 4 * 60_000).toISOString() },
    { id: "zero", name: "ZERO", role: "Operator automation", runtime: "Isolated container", riskLevel: "R4", toolCount: 8, status: "held", lastSeenAt: new Date(now - 21 * 60_000).toISOString() },
  ],
  reviews: [
    { id: "review-stage-vision", subjectId: "pass-stage-vision", subjectName: "Stage Vision Operator", reviewType: "Pit Stop evidence", riskLevel: "R3", status: "pending", requestedBy: "TAZ", createdAt: new Date(now - 42 * 60_000).toISOString() },
    { id: "review-zero-tools", subjectId: "pass-zero", subjectName: "Zero Operator Runtime", reviewType: "Live tool scope", riskLevel: "R4", status: "pending", requestedBy: "AMX Control Plane", createdAt: new Date(now - 96 * 60_000).toISOString() },
  ],
  audit: [
    { id: "audit-1", eventType: "passport.verified", actorId: "operator", subjectName: "JAZ Learning Guide", riskLevel: "R2", outcome: "verified", detail: "Disclosure, model card, and consent path confirmed.", createdAt: new Date(now - 18 * 60_000).toISOString() },
    { id: "audit-2", eventType: "deployment.held", actorId: "policy-engine", subjectName: "Zero Operator Runtime", riskLevel: "R4", outcome: "held", detail: "Live tool scope requires two-person approval.", createdAt: new Date(now - 96 * 60_000).toISOString() },
  ],
  nodes: [
    { id: "air-box-hq", name: "AIR BOX / HQ", location: "Louisville Lab", status: "online", lastHeartbeatAt: new Date(now - 38_000).toISOString() },
    { id: "air-box-stage", name: "AIR BOX / XR Stage", location: "NEXUS1", status: "online", lastHeartbeatAt: new Date(now - 74_000).toISOString() },
  ],
};

async function trustApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", ...(init?.headers || {}) } });
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) throw new Error("Trust API is unavailable in this preview");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Trust request failed with HTTP ${response.status}`);
  return payload as T;
}

export async function loadTrustState(tenantId: string) {
  return trustApi<TrustState>(`/api/trust/state?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function bootstrapTrustRegistry(tenantId: string) {
  return trustApi<TrustState>("/api/trust/bootstrap", { method: "POST", body: JSON.stringify({ tenantId }) });
}

export async function createTrustPassport(tenantId: string, input: Pick<TrustPassport, "name" | "systemType" | "owner" | "riskLevel" | "modelProvider" | "dataClassification">) {
  return trustApi<{ passport: TrustPassport }>("/api/trust/passports", { method: "POST", body: JSON.stringify({ tenantId, ...input }) });
}

export async function decideTrustReview(tenantId: string, reviewId: string, decision: "approved" | "rejected", rationale: string) {
  return trustApi<{ review: TrustReview }>(`/api/trust/reviews/${encodeURIComponent(reviewId)}/decision`, { method: "POST", body: JSON.stringify({ tenantId, decision, rationale }) });
}

export async function approveTrustLive(tenantId: string, passportId: string, reason: string) {
  return trustApi<{ passport: TrustPassport }>(`/api/trust/passports/${encodeURIComponent(passportId)}/live-approval`, { method: "POST", body: JSON.stringify({ tenantId, reason, operatorApproved: true }) });
}
