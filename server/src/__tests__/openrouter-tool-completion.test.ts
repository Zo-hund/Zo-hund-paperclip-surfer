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
  it("accepts an assigned run only after persisted document readback", async () => {
    const invented = "Completed: https://api.paperclip.com/wrong";
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: invented } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "agent", companyId: "tenant" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "task", companyId: "tenant", assigneeAgentId: "agent", status: "in_review" })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ companyId: "tenant", issueId: "task", status: "active", isPrimary: true, provider: "agent-sync", url: "/api/issues/task/documents/deliverable/export" }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ body: "Persisted report" })));
    vi.stubGlobal("fetch", fetch);
    const ctx = context(); ctx.authToken = "runtime-key"; ctx.context = { taskId: "task" };
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(result.summary).toBe("Verified delivery ready for review: [Deliverable](/api/issues/task/documents/deliverable/export)");
    expect(result.resultJson).toEqual({ kind: "verified_deliveries", deliveries: [{ taskId: "task", status: "in_review", documentUrl: "/api/issues/task/documents/deliverable/export" }] });
    expect(JSON.stringify(result.resultJson)).not.toContain("api.paperclip.com");
    expect(JSON.stringify(result.sessionParams)).toContain(invented);
    expect(ctx.onLog).toHaveBeenCalledWith("stdout", expect.stringContaining("[Generated model text - unverified]"));
  });
  it("preserves failure when a later claimed task fails after a verified delivery", async () => {
    const asJson = (data: unknown) => new Response(JSON.stringify(data));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(asJson({ choices: [{ message: { role: "assistant", tool_calls: [{ id: "claim", function: { name: "paperclip_api", arguments: JSON.stringify({ method: "POST", path: "/api/issues/second/checkout", body: { agentId: "agent" } }) } }] } }] }))
      .mockResolvedValueOnce(asJson({ id: "second" })).mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(asJson({ id: "agent", companyId: "tenant" }))
      .mockResolvedValueOnce(asJson({ id: "task", companyId: "tenant", assigneeAgentId: "agent", status: "done" }))
      .mockResolvedValueOnce(asJson([{ companyId: "tenant", issueId: "task", status: "active", isPrimary: true, provider: "agent-sync", url: "/api/issues/task/documents/deliverable/export" }]))
      .mockResolvedValueOnce(asJson({ body: "Saved" }))
      .mockResolvedValueOnce(asJson({ id: "agent", companyId: "tenant" }))
      .mockResolvedValueOnce(asJson({ id: "second", companyId: "tenant", assigneeAgentId: "agent", status: "backlog" })));
    const ctx = context(); ctx.authToken = "runtime-key"; ctx.context = { taskId: "task" };
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.resultJson).toBeNull();
    expect(result.summary).toBe(result.errorMessage);
    expect(result.summary).toContain("not in review");
  });
  it("fails a native HTTP error instead of treating curl-style exit success as completion", async () => {
    const tool = new Response(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: [{ id: "checkout", function: {
      name: "paperclip_api", arguments: JSON.stringify({ method: "POST", path: "/api/issues/task/checkout", body: {} }),
    } }] } }] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tool).mockResolvedValueOnce(new Response("secret error", { status: 400 })));
    const ctx = context(); ctx.authToken = "runtime-key";
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("paperclip_api failed");
    expect(JSON.stringify(result)).not.toContain("secret error");
  });
  it("rejects final prose when the assigned issue is still backlog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "agent", companyId: "tenant" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "task", companyId: "tenant", assigneeAgentId: "agent", status: "backlog" }))));
    const ctx = context(); ctx.authToken = "runtime-key"; ctx.context = { taskId: "task" };
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("not in review");
  });
  it("verifies successful native checkout on an initially unassigned wake", async () => {
    const tool = new Response(JSON.stringify({ choices: [{ message: { role: "assistant", tool_calls: [{ id: "checkout", function: {
      name: "paperclip_api", arguments: JSON.stringify({ method: "POST", path: "/api/issues/task/checkout", body: { agentId: "agent", expectedStatuses: ["backlog"] } }),
    } }] } }] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tool)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "task" })))
      .mockResolvedValueOnce(response(false))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "agent", companyId: "tenant" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "task", companyId: "tenant", assigneeAgentId: "agent", status: "backlog" }))));
    const ctx = context(); ctx.authToken = "runtime-key";
    const result = await execute(ctx);
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("not in review");
  });
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
  it("refreshes the assignment and command environment on a resumed conversation", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(true)).mockResolvedValueOnce(response(false));
    vi.stubGlobal("fetch", fetch);
    const ctx = context();
    ctx.config.promptTemplate = "Current task {{context.taskId}}";
    ctx.config.env = { OPENROUTER_API_KEY: "test-key", PAPERCLIP_TASK_ID: "old-task" };
    ctx.context = { taskId: "new-task" };
    ctx.runtime.sessionParams = { messages: [{ role: "system", content: "old" }, { role: "assistant", content: "previous task" }] };
    await execute(ctx);
    const firstRequest = JSON.parse(fetch.mock.calls[0][1].body);
    expect(firstRequest.messages.at(-1)).toMatchObject({ role: "user" });
    expect(firstRequest.messages.at(-1).content).toContain("Current task new-task");
    expect(vi.mocked(runChildProcess).mock.calls[0][3].env.PAPERCLIP_TASK_ID).toBe("new-task");
  });
  it("clears stale task configuration on an unassigned wake and preserves the current run ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(true)).mockResolvedValueOnce(response(false)));
    const ctx = context();
    ctx.config.env = { OPENROUTER_API_KEY: "test-key", PAPERCLIP_TASK_ID: "old-task", PAPERCLIP_RUN_ID: "old-run" };
    await execute(ctx);
    const env = vi.mocked(runChildProcess).mock.calls[0][3].env;
    expect(env.PAPERCLIP_TASK_ID).toBe("");
    expect(env.PAPERCLIP_RUN_ID).toBe("completion-test");
  });
  it("rejects an assigned workflow without authorized tools before generating a response", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const ctx = context(); ctx.context = { taskId: "current" };
    await expect(execute(ctx)).rejects.toThrow("task is not complete");
    expect(fetch).not.toHaveBeenCalled();
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
