import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";
const id = "11111111-1111-4111-8111-111111111111";
const fixture = vi.hoisted(() => ({
  agent: { id: "11111111-1111-4111-8111-111111111111", companyId: "company-a", adapterType: "codex_local", adapterConfig: {}, permissions: { canCreateAgents: true } },
  getById: vi.fn(), update: vi.fn(), normalize: vi.fn(), resolve: vi.fn(), probe: vi.fn(),
  getBundle: vi.fn(), readFile: vi.fn(), updateBundle: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn(),
  getRun: vi.fn(), cancelRun: vi.fn(), pauseRun: vi.fn(), archiveRun: vi.fn(), unarchiveRun: vi.fn(), rollbackRun: vi.fn(), activity: vi.fn(),
}));
vi.mock("../services/index.js", () => ({
  agentService: () => ({ getById: fixture.getById, update: fixture.update }),
  agentInstructionsService: () => ({ getBundle: fixture.getBundle, readFile: fixture.readFile, updateBundle: fixture.updateBundle, writeFile: fixture.writeFile, deleteFile: fixture.deleteFile }),
  accessService: () => ({ canUser: async () => true, hasPermission: async () => true }),
  secretService: () => ({ normalizeAdapterConfigForPersistence: fixture.normalize, resolveAdapterConfigForRuntime: fixture.resolve }),
  heartbeatService: () => ({ getRun: fixture.getRun, cancelRun: fixture.cancelRun, pauseRun: fixture.pauseRun, archiveRun: fixture.archiveRun, unarchiveRun: fixture.unarchiveRun, rollbackRun: fixture.rollbackRun }),
  approvalService: () => ({}), companySkillService: () => ({}), budgetService: () => ({}), issueApprovalService: () => ({}), issueService: () => ({}), workspaceOperationService: () => ({}),
  logActivity: fixture.activity, syncInstructionsBundleConfigFromFilePath: (_agent: unknown, config: unknown) => config,
}));
vi.mock("../adapters/index.js", () => ({ findServerAdapter: () => ({ testEnvironment: fixture.probe }), listAdapterModels: vi.fn() }));
function app(type = "board", admin = false) {
  const server = express(); server.use(express.json()); server.use((req, _res, next) => {
    (req as any).actor = { type, source: "session", userId: "fixture-user", agentId: id, companyId: "company-a", companyIds: ["company-a"], isInstanceAdmin: admin }; next();
  }); server.use("/api", agentRoutes({} as any)); server.use(errorHandler); return server;
}
beforeEach(() => {
  vi.clearAllMocks(); fixture.getById.mockResolvedValue(fixture.agent);
  fixture.normalize.mockImplementation(async (_company, config) => config); fixture.resolve.mockImplementation(async (_company, config) => ({ config }));
  fixture.update.mockImplementation(async (_id, patch) => ({ ...fixture.agent, ...patch }));
  fixture.probe.mockResolvedValue({ status: "pass", checks: [] }); fixture.getBundle.mockResolvedValue({ files: [] }); fixture.readFile.mockResolvedValue({ content: "harmless fixture" });
  fixture.getRun.mockResolvedValue({ id: "run-fixture", companyId: "company-a", agentId: id });
  for (const action of [fixture.cancelRun, fixture.pauseRun, fixture.archiveRun, fixture.unarchiveRun]) action.mockResolvedValue({ id: "run-fixture", companyId: "company-a", agentId: id });
  fixture.rollbackRun.mockResolvedValue({ run: { id: "run-fixture", companyId: "company-a", agentId: id } });
});
describe("alternate execution and host-file gates", () => {
  it.each(["agent", "board"])("blocks %s diagnostics before secrets or adapter side effects", async type => {
    expect((await request(app(type)).post("/api/companies/company-a/adapters/codex_local/test-environment").send({ adapterConfig: { command: "harmless-fixture" } })).status).toBe(403);
    expect(fixture.normalize).not.toHaveBeenCalled(); expect(fixture.resolve).not.toHaveBeenCalled(); expect(fixture.probe).not.toHaveBeenCalled();
  });
  it("preserves authorized operator diagnostics", async () => {
    expect((await request(app("board", true)).post("/api/companies/company-a/adapters/codex_local/test-environment").send({ adapterConfig: {} })).status).toBe(200); expect(fixture.probe).toHaveBeenCalledTimes(1);
  });
  it.each(["agent", "board"])("blocks %s instructions configuration before normalization or persistence", async type => {
    expect((await request(app(type)).patch(`/api/agents/${id}/instructions-path`).send({ adapterConfigKey: "command", path: "harmless-fixture" })).status).toBe(403);
    expect(fixture.normalize).not.toHaveBeenCalled(); expect(fixture.update).not.toHaveBeenCalled();
  });
  it("rejects arbitrary config keys even for an operator", async () => {
    expect((await request(app("board", true)).patch(`/api/agents/${id}/instructions-path`).send({ adapterConfigKey: "command", path: "harmless-fixture" })).status).toBe(422); expect(fixture.update).not.toHaveBeenCalled();
  });
  it("preserves operator use of the known instructions key", async () => {
    expect((await request(app("board", true)).patch(`/api/agents/${id}/instructions-path`).send({ adapterConfigKey: "instructionsFilePath", path: null })).status).toBe(200); expect(fixture.update).toHaveBeenCalledTimes(1);
  });
  it.each(["agent", "board"])("blocks %s access to legacy host-backed bundle reads and writes", async type => {
    fixture.getById.mockResolvedValue({ ...fixture.agent, adapterConfig: { instructionsBundleMode: "external", instructionsRootPath: "/fixture/private-root", instructionsEntryFile: "AGENTS.md" } });
    const server = app(type);
    expect((await request(server).get(`/api/agents/${id}/instructions-bundle`)).status).toBe(403);
    expect((await request(server).get(`/api/agents/${id}/instructions-bundle/file?path=AGENTS.md`)).status).toBe(403);
    expect((await request(server).patch(`/api/agents/${id}/instructions-bundle`).send({ mode: "external", rootPath: "/fixture", entryFile: "AGENTS.md" })).status).toBe(403);
    expect((await request(server).put(`/api/agents/${id}/instructions-bundle/file`).send({ path: "AGENTS.md", content: "fixture" })).status).toBe(403);
    expect((await request(server).delete(`/api/agents/${id}/instructions-bundle/file?path=AGENTS.md`)).status).toBe(403);
    for (const effect of [fixture.getBundle, fixture.readFile, fixture.updateBundle, fixture.writeFile, fixture.deleteFile, fixture.normalize, fixture.update]) expect(effect).not.toHaveBeenCalled();
  });
});
describe("run mutation boundaries", () => {
  it.each(["cancel", "pause", "archive", "unarchive", "rollback"])("blocks cross-company %s before mutation", async action => {
    fixture.getRun.mockResolvedValue({ id: "run-fixture", companyId: "company-b", agentId: id });
    expect((await request(app()).post(`/api/heartbeat-runs/run-fixture/${action}`)).status).toBe(403);
    for (const effect of [fixture.cancelRun, fixture.pauseRun, fixture.archiveRun, fixture.unarchiveRun, fixture.rollbackRun, fixture.activity]) expect(effect).not.toHaveBeenCalled();
  });
  it.each(["cancel", "pause", "archive", "unarchive", "rollback"])("returns404 for missing run before %s effects", async action => {
    fixture.getRun.mockResolvedValue(null); expect((await request(app()).post(`/api/heartbeat-runs/missing/${action}`)).status).toBe(404);
    for (const effect of [fixture.cancelRun, fixture.pauseRun, fixture.archiveRun, fixture.unarchiveRun, fixture.rollbackRun]) expect(effect).not.toHaveBeenCalled();
  });
  it.each(["cancel", "pause", "archive", "unarchive"])("preserves same-company board %s", async action => {
    expect((await request(app()).post(`/api/heartbeat-runs/run-fixture/${action}`)).status).toBe(200);
  });
  it("requires operator authority for rollback and preserves operator use", async () => {
    expect((await request(app()).post("/api/heartbeat-runs/run-fixture/rollback")).status).toBe(403); expect(fixture.rollbackRun).not.toHaveBeenCalled();
    expect((await request(app("board", true)).post("/api/heartbeat-runs/run-fixture/rollback")).status).toBe(200); expect(fixture.rollbackRun).toHaveBeenCalledTimes(1);
  });
});
