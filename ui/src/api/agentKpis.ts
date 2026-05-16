import { api } from "./client";
import type { HeartbeatTraceSummary } from "@paperclipai/shared";

export interface AgentKpi {
  id: string;
  agentId: string;
  companyId: string;
  projectId: string | null;
  runId: string | null;
  taskCompleted: boolean | null;
  selfAssessmentScore: number | null;
  tokensUsed: number | null;
  costCents: number | null;
  durationSeconds: number | null;
  errorsEncountered: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface KpiTrend {
  totalRuns: number;
  completionRate: number;
  avgCostCents: number;
  avgDurationSeconds: number;
  avgTokensUsed: number;
  trend: "improving" | "declining" | "stable";
}

export interface KpiObservation {
  id: string;
  companyId: string;
  observerType: "ceo_agent" | "board_human";
  observerAgentId: string | null;
  observerUserId: string | null;
  observation: string;
  agentIds: string[];
  actionTaken: boolean;
  actionNotes: string | null;
  createdAt: string;
  // UI-specific fields mapping or older versions
  title?: string;
  content?: string;
  severity?: "info" | "warning" | "critical";
  agentId?: string; // Singular used in filters
}

export interface AgentExperiment {
  id: string;
  agentId: string;
  companyId: string;
  hypothesis: string;
  approachA: string;
  approachB: string;
  taskType: string | null;
  status: "running" | "concluded" | "draft" | "paused" | "completed" | "cancelled";
  winningApproach: string | null;
  runsA: number;
  runsB: number;
  kpiResultsA: Record<string, unknown>;
  kpiResultsB: Record<string, unknown>;
  changeNotes: string | null;
  createdAt: string;
  concludedAt: string | null;
  // UI-specific fields
  name?: string;
  description?: string;
  result?: string;
}

export interface CompanyAnalytics {
  totalRuns: number;
  avgCompletionRate: number;
  totalCostCents: number;
  activeAgents: number;
  agentSummaries: Array<{
    agentId: string;
    agentName: string;
    totalRuns: number;
    completionRate: number;
    avgCostCents: number;
    avgDurationSeconds: number;
  }>;
}

export interface ExperimentCreateRequest {
  hypothesis: string;
  approachA: string;
  approachB: string;
  taskType?: string;
}

export interface ExperimentUpdateRequest {
  status?: "running" | "concluded";
  winningApproach?: string;
  changeNotes?: string;
}

export interface ObservationCreateRequest {
  observerType: "ceo_agent" | "board_human";
  observation: string;
  agentIds?: string[];
  actionTaken?: boolean;
  actionNotes?: string;
}

export interface TraceListFilters {
  agentId?: string;
  status?: string;
  issueId?: string;
  since?: string;
  limit?: number;
}

export const agentKpisApi = {
  list: (agentId: string, params?: { limit?: number }) => {
    let path = `/agents/${encodeURIComponent(agentId)}/kpis`;
    if (params?.limit) path += `?limit=${params.limit}`;
    return api.get<AgentKpi[]>(path);
  },
  trends: (agentId: string) =>
    api.get<KpiTrend>(`/agents/${encodeURIComponent(agentId)}/kpis/trends`),
};

export const analyticsApi = {
  getCompanyAnalytics: (companyId: string) =>
    api.get<CompanyAnalytics>(`/companies/${encodeURIComponent(companyId)}/analytics`),
  listTraces: (companyId: string, filters: TraceListFilters = {}) => {
    const searchParams = new URLSearchParams();
    if (filters.agentId) searchParams.set("agentId", filters.agentId);
    if (filters.status) searchParams.set("status", filters.status);
    if (filters.issueId) searchParams.set("issueId", filters.issueId);
    if (filters.since) searchParams.set("since", filters.since);
    if (filters.limit != null) searchParams.set("limit", String(filters.limit));
    const qs = searchParams.toString();
    return api.get<HeartbeatTraceSummary[]>(
      `/companies/${encodeURIComponent(companyId)}/analytics/traces${qs ? `?${qs}` : ""}`,
    );
  },
  listObservations: (companyId: string) =>
    api.get<KpiObservation[]>(
      `/companies/${encodeURIComponent(companyId)}/analytics/observations`,
    ),
  createObservation: (companyId: string, data: ObservationCreateRequest) =>
    api.post<KpiObservation>(
      `/companies/${encodeURIComponent(companyId)}/analytics/observations`,
      data,
    ),
  deleteObservation: (companyId: string, observationId: string) =>
    api.delete<{ success: true }>(
      `/companies/${encodeURIComponent(companyId)}/analytics/observations/${encodeURIComponent(observationId)}`,
    ),
};

export const experimentsApi = {
  list: (agentId: string) =>
    api.get<AgentExperiment[]>(`/agents/${encodeURIComponent(agentId)}/experiments`),
  create: (agentId: string, data: ExperimentCreateRequest) =>
    api.post<AgentExperiment>(
      `/agents/${encodeURIComponent(agentId)}/experiments`,
      data,
    ),
  update: (agentId: string, experimentId: string, data: ExperimentUpdateRequest) =>
    api.patch<AgentExperiment>(
      `/agents/${encodeURIComponent(agentId)}/experiments/${encodeURIComponent(experimentId)}`,
      data,
    ),
  delete: (agentId: string, experimentId: string) =>
    api.delete<{ success: true }>(
      `/agents/${encodeURIComponent(agentId)}/experiments/${encodeURIComponent(experimentId)}`,
    ),
};
