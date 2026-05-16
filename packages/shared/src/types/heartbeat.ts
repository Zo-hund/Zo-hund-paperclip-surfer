import type {
  AgentRole,
  HeartbeatRunMode,
  OperatingEnvironment,
  AgentStatus,
  HeartbeatInvocationSource,
  HeartbeatRunStatus,
  WakeupTriggerDetail,
  WakeupRequestStatus,
} from "../constants.js";
import type {
  IssueRuntimeContextTier,
  IssueRuntimeDeploymentTarget,
  IssueRuntimeRequirements,
  IssueRuntimeReasoningTier,
  IssueRuntimeWorkspaceMode,
} from "./issue.js";

export type RunFailoverCategory =
  | "rate_limited"
  | "quota_exhausted"
  | "provider_denied"
  | "auth_failed"
  | "non_retryable";

export interface RunExecutionCandidate {
  harness: string;
  model: string | null;
  provider: string | null;
  variant: string | null;
  deployment: IssueRuntimeDeploymentTarget;
  reasoningTier: IssueRuntimeReasoningTier;
  reason: string;
}

export interface RunExecutionFailoverPolicy {
  maxAttempts: number;
  retryableCategories: RunFailoverCategory[];
}

export interface RunExecutionAttemptTrace {
  attempt: number;
  harness: string;
  model: string | null;
  provider: string | null;
  variant: string | null;
  deployment: IssueRuntimeDeploymentTarget;
  reasoningTier: IssueRuntimeReasoningTier;
  outcome: "succeeded" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  failureCategory: RunFailoverCategory | null;
}

export interface HeartbeatRun {
  id: string;
  companyId: string;
  agentId: string;
  invocationSource: HeartbeatInvocationSource;
  triggerDetail: WakeupTriggerDetail | null;
  status: HeartbeatRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  wakeupRequestId: string | null;
  exitCode: number | null;
  signal: string | null;
  usageJson: Record<string, unknown> | null;
  resultJson: Record<string, unknown> | null;
  sessionIdBefore: string | null;
  sessionIdAfter: string | null;
  logStore: string | null;
  logRef: string | null;
  logBytes: number | null;
  logSha256: string | null;
  logCompressed: boolean;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
  errorCode: string | null;
  externalRunId: string | null;
  processPid: number | null;
  processStartedAt: Date | null;
  retryOfRunId: string | null;
  processLossRetryCount: number;
  contextSnapshot: Record<string, unknown> | null;
  runMode: HeartbeatRunMode;
  environment: OperatingEnvironment;
  swarmBatchId: string | null;
  promotedFromRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HeartbeatRunEvent {
  id: number;
  companyId: string;
  runId: string;
  agentId: string;
  seq: number;
  eventType: string;
  stream: "system" | "stdout" | "stderr" | null;
  level: "info" | "warn" | "error" | null;
  color: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface HeartbeatTraceSummary {
  runId: string;
  companyId: string;
  agentId: string;
  agentName: string;
  status: HeartbeatRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  wakeSource: HeartbeatInvocationSource | null;
  wakeReason: string | null;
  triggerDetail: string | null;
  issueId: string | null;
  commentId: string | null;
  approvalId: string | null;
  adapterType: string | null;
  model: string | null;
  effectiveVariant: string | null;
  gearProfile: IssueRuntimeRequirements | null;
  contextTier: IssueRuntimeContextTier | null;
  selectedHarness: string | null;
  selectedModel: string | null;
  selectedDeployment: IssueRuntimeDeploymentTarget | null;
  selectedProvider: string | null;
  selectedWorkspaceMode: IssueRuntimeWorkspaceMode | null;
  selectionReason: string | null;
  fallbackApplied: boolean;
  manualOverrideApplied: boolean;
  initialSelectedModel: string | null;
  failureCategory: RunFailoverCategory | null;
  failoverAttempt: number;
  failoverFromModel: string | null;
  failoverToModel: string | null;
  failoverExhausted: boolean;
  attemptedModels: RunExecutionAttemptTrace[];
  pitStopTriggered: boolean;
  pitStopTriggerReason: string | null;
  pitStopWorkspaceId: string | null;
  pitStopOptimizationId: string | null;
  pitStopSourceRunId: string | null;
  workspaceId: string | null;
  workspaceSource: string | null;
  cwd: string | null;
  sessionRotated: boolean;
  sessionRotationReason: string | null;
  sessionIdBefore: string | null;
  sessionIdAfter: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  durationSeconds: number | null;
  exitCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  eventCount: number;
  logBytes: number;
  hasLog: boolean;
  primaryEventType: string | null;
}

export interface RunExecutionPlan {
  gearProfile: IssueRuntimeRequirements;
  contextTier: IssueRuntimeContextTier;
  selectedHarness: string;
  selectedModel: string | null;
  selectedDeployment: IssueRuntimeDeploymentTarget;
  selectedProvider: string | null;
  selectedVariant: string | null;
  selectedWorkspaceMode: IssueRuntimeWorkspaceMode;
  selectionReason: string;
  fallbackApplied: boolean;
  manualOverrideApplied: boolean;
  initialSelectedModel: string | null;
  candidateModels: RunExecutionCandidate[];
  failoverPolicy: RunExecutionFailoverPolicy;
}

export interface AgentRuntimeState {
  agentId: string;
  companyId: string;
  adapterType: string;
  sessionId: string | null;
  sessionDisplayId?: string | null;
  sessionParamsJson?: Record<string, unknown> | null;
  stateJson: Record<string, unknown>;
  lastRunId: string | null;
  lastRunStatus: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedInputTokens: number;
  totalCostCents: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentTaskSession {
  id: string;
  companyId: string;
  agentId: string;
  adapterType: string;
  taskKey: string;
  sessionParamsJson: Record<string, unknown> | null;
  sessionDisplayId: string | null;
  lastRunId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentWakeupRequest {
  id: string;
  companyId: string;
  agentId: string;
  source: HeartbeatInvocationSource;
  triggerDetail: WakeupTriggerDetail | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  status: WakeupRequestStatus;
  coalescedCount: number;
  requestedByActorType: "user" | "agent" | "system" | null;
  requestedByActorId: string | null;
  idempotencyKey: string | null;
  runId: string | null;
  requestedAt: Date;
  claimedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstanceSchedulerHeartbeatAgent {
  id: string;
  companyId: string;
  companyName: string;
  companyIssuePrefix: string;
  agentName: string;
  agentUrlKey: string;
  role: AgentRole;
  title: string | null;
  status: AgentStatus;
  adapterType: string;
  intervalSec: number;
  heartbeatEnabled: boolean;
  schedulerActive: boolean;
  lastHeartbeatAt: Date | null;
}
