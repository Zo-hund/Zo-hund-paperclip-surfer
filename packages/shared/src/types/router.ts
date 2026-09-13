export interface AdapterCapabilities {
  privacy: "local" | "cloud";
  costTier: "free" | "subscription" | "metered";
  supportsLocalFilesystem: boolean;
  supportsGpu: boolean;
  latencyClass: "low" | "medium" | "high";
}

export interface RouterPolicy {
  mode: "auto" | "manual";
  privacyRequirement: "local_only" | "any";
  costPreference: "minimize" | "performance" | "balanced";
  fallbackChain?: string[];
  budgetThresholdPct?: number;
}

export interface RouterDecision {
  adapterType: string;
  adapterConfig?: Record<string, unknown>;
  reason: "primary_selected" | "budget_fallback" | "privacy_filter" | "fallback_to_primary" | "explicit_override";
}

export interface RouterPreviewResult {
  policy: RouterPolicy;
  decision: RouterDecision;
  candidates: Array<{ adapterType: string; capabilities: AdapterCapabilities; eligible: boolean; reason?: string }>;
  budgetStatus: { spentCents: number; budgetCents: number | null; thresholdPct: number; overThreshold: boolean } | null;
}
