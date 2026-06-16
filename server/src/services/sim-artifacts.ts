import type { SimArtifactBundle } from "@paperclipai/shared";
import { asBoolean } from "../adapters/utils.js";
import type { RealizedExecutionWorkspace } from "./workspace-runtime.js";

/**
 * Builds the SIM artifact bundle merged into `heartbeat_runs.resultJson` for
 * `runMode === "sim"` runs. This is the PIT STOP review payload: what ran, where
 * it ran, what it would cost/take, what permissions it needed, how risky it looks,
 * and how to roll it back.
 */
export function buildSimArtifactBundle(input: {
  events: Array<{ seq: number; eventType: string; message: string | null }>;
  startedAt: Date | null;
  finishedAt: Date;
  usageJson: Record<string, unknown> | null;
  model: string | null;
  executionWorkspace: RealizedExecutionWorkspace;
  resolvedConfig: Record<string, unknown>;
}): SimArtifactBundle {
  const isolated = input.executionWorkspace.strategy === "git_worktree";
  const warnings = input.executionWorkspace.warnings ?? [];

  const estimatedRuntimeMs = input.startedAt
    ? Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime())
    : null;

  const costUsd = typeof input.usageJson?.costUsd === "number" ? input.usageJson.costUsd : null;
  const estimatedCostCents = costUsd != null ? Math.round(costUsd * 100) : null;

  const modelsUsed = input.model ? [input.model] : [];

  const dangerouslySkipPermissions = asBoolean(input.resolvedConfig.dangerouslySkipPermissions, false);
  const chrome = asBoolean(input.resolvedConfig.chrome, false);

  const requiredPermissions: string[] = ["workspace:read_write"];
  if (dangerouslySkipPermissions) requiredPermissions.push("filesystem:unrestricted");
  if (chrome) requiredPermissions.push("browser:chrome");
  if (!isolated) requiredPermissions.push("workspace:shared_with_live");

  const riskFactors: string[] = [];
  let riskScore = isolated ? 10 : 40;
  if (!isolated) {
    riskFactors.push("No isolated workspace was available — this SIM ran against the shared workspace.");
    riskScore += 20;
  }
  if (warnings.length > 0) {
    riskFactors.push(...warnings);
    riskScore += warnings.length * 10;
  }
  if (dangerouslySkipPermissions) {
    riskFactors.push("Agent is configured with dangerouslySkipPermissions.");
    riskScore += 20;
  }
  riskScore = Math.min(100, riskScore);

  const rollbackPlan = isolated
    ? `Discard the isolated SIM worktree and branch "${input.executionWorkspace.branchName}" at ${input.executionWorkspace.worktreePath}. No changes were made to the primary workspace or branch.`
    : `No isolated workspace was available for this SIM run; review file changes in ${input.executionWorkspace.cwd} manually before any promotion to LIVE.`;

  return {
    runMode: "sim",
    executionGraph: input.events,
    estimatedRuntimeMs,
    estimatedCostCents,
    modelsUsed,
    requiredPermissions,
    workspace: {
      strategy: input.executionWorkspace.strategy,
      isolated,
      branchName: input.executionWorkspace.branchName,
      worktreePath: input.executionWorkspace.worktreePath,
      cwd: input.executionWorkspace.cwd,
      warnings,
    },
    riskScore,
    riskFactors,
    rollbackPlan,
  };
}
