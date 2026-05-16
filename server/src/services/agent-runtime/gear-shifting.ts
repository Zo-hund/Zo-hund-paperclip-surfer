import type {
  IssueRuntimeCapability,
  IssueRuntimeContextTier,
  IssueRuntimeDeploymentPreference,
  IssueRuntimeDeploymentTarget,
  IssueRuntimeManualOverride,
  IssueRuntimeQualityTier,
  IssueRuntimeReasoningTier,
  IssueRuntimeRequirements,
  IssueRuntimeWorkspaceMode,
  RunExecutionPlan,
} from "@paperclipai/shared";

type AgentLike = {
  adapterType: string;
  adapterConfig: unknown;
};

type BudgetSignal = {
  companyUtilizationPercent?: number | null;
  projectBudgetBlocked?: boolean;
};

type ResolveRunExecutionPlanInput = {
  agent: AgentLike;
  contextSnapshot?: Record<string, unknown> | null;
  runtimeRequirements?: IssueRuntimeRequirements | null;
  budget?: BudgetSignal;
};

const LOCAL_ADAPTERS = new Set([
  "claude_local",
  "codex_local",
  "opencode_local",
  "pi_local",
  "cursor",
  "hermes_local",
]);

const VALID_OBJECTIVE_CLASSES = new Set(["creative", "technical", "research", "ops", "mixed"]);
const VALID_QUALITY_TIERS = new Set(["economy", "standard", "premium"]);
const VALID_LATENCY_TIERS = new Set(["background", "interactive", "urgent"]);
const VALID_BUDGET_MODES = new Set(["min_cost", "balanced", "best_effort"]);
const VALID_DEPLOYMENT_PREFERENCES = new Set(["local_only", "cloud_only", "local_then_cloud", "cloud_then_local"]);
const VALID_DATA_SENSITIVITY = new Set(["local_preferred", "cloud_allowed"]);
const VALID_CAPABILITIES = new Set(["web", "files", "code", "image", "audio", "video"]);
const VALID_CONTEXT_TIERS = new Set(["minimal", "role_aware", "project_aware", "engineering_full"]);
const VALID_REASONING_TIERS = new Set(["low", "standard", "high"]);
const VALID_WORKSPACE_MODES = new Set(["agent_home", "project_workspace"]);
const VALID_DEPLOYMENT_TARGETS = new Set(["local", "cloud"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function pickEnum<T extends string>(value: unknown, valid: Set<string>, fallback: T): T {
  const normalized = asString(value);
  return normalized && valid.has(normalized) ? (normalized as T) : fallback;
}

function uniqueCapabilities(value: unknown): IssueRuntimeCapability[] {
  return [...new Set(asStringArray(value).filter((item): item is IssueRuntimeCapability => VALID_CAPABILITIES.has(item)))];
}

function normalizeManualOverride(value: unknown): IssueRuntimeManualOverride | null {
  const parsed = asRecord(value);
  if (!parsed) return null;
  const manualOverride: IssueRuntimeManualOverride = {
    adapterType: asString(parsed.adapterType),
    provider: asString(parsed.provider),
    model: asString(parsed.model),
    variant: asString(parsed.variant),
    allowAutoSwitch: asBoolean(parsed.allowAutoSwitch),
    cwd: asString(parsed.cwd),
    deploymentTarget: (() => {
      const deploymentTarget = asString(parsed.deploymentTarget);
      return deploymentTarget && VALID_DEPLOYMENT_TARGETS.has(deploymentTarget)
        ? (deploymentTarget as IssueRuntimeDeploymentTarget)
        : null;
    })(),
    contextTier: (() => {
      const contextTier = asString(parsed.contextTier);
      return contextTier && VALID_CONTEXT_TIERS.has(contextTier)
        ? (contextTier as IssueRuntimeContextTier)
        : null;
    })(),
    reasoningTier: (() => {
      const reasoningTier = asString(parsed.reasoningTier);
      return reasoningTier && VALID_REASONING_TIERS.has(reasoningTier)
        ? (reasoningTier as IssueRuntimeReasoningTier)
        : null;
    })(),
    workspaceMode: (() => {
      const workspaceMode = asString(parsed.workspaceMode);
      return workspaceMode && VALID_WORKSPACE_MODES.has(workspaceMode)
        ? (workspaceMode as IssueRuntimeWorkspaceMode)
        : null;
    })(),
  };
  const nonEmpty = Object.values(manualOverride).some((value) => value != null);
  return nonEmpty ? manualOverride : null;
}

export function normalizeRuntimeRequirements(
  value: unknown,
  contextSnapshot?: Record<string, unknown> | null,
): IssueRuntimeRequirements {
  const parsed = asRecord(value);
  const context = contextSnapshot ?? {};
  const requiredCapabilities = uniqueCapabilities(parsed?.requiredCapabilities ?? context.requiredCapabilities);
  const inferredObjectiveClass =
    requiredCapabilities.includes("code") ? "technical"
      : requiredCapabilities.includes("image") || requiredCapabilities.includes("audio") || requiredCapabilities.includes("video") ? "creative"
      : asString(context.wakeSource) === "timer" ? "ops"
      : "technical";

  return {
    objectiveClass: pickEnum(parsed?.objectiveClass, VALID_OBJECTIVE_CLASSES, inferredObjectiveClass),
    qualityTier: pickEnum(parsed?.qualityTier, VALID_QUALITY_TIERS, "standard"),
    latencyTier: pickEnum(parsed?.latencyTier, VALID_LATENCY_TIERS, asString(context.wakeSource) === "timer" ? "background" : "interactive"),
    budgetMode: pickEnum(parsed?.budgetMode, VALID_BUDGET_MODES, "balanced"),
    deploymentPreference: pickEnum(parsed?.deploymentPreference, VALID_DEPLOYMENT_PREFERENCES, "local_then_cloud"),
    dataSensitivity: pickEnum(parsed?.dataSensitivity, VALID_DATA_SENSITIVITY, "local_preferred"),
    requiredCapabilities,
    manualOverride: normalizeManualOverride(parsed?.manualOverride),
  };
}

function inferDeploymentTarget(adapterType: string): IssueRuntimeDeploymentTarget {
  return LOCAL_ADAPTERS.has(adapterType) ? "local" : "cloud";
}

function downgradeContextTier(contextTier: IssueRuntimeContextTier): IssueRuntimeContextTier {
  if (contextTier === "engineering_full") return "project_aware";
  if (contextTier === "project_aware") return "role_aware";
  if (contextTier === "role_aware") return "minimal";
  return "minimal";
}

function chooseContextTier(
  requirements: IssueRuntimeRequirements,
  budget: BudgetSignal | undefined,
): IssueRuntimeContextTier {
  const manualTier = requirements.manualOverride?.contextTier;
  if (manualTier) return manualTier;

  let contextTier: IssueRuntimeContextTier;
  if (requirements.objectiveClass === "technical" && requirements.qualityTier === "premium") {
    contextTier = "engineering_full";
  } else if (requirements.objectiveClass === "technical" || requirements.objectiveClass === "research") {
    contextTier = "project_aware";
  } else if (requirements.objectiveClass === "creative" || requirements.objectiveClass === "mixed") {
    contextTier = "role_aware";
  } else {
    contextTier = "minimal";
  }

  if (
    requirements.budgetMode === "min_cost"
    || (budget?.companyUtilizationPercent ?? 0) >= 80
    || budget?.projectBudgetBlocked
  ) {
    return downgradeContextTier(contextTier);
  }
  return contextTier;
}

function chooseWorkspaceMode(
  requirements: IssueRuntimeRequirements,
  contextTier: IssueRuntimeContextTier,
): IssueRuntimeWorkspaceMode {
  const manualMode = requirements.manualOverride?.workspaceMode;
  if (manualMode) return manualMode;
  if (
    requirements.requiredCapabilities?.includes("code")
    || requirements.requiredCapabilities?.includes("files")
    || requirements.objectiveClass === "technical"
    || requirements.objectiveClass === "research"
    || contextTier === "engineering_full"
    || contextTier === "project_aware"
  ) {
    return "project_workspace";
  }
  return "agent_home";
}

function chooseReasoningTier(
  requirements: IssueRuntimeRequirements,
  budget: BudgetSignal | undefined,
): IssueRuntimeReasoningTier {
  const manualTier = requirements.manualOverride?.reasoningTier;
  if (manualTier) return manualTier;
  if (
    requirements.objectiveClass === "ops"
    || requirements.latencyTier === "background"
    || requirements.budgetMode === "min_cost"
    || (budget?.companyUtilizationPercent ?? 0) >= 80
  ) {
    return "low";
  }
  if (requirements.qualityTier === "premium" || requirements.objectiveClass === "research") {
    return "high";
  }
  return "standard";
}

function chooseModel(
  harness: string,
  currentConfig: Record<string, unknown>,
  qualityTier: IssueRuntimeQualityTier,
  budgetMode: string,
): string | null {
  const currentModel = asString(currentConfig.model) ?? asString(currentConfig.providerModel);
  if (harness === "codex_local") {
    if (budgetMode === "min_cost" || qualityTier === "economy") return "gpt-5.4-mini";
    if (qualityTier === "premium") return "gpt-5.5";
    return currentModel ?? "gpt-5.4";
  }
  if (harness === "opencode_local") {
    if (budgetMode === "min_cost" || qualityTier === "economy") return currentModel ?? "gpt-5.4-mini";
    if (qualityTier === "premium") return currentModel ?? "gpt-5.5";
    return currentModel ?? "gpt-5.4";
  }
  if (harness === "cursor") {
    if (budgetMode === "min_cost" || qualityTier === "economy") return currentModel ?? "gpt-5.4-mini";
    return currentModel ?? "gpt-5.4";
  }
  return currentModel;
}

function deriveProviderFromModel(model: string | null): string | null {
  if (!model?.includes("/")) return null;
  return model.split("/")[0] ?? null;
}

function parseModelSegments(model: string | null): { provider: string | null; name: string | null } {
  if (!model) return { provider: null, name: null };
  const parts = model.split("/");
  if (parts.length === 1) return { provider: null, name: parts[0] ?? null };
  return {
    provider: parts[0] ?? null,
    name: parts[parts.length - 1] ?? null,
  };
}

function prefixModel(provider: string | null, name: string | null) {
  if (!name) return null;
  return provider ? `${provider}/${name}` : name;
}

function cheaperModelNames(model: string | null) {
  const { name } = parseModelSegments(model);
  if (!name) return [] as string[];
  if (name.includes("gpt-5.5")) return ["gpt-5.4", "gpt-5.4-mini", "gpt-4o-mini"];
  if (name.includes("gpt-5.4") && !name.includes("mini")) return ["gpt-5.4-mini", "gpt-4o-mini"];
  if (name.includes("gemini-2.5-flash") && !name.includes("lite")) return ["gemini-2.5-flash-lite"];
  if (name.includes("claude-3-5-sonnet")) return ["claude-3-5-haiku"];
  if (name.includes("claude-3-7-sonnet")) return ["claude-3-5-sonnet", "claude-3-5-haiku"];
  return [];
}

function alternateProviderCandidates(model: string | null) {
  const { provider, name } = parseModelSegments(model);
  if (!name) return [] as string[];
  if (provider === "google") return ["openrouter/openai/gpt-4o-mini"];
  if (provider === "openrouter") return ["google/gemini-2.5-flash-lite"];
  if (provider === "anthropic") return ["openrouter/openai/gpt-4o-mini"];
  if (name.startsWith("gpt-")) return ["google/gemini-2.5-flash-lite"];
  if (name.startsWith("gemini-")) return ["openrouter/openai/gpt-4o-mini"];
  if (name.startsWith("claude-")) return ["openrouter/openai/gpt-4o-mini"];
  return [];
}

function chooseVariant(harness: string, reasoningTier: IssueRuntimeReasoningTier): string | null {
  if (harness === "opencode_local") {
    if (reasoningTier === "high") return "high";
    if (reasoningTier === "low") return "low";
    return "medium";
  }
  if (harness === "codex_local") {
    if (reasoningTier === "high") return "high";
    if (reasoningTier === "low") return "low";
    return "medium";
  }
  if (harness === "claude_local") {
    if (reasoningTier === "high") return "high";
    if (reasoningTier === "low") return "low";
    return "medium";
  }
  return null;
}

function buildCandidateModels(input: {
  harness: string;
  deployment: IssueRuntimeDeploymentTarget;
  selectedModel: string | null;
  selectedProvider: string | null;
  selectedVariant: string | null;
  reasoningTier: IssueRuntimeReasoningTier;
  manualOverride: IssueRuntimeManualOverride | null;
}) {
  const candidates: RunExecutionPlan["candidateModels"] = [];
  const seen = new Set<string>();
  const pushCandidate = (candidate: RunExecutionPlan["candidateModels"][number] | null) => {
    if (!candidate) return;
    const key = [
      candidate.harness,
      candidate.model ?? "",
      candidate.provider ?? "",
      candidate.variant ?? "",
      candidate.deployment,
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  const pushModel = (model: string | null, reason: string) => {
    const provider = input.manualOverride?.provider ?? deriveProviderFromModel(model) ?? input.selectedProvider;
    pushCandidate({
      harness: input.harness,
      model,
      provider,
      variant: input.selectedVariant,
      deployment: input.deployment,
      reasoningTier: input.reasoningTier,
      reason,
    });
  };

  pushModel(input.selectedModel, "primary policy selection");

  if (input.manualOverride && input.manualOverride.allowAutoSwitch !== true) {
    return candidates;
  }

  const selectedProvider = input.selectedProvider ?? deriveProviderFromModel(input.selectedModel);
  for (const cheaperName of cheaperModelNames(input.selectedModel)) {
    pushModel(prefixModel(selectedProvider, cheaperName), "same-provider fallback");
  }
  for (const altModel of alternateProviderCandidates(input.selectedModel)) {
    pushModel(altModel, "alternate-provider fallback");
  }

  if (candidates.length === 1) {
    const lastResort =
      input.harness === "codex_local" || input.harness === "cursor" ? "gpt-5.4-mini"
      : input.harness === "opencode_local" ? "openrouter/openai/gpt-4o-mini"
      : input.selectedModel;
    pushModel(lastResort, "last-resort low-cost lane");
  }

  return candidates;
}

function applyVariantConfig(harness: string, variant: string | null, adapterConfig: Record<string, unknown>) {
  if (!variant) return;
  if (harness === "codex_local") adapterConfig.modelReasoningEffort = variant;
  if (harness === "opencode_local") adapterConfig.variant = variant;
  if (harness === "claude_local") adapterConfig.effort = variant;
}

function deploymentPreferenceReason(
  deploymentPreference: IssueRuntimeDeploymentPreference,
  selectedDeployment: IssueRuntimeDeploymentTarget,
) {
  if (deploymentPreference === "local_only") return "local-only policy applied";
  if (deploymentPreference === "cloud_only") return "cloud-only policy applied";
  if (deploymentPreference === "local_then_cloud" && selectedDeployment === "local") return "local-first policy retained local lane";
  if (deploymentPreference === "cloud_then_local" && selectedDeployment === "cloud") return "cloud-first policy retained cloud lane";
  return null;
}

export function resolveRunExecutionPlan(input: ResolveRunExecutionPlanInput): RunExecutionPlan {
  const currentConfig = asRecord(input.agent.adapterConfig) ?? {};
  const requirements = normalizeRuntimeRequirements(input.runtimeRequirements, input.contextSnapshot);
  const manualOverride = requirements.manualOverride;
  const selectedHarness = manualOverride?.adapterType ?? input.agent.adapterType;
  const selectedDeployment = manualOverride?.deploymentTarget ?? inferDeploymentTarget(selectedHarness);
  const contextTier = chooseContextTier(requirements, input.budget);
  const workspaceMode = chooseWorkspaceMode(requirements, contextTier);
  const reasoningTier = chooseReasoningTier(requirements, input.budget);
  const selectedModel = manualOverride?.model ?? chooseModel(
    selectedHarness,
    currentConfig,
    requirements.qualityTier ?? "standard",
    requirements.budgetMode ?? "balanced",
  );
  const selectedVariant = manualOverride?.variant ?? chooseVariant(selectedHarness, reasoningTier);
  const selectedProvider = manualOverride?.provider ?? (selectedModel?.includes("/") ? selectedModel.split("/")[0] : null);
  const candidateModels = buildCandidateModels({
    harness: selectedHarness,
    deployment: selectedDeployment,
    selectedModel,
    selectedProvider,
    selectedVariant,
    reasoningTier,
    manualOverride,
  });

  const selectionReasons = [
    `objective=${requirements.objectiveClass ?? "technical"}`,
    `quality=${requirements.qualityTier ?? "standard"}`,
    `budget=${requirements.budgetMode ?? "balanced"}`,
    `context=${contextTier}`,
    `workspace=${workspaceMode}`,
    deploymentPreferenceReason(requirements.deploymentPreference ?? "local_then_cloud", selectedDeployment),
  ].filter((value): value is string => Boolean(value));

  const fallbackApplied = Boolean(
    requirements.budgetMode === "min_cost"
    || (input.budget?.companyUtilizationPercent ?? 0) >= 80
    || input.budget?.projectBudgetBlocked,
  );

  return {
    gearProfile: requirements,
    contextTier,
    selectedHarness,
    selectedModel,
    selectedDeployment,
    selectedProvider,
    selectedVariant,
    selectedWorkspaceMode: workspaceMode,
    selectionReason: selectionReasons.join(" | "),
    fallbackApplied,
    manualOverrideApplied: Boolean(manualOverride && Object.values(manualOverride).some((value) => value != null)),
    initialSelectedModel: selectedModel,
    candidateModels,
    failoverPolicy: {
      maxAttempts: 3,
      retryableCategories: ["rate_limited", "quota_exhausted", "provider_denied"],
    },
  };
}

export function buildExecutionPlanAdapterOverride(plan: RunExecutionPlan, existingRaw: unknown) {
  const existing = asRecord(existingRaw) ?? {};
  const adapterConfig = {
    ...(asRecord(existing.adapterConfig) ?? {}),
  } as Record<string, unknown>;

  adapterConfig.paperclipContextTier = plan.contextTier;
  adapterConfig.paperclipDeploymentTarget = plan.selectedDeployment;
  adapterConfig.paperclipWorkspaceMode = plan.selectedWorkspaceMode;
  if (plan.selectedModel) adapterConfig.model = plan.selectedModel;
  if (plan.selectedProvider) adapterConfig.provider = plan.selectedProvider;
  applyVariantConfig(plan.selectedHarness, plan.selectedVariant, adapterConfig);
  if (plan.gearProfile.manualOverride?.cwd) adapterConfig.cwd = plan.gearProfile.manualOverride.cwd;

  return {
    ...existing,
    adapterType: plan.selectedHarness,
    adapterConfig,
  };
}
