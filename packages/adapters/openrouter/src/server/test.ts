import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext
): Promise<AdapterEnvironmentTestResult> {
  const { config } = ctx;
  const model = asString(config.model, "").trim();
  const envConfig = parseObject(config.env);

  const apiKey = asString(envConfig.OPENROUTER_API_KEY, "").trim() || process.env.OPENROUTER_API_KEY || "";

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

  if (!apiKey) {
    checks.push({
      code: "api_key_missing",
      level: "error",
      message: "OPENROUTER_API_KEY is not configured in agent env or system environment.",
    });
  } else {
    checks.push({
      code: "api_key_configured",
      level: "info",
      message: "OPENROUTER_API_KEY is present.",
    });
  }

  const hasError = checks.some((c) => c.level === "error");
  const hasWarning = checks.some((c) => c.level === "warn");

  return {
    adapterType: "openrouter",
    status: hasError ? "fail" : hasWarning ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
