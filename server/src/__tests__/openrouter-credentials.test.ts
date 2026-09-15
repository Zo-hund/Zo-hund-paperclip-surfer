import { afterEach, describe, expect, it, vi } from "vitest";
import { isOpenRouterProvisioned, resolveOpenRouterKey, validateOpenRouterKey, hasOpenRouterHostTools } from "../../../packages/adapters/openrouter/src/server/credentials.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("OpenRouter billing boundaries", () => {
  it("keeps host tool grants separate from provider billing grants", () => {
    vi.stubEnv("PAPERCLIP_OPENROUTER_COMPANY_IDS", "tenant");
    vi.stubEnv("PAPERCLIP_OPENROUTER_TRUSTED_TOOL_COMPANY_IDS", "internal-company");
    expect(isOpenRouterProvisioned("tenant")).toBe(true);
    expect(hasOpenRouterHostTools("tenant")).toBe(false);
    expect(hasOpenRouterHostTools("internal-company")).toBe(true);
  });
  it("denies the shared key to companies without an exact operator grant", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "operator-key");
    vi.stubEnv("PAPERCLIP_OPENROUTER_COMPANY_IDS", "company-a, company-b");
    expect(resolveOpenRouterKey("company-a", {})).toBe("operator-key");
    expect(isOpenRouterProvisioned("company")).toBe(false);
    expect(() => resolveOpenRouterKey("company-c", { PAPERCLIP_OPENROUTER_COMPANY_IDS: "company-c" })).toThrow("provision access");
    vi.stubEnv("PAPERCLIP_OPENROUTER_COMPANY_IDS", "*");
    expect(isOpenRouterProvisioned("company-c")).toBe(false);
  });

  it("prefers a supplied tenant key and never falls back on an empty or unresolved binding", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "operator-key");
    vi.stubEnv("PAPERCLIP_OPENROUTER_COMPANY_IDS", "company-a");
    expect(resolveOpenRouterKey("company-a", { env: { OPENROUTER_API_KEY: " tenant-key " } })).toBe("tenant-key");
    for (const value of ["", "   ", "***REDACTED***", { type: "secret_ref", secretId: "other-company-secret" }]) {
      expect(() => resolveOpenRouterKey("company-a", { env: { OPENROUTER_API_KEY: value } })).toThrow("empty or unresolved");
    }
  });

  it("validates credentials without inference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { disabled: false, expires_at: null } })));
    vi.stubGlobal("fetch", fetchMock);
    await validateOpenRouterKey("tenant-key");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/key");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer tenant-key" }, redirect: "error" });
  });

  it("rejects 401 without leaking the response or retrying a provisioned key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("provider echoed private-key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(validateOpenRouterKey("private-key")).rejects.toThrow("No fallback key was used");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([{}, { data: { disabled: true } }, { data: { expires_at: "2020-01-01T00:00:00Z" } }])("rejects invalid/disabled/expired key responses: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(validateOpenRouterKey("tenant-key")).rejects.toThrow();
  });

  it("reports network failures without leaking credential-bearing errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-key in transport error")));
    await expect(validateOpenRouterKey("private-key")).rejects.toThrow("Unable to validate");
  });
});
