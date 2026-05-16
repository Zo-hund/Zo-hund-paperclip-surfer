import type { IssueRuntimeCapability, IssueRuntimeRequirements, RunExecutionPlan } from "@paperclipai/shared";
import { buildExecutionPlanAdapterOverride, resolveRunExecutionPlan } from "./gear-shifting.js";

type AgentLike = {
  adapterType: string;
  adapterConfig: unknown;
};

type BudgetSignal = {
  companyUtilizationPercent?: number | null;
};

type RunLike = {
  id: string;
  runMode: string;
  status: string;
  usageJson: Record<string, unknown> | null;
  retryOfRunId: string | null;
  processLossRetryCount: number;
  sessionIdBefore: string | null;
  sessionIdAfter: string | null;
  contextSnapshot: Record<string, unknown> | null;
};

export type PitStopOptimizationRecommendation = {
  triggerReason: string;
  triggerDetails: Record<string, unknown>;
  optimizationActions: string[];
  explanation: string;
  estimatedSavings: {
    percent: number;
    tokens: number | null;
  };
  recommendedRuntimeRequirements: IssueRuntimeRequirements;
  recommendedExecutionPlan: RunExecutionPlan;
  recommendedAdapterOverride: Record<string, unknown>;
  relaunchEligible: boolean;
};

const MEDIA_CAPABILITIES = new Set<IssueRuntimeCapability>(["image", "audio", "video"]);
const LOCAL_COMPATIBLE_OBJECTIVES = new Set(["technical", "research", "ops", "mixed"]);
const WARN_TOKENS = 3_471_495;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function hasRotationReason(context: Record<string, unknown> | null | undefined) {
  return Boolean(
    asString(context?.paperclipSessionRotationReason)
    ?? asString(context?.sessionRotationReason)
    ?? asString(context?.rotationReason),
  );
}

function cloneRequirements(requirements: IssueRuntimeRequirements): IssueRuntimeRequirements {
  return JSON.parse(JSON.stringify(requirements ?? {})) as IssueRuntimeRequirements;
}

function hasMediaCapabilities(requiredCapabilities: IssueRuntimeCapability[] | null | undefined) {
  return (requiredCapabilities ?? []).some((capability) => MEDIA_CAPABILITIES.has(capability));
}

function chooseLeanContextTier(requiredCapabilities: IssueRuntimeCapability[] | null | undefined) {
  return (requiredCapabilities ?? []).some((capability) => capability === "code" || capability === "files")
    ? "role_aware"
    : "minimal";
}

function maybeCheaperLocalHarness(
  currentHarness: string,
  requirements: IssueRuntimeRequirements,
) {
  if (hasMediaCapabilities(requirements.requiredCapabilities)) return null;
  if (!LOCAL_COMPATIBLE_OBJECTIVES.has(requirements.objectiveClass ?? "technical")) return null;
  if (currentHarness === "codex_local" || currentHarness === "opencode_local") return currentHarness;
  if ((requirements.requiredCapabilities ?? []).includes("code")) return "codex_local";
  return "opencode_local";
}

function parseCurrentExecutionPlan(context: Record<string, unknown> | null) {
  return asRecord(context?.executionPlan);
}

function totalObservedTokens(run: RunLike) {
  const usage = asRecord(run.usageJson);
  return (
    (asNumber(usage?.inputTokens) ?? asNumber(usage?.input_tokens) ?? 0)
    + (asNumber(usage?.outputTokens) ?? asNumber(usage?.output_tokens) ?? 0)
  );
}

function determineTriggers(run: RunLike, currentPlan: RunExecutionPlan, requirements: IssueRuntimeRequirements) {
  const wakeReason =
    asString(run.contextSnapshot?.wakeReason)
    ?? asString(run.contextSnapshot?.reason)
    ?? asString(run.contextSnapshot?.requestedRunMode);
  const triggers: string[] = [];
  const details: Record<string, unknown> = {
    sourceRunId: run.id,
    sourceRunStatus: run.status,
    wakeReason,
  };

  const observedTokens = totalObservedTokens(run);
  if (observedTokens > WARN_TOKENS) {
    triggers.push("token_burn_above_warn_threshold");
    details.observedTokens = observedTokens;
    details.warnThreshold = WARN_TOKENS;
  }

  if (
    (wakeReason?.includes("heartbeat") || wakeReason === "timer")
    && (currentPlan.contextTier === "engineering_full" || currentPlan.contextTier === "project_aware")
  ) {
    triggers.push("repeated_context_replay");
  }

  if (
    (requirements.budgetMode === "min_cost" || (requirements.qualityTier ?? "standard") === "economy")
    && currentPlan.selectedDeployment === "cloud"
    && !hasMediaCapabilities(requirements.requiredCapabilities)
  ) {
    triggers.push("poor_lane_budget_mismatch");
  }

  if (run.retryOfRunId || (run.processLossRetryCount ?? 0) > 0) {
    triggers.push("retry_process_churn");
    details.retryOfRunId = run.retryOfRunId;
    details.processLossRetryCount = run.processLossRetryCount ?? 0;
  }

  if (
    run.sessionIdBefore
    && (!run.sessionIdAfter || run.sessionIdAfter === run.sessionIdBefore)
    && !hasRotationReason(run.contextSnapshot)
  ) {
    triggers.push("session_growth_without_rotation");
  }

  return { triggers, details };
}

export function buildPitStopOptimizationRecommendation(input: {
  run: RunLike;
  agent: AgentLike;
  budget?: BudgetSignal;
}) {
  if (input.run.runMode !== "sim") return null;

  const context = input.run.contextSnapshot ?? {};
  const currentPlanRecord = parseCurrentExecutionPlan(context);
  const currentPlan = currentPlanRecord as unknown as RunExecutionPlan | null;
  if (!currentPlan) return null;

  const requirements = cloneRequirements(
    (asRecord(context.runtimeRequirements) as IssueRuntimeRequirements | null)
    ?? currentPlan.gearProfile
    ?? {},
  );

  const { triggers, details } = determineTriggers(input.run, currentPlan, requirements);
  if (triggers.length === 0) return null;

  const optimizationActions: string[] = [];
  const nextRequirements = cloneRequirements(requirements);
  nextRequirements.budgetMode = "min_cost";
  if (nextRequirements.qualityTier === "premium") {
    nextRequirements.qualityTier = "standard";
  }
  nextRequirements.manualOverride = {
    ...(nextRequirements.manualOverride ?? {}),
    contextTier: chooseLeanContextTier(nextRequirements.requiredCapabilities),
    reasoningTier: "low",
    variant: "low",
  };
  optimizationActions.push("compact_prompt", "incremental_context", "downgrade_reasoning");

  const localHarness = maybeCheaperLocalHarness(currentPlan.selectedHarness, nextRequirements);
  if (localHarness && currentPlan.selectedDeployment === "cloud") {
    nextRequirements.manualOverride = {
      ...(nextRequirements.manualOverride ?? {}),
      adapterType: localHarness,
      deploymentTarget: "local",
    };
    optimizationActions.push("switch_to_local_lane");
  }

  if (input.run.sessionIdBefore) {
    optimizationActions.push("fresh_session");
  }

  const recommendedExecutionPlan = resolveRunExecutionPlan({
    agent: {
      adapterType: input.agent.adapterType,
      adapterConfig: input.agent.adapterConfig,
    },
    contextSnapshot: context,
    runtimeRequirements: nextRequirements,
    budget: input.budget,
  });
  const recommendedAdapterOverride = buildExecutionPlanAdapterOverride(recommendedExecutionPlan, context.adapterOverride);

  const observedTokens = totalObservedTokens(input.run);
  const estimatedPercent = Math.min(
    70,
    (optimizationActions.includes("compact_prompt") ? 20 : 0)
      + (optimizationActions.includes("incremental_context") ? 15 : 0)
      + (optimizationActions.includes("downgrade_reasoning") ? 10 : 0)
      + (optimizationActions.includes("switch_to_local_lane") ? 15 : 0)
      + (optimizationActions.includes("fresh_session") ? 10 : 0),
  );

  const estimatedTokenSavings = observedTokens > 0
    ? Math.round((observedTokens * estimatedPercent) / 100)
    : null;

  return {
    triggerReason: triggers[0]!,
    triggerDetails: {
      ...details,
      triggers,
      currentContextTier: currentPlan.contextTier,
      currentDeployment: currentPlan.selectedDeployment,
      currentHarness: currentPlan.selectedHarness,
      currentModel: currentPlan.selectedModel,
    },
    optimizationActions,
    explanation: `Pit Stop flagged ${triggers.join(", ")} and recommends a lower-cost rerun using ${recommendedExecutionPlan.selectedHarness} / ${recommendedExecutionPlan.selectedDeployment} with ${recommendedExecutionPlan.contextTier} context.`,
    estimatedSavings: {
      percent: estimatedPercent,
      tokens: estimatedTokenSavings,
    },
    recommendedRuntimeRequirements: nextRequirements,
    recommendedExecutionPlan,
    recommendedAdapterOverride: recommendedAdapterOverride as Record<string, unknown>,
    relaunchEligible: ["succeeded", "failed", "timed_out", "cancelled"].includes(input.run.status),
  } satisfies PitStopOptimizationRecommendation;
}
