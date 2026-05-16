import { describe, expect, it } from "vitest";
import { buildPitStopOptimizationRecommendation } from "../services/agent-runtime/pit-stop-optimizer.js";

describe("buildPitStopOptimizationRecommendation", () => {
  it("returns a lower-cost rerun recommendation for expensive sim runs", () => {
    const recommendation = buildPitStopOptimizationRecommendation({
      run: {
        id: "run-1",
        runMode: "sim",
        status: "succeeded",
        usageJson: {
          inputTokens: 3_600_000,
          outputTokens: 200_000,
        },
        retryOfRunId: null,
        processLossRetryCount: 0,
        sessionIdBefore: "session-1",
        sessionIdAfter: "session-1",
        contextSnapshot: {
          wakeReason: "heartbeat_timer",
          runtimeRequirements: {
            objectiveClass: "technical",
            qualityTier: "premium",
            latencyTier: "background",
            budgetMode: "balanced",
            deploymentPreference: "cloud_then_local",
            dataSensitivity: "cloud_allowed",
            requiredCapabilities: ["code"],
          },
          executionPlan: {
            gearProfile: {
              objectiveClass: "technical",
              qualityTier: "premium",
              latencyTier: "background",
              budgetMode: "balanced",
              deploymentPreference: "cloud_then_local",
              dataSensitivity: "cloud_allowed",
              requiredCapabilities: ["code"],
            },
            contextTier: "engineering_full",
            selectedHarness: "hermes_advanced",
            selectedModel: "anthropic/claude-3-5-sonnet",
            selectedDeployment: "cloud",
            selectedProvider: "anthropic",
            selectedVariant: "high",
            selectedWorkspaceMode: "project_workspace",
            selectionReason: "objective=technical",
            fallbackApplied: false,
            manualOverrideApplied: false,
          },
        },
      },
      agent: {
        adapterType: "hermes_advanced",
        adapterConfig: {
          model: "anthropic/claude-3-5-sonnet",
        },
      },
      budget: {
        companyUtilizationPercent: 86,
      },
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.triggerReason).toBe("token_burn_above_warn_threshold");
    expect(recommendation?.optimizationActions).toEqual(
      expect.arrayContaining([
        "compact_prompt",
        "incremental_context",
        "downgrade_reasoning",
        "switch_to_local_lane",
        "fresh_session",
      ]),
    );
    expect(recommendation?.recommendedRuntimeRequirements.budgetMode).toBe("min_cost");
    expect(recommendation?.recommendedRuntimeRequirements.qualityTier).toBe("standard");
    expect(recommendation?.recommendedRuntimeRequirements.manualOverride?.contextTier).toBe("role_aware");
    expect(recommendation?.recommendedRuntimeRequirements.manualOverride?.reasoningTier).toBe("low");
    expect(recommendation?.recommendedExecutionPlan.selectedDeployment).toBe("local");
    expect(recommendation?.recommendedExecutionPlan.selectedHarness).toBe("codex_local");
    expect(recommendation?.recommendedExecutionPlan.contextTier).toBe("role_aware");
    expect(recommendation?.estimatedSavings.percent).toBeGreaterThan(0);
    expect(recommendation?.relaunchEligible).toBe(true);
  });

  it("returns null for healthy sim runs without drift", () => {
    const recommendation = buildPitStopOptimizationRecommendation({
      run: {
        id: "run-2",
        runMode: "sim",
        status: "running",
        usageJson: {
          inputTokens: 400,
          outputTokens: 100,
        },
        retryOfRunId: null,
        processLossRetryCount: 0,
        sessionIdBefore: null,
        sessionIdAfter: null,
        contextSnapshot: {
          wakeReason: "issue_assignment",
          runtimeRequirements: {
            objectiveClass: "technical",
            qualityTier: "standard",
            latencyTier: "interactive",
            budgetMode: "balanced",
            deploymentPreference: "local_then_cloud",
            dataSensitivity: "local_preferred",
            requiredCapabilities: ["code"],
          },
          executionPlan: {
            gearProfile: {
              objectiveClass: "technical",
              qualityTier: "standard",
              latencyTier: "interactive",
              budgetMode: "balanced",
              deploymentPreference: "local_then_cloud",
              dataSensitivity: "local_preferred",
              requiredCapabilities: ["code"],
            },
            contextTier: "project_aware",
            selectedHarness: "codex_local",
            selectedModel: "gpt-5.4",
            selectedDeployment: "local",
            selectedProvider: "openai",
            selectedVariant: "medium",
            selectedWorkspaceMode: "project_workspace",
            selectionReason: "objective=technical",
            fallbackApplied: false,
            manualOverrideApplied: false,
          },
        },
      },
      agent: {
        adapterType: "codex_local",
        adapterConfig: {
          model: "gpt-5.4",
        },
      },
      budget: {
        companyUtilizationPercent: 24,
      },
    });

    expect(recommendation).toBeNull();
  });
});
