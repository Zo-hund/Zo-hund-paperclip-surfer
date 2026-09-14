import { afterEach, describe, expect, it, vi } from "vitest";
import { preflightOpenRouter } from "../../../scripts/lib/openrouter-preflight.js";

const input = { companyId: "c3burns", agentId: "ceo", model: "minimax/minimax-m3:batch", key: "replacement-key" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("isolated OpenRouter repair verification", () => {
  it("fails the inherited-key 401 case without inference, retry, fallback, or secret output", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "");
    vi.stubEnv("OPENROUTER_API_KEY", "different-platform-key");
    const fetch = vi.fn().mockResolvedValue(new Response("replacement-key", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const result = await preflightOpenRouter({ ...input, infer: true });
    expect(result.preflight.status).toBe("fail");
    expect(result.manualRun).toBe("not_run");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer replacement-key");
    expect(JSON.stringify(result)).not.toContain(input.key);
  });

  it("validates by default without making a billable completion", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} })));
    vi.stubGlobal("fetch", fetch);
    expect((await preflightOpenRouter(input)).manualRun).toBe("not_run");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/key");
  });

  it("runs the real adapter with the validated replacement and no tools or saved context", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "");
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "OPENROUTER_OK" } }] })));
    vi.stubGlobal("fetch", fetch);
    const result = await preflightOpenRouter({ ...input, infer: true });
    expect(result.manualRun).toBe("succeeded");
    expect(fetch).toHaveBeenCalledTimes(2);
    const request = fetch.mock.calls[1];
    expect(request[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request[1].headers.Authorization).toBe("Bearer replacement-key");
    const body = JSON.parse(request[1].body);
    expect(body.model).toBe(input.model);
    expect(body.tools).toBeUndefined();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].content).toContain("OPENROUTER_OK");
    expect(JSON.stringify(result)).not.toContain(input.key);
  });

  it("refuses any host-tool grant before making a request", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", input.companyId);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(preflightOpenRouter({ ...input, infer: true })).rejects.toThrow("Disable host-tool grants");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not report HTTP 200 with an unexpected model response as success", async () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "unexpected" } }] }))));
    expect((await preflightOpenRouter({ ...input, infer: true })).manualRun).toBe("failed");
  });
});
