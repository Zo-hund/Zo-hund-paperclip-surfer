import { afterEach, describe, expect, it, vi } from "vitest";
import { secretService } from "../services/secrets.js";

const resolveVersion = vi.hoisted(() => vi.fn().mockResolvedValue("tenant-key"));
vi.mock("../secrets/provider-registry.js", () => ({
  getSecretProvider: () => ({ resolveVersion }), listSecretProviders: () => [],
}));

function database(results: unknown[][]) {
  const pending = [...results];
  const select = vi.fn(() => ({ from: () => ({ where: () => ({ then: (callback: (rows: unknown[]) => unknown) => Promise.resolve(callback(pending.shift() ?? [])) }) }) }));
  return { db: { select } as never, select };
}
afterEach(() => vi.clearAllMocks());
const secret = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", companyId: "company-a", name: "OPENROUTER_API_KEY", provider: "local_encrypted", latestVersion: 2 };

describe("company default OpenRouter secret resolution", () => {
  it("resolves the latest encrypted default and marks it for log redaction", async () => {
    const { db, select } = database([[secret], [secret], [{ material: { encrypted: "ciphertext" } }]]);
    const config = { env: { PUBLIC_SETTING: "keep" } };
    const result = await secretService(db).resolveAdapterConfigForRuntime("company-a", config, "openrouter");
    expect(result.config.env).toEqual({ PUBLIC_SETTING: "keep", OPENROUTER_API_KEY: "tenant-key" });
    expect(result.secretKeys.has("OPENROUTER_API_KEY")).toBe(true);
    expect(select).toHaveBeenCalledTimes(3);
    expect(config.env).toEqual({ PUBLIC_SETTING: "keep" });
  });

  it("keeps an explicit override, including empty values, without loading any default", async () => {
    for (const key of ["override-key", ""]) {
      const { db, select } = database([]);
      const result = await secretService(db).resolveAdapterConfigForRuntime("company-a", { env: { OPENROUTER_API_KEY: key } }, "openrouter");
      expect(result.config.env).toEqual({ OPENROUTER_API_KEY: key });
      expect(select).not.toHaveBeenCalled();
    }
  });

  it("does not inject OpenRouter credentials into other adapters", async () => {
    const { db, select } = database([]);
    expect((await secretService(db).resolveAdapterConfigForRuntime("company-a", {}, "codex_local")).config).toEqual({});
    expect(select).not.toHaveBeenCalled();
  });

  it("rejects an explicit reference to another company's key before decryption", async () => {
    const { db } = database([[{ ...secret, companyId: "company-b" }]]);
    await expect(secretService(db).resolveAdapterConfigForRuntime("company-a", {
      env: { OPENROUTER_API_KEY: { type: "secret_ref", secretId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version: "latest" } },
    }, "openrouter")).rejects.toThrow("same company");
    expect(resolveVersion).not.toHaveBeenCalled();
  });

  it("leaves operator provisioning decisions to the adapter if the company has no default", async () => {
    const { db } = database([[]]);
    const result = await secretService(db).resolveAdapterConfigForRuntime("company-a", {}, "openrouter");
    expect(result.config).toEqual({});
    expect(result.secretKeys.size).toBe(0);
  });
});
