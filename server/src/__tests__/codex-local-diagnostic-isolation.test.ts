import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../../../packages/adapters/codex-local/src/server/test.js";
const effects = vi.hoisted(() => ({ prepare: vi.fn(), auth: vi.fn(), command: vi.fn(), run: vi.fn() }));
vi.mock("@paperclipai/adapter-utils/server-utils", async original => ({
  ...await original<typeof import("@paperclipai/adapter-utils/server-utils")>(),
  ensureAbsoluteDirectory: vi.fn(async () => {}), ensureCommandResolvable: effects.command, runChildProcess: effects.run,
}));
vi.mock("../../../packages/adapters/codex-local/src/server/codex-home.js", () => ({ prepareManagedCodexHome: effects.prepare }));
vi.mock("../../../packages/adapters/codex-local/src/server/quota.js", () => ({ readCodexAuthInfo: effects.auth }));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("OPENAI_API_KEY", "synthetic-host-key"); vi.stubEnv("CODEX_API_KEY", "synthetic-host-codex-key"); vi.stubEnv("CODEX_HOME", path.resolve("fixture/operator-home"));
  effects.prepare.mockImplementation(async (_env, _log, company) => path.resolve("fixture/managed", company));
  effects.auth.mockResolvedValue(null); effects.command.mockResolvedValue(undefined);
  effects.run.mockResolvedValue({ exitCode: 0, timedOut: false, stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}\n', stderr: "" });
});
afterEach(() => vi.unstubAllEnvs());
describe("Codex diagnostic credential isolation", () => {
  it("blanks host credentials and reads only the company-managed auth path", async () => {
    const result = await testEnvironment({ companyId: "company-a", adapterType: "codex_local", config: { cwd: path.resolve("fixture/workspace") } });
    const env = effects.run.mock.calls[0][3].env;
    expect(env.OPENAI_API_KEY).toBe(""); expect(env.CODEX_API_KEY).toBe(""); expect(env.CODEX_HOME).toBe(path.resolve("fixture/managed/company-a"));
    expect(effects.auth).toHaveBeenCalledWith(path.resolve("fixture/managed/company-a"));
    expect(effects.command.mock.calls[0][2].OPENAI_API_KEY).toBe("");
    expect(result.checks.some(check => check.code === "codex_openai_api_key_present")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("synthetic-host");
  });
  it("keeps managed homes isolated between companies", async () => {
    await testEnvironment({ companyId: "company-a", adapterType: "codex_local", config: {} });
    await testEnvironment({ companyId: "company-b", adapterType: "codex_local", config: {} });
    expect(effects.run.mock.calls[0][3].env.CODEX_HOME).not.toBe(effects.run.mock.calls[1][3].env.CODEX_HOME);
  });
  it("preserves explicit tenant credentials and home without host fallback", async () => {
    const home = path.resolve("fixture/tenant-home");
    await testEnvironment({ companyId: "company-a", adapterType: "codex_local", config: { env: { OPENAI_API_KEY: "synthetic-tenant-key", CODEX_API_KEY: "synthetic-tenant-codex", CODEX_HOME: home } } });
    expect(effects.prepare).not.toHaveBeenCalled();
    expect(effects.run.mock.calls[0][3].env).toMatchObject({ OPENAI_API_KEY: "synthetic-tenant-key", CODEX_API_KEY: "synthetic-tenant-codex", CODEX_HOME: home });
    expect(effects.auth).not.toHaveBeenCalled();
  });
  it("does not disclose the tenant auth email or token in diagnostic output", async () => {
    effects.auth.mockResolvedValue({ email: "synthetic-private@example.test", accessToken: "synthetic-private-token" });
    const result = await testEnvironment({ companyId: "company-a", adapterType: "codex_local", config: {} });
    expect(result.checks.some(check => check.code === "codex_native_auth_present")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("synthetic-private");
  });
});
