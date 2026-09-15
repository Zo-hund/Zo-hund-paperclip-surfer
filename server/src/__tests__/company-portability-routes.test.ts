import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  ensureMembership: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockCompanyPortabilityService = vi.hoisted(() => ({
  exportBundle: vi.fn(),
  previewExport: vi.fn(),
  previewImport: vi.fn(),
  importBundle: vi.fn(),
}));
const mockWorkProductService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  budgetService: () => mockBudgetService,
  companyPortabilityService: () => mockCompanyPortabilityService,
  workProductService: () => mockWorkProductService,
  companyService: () => mockCompanyService,
  logActivity: mockLogActivity,
}));

async function createApp(actor: Record<string, unknown>) {
  const { companyRoutes } = await import("../routes/companies.js");
  const { errorHandler } = await import("../middleware/index.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("company portability routes", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAgentService.getById.mockReset();
    mockCompanyPortabilityService.exportBundle.mockReset();
    mockCompanyPortabilityService.previewExport.mockReset();
    mockCompanyPortabilityService.previewImport.mockReset();
    mockCompanyPortabilityService.importBundle.mockReset();
    mockLogActivity.mockReset();
  });

  it("rejects non-CEO agents from CEO-safe export preview routes", async () => {
    mockAgentService.getById.mockResolvedValue({
      id: "agent-1",
      companyId: "11111111-1111-4111-8111-111111111111",
      role: "engineer",
    });
    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "11111111-1111-4111-8111-111111111111",
      source: "agent_key",
      runId: "run-1",
    });

    const res = await request(app)
      .post("/api/companies/11111111-1111-4111-8111-111111111111/exports/preview")
      .send({ include: { company: true, agents: true, projects: true } });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Only CEO agents");
    expect(mockCompanyPortabilityService.previewExport).not.toHaveBeenCalled();
  });

  it("allows CEO agents to use company-scoped export preview routes", async () => {
    mockAgentService.getById.mockResolvedValue({
      id: "agent-1",
      companyId: "11111111-1111-4111-8111-111111111111",
      role: "ceo",
    });
    mockCompanyPortabilityService.previewExport.mockResolvedValue({
      rootPath: "paperclip",
      manifest: { agents: [], skills: [], projects: [], issues: [], envInputs: [], includes: { company: true, agents: true, projects: true, issues: false, skills: false }, company: null, schemaVersion: 1, generatedAt: new Date().toISOString(), source: null },
      files: {},
      fileInventory: [],
      counts: { files: 0, agents: 0, skills: 0, projects: 0, issues: 0 },
      warnings: [],
      paperclipExtensionPath: ".paperclip.yaml",
    });
    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "11111111-1111-4111-8111-111111111111",
      source: "agent_key",
      runId: "run-1",
    });

    const res = await request(app)
      .post("/api/companies/11111111-1111-4111-8111-111111111111/exports/preview")
      .send({ include: { company: true, agents: true, projects: true } });

    expect(res.status).toBe(200);
    expect(mockCompanyPortabilityService.previewExport).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", {
      include: { company: true, agents: true, projects: true },
    });
  });

  it("rejects replace collision strategy on CEO-safe import routes", async () => {
    mockAgentService.getById.mockResolvedValue({
      id: "agent-1",
      companyId: "11111111-1111-4111-8111-111111111111",
      role: "ceo",
    });
    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "11111111-1111-4111-8111-111111111111",
      source: "agent_key",
      runId: "run-1",
    });

    const res = await request(app)
      .post("/api/companies/11111111-1111-4111-8111-111111111111/imports/preview")
      .send({
        source: { type: "inline", files: { "COMPANY.md": "---\nname: Test\n---\n" } },
        include: { company: true, agents: true, projects: false, issues: false },
        target: { mode: "existing_company", companyId: "11111111-1111-4111-8111-111111111111" },
        collisionStrategy: "replace",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("does not allow replace");
    expect(mockCompanyPortabilityService.previewImport).not.toHaveBeenCalled();
  });

  it("keeps global import preview routes board-only", async () => {
    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "11111111-1111-4111-8111-111111111111",
      source: "agent_key",
      runId: "run-1",
    });

    const res = await request(app)
      .post("/api/companies/import/preview")
      .send({
        source: { type: "inline", files: { "COMPANY.md": "---\nname: Test\n---\n" } },
        include: { company: true, agents: true, projects: false, issues: false },
        target: { mode: "existing_company", companyId: "11111111-1111-4111-8111-111111111111" },
        collisionStrategy: "rename",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Board access required");
  });
});


describe("operator-owned company creation and import", () => {
  const source = { type: "inline", files: { "COMPANY.md": "---\nname: Test\n---\n" } };
  const companyId = "11111111-1111-4111-8111-111111111111";
  const body = { source, target: { mode: "new_company", newCompanyName: "Test" }, include: { company: true, agents: true, projects: false, issues: false }, collisionStrategy: "rename" };

  it.each(["/import", "/import/preview"])("rejects non-admin board on %s before reading or executing import", async (route) => {
    mockCompanyPortabilityService.importBundle.mockClear();
    mockCompanyPortabilityService.previewImport.mockClear();
    const app = await createApp({ type: "board", userId: "member", source: "session", companyIds: [companyId], isInstanceAdmin: false });
    expect((await request(app).post(`/api/companies${route}`).send(body)).status).toBe(403);
    expect(mockCompanyPortabilityService.importBundle).not.toHaveBeenCalled();
    expect(mockCompanyPortabilityService.previewImport).not.toHaveBeenCalled();
  });

  it("rejects non-admin company creation and agent-safe apply", async () => {
    const app = await createApp({ type: "board", userId: "member", source: "session", companyIds: [companyId], isInstanceAdmin: false });
    expect((await request(app).post("/api/companies").send({ name: "Test" })).status).toBe(403);
    expect((await request(app).post(`/api/companies/${companyId}/imports/apply`).send({ ...body, target: { mode: "existing_company", companyId } })).status).toBe(403);
  });

  it.each([{ isInstanceAdmin: true, source: "session" }, { isInstanceAdmin: false, source: "local_implicit" }])("allows trusted operator import preview", async (authority) => {
    mockCompanyPortabilityService.previewImport.mockResolvedValue({ warnings: [] });
    const app = await createApp({ type: "board", userId: "operator", ...authority });
    expect((await request(app).post("/api/companies/import/preview").send(body)).status).toBe(200);
  });
});
