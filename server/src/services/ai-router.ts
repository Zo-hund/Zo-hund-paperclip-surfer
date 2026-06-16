import type { AdapterCapabilities, RouterDecision, RouterPolicy, RouterPreviewResult } from "@paperclipai/shared";

const ADAPTER_CAPABILITIES: Record<string, AdapterCapabilities> = {
  claude_local:    { privacy: "local",  costTier: "subscription", supportsLocalFilesystem: true,  supportsGpu: false, latencyClass: "medium" },
  codex_local:     { privacy: "local",  costTier: "subscription", supportsLocalFilesystem: true,  supportsGpu: false, latencyClass: "medium" },
  cursor:          { privacy: "local",  costTier: "subscription", supportsLocalFilesystem: true,  supportsGpu: false, latencyClass: "medium" },
  gemini_local:    { privacy: "local",  costTier: "subscription", supportsLocalFilesystem: true,  supportsGpu: false, latencyClass: "medium" },
  opencode_local:  { privacy: "local",  costTier: "subscription", supportsLocalFilesystem: true,  supportsGpu: false, latencyClass: "medium" },
  pi_local:        { privacy: "local",  costTier: "subscription", supportsLocalFilesystem: true,  supportsGpu: false, latencyClass: "medium" },
  hermes_local:    { privacy: "local",  costTier: "free",         supportsLocalFilesystem: true,  supportsGpu: true,  latencyClass: "low" },
  hermes_advanced: { privacy: "cloud",  costTier: "metered",      supportsLocalFilesystem: false, supportsGpu: false, latencyClass: "low" },
  openclaw_gateway:{ privacy: "cloud",  costTier: "metered",      supportsLocalFilesystem: false, supportsGpu: false, latencyClass: "low" },
  openrouter:      { privacy: "cloud",  costTier: "metered",      supportsLocalFilesystem: false, supportsGpu: false, latencyClass: "low" },
  process:         { privacy: "local",  costTier: "free",         supportsLocalFilesystem: true,  supportsGpu: false, latencyClass: "medium" },
  http:            { privacy: "cloud",  costTier: "metered",      supportsLocalFilesystem: false, supportsGpu: false, latencyClass: "low" },
};

export function getAdapterCapabilities(adapterType: string): AdapterCapabilities | null {
  return ADAPTER_CAPABILITIES[adapterType] ?? null;
}

const DEFAULT_POLICY: RouterPolicy = {
  mode: "auto",
  privacyRequirement: "any",
  costPreference: "balanced",
  budgetThresholdPct: 0.9,
};

function parsePolicy(raw: unknown): RouterPolicy {
  if (!raw || typeof raw !== "object") return DEFAULT_POLICY;
  const r = raw as Record<string, unknown>;
  return {
    mode: r["mode"] === "manual" ? "manual" : "auto",
    privacyRequirement: r["privacyRequirement"] === "local_only" ? "local_only" : "any",
    costPreference:
      r["costPreference"] === "minimize" ? "minimize"
      : r["costPreference"] === "performance" ? "performance"
      : "balanced",
    fallbackChain: Array.isArray(r["fallbackChain"])
      ? r["fallbackChain"].filter((x): x is string => typeof x === "string")
      : undefined,
    budgetThresholdPct: typeof r["budgetThresholdPct"] === "number" ? r["budgetThresholdPct"] : 0.9,
  };
}

interface RouteContext {
  primaryAdapterType: string;
  runtimeConfig: unknown;
  spentMonthlyCents: number | null;
  budgetMonthlyCents: number | null;
}

export function aiRouterService() {
  function route(ctx: RouteContext): RouterDecision {
    const rawPolicy = ctx.runtimeConfig && typeof ctx.runtimeConfig === "object"
      ? (ctx.runtimeConfig as Record<string, unknown>)["routerPolicy"]
      : undefined;
    const policy = parsePolicy(rawPolicy);

    if (policy.mode === "manual") {
      return { adapterType: ctx.primaryAdapterType, reason: "explicit_override" };
    }

    const budgetThresholdPct = policy.budgetThresholdPct ?? 0.9;
    const overBudget =
      ctx.budgetMonthlyCents != null &&
      ctx.budgetMonthlyCents > 0 &&
      ctx.spentMonthlyCents != null &&
      ctx.spentMonthlyCents / ctx.budgetMonthlyCents >= budgetThresholdPct;

    const primaryCaps = ADAPTER_CAPABILITIES[ctx.primaryAdapterType];

    // Check privacy constraint
    if (policy.privacyRequirement === "local_only" && primaryCaps?.privacy === "cloud") {
      // Try fallback chain first
      if (policy.fallbackChain?.length) {
        for (const fb of policy.fallbackChain) {
          const caps = ADAPTER_CAPABILITIES[fb];
          if (caps?.privacy === "local") return { adapterType: fb, reason: "privacy_filter" };
        }
      }
      // Fall back to process (always local, always available)
      return { adapterType: "process", reason: "privacy_filter" };
    }

    // Budget pressure: prefer non-metered adapter
    if (overBudget && primaryCaps?.costTier === "metered") {
      if (policy.fallbackChain?.length) {
        for (const fb of policy.fallbackChain) {
          const caps = ADAPTER_CAPABILITIES[fb];
          if (caps && caps.costTier !== "metered") {
            if (policy.privacyRequirement === "local_only" && caps.privacy === "cloud") continue;
            return { adapterType: fb, reason: "budget_fallback" };
          }
        }
      }
      // hermes_local is free + local — safe universal fallback
      if (policy.privacyRequirement !== "local_only" || primaryCaps?.privacy === "local") {
        return { adapterType: "hermes_local", reason: "budget_fallback" };
      }
    }

    // Cost minimization: prefer free/subscription over metered
    if (policy.costPreference === "minimize" && primaryCaps?.costTier === "metered") {
      const candidates = (policy.fallbackChain ?? []).filter((fb) => {
        const caps = ADAPTER_CAPABILITIES[fb];
        if (!caps) return false;
        if (caps.costTier === "metered") return false;
        if (policy.privacyRequirement === "local_only" && caps.privacy === "cloud") return false;
        return true;
      });
      if (candidates[0]) return { adapterType: candidates[0], reason: "budget_fallback" };
    }

    return { adapterType: ctx.primaryAdapterType, reason: "primary_selected" };
  }

  function preview(ctx: RouteContext): RouterPreviewResult {
    const rawPolicy = ctx.runtimeConfig && typeof ctx.runtimeConfig === "object"
      ? (ctx.runtimeConfig as Record<string, unknown>)["routerPolicy"]
      : undefined;
    const policy = parsePolicy(rawPolicy);
    const decision = route(ctx);

    const budgetThresholdPct = policy.budgetThresholdPct ?? 0.9;
    const budgetStatus =
      ctx.budgetMonthlyCents != null
        ? {
            spentCents: ctx.spentMonthlyCents ?? 0,
            budgetCents: ctx.budgetMonthlyCents,
            thresholdPct: budgetThresholdPct,
            overThreshold:
              ctx.budgetMonthlyCents > 0 &&
              (ctx.spentMonthlyCents ?? 0) / ctx.budgetMonthlyCents >= budgetThresholdPct,
          }
        : null;

    const candidates = Object.entries(ADAPTER_CAPABILITIES).map(([adapterType, caps]) => {
      let eligible = true;
      let reason: string | undefined;
      if (policy.privacyRequirement === "local_only" && caps.privacy === "cloud") {
        eligible = false;
        reason = "privacy_requirement";
      }
      return { adapterType, capabilities: caps, eligible, reason };
    });

    return { policy, decision, candidates, budgetStatus };
  }

  return { route, preview };
}
