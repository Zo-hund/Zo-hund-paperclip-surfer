import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";

const { executeOpenCode } = vi.hoisted(() => ({ executeOpenCode: vi.fn(async () => ({
  exitCode: 0, signal: null, timedOut: false, sessionParams: { sessionId: "session-1" },
})) }));
vi.mock("@paperclipai/adapter-opencode-local/server", () => ({ execute: executeOpenCode }));
import { openRouterAdapter, openRouterModel } from "../adapters/openrouter.js";

describe("AMX OpenRouter sandbox adapter", () => {
  let workspace: string;
  let ctx: AdapterExecutionContext;
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "amx-openrouter-"));
    ctx = {
      runId: "test-run", agent: { id: "agent-a", companyId: "company-a", name: "Test", adapterType: "openrouter", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      context: { paperclipWorkspace: { cwd: workspace } },
      config: { model: "anthropic/example", env: { OPENROUTER_API_KEY: "tenant-test-only" } },
      executionTarget: { kind: "remote", transport: "sandbox", environmentId: "env-a", leaseId: "lease-a",
        remoteCwd: "/workspace", runner: { execute: vi.fn() } },
      onLog: async () => {},
    };
  });
  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it.each([
    ["anthropic/example", "openrouter/anthropic/example"],
    ["openrouter/auto", "openrouter/openrouter/auto"],
    ["openrouter/anthropic/example", "openrouter/anthropic/example"],
  ])("preserves model routing for %s", (input, expected) => expect(openRouterModel(input)).toBe(expected));

  it("rejects implicit owner host credentials before execution", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "owner-host-key-must-not-be-used");
    ctx.config.env = {};
    await expect(openRouterAdapter.execute(ctx)).rejects.toThrow("Bind an authorized tenant");
    expect(executeOpenCode).not.toHaveBeenCalled();
  });

  it.each([null, { kind: "local" }, { kind: "remote", transport: "sandbox", environmentId: "env-a" }])(
    "rejects an absent, local or unleased execution target", async (target) => {
      ctx.executionTarget = target as AdapterExecutionContext["executionTarget"];
      await expect(openRouterAdapter.execute(ctx)).rejects.toThrow("company-authorized managed sandbox");
      expect(executeOpenCode).not.toHaveBeenCalled();
    },
  );

  it("keeps explicit key provisioning while discarding host command and permission overrides", async () => {
    Object.assign(ctx.config, { command: "arbitrary-host-command", extraArgs: ["--unsafe"],
      dangerouslySkipPermissions: true, timeoutSec: 0,
      env: { OPENROUTER_API_KEY: "owner-explicitly-provisioned-test-key", OTHER_TENANT_KEY: "must-not-forward" } });
    const result = await openRouterAdapter.execute(ctx);
    expect(executeOpenCode).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({
      command: "opencode", dangerouslySkipPermissions: false, timeoutSec: 300,
      env: { OPENROUTER_API_KEY: "owner-explicitly-provisioned-test-key", OPENCODE_ALLOW_ALL_MODELS: "false" },
    }) }));
    expect(JSON.stringify(executeOpenCode.mock.calls)).not.toContain("must-not-forward");
    expect(JSON.stringify(executeOpenCode.mock.calls)).not.toContain("arbitrary-host-command");
    expect(result.sessionParams).toMatchObject({ amxCompanyId: "company-a", amxEnvironmentId: "env-a", amxLeaseId: "lease-a", amxSessionVersion: 2 });
  });

  it.each([
    { messages: [{ role: "assistant", content: "legacy conversation" }] },
    { amxSessionVersion: 2, amxCompanyId: "company-b", amxEnvironmentId: "env-a", amxLeaseId: "lease-a" },
    { amxSessionVersion: 2, amxCompanyId: "company-a", amxEnvironmentId: "env-b", amxLeaseId: "lease-a" },
    { amxSessionVersion: 2, amxCompanyId: "company-a", amxEnvironmentId: "env-a", amxLeaseId: "lease-old" },
  ])("rejects legacy or mismatched session provenance", async (session) => {
    ctx.runtime.sessionParams = session;
    await expect(openRouterAdapter.execute(ctx)).rejects.toThrow("explicitly start a fresh sandbox session");
    expect(executeOpenCode).not.toHaveBeenCalled();
  });

  it("rejects instruction symlinks outside the workspace", async () => {
    await fs.symlink(os.tmpdir(), path.join(workspace, "outside"), "dir");
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "amx-outside-"));
    try {
      await fs.writeFile(path.join(outside, "instructions.md"), "synthetic outside file");
      ctx.config.instructionsFilePath = path.join("outside", path.basename(outside), "instructions.md");
      await expect(openRouterAdapter.execute(ctx)).rejects.toThrow("inside the authorized workspace");
      expect(executeOpenCode).not.toHaveBeenCalled();
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("does not claim provider authentication from a static configuration check", async () => {
    const result = await openRouterAdapter.testEnvironment!({ companyId: "company-a", adapterType: "openrouter", config: ctx.config, executionTarget: ctx.executionTarget });
    expect(result.status).toBe("warn");
    expect(result.checks[0]?.code).toBe("openrouter_configured_unverified");
    expect(executeOpenCode).not.toHaveBeenCalled();
  });
});
