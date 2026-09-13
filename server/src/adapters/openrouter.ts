import fs from "node:fs/promises";
import path from "node:path";
import type { AdapterExecutionContext, AdapterEnvironmentTestContext, AdapterEnvironmentTestResult, ServerAdapterModule } from "@paperclipai/adapter-utils";
import type { AdapterExecutionTarget, AdapterSandboxExecutionTarget } from "@paperclipai/adapter-utils/execution-target";
import { execute as executeOpenCode } from "@paperclipai/adapter-opencode-local/server";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function managedTarget(target: AdapterExecutionTarget | null | undefined): AdapterSandboxExecutionTarget {
  if (target?.kind !== "remote" || target.transport !== "sandbox"
    || !target.environmentId || !target.leaseId || !target.runner) {
    throw new Error("OpenRouter requires a company-authorized managed sandbox with an active lease.");
  }
  return target;
}

export function openRouterModel(model: unknown): string {
  if (typeof model !== "string" || !model.trim() || /\s/.test(model)) {
    throw new Error("Select an explicit OpenRouter model before running this agent.");
  }
  // Existing AMX values use publisher/model. New values may already have
  // OpenCode's provider prefix. Preserve OpenRouter's own openrouter/auto ID.
  if (model.startsWith("openrouter/") && model.split("/").length >= 3) return model;
  if (!model.includes("/")) throw new Error("OpenRouter model must include its publisher.");
  return `openrouter/${model}`;
}

function resolvedKey(config: Record<string, unknown>): string {
  const key = object(config.env).OPENROUTER_API_KEY;
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("Bind an authorized tenant or explicitly provisioned owner OpenRouter secret. Host credentials are not a fallback.");
  }
  return key;
}

async function execute(ctx: AdapterExecutionContext) {
  const target = managedTarget(ctx.executionTarget);
  const model = openRouterModel(ctx.config.model);
  const key = resolvedKey(ctx.config);
  const workspace = object(ctx.context.paperclipWorkspace);
  if (typeof workspace.cwd !== "string" || !path.isAbsolute(workspace.cwd)) {
    throw new Error("OpenRouter requires a server-resolved project workspace.");
  }
  const cwd = await fs.realpath(workspace.cwd);
  let instructionsFilePath: string | undefined;
  if (ctx.config.instructionsFilePath) {
    if (typeof ctx.config.instructionsFilePath !== "string") throw new Error("Invalid instructions path.");
    instructionsFilePath = await fs.realpath(path.resolve(cwd, ctx.config.instructionsFilePath));
    const relative = path.relative(cwd, instructionsFilePath);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("OpenRouter instructions must be inside the authorized workspace.");
    }
  }
  const session = object(ctx.runtime.sessionParams);
  if (ctx.runtime.sessionId || Object.keys(session).length) {
    if (session.amxCompanyId !== ctx.agent.companyId || session.amxEnvironmentId !== target.environmentId
      || session.amxLeaseId !== target.leaseId || session.amxSessionVersion !== 2) {
      throw new Error("Archive the previous session and explicitly start a fresh sandbox session. Cross-tenant or legacy sessions cannot resume.");
    }
  }
  const configuredTimeout = ctx.config.timeoutSec;
  const timeoutSec = typeof configuredTimeout === "number" && Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(configuredTimeout, 900) : 300;
  const result = await executeOpenCode({
    ...ctx,
    executionTransport: undefined,
    config: {
      command: "opencode", cwd, model, instructionsFilePath,
      // Preserve tool approval checks; never import the old unrestricted host
      // shell loop or accept a tenant-supplied executable/argument override.
      dangerouslySkipPermissions: false, timeoutSec, graceSec: 20,
      env: { OPENROUTER_API_KEY: key, OPENCODE_ALLOW_ALL_MODELS: "false" },
    },
  });
  return {
    ...result,
    sessionParams: result.sessionParams ? { ...result.sessionParams,
      amxSessionVersion: 2, amxCompanyId: ctx.agent.companyId,
      amxEnvironmentId: target.environmentId, amxLeaseId: target.leaseId,
    } : null,
  };
}

async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  try {
    managedTarget(ctx.executionTarget);
    openRouterModel(ctx.config.model);
    resolvedKey(ctx.config);
    return { adapterType: "openrouter", status: "warn", testedAt: new Date().toISOString(), checks: [{
      code: "openrouter_configured_unverified", level: "warn",
      message: "Sandbox and explicit key configuration are present. Provider authentication and runtime execution have not been tested.",
    }] };
  } catch (error) {
    return { adapterType: "openrouter", status: "fail", testedAt: new Date().toISOString(), checks: [{
      code: "openrouter_configuration_required", level: "error",
      message: error instanceof Error ? error.message : "OpenRouter configuration is incomplete.",
    }] };
  }
}

export const openRouterAdapter: ServerAdapterModule = {
  type: "openrouter", execute, testEnvironment,
  // Keep provenance intact so sessions cannot cross company/environment/lease
  // boundaries. Legacy payloads remain detectable and cannot silently resume.
  sessionCodec: {
    serialize: (params) => params,
    deserialize: (raw) => raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null,
    getDisplayId: (params) => typeof params?.sessionId === "string" ? params.sessionId : null,
  },
  supportsLocalAgentJwt: true,
  supportsInstructionsBundle: true,
  instructionsPathKey: "instructionsFilePath",
  requiresMaterializedRuntimeSkills: true,
  agentConfigurationDoc: "OpenRouter uses an authorized managed sandbox and an explicit company/user secret binding. Owner provisioning must also be explicitly authorized for that company. Legacy host execution and implicit host API-key fallback are disabled. Provider connectivity is a separate test.",
};
