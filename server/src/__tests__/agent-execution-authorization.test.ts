import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

const id = "11111111-1111-4111-8111-111111111111";
const service = vi.hoisted(() => ({
  getById: vi.fn(), listKeys: vi.fn(), createApiKey: vi.fn(), revokeKey: vi.fn(),
  pause: vi.fn(), resume: vi.fn(), terminate: vi.fn(), remove: vi.fn(),
}));
const heartbeat = vi.hoisted(() => ({ cancelActiveForAgent: vi.fn() }));
const activity = vi.hoisted(() => vi.fn());
vi.mock("../services/index.js", () => ({
  agentService: () => service, agentInstructionsService: () => ({}),
  accessService: () => ({}), approvalService: () => ({}), companySkillService: () => ({}),
  budgetService: () => ({}), heartbeatService: () => heartbeat, issueApprovalService: () => ({}),
  issueService: () => ({}), secretService: () => ({}), workspaceOperationService: () => ({}),
  logActivity: activity, syncInstructionsBundleConfigFromFilePath: vi.fn(),
}));
function app(type = "agent", isInstanceAdmin = false) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).actor = { type, source: "session", userId: "reviewer", agentId: id, companyId: "company-a", companyIds: ["company-a"], isInstanceAdmin };
    next();
  });
  server.use("/api", agentRoutes({} as any));
  server.use(errorHandler);
  return server;
}

describe("execution configuration requires a trusted operator", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it.each([
    { adapterConfig: { workspaceStrategy: { type: "git_worktree", provisionCommand: "benign fixture command" } } },
    { adapterConfig: { env: { CODEX_HOME: "/operator/home" } } },
    { adapterType: "process" },
    { adapterConfig: {}, replaceAdapterConfig: true },
    { runtimeConfig: { anything: "value" } },
  ])("rejects agent self-update before any persistence or lookup", async (body) => {
    expect((await request(app()).patch(`/api/agents/${id}`).send(body)).status).toBe(403);
    expect(service.getById).not.toHaveBeenCalled();
  });
  it("also rejects a non-admin board member", async () => {
    expect((await request(app("board")).patch(`/api/agents/${id}`).send({ adapterConfig: { command: "fixture" } })).status).toBe(403);
    expect(service.getById).not.toHaveBeenCalled();
  });
  it("permits operator authorization and continues normal missing-agent validation", async () => {
    service.getById.mockResolvedValue(null);
    expect((await request(app("board", true)).patch(`/api/agents/${id}`).send({ adapterConfig: { command: "fixture" } })).status).toBe(404);
    expect(service.getById).toHaveBeenCalledWith(id);
  });
  it("does not block an ordinary self metadata update at the execution guard", async () => {
    service.getById.mockResolvedValue(null);
    expect((await request(app()).patch(`/api/agents/${id}`).send({ name: "New name" })).status).toBe(404);
    expect(service.getById).toHaveBeenCalledWith(id);
  });
  it("rejects configuration rollback and live-run config bypass paths", async () => {
    expect((await request(app()).post(`/api/agents/${id}/config-revisions/revision/rollback`)).status).toBe(403);
    expect((await request(app("board")).patch("/api/heartbeat-runs/run/config").send({ adapterConfig: {} })).status).toBe(403);
    expect(service.getById).not.toHaveBeenCalled();
  });
  it.each(["agents", "agent-hires"])("rejects agent-supplied executable configuration via %s", async (route) => {
    expect((await request(app()).post(`/api/companies/company-a/${route}`).send({ name: "Fixture", role: "engineer", adapterType: "process", adapterConfig: { command: "fixture" } })).status).toBe(403);
  });
});
