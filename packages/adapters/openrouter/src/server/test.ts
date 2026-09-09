import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@paperclipai/adapter-utils";
import { asString } from "@paperclipai/adapter-utils/server-utils";
import { resolveOpenRouterKey, validateOpenRouterKey, hasOpenRouterHostTools } from "./credentials.js";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext
): Promise<AdapterEnvironmentTestResult> {
  const { config } = ctx;
  const model = asString(config.model, "").trim();

  const checks: AdapterEnvironmentCheck[] = [];

  checks.push({
    code: "openrouter_url",
    level: "info",
    message: "Using OpenRouter API endpoint: https://openrouter.ai/api/v1",
  });

  if (!model) {
    checks.push({
      code: "model_missing",
      level: "error",
      message: "No model configured. Select an OpenRouter model (e.g. anthropic/claude-3.5-sonnet).",
    });
  } else {
    checks.push({
      code: "model_configured",
      level: "info",
      message: `Configured model: ${model}`,
    });
  }

  try {
    const apiKey = resolveOpenRouterKey(ctx.companyId, config);
    await validateOpenRouterKey(apiKey);
    checks.push({
      code: "api_key_validated",
      level: "info",
      message: "OpenRouter accepted the selected API key. No model inference was requested.",
    });
  } catch (err) {
    checks.push({
      code: "api_key_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "OpenRouter key validation failed.",
    });
  }

  const hasError = checks.some((c) => c.level === "error");
  if (!hasOpenRouterHostTools(ctx.companyId)) checks.push({
    code: "host_tools_unavailable", level: "warn",
    message: "Model access only. Host commands, files, and instruction/memory files require a trusted operator grant; use an isolated worker for tenant coding tasks.",
  });
  const hasWarning = checks.some((c) => c.level === "warn");

  return {
    adapterType: "openrouter",
    status: hasError ? "fail" : hasWarning ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
