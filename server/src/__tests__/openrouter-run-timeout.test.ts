import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import { execute } from "../../../packages/adapters/openrouter/src/server/execute.js";

vi.mock("@paperclipai/adapter-utils/server-utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("@paperclipai/adapter-utils/server-utils")>(),
  ensureAbsoluteDirectory: vi.fn().mockResolvedValue(undefined),
  runChildProcess: vi.fn(),
}));

const reply = (tool = false) => new Response(JSON.stringify({ choices: [{ message: tool
  ? { role: "assistant", tool_calls: [{ id: "call", function: { name: "run_command", arguments: '{"command":"test-only"}' } }] }
  : { role: "assistant", content: "done" } }] }));
const untilAborted = (signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});
function context(timeoutSec: number): AdapterExecutionContext {
  return {
    runId: "timeout-test", agent: { id: "agent", companyId: "tenant", name: "CEO", adapterType: "openrouter", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { timeoutSec, env: { OPENROUTER_API_KEY: "test-key" } },
    context: {}, onLog: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "");
  vi.mocked(runChildProcess).mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("OpenRouter whole-run deadline", () => {
  it("allows explicit zero to finish a request lasting more than two minutes", async () => {
    const fetch = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(reply()), 121_000)));
    vi.stubGlobal("fetch", fetch);
    const pending = execute(context(0));
    await vi.advanceTimersByTimeAsync(121_000);
    expect((await pending).summary).toBe("done");
    expect(fetch.mock.calls[0][1].signal).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a later completion at the original deadline, not a new per-turn deadline", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "tenant");
    vi.mocked(runChildProcess).mockResolvedValue({ exitCode: 0, signal: null, timedOut: false, stdout: "ok", stderr: "" });
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(reply(true)), 40_000)))
      .mockImplementationOnce((_url, options) => untilAborted(options.signal));
    vi.stubGlobal("fetch", fetch);
    const pending = execute(context(60));
    const rejected = expect(pending).rejects.toThrow("run exceeded its configured timeout");
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].signal).toBe(fetch.mock.calls[0][1].signal);
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps response body consumption within the same deadline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, options) => ({
      ok: true, json: () => untilAborted(options.signal),
    })));
    const rejected = expect(execute(context(60))).rejects.toThrow("run exceeded its configured timeout");
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
  });

  it("counts setup time and sends no completion after the budget expires", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const ctx = context(60);
    ctx.onMeta = async () => { await vi.advanceTimersByTimeAsync(60_000); };
    await expect(execute(ctx)).rejects.toThrow("run exceeded its configured timeout");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes only the remaining budget to a command and stops on its timeout", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "tenant");
    const fetch = vi.fn().mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(reply(true)), 40_000)));
    vi.stubGlobal("fetch", fetch);
    vi.mocked(runChildProcess).mockResolvedValue({ exitCode: null, signal: "SIGTERM", timedOut: true, stdout: "", stderr: "" });
    const rejected = expect(execute(context(60))).rejects.toThrow("run exceeded its configured timeout");
    await vi.advanceTimersByTimeAsync(40_000);
    await rejected;
    expect(vi.mocked(runChildProcess).mock.calls[0][3].timeoutSec).toBe(20);
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its deadline timer after successful completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply()));
    expect((await execute(context(60))).summary).toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });
});
