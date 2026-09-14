import { randomUUID } from "node:crypto";
import { execute } from "../../packages/adapters/openrouter/src/server/execute.js";
import { hasOpenRouterHostTools } from "../../packages/adapters/openrouter/src/server/credentials.js";
import { testEnvironment } from "../../packages/adapters/openrouter/src/server/test.js";

/** No database, scheduler, agent JWT, saved instructions, or session history. */
export async function preflightOpenRouter(input: {
  companyId: string;
  agentId: string;
  model: string;
  key: string;
  infer?: boolean;
}) {
  if (hasOpenRouterHostTools(input.companyId)) {
    throw new Error("Disable host-tool grants in the probe process before running this check.");
  }
  const config = {
    model: input.model,
    env: { OPENROUTER_API_KEY: input.key },
    promptTemplate: "Reply with exactly OPENROUTER_OK. Do not call tools or perform any other work.",
  };
  const preflight = await testEnvironment({ companyId: input.companyId, adapterType: "openrouter", config });
  if (preflight.status === "fail" || !input.infer) {
    return { preflight, manualRun: "not_run" as const };
  }
  const result = await execute({
    runId: `preflight-${randomUUID()}`,
    agent: { id: input.agentId, companyId: input.companyId, name: "Provider preflight", adapterType: "openrouter", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config, context: {}, onLog: async () => {},
  });
  // Never output provider text, session content, or credential-bearing metadata.
  const succeeded = result.exitCode === 0 && result.summary?.trim() === "OPENROUTER_OK";
  return { preflight, manualRun: succeeded ? "succeeded" as const : "failed" as const };
}
