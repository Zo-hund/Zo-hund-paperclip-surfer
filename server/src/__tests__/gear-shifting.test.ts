import { describe, expect, it } from "vitest";
import { resolveRunExecutionPlan } from "../services/agent-runtime/gear-shifting.js";

describe("resolveRunExecutionPlan", () => {
  it("returns an ordered fallback ladder for policy-selected models", () => {
    const plan = resolveRunExecutionPlan({
      agent: {
        adapterType: "opencode_local",
        adapterConfig: {
          model: "google/gemini-2.5-flash",
        },
      },
      runtimeRequirements: {
        objectiveClass: "technical",
        qualityTier: "standard",
        budgetMode: "balanced",
      },
    });

    expect(plan.selectedModel).toBe("google/gemini-2.5-flash");
    expect(plan.initialSelectedModel).toBe("google/gemini-2.5-flash");
    expect(plan.candidateModels.map((candidate) => candidate.model)).toEqual([
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
      "openrouter/openai/gpt-4o-mini",
    ]);
    expect(plan.failoverPolicy.maxAttempts).toBe(3);
  });

  it("pins manual overrides unless auto-switch is explicitly enabled", () => {
    const plan = resolveRunExecutionPlan({
      agent: {
        adapterType: "opencode_local",
        adapterConfig: {
          model: "google/gemini-2.5-flash",
        },
      },
      runtimeRequirements: {
        manualOverride: {
          model: "openrouter/openai/gpt-4o-mini",
        },
      },
    });

    expect(plan.selectedModel).toBe("openrouter/openai/gpt-4o-mini");
    expect(plan.candidateModels).toHaveLength(1);
    expect(plan.candidateModels[0]?.model).toBe("openrouter/openai/gpt-4o-mini");
  });
});
