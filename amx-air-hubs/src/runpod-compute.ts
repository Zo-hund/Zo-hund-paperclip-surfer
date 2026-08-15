export interface RunpodWorkload {
  id: string;
  label: string;
  gpu: string;
  maxSeconds: number;
  approvalRequired: boolean;
  outputKind: string;
  configured: boolean;
}

export interface RunpodHealth {
  configured: boolean;
  endpointCount: number;
  retentionMinutes: number;
  durableCapture: boolean;
  workloads: RunpodWorkload[];
  provider: { jobs?: Record<string, number>; workers?: Record<string, number> } | null;
}

export interface RunpodPolicy {
  tenantId: string;
  status: "active" | "paused";
  monthlyBudgetCents: number;
  perJobLimitCents: number;
  allowedWorkloads: string[];
  allowedGpus: string[];
  maxConcurrentJobs: number;
}

export interface RunpodUsage {
  spentCents: number;
  activeJobs: number;
}

export interface RunpodJob {
  id: string;
  tenantId: string;
  memberId: string;
  workload: string;
  status: string;
  gpuType: string;
  estimatedCents: number;
  actualCents: number | null;
  durationMs: number | null;
  outputUrl: string;
  outputContentType: string;
  mediaObjectId: string;
  deliveryTarget: "archive" | "stage" | "livekit";
  stageRoom: string;
  error: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface ApiError { error?: string }

async function computeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const payload = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) throw new Error(payload.error || `GPU compute request failed (${response.status})`);
  return payload;
}

export const loadRunpodHealth = () => computeRequest<RunpodHealth>("/api/runpod/health");

export async function loadRunpodPolicy(tenantId: string) {
  return computeRequest<{ policy: RunpodPolicy; usage: RunpodUsage }>(`/api/runpod/policy?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function saveRunpodPolicy(policy: RunpodPolicy) {
  return computeRequest<{ policy: RunpodPolicy }>("/api/runpod/policy", { method: "PUT", body: JSON.stringify(policy) });
}

export async function loadRunpodJobs(tenantId: string) {
  return computeRequest<{ jobs: RunpodJob[] }>(`/api/runpod/jobs?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function createRunpodJob(input: {
  tenantId: string;
  workload: string;
  prompt: string;
  sourceUrl?: string;
  deliveryTarget: "archive" | "stage" | "livekit";
  stageRoom: string;
  maxSeconds: number;
  lowPriority: boolean;
  operatorApproved: boolean;
}) {
  return computeRequest<{ job: RunpodJob }>("/api/runpod/jobs", { method: "POST", body: JSON.stringify(input) });
}

export async function refreshRunpodJob(jobId: string) {
  return computeRequest<{ job: RunpodJob }>(`/api/runpod/jobs/${encodeURIComponent(jobId)}`);
}

export async function cancelRunpodJob(jobId: string) {
  return computeRequest<{ job: RunpodJob }>(`/api/runpod/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}

export async function deliverRunpodJob(jobId: string, target: "archive" | "stage" | "livekit", roomCode: string) {
  return computeRequest<{ delivery: { id: string; target: string; roomCode: string; sourceUrl: string; contentType: string; status: string; detail: string; stageAsset: { id: string; name: string; url: string; contentType: string; addedAt: number } | null } }>(`/api/runpod/jobs/${encodeURIComponent(jobId)}/deliver`, { method: "POST", body: JSON.stringify({ target, roomCode }) });
}
