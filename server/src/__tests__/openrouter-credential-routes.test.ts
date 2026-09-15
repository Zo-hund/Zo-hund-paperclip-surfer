import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRouterCredentialRoutes } from "../routes/openrouter-credentials.js";
import { sanitizeRequestBody } from "../redaction.js";

const mocks = vi.hoisted(() => ({
  getByName: vi.fn(), create: vi.fn(), rotate: vi.fn(), remove: vi.fn(),
  resolveAdapterConfigForRuntime: vi.fn(), log: vi.fn(), validate: vi.fn(),
}));
vi.mock("../services/secrets.js", () => ({ secretService: () => mocks }));
vi.mock("../services/activity-log.js", () => ({ logActivity: mocks.log }));
vi.mock("@paperclipai/adapter-openrouter/server", async () => {
  const actual = await import("../../../packages/adapters/openrouter/src/server/credentials.js");
  return { ...actual, validateOpenRouterKey: mocks.validate };
});
const admin = { type: "board", source: "session", userId: "u-a", companyIds: ["company-a"], companyRoles: { "company-a": "admin" } };

function app(actor: Record<string, unknown> = admin) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { (req as unknown as { actor: unknown }).actor = actor; next(); });
  server.use("/api", openRouterCredentialRoutes({} as never));
  server.use((err: { status?: number; message: string }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status ?? 500).json({ error: err.message, loggedBody: sanitizeRequestBody(req.originalUrl, req.body) });
  });
  return server;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PAPERCLIP_OPENROUTER_COMPANY_IDS", "");
  mocks.getByName.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "secret-a", latestVersion: 1 });
  mocks.rotate.mockResolvedValue({ id: "secret-a", latestVersion: 2 });
});
afterEach(() => vi.unstubAllEnvs());

describe("tenant OpenRouter credential endpoints", () => {
  it("redacts credential bodies even when authorization fails before the route is entered", () => {
    for (const path of ["/api/companies/company-a/openrouter-credentials", "/api/companies/company-a/secrets", "/api/secrets/key-id/rotate"]) {
      expect(sanitizeRequestBody(path, { value: "private-key" })).toBe("***REDACTED***");
    }
  });

  it("rate limits repeated provider validation requests", async () => {
    mocks.resolveAdapterConfigForRuntime.mockResolvedValue({ config: { env: { OPENROUTER_API_KEY: "tenant-key" } } });
    const server = app();
    for (let i = 0; i < 10; i++) await request(server).post("/api/companies/company-a/openrouter-credentials/validate");
    const result = await request(server).post("/api/companies/company-a/openrouter-credentials/validate");
    expect(result.status).toBe(429);
    expect(mocks.validate).toHaveBeenCalledTimes(10);
  });
  it.each(["get", "put", "delete", "post"] as const)("rejects cross-company %s access before resolving secrets", async (method) => {
    const suffix = method === "post" ? "/validate" : "";
    const result = await request(app())[method](`/api/companies/company-b/openrouter-credentials${suffix}`).send({ value: "private-key" });
    expect(result.status).toBe(403);
    expect(mocks.getByName).not.toHaveBeenCalled();
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toContain("private-key");
  });

  it.each(["member", "viewer", "client"])("denies credential changes to %s", async (role) => {
    const actor = { ...admin, companyRoles: { "company-a": role } };
    const result = await request(app(actor)).put("/api/companies/company-a/openrouter-credentials").send({ value: "private-key" });
    expect(result.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("denies agents and anonymous callers", async () => {
    for (const actor of [{ type: "none" }, { type: "agent", companyId: "company-a" }]) {
      const result = await request(app(actor)).put("/api/companies/company-a/openrouter-credentials").send({ value: "private-key" });
      expect(result.status).toBe(403);
    }
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it("validates before storing an encrypted, company-scoped secret, without echoing the key", async () => {
    const result = await request(app()).put("/api/companies/company-a/openrouter-credentials").send({ value: "private-key" });
    expect(result.status).toBe(200);
    expect(mocks.validate).toHaveBeenCalledWith("private-key");
    expect(mocks.create).toHaveBeenCalledWith("company-a", expect.objectContaining({ name: "OPENROUTER_API_KEY", value: "private-key", provider: "local_encrypted" }), expect.anything());
    expect(mocks.validate.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(JSON.stringify(result.body)).not.toContain("private-key");
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("private-key");
  });

  it("preserves an existing key when the replacement fails validation", async () => {
    mocks.validate.mockRejectedValue(new Error("OpenRouter rejected the selected API key (401)."));
    const result = await request(app()).put("/api/companies/company-a/openrouter-credentials").send({ value: "private-key" });
    expect(result.status).toBe(422);
    expect(mocks.rotate).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toContain("private-key");
  });

  it("rotates the company default while keeping the secret identity", async () => {
    mocks.getByName.mockResolvedValue({ id: "secret-a", latestVersion: 1 });
    await request(app()).put("/api/companies/company-a/openrouter-credentials").send({ value: "replacement-key" });
    expect(mocks.rotate).toHaveBeenCalledWith("secret-a", { value: "replacement-key" }, expect.anything());
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not disclose the operator key through status", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "operator-private-key");
    vi.stubEnv("PAPERCLIP_OPENROUTER_COMPANY_IDS", "company-a");
    const result = await request(app()).get("/api/companies/company-a/openrouter-credentials");
    expect(result.body.defaultSource).toBe("platform");
    expect(JSON.stringify(result.body)).not.toContain("operator-private-key");
  });
});
