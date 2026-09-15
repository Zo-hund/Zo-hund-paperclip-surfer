import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import { execute, resolveShellCommand } from "../../../packages/adapters/openrouter/src/server/execute.js";

vi.mock("@paperclipai/adapter-utils/server-utils", async (original) => ({
  ...await original<typeof import("@paperclipai/adapter-utils/server-utils")>(),
  ensureAbsoluteDirectory: vi.fn().mockResolvedValue(undefined),
  runChildProcess: vi.fn(),
}));
const response = (tool: boolean) => new Response(JSON.stringify({
  usage: { prompt_tokens: 10, completion_tokens: 2 },
  choices: [{ message: tool
    ? { role: "assistant", tool_calls: [{ id: "call", function: { name: "run_command", arguments: JSON.stringify({ command: "echo test" }) } }] }
    : { role: "assistant", content: "Completed" } }],
}));
const context = (): AdapterExecutionContext => ({
  runId: "completion-test", agent: { id: "agent", companyId: "tenant", name: "CEO", adapterType: "openrouter", adapterConfig: {} },
  runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
  config: { env: { OPENROUTER_API_KEY: "test-key" } }, context: {}, onLog: vi.fn(),
});
beforeEach(() => {
  vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "tenant");
  vi.mocked(runChildProcess).mockReset();
  vi.mocked(runChildProcess).mockResolvedValue({ exitCode: 0, signal: null, timedOut: false, stdout: "ok", stderr: "" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("OpenRouter command and completion semantics", () => {
  it("uses a POSIX shell on Linux and noninteractive PowerShell on Windows", () => {
    expect(resolveShellCommand("echo test", "linux")).toEqual({ executable: "/bin/sh", args: ["-c", "echo test"] });
    expect(resolveShellCommand("echo test", "win32")).toEqual({ executable: "powershell", args: ["-NoProfile", "-NonInteractive", "-Command", "echo test"] });
  });
  it("runs a tool then accepts a final response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(true)).mockResolvedValueOnce(response(false)));
    const result = await execute(context());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("Completed");
    const shell = resolveShellCommand("echo test");
    expect(runChildProcess).toHaveBeenCalledWith("completion-test", shell.executable, shell.args, expect.any(Object));
  });
  it.each(["exit", "spawn"])("stops on a %s failure instead of returning success or looping", async (kind) => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(true)));
    vi.stubGlobal("fetch", fetch);
    if (kind === "spawn") vi.mocked(runChildProcess).mockRejectedValue(new Error("shell unavailable"));
    else vi.mocked(runChildProcess).mockResolvedValue({ exitCode: 1, signal: null, timedOut: false, stdout: "", stderr: "failed" });
    const result = await execute(context());
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("task is not complete");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 2 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("marks turn exhaustion as failure while retaining usage", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(true)));
    vi.stubGlobal("fetch", fetch);
    const result = await execute(context());
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("20-turn limit");
    expect(fetch).toHaveBeenCalledTimes(20);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 40 });
  });
});
