import { describe, expect, it } from "vitest";
import { buildHeartbeatTraceSummary } from "../services/agent-runtime/trace-summaries.js";

describe("buildHeartbeatTraceSummary", () => {
  it("prefers standardized trace payloads and derives failure details", () => {
    const summary = buildHeartbeatTraceSummary(
      {
        id: "run-1",
        companyId: "company-1",
        agentId: "agent-1",
        agentName: "COO",
        adapterType: "opencode_local",
        invocationSource: "assignment",
        triggerDetail: "manual",
        status: "failed",
        startedAt: new Date("2026-04-30T22:00:00.000Z"),
        finishedAt: new Date("2026-04-30T22:01:00.000Z"),
        error: "fallback error",
        errorCode: "adapter_failed",
        exitCode: 1,
        usageJson: { inputTokens: 42, outputTokens: 8, cachedInputTokens: 3 },
        resultJson: null,
        sessionIdBefore: "session-a",
        sessionIdAfter: "session-b",
        logBytes: 256,
        contextSnapshot: {
          issueId: "AMXA-42",
          wakeReason: "issue_comment_mentioned",
          pitStopTriggered: true,
          pitStopTriggerReason: "token_burn_above_warn_threshold",
          pitStopWorkspaceId: "workspace-1",
          pitStopOptimizationId: "optimization-1",
          pitStopSourceRunId: "run-1",
          executionPlan: {
            gearProfile: {
              objectiveClass: "technical",
              qualityTier: "premium",
              budgetMode: "balanced",
            },
            contextTier: "engineering_full",
            selectedHarness: "opencode_local",
            selectedModel: "gpt-5.5",
            selectedDeployment: "local",
            selectedProvider: "openai",
            selectedWorkspaceMode: "project_workspace",
            selectionReason: "objective=technical",
            fallbackApplied: false,
            manualOverrideApplied: true,
            initialSelectedModel: "gpt-5.5",
            failoverAttempt: 2,
            failureCategory: "provider_denied",
            failoverFromModel: "gpt-5.5",
            failoverToModel: "gpt-5.3-codex",
            attemptedModels: [
              {
                attempt: 1,
                harness: "opencode_local",
                model: "gpt-5.5",
                provider: "openai",
                variant: "medium",
                deployment: "local",
                reasoningTier: "standard",
                outcome: "failed",
                errorCode: "adapter_failed",
                errorMessage: "denied",
                failureCategory: "provider_denied",
              },
              {
                attempt: 2,
                harness: "opencode_local",
                model: "gpt-5.3-codex",
                provider: "openai",
                variant: "low",
                deployment: "local",
                reasoningTier: "standard",
                outcome: "failed",
                errorCode: "provider_auth",
                errorMessage: "missing api key",
                failureCategory: "auth_failed",
              },
            ],
          },
        },
      },
      [
        {
          runId: "run-1",
          seq: 1,
          eventType: "wakeup.received",
          message: "wakeup received",
          payload: {
            wakeSource: "assignment",
            wakeReason: "issue_comment_mentioned",
            issueId: "AMXA-42",
            commentId: "comment-9",
          },
        },
        {
          runId: "run-1",
          seq: 2,
          eventType: "session.rotation",
          message: "session rotated",
          payload: {
            sessionRotated: true,
            sessionRotationReason: "session exceeded 40 runs",
            sessionIdBefore: "session-a",
            sessionIdAfter: "session-b",
          },
        },
        {
          runId: "run-1",
          seq: 3,
          eventType: "pitstop.triggered",
          message: "pit stop optimization recommended",
          payload: {
            pitStopTriggered: true,
            pitStopTriggerReason: "token_burn_above_warn_threshold",
            pitStopWorkspaceId: "workspace-1",
            pitStopOptimizationId: "optimization-1",
            pitStopSourceRunId: "run-1",
          },
        },
        {
          runId: "run-1",
          seq: 4,
          eventType: "adapter.command.prepared",
          message: "adapter command prepared",
          payload: {
            adapterType: "opencode_local",
            model: "gpt-5.3-codex",
            effectiveVariant: "low",
            cwd: "C:/workspace",
            contextTier: "engineering_full",
            selectedHarness: "opencode_local",
            selectedModel: "gpt-5.3-codex",
            selectedDeployment: "local",
            selectedProvider: "openai",
            selectedWorkspaceMode: "project_workspace",
            selectionReason: "objective=technical",
            fallbackApplied: false,
            manualOverrideApplied: true,
            initialSelectedModel: "gpt-5.5",
            failoverAttempt: 2,
            attemptedModels: [
              {
                attempt: 1,
                harness: "opencode_local",
                model: "gpt-5.5",
                provider: "openai",
                variant: "medium",
                deployment: "local",
                reasoningTier: "standard",
                outcome: "failed",
                errorCode: "adapter_failed",
                errorMessage: "denied",
                failureCategory: "provider_denied",
              },
            ],
          },
        },
        {
          runId: "run-1",
          seq: 5,
          eventType: "run.failed",
          message: "run failed",
          payload: {
            status: "failed",
            errorCode: "provider_auth",
            errorMessage: "missing api key",
            exitCode: 1,
            durationSeconds: 60,
            initialSelectedModel: "gpt-5.5",
            selectedModel: "gpt-5.3-codex",
            failureCategory: "auth_failed",
            failoverAttempt: 2,
            failoverFromModel: "gpt-5.5",
            failoverToModel: "gpt-5.3-codex",
            failoverExhausted: false,
            attemptedModels: [
              {
                attempt: 1,
                harness: "opencode_local",
                model: "gpt-5.5",
                provider: "openai",
                variant: "medium",
                deployment: "local",
                reasoningTier: "standard",
                outcome: "failed",
                errorCode: "adapter_failed",
                errorMessage: "denied",
                failureCategory: "provider_denied",
              },
              {
                attempt: 2,
                harness: "opencode_local",
                model: "gpt-5.3-codex",
                provider: "openai",
                variant: "low",
                deployment: "local",
                reasoningTier: "standard",
                outcome: "failed",
                errorCode: "provider_auth",
                errorMessage: "missing api key",
                failureCategory: "auth_failed",
              },
            ],
          },
        },
      ],
    );

    expect(summary.issueId).toBe("AMXA-42");
    expect(summary.commentId).toBe("comment-9");
    expect(summary.sessionRotated).toBe(true);
    expect(summary.sessionRotationReason).toContain("40 runs");
    expect(summary.model).toBe("gpt-5.3-codex");
    expect(summary.effectiveVariant).toBe("low");
    expect(summary.contextTier).toBe("engineering_full");
    expect(summary.selectedHarness).toBe("opencode_local");
    expect(summary.selectedModel).toBe("gpt-5.3-codex");
    expect(summary.initialSelectedModel).toBe("gpt-5.5");
    expect(summary.selectedDeployment).toBe("local");
    expect(summary.manualOverrideApplied).toBe(true);
    expect(summary.failureCategory).toBe("auth_failed");
    expect(summary.failoverAttempt).toBe(2);
    expect(summary.failoverFromModel).toBe("gpt-5.5");
    expect(summary.failoverToModel).toBe("gpt-5.3-codex");
    expect(summary.attemptedModels).toHaveLength(2);
    expect(summary.pitStopTriggered).toBe(true);
    expect(summary.pitStopTriggerReason).toBe("token_burn_above_warn_threshold");
    expect(summary.pitStopWorkspaceId).toBe("workspace-1");
    expect(summary.cwd).toBe("C:/workspace");
    expect(summary.errorCode).toBe("provider_auth");
    expect(summary.errorMessage).toBe("missing api key");
    expect(summary.eventCount).toBe(5);
    expect(summary.logBytes).toBe(256);
  });
});
