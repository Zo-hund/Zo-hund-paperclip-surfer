import type { HeartbeatRunStatus, HeartbeatTraceSummary } from "@paperclipai/shared";

type TraceRunRow = {
  id: string;
  companyId: string;
  agentId: string;
  agentName: string;
  adapterType: string | null;
  invocationSource: string;
  triggerDetail: string | null;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  errorCode: string | null;
  exitCode: number | null;
  usageJson: Record<string, unknown> | null;
  resultJson: Record<string, unknown> | null;
  sessionIdBefore: string | null;
  sessionIdAfter: string | null;
  logBytes: number | null;
  contextSnapshot: Record<string, unknown> | null;
};

type TraceEventRow = {
  runId: string;
  seq: number;
  eventType: string;
  message: string | null;
  payload: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function usageNumber(usage: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = asNumber(usage?.[key]);
    if (value != null) return value;
  }
  return 0;
}

function contextString(context: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = asString(context?.[key]);
    if (value) return value;
  }
  return null;
}

function eventPayloadValue(
  events: TraceEventRow[],
  eventType: string,
  key: string,
): string | number | boolean | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.eventType !== eventType || !event.payload) continue;
    const value = event.payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value;
  }
  return null;
}

function findLastEvent(events: TraceEventRow[], ...eventTypes: string[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (eventTypes.includes(events[index].eventType)) return events[index];
  }
  return null;
}

function attemptedModelsFromValue(value: unknown): HeartbeatTraceSummary["attemptedModels"] {
  return asArray(value)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      attempt: asNumber(entry.attempt) ?? 0,
      harness: asString(entry.harness) ?? "unknown",
      model: asString(entry.model),
      provider: asString(entry.provider),
      variant: asString(entry.variant),
      deployment: (asString(entry.deployment) ?? "local") as HeartbeatTraceSummary["selectedDeployment"],
      reasoningTier: (asString(entry.reasoningTier) ?? "standard") as "low" | "standard" | "high",
      outcome: (asString(entry.outcome) ?? "failed") as "succeeded" | "failed",
      errorCode: asString(entry.errorCode),
      errorMessage: asString(entry.errorMessage),
      failureCategory: (asString(entry.failureCategory) ?? null) as HeartbeatTraceSummary["failureCategory"],
    }));
}

export function buildHeartbeatTraceSummary(
  run: TraceRunRow,
  events: TraceEventRow[],
): HeartbeatTraceSummary {
  const context = asRecord(run.contextSnapshot);
  const usage = asRecord(run.usageJson);
  const wakeupPayload = asRecord(findLastEvent(events, "wakeup.received")?.payload);
  const contextPayload = asRecord(findLastEvent(events, "context.prepared")?.payload);
  const workspacePayload = asRecord(findLastEvent(events, "workspace.resolved")?.payload);
  const rotationPayload = asRecord(findLastEvent(events, "session.rotation")?.payload);
  const commandPayload = asRecord(findLastEvent(events, "adapter.command.prepared")?.payload);
  const failoverPayload = asRecord(findLastEvent(events, "model.failover.applied")?.payload);
  const pitStopPayload = asRecord(findLastEvent(events, "pitstop.triggered")?.payload);
  const usagePayload = asRecord(findLastEvent(events, "run.usage.recorded")?.payload);
  const finishedPayload = asRecord(findLastEvent(events, "run.finished")?.payload);
  const failedEvent = findLastEvent(events, "run.failed");
  const failedPayload = asRecord(failedEvent?.payload);

  const inputTokens = usageNumber(usage, "inputTokens", "input_tokens");
  const outputTokens = usageNumber(usage, "outputTokens", "output_tokens");
  const cachedInputTokens = usageNumber(
    usage,
    "cachedInputTokens",
    "cached_input_tokens",
    "cache_read_input_tokens",
  );
  const durationSeconds =
    asNumber(usagePayload?.durationSeconds)
    ?? asNumber(finishedPayload?.durationSeconds)
    ?? (run.startedAt && run.finishedAt
      ? Math.max(0, Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000))
      : null);

  const primaryEvent = findLastEvent(events, "run.failed", "run.finished", "run.started");

  return {
    runId: run.id,
    companyId: run.companyId,
    agentId: run.agentId,
    agentName: run.agentName,
    status: run.status as HeartbeatRunStatus,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    wakeSource:
      (asString(wakeupPayload?.wakeSource)
        ?? contextString(context, "wakeSource", "source")
        ?? run.invocationSource) as HeartbeatTraceSummary["wakeSource"],
    wakeReason:
      asString(wakeupPayload?.wakeReason)
      ?? asString(contextPayload?.wakeReason)
      ?? contextString(context, "wakeReason", "reason"),
    triggerDetail:
      asString(wakeupPayload?.triggerDetail)
      ?? asString(contextPayload?.triggerDetail)
      ?? asString(run.triggerDetail)
      ?? contextString(context, "wakeTriggerDetail"),
    issueId:
      asString(wakeupPayload?.issueId)
      ?? asString(contextPayload?.issueId)
      ?? contextString(context, "issueId"),
    commentId:
      asString(wakeupPayload?.commentId)
      ?? asString(contextPayload?.commentId)
      ?? contextString(context, "commentId", "wakeCommentId"),
    approvalId:
      asString(wakeupPayload?.approvalId)
      ?? asString(contextPayload?.approvalId)
      ?? contextString(context, "approvalId"),
    adapterType:
      asString(commandPayload?.adapterType)
      ?? run.adapterType,
    model:
      asString(commandPayload?.model)
      ?? asString(usage?.model)
      ?? asString(asRecord(run.resultJson)?.model),
    effectiveVariant:
      asString(commandPayload?.effectiveVariant)
      ?? asString(usage?.effectiveVariant)
      ?? asString(usage?.reasoningEffort),
    gearProfile:
      (asRecord(contextPayload?.gearProfile)
        ?? asRecord(asRecord(context?.executionPlan)?.gearProfile)
        ?? asRecord(context?.runtimeRequirements)) as HeartbeatTraceSummary["gearProfile"],
    contextTier:
      (asString(commandPayload?.contextTier)
        ?? asString(contextPayload?.contextTier)
        ?? contextString(asRecord(context?.executionPlan), "contextTier")
        ?? contextString(context, "contextTier")) as HeartbeatTraceSummary["contextTier"],
    selectedHarness:
      asString(commandPayload?.selectedHarness)
      ?? asString(contextPayload?.selectedHarness)
      ?? contextString(asRecord(context?.executionPlan), "selectedHarness")
      ?? asString(commandPayload?.adapterType)
      ?? run.adapterType,
    selectedModel:
      asString(commandPayload?.selectedModel)
      ?? asString(contextPayload?.selectedModel)
      ?? contextString(asRecord(context?.executionPlan), "selectedModel")
      ?? asString(commandPayload?.model)
      ?? asString(usage?.model)
      ?? asString(asRecord(run.resultJson)?.model),
    selectedDeployment:
      (asString(commandPayload?.selectedDeployment)
        ?? asString(contextPayload?.selectedDeployment)
        ?? contextString(asRecord(context?.executionPlan), "selectedDeployment")
        ?? contextString(context, "selectedDeployment")) as HeartbeatTraceSummary["selectedDeployment"],
    selectedProvider:
      asString(commandPayload?.selectedProvider)
      ?? asString(contextPayload?.selectedProvider)
      ?? contextString(asRecord(context?.executionPlan), "selectedProvider"),
    selectedWorkspaceMode:
      (asString(commandPayload?.selectedWorkspaceMode)
        ?? asString(contextPayload?.selectedWorkspaceMode)
        ?? contextString(asRecord(context?.executionPlan), "selectedWorkspaceMode")
        ?? contextString(context, "selectedWorkspaceMode")) as HeartbeatTraceSummary["selectedWorkspaceMode"],
    selectionReason:
      asString(commandPayload?.selectionReason)
      ?? asString(contextPayload?.selectionReason)
      ?? contextString(asRecord(context?.executionPlan), "selectionReason")
      ?? contextString(context, "selectionReason"),
    fallbackApplied:
      asBoolean(commandPayload?.fallbackApplied)
      ?? asBoolean(contextPayload?.fallbackApplied)
      ?? asBoolean(asRecord(context?.executionPlan)?.fallbackApplied)
      ?? false,
    manualOverrideApplied:
      asBoolean(commandPayload?.manualOverrideApplied)
      ?? asBoolean(contextPayload?.manualOverrideApplied)
      ?? asBoolean(asRecord(context?.executionPlan)?.manualOverrideApplied)
      ?? false,
    initialSelectedModel:
      asString(finishedPayload?.initialSelectedModel)
      ?? asString(failedPayload?.initialSelectedModel)
      ?? asString(commandPayload?.initialSelectedModel)
      ?? contextString(asRecord(context?.executionPlan), "initialSelectedModel")
      ?? contextString(context, "initialSelectedModel")
      ?? asString(commandPayload?.selectedModel)
      ?? asString(commandPayload?.model)
      ?? null,
    failureCategory:
      (asString(finishedPayload?.failureCategory)
        ?? asString(failedPayload?.failureCategory)
        ?? asString(failoverPayload?.failureCategory)
        ?? contextString(asRecord(context?.executionPlan), "failureCategory")
        ?? contextString(context, "failureCategory")) as HeartbeatTraceSummary["failureCategory"],
    failoverAttempt:
      asNumber(finishedPayload?.failoverAttempt)
      ?? asNumber(failedPayload?.failoverAttempt)
      ?? asNumber(failoverPayload?.failoverAttempt)
      ?? asNumber(asRecord(context?.executionPlan)?.failoverAttempt)
      ?? 0,
    failoverFromModel:
      asString(finishedPayload?.failoverFromModel)
      ?? asString(failedPayload?.failoverFromModel)
      ?? asString(failoverPayload?.failoverFromModel)
      ?? contextString(asRecord(context?.executionPlan), "failoverFromModel"),
    failoverToModel:
      asString(finishedPayload?.failoverToModel)
      ?? asString(failedPayload?.failoverToModel)
      ?? asString(failoverPayload?.failoverToModel)
      ?? contextString(asRecord(context?.executionPlan), "failoverToModel"),
    failoverExhausted:
      asBoolean(finishedPayload?.failoverExhausted)
      ?? asBoolean(failedPayload?.failoverExhausted)
      ?? asBoolean(asRecord(context?.executionPlan)?.failoverExhausted)
      ?? false,
    attemptedModels:
      attemptedModelsFromValue(finishedPayload?.attemptedModels)
        .concat(attemptedModelsFromValue(failedPayload?.attemptedModels))
        .concat(attemptedModelsFromValue(asRecord(context?.executionPlan)?.attemptedModels))
        .filter((entry, index, items) =>
          items.findIndex((candidate) => candidate.attempt === entry.attempt && candidate.model === entry.model) === index,
        ),
    pitStopTriggered:
      asBoolean(pitStopPayload?.pitStopTriggered)
      ?? asBoolean(context?.pitStopTriggered)
      ?? false,
    pitStopTriggerReason:
      asString(pitStopPayload?.pitStopTriggerReason)
      ?? contextString(context, "pitStopTriggerReason"),
    pitStopWorkspaceId:
      asString(pitStopPayload?.pitStopWorkspaceId)
      ?? contextString(context, "pitStopWorkspaceId"),
    pitStopOptimizationId:
      asString(pitStopPayload?.pitStopOptimizationId)
      ?? contextString(context, "pitStopOptimizationId"),
    pitStopSourceRunId:
      asString(pitStopPayload?.pitStopSourceRunId)
      ?? contextString(context, "pitStopSourceRunId"),
    workspaceId:
      asString(workspacePayload?.workspaceId)
      ?? contextString(context, "executionWorkspaceId", "workspaceId"),
    workspaceSource:
      asString(workspacePayload?.workspaceSource)
      ?? contextString(context, "workspaceSource"),
    cwd:
      asString(workspacePayload?.cwd)
      ?? asString(commandPayload?.cwd),
    sessionRotated:
      (eventPayloadValue(events, "session.rotation", "sessionRotated") as boolean | null)
      ?? Boolean(asString(rotationPayload?.sessionRotationReason) ?? contextString(context, "paperclipSessionRotationReason")),
    sessionRotationReason:
      asString(rotationPayload?.sessionRotationReason)
      ?? contextString(context, "paperclipSessionRotationReason"),
    sessionIdBefore:
      asString(rotationPayload?.sessionIdBefore)
      ?? run.sessionIdBefore,
    sessionIdAfter:
      asString(rotationPayload?.sessionIdAfter)
      ?? run.sessionIdAfter,
    inputTokens:
      asNumber(usagePayload?.inputTokens)
      ?? inputTokens,
    outputTokens:
      asNumber(usagePayload?.outputTokens)
      ?? outputTokens,
    cachedInputTokens:
      asNumber(usagePayload?.cachedInputTokens)
      ?? cachedInputTokens,
    durationSeconds,
    exitCode:
      asNumber(finishedPayload?.exitCode)
      ?? asNumber(failedPayload?.exitCode)
      ?? run.exitCode,
    errorCode:
      asString(failedPayload?.errorCode)
      ?? run.errorCode,
    errorMessage:
      asString(failedPayload?.errorMessage)
      ?? failedEvent?.message
      ?? run.error,
    eventCount: events.length,
    logBytes: run.logBytes ?? 0,
    hasLog: Boolean((run.logBytes ?? 0) > 0),
    primaryEventType: primaryEvent?.eventType ?? null,
  };
}
