import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "../../../packages/adapters/openrouter/src/server/execute.js";
import { testEnvironment } from "../../../packages/adapters/openrouter/src/server/test.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("OpenRouter run and environment authentication", () => {
  it("does not execute unexpected tool calls for a tenant without a host-tools grant", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: {
      role: "assistant", tool_calls: [{ id: "call-1", function: { name: "read_file", arguments: '{"filePath":"/proc/self/environ"}' } }],
    } }] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(execute({
      runId: "test-run", agent: { id: "a", companyId: "tenant", name: "CEO", adapterType: "openrouter", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { env: { OPENROUTER_API_KEY: "tenant-key" }, instructionsFilePath: "/proc/self/environ" },
      context: {}, onLog: vi.fn(),
    })).rejects.toThrow("Host tools are unavailable");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("tenant-key");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("marks a configured but rejected key as failed in Test environment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rejected", { status: 401 })));
    const result = await testEnvironment({ companyId: "company-a", adapterType: "openrouter", config: {
      model: "minimax/minimax-m3:batch", env: { OPENROUTER_API_KEY: "invalid-key" },
    } });
    expect(result.status).toBe("fail");
    expect(result.checks.some((check) => check.code === "api_key_invalid" && check.message.includes("401"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("invalid-key");
  });

  it("stops a rejected tenant run without attempting the operator key or exposing secrets in metadata", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "operator-key");
    vi.stubEnv("PAPERCLIP_OPENROUTER_COMPANY_IDS", "company-a");
    const fetchMock = vi.fn().mockResolvedValue(new Response("provider echo: tenant-key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const onLog = vi.fn();
    const onMeta = vi.fn();
    await expect(execute({
      runId: "test-run",
      agent: { id: "agent-a", companyId: "company-a", name: "CEO", adapterType: "openrouter", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { cwd: process.cwd(), model: "minimax/minimax-m3:batch", env: { OPENROUTER_API_KEY: "tenant-key" } },
      context: {}, onLog, onMeta,
    })).rejects.toThrow("No fallback key was used");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tenant-key");
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(onMeta.mock.calls)).not.toContain("tenant-key");
    expect(JSON.stringify(onLog.mock.calls)).not.toContain("tenant-key");
  });

  it.each(["transport", "json", "provider-envelope"])("sanitizes %s failures without retrying another account", async (failure) => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "");
    const fetchMock = vi.fn();
    if (failure === "transport") fetchMock.mockRejectedValue(new Error("tenant-key in transport"));
    else if (failure === "json") fetchMock.mockResolvedValue(new Response("tenant-key"));
    else fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: 401, message: "tenant-key" } })));
    vi.stubGlobal("fetch", fetchMock);
    const promise = execute({
      runId: "probe", agent: { id: "a", companyId: "tenant", name: "CEO", adapterType: "openrouter", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { env: { OPENROUTER_API_KEY: "tenant-key" } }, context: {}, onLog: vi.fn(),
    });
    await expect(promise).rejects.toThrow("No fallback key was used");
    await expect(promise).rejects.not.toThrow("tenant-key");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
