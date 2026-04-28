import { api } from "./client";

export interface PitStopNotebook {
  id: string;
  companyId: string;
  memberUserId: string;
  scenarioKey: string;
  scenarioLabel: string;
  issueId: string | null;
  workProductId: string | null;
  lastSourceRunId: string | null;
  latestSectionKey: string | null;
  currentMarkdown: string;
  createdAt: string;
  updatedAt: string;
}

export interface PitStopWorkspaceSummary {
  id: string;
  companyId: string;
  notebookId: string;
  memberUserId: string;
  scenarioKey: string;
  latestSimRunId: string | null;
  latestNotebookSectionKey: string | null;
  latestRunSummary: Record<string, unknown>;
  latestEvalSummary: Record<string, unknown>;
  coachingNotes: string | null;
  mentorNotes: string | null;
  sponsorNotes: string | null;
  generatedNotes: string[];
  draftAgentConfig: Record<string, unknown>;
  draftAgentDiff: Record<string, unknown>;
  targetAgentIds: string[];
  targetLiveSettings: Record<string, unknown>;
  targetTrack: string | null;
  targetRail: string | null;
  readinessScore: number | null;
  thresholdPassed: boolean;
  blockingIssues: string[];
  liveRecommendation: string | null;
  lastPackagedAt: string | null;
  lastApprovalId: string | null;
  createdAt: string;
  updatedAt: string;
  notebook: PitStopNotebook;
  notebookArtifact?: {
    id: string;
    title: string;
    summary: string | null;
    reviewState: string;
    status: string;
  } | null;
}

export interface PitStopPackage {
  id: string;
  companyId: string;
  workspaceId: string | null;
  notebookId: string;
  memberUserId: string;
  scenarioKey: string;
  version: number;
  status: string;
  sourceSimRunId: string | null;
  notebookSectionKey: string | null;
  notebookSnapshotMarkdown: string;
  runSummary: Record<string, unknown>;
  evalSummary: Record<string, unknown>;
  coachingNotes: string | null;
  mentorNotes: string | null;
  sponsorNotes: string | null;
  generatedNotes: string[];
  draftAgentConfig: Record<string, unknown>;
  draftAgentDiff: Record<string, unknown>;
  targetAgentIds: string[];
  targetLiveSettings: Record<string, unknown>;
  targetTrack: string | null;
  targetRail: string | null;
  readinessScore: number | null;
  thresholdPassed: boolean;
  blockingIssues: string[];
  liveRecommendation: string | null;
  approvalId: string | null;
  approvalOutcome: string | null;
  approvalNotes: string | null;
  approvalReviewedAt: string | null;
  promotedLiveRunIds: string[];
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PitStopWorkspaceDetail extends PitStopWorkspaceSummary {
  packages: PitStopPackage[];
}

export const pitStopApi = {
  listWorkspaces: (companyId: string, memberUserId?: string) => {
    const params = new URLSearchParams();
    if (memberUserId) params.set("memberUserId", memberUserId);
    return api.get<PitStopWorkspaceSummary[]>(
      `/companies/${companyId}/pit-stop/workspaces${params.toString() ? `?${params.toString()}` : ""}`,
    );
  },
  getWorkspace: (companyId: string, workspaceId: string) =>
    api.get<PitStopWorkspaceDetail>(`/companies/${companyId}/pit-stop/workspaces/${workspaceId}`),
  updateWorkspace: (
    companyId: string,
    workspaceId: string,
    patch: Partial<{
      coachingNotes: string | null;
      mentorNotes: string | null;
      sponsorNotes: string | null;
      generatedNotes: string[];
      draftAgentConfig: Record<string, unknown>;
      draftAgentDiff: Record<string, unknown>;
      targetAgentIds: string[];
      targetLiveSettings: Record<string, unknown>;
      targetTrack: string | null;
      targetRail: string | null;
    }>,
  ) => api.patch<PitStopWorkspaceDetail>(`/companies/${companyId}/pit-stop/workspaces/${workspaceId}`, patch),
  packagePromotion: (companyId: string, workspaceId: string) =>
    api.post<{ package: PitStopPackage; approval: { id: string; status: string } }>(
      `/companies/${companyId}/pit-stop/workspaces/${workspaceId}/package-promotion`,
      {},
    ),
  ingestRun: (companyId: string, runId: string) =>
    api.post(`/companies/${companyId}/pit-stop/ingest-run`, { runId }),
};
