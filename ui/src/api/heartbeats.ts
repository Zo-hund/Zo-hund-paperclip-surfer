import type {
  HeartbeatRun,
  HeartbeatRunEvent,
  InstanceSchedulerHeartbeatAgent,
  WorkspaceOperation,
} from "@paperclipai/shared";
import { api } from "./client";

export interface ActiveRunForIssue extends HeartbeatRun {
  agentId: string;
  agentName: string;
  adapterType: string;
}

export interface LiveRunForIssue {
  id: string;
  status: string;
  invocationSource: string;
  triggerDetail: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  agentId: string;
  agentName: string;
  adapterType: string;
  runMode?: string;
  swarmBatchId?: string | null;
  promotedFromRunId?: string | null;
  issueId?: string | null;
}

export const heartbeatsApi = {
  list: (companyId: string, agentId?: string, limit?: number) => {
    const searchParams = new URLSearchParams();
    if (agentId) searchParams.set("agentId", agentId);
    if (limit) searchParams.set("limit", String(limit));
    const qs = searchParams.toString();
    return api.get<HeartbeatRun[]>(`/companies/${companyId}/heartbeat-runs${qs ? `?${qs}` : ""}`);
  },
  get: (runId: string) => api.get<HeartbeatRun>(`/heartbeat-runs/${runId}`),
  events: (runId: string, afterSeq = 0, limit = 200) =>
    api.get<HeartbeatRunEvent[]>(
      `/heartbeat-runs/${runId}/events?afterSeq=${encodeURIComponent(String(afterSeq))}&limit=${encodeURIComponent(String(limit))}`,
    ),
  log: (runId: string, offset = 0, limitBytes = 256000) =>
    api.get<{ runId: string; store: string; logRef: string; content: string; nextOffset?: number }>(
      `/heartbeat-runs/${runId}/log?offset=${encodeURIComponent(String(offset))}&limitBytes=${encodeURIComponent(String(limitBytes))}`,
    ),
  workspaceOperations: (runId: string) =>
    api.get<WorkspaceOperation[]>(`/heartbeat-runs/${runId}/workspace-operations`),
  workspaceOperationLog: (operationId: string, offset = 0, limitBytes = 256000) =>
    api.get<{ operationId: string; store: string; logRef: string; content: string; nextOffset?: number }>(
      `/workspace-operations/${operationId}/log?offset=${encodeURIComponent(String(offset))}&limitBytes=${encodeURIComponent(String(limitBytes))}`,
    ),
  cancel: (runId: string) => api.post<void>(`/heartbeat-runs/${runId}/cancel`, {}),
  updateConfig: (runId: string, adapterType?: string, adapterConfig?: Record<string, unknown>) => 
    api.patch<HeartbeatRun>(`/heartbeat-runs/${runId}/config`, { adapterType, adapterConfig }),
  liveRunsForIssue: (issueId: string) =>
    api.get<LiveRunForIssue[]>(`/issues/${issueId}/live-runs`),
  activeRunForIssue: (issueId: string) =>
    api.get<ActiveRunForIssue | null>(`/issues/${issueId}/active-run`),
  liveRunsForCompany: (
    companyId: string,
    opts?: number | { minCount?: number; swarmBatchId?: string },
  ) => {
    const resolvedOpts = typeof opts === "number" ? { minCount: opts } : opts;
    const searchParams = new URLSearchParams();
    if (resolvedOpts?.minCount != null) searchParams.set("minCount", String(resolvedOpts.minCount));
    if (resolvedOpts?.swarmBatchId) searchParams.set("swarmBatchId", resolvedOpts.swarmBatchId);
    const qs = searchParams.toString();
    return api.get<LiveRunForIssue[]>(`/companies/${companyId}/live-runs${qs ? `?${qs}` : ""}`);
  },
  listInstanceSchedulerAgents: () =>
    api.get<InstanceSchedulerHeartbeatAgent[]>("/instance/scheduler-heartbeats"),
};
