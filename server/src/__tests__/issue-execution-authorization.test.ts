import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

const id = "11111111-1111-4111-8111-111111111111";
const issue = { id, companyId: "company-a", title: "Task", status: "todo", assigneeAgentId: null, assigneeUserId: null };
const service = vi.hoisted(() => ({ getById: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("../services/issue-assignment-wakeup.js", () => ({ queueIssueAssignmentWakeup: vi.fn() }));
vi.mock("../services/index.js", () => ({
  issueService: () => service, accessService: () => ({}), agentService: () => ({}),
  executionWorkspaceService: () => ({}), goalService: () => ({}), heartbeatService: () => ({}),
  issueApprovalService: () => ({}), documentService: () => ({}), projectService: () => ({}),
  routineService: () => ({ syncRunStatusForIssue: vi.fn() }), workProductService: () => ({}),
  logActivity: vi.fn(),
}));
function app(type = "agent", isInstanceAdmin = false, source = "session") {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).actor = { type, source, isInstanceAdmin, userId: "operator", agentId: id, companyId: "company-a", companyIds: ["company-a"] };
    next();
  });
  server.use("/api", issueRoutes({} as any, {} as any));
  server.use(errorHandler);
  return server;
}
const sensitivePatches = [
  { assigneeAdapterOverrides: { adapterConfig: { command: "fixture" } } },
  { executionWorkspaceSettings: { workspaceStrategy: { provisionCommand: "fixture" } } },
  { executionWorkspaceSettings: { workspaceStrategy: { teardownCommand: "fixture" } } },
  { executionWorkspaceSettings: { workspaceRuntime: { env: { FIXTURE: "value" } } } },
  { assigneeAdapterOverrides: null },
  { executionWorkspaceSettings: null },
];

describe("issue execution configuration requires an instance operator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.getById.mockResolvedValue(issue);
    service.create.mockImplementation(async (_company, fields) => ({ ...issue, ...fields }));
    service.update.mockImplementation(async (_id, fields) => ({ ...issue, ...fields }));
  });
  it.each(sensitivePatches)("rejects agent execution settings on create and update", async (patch) => {
    expect((await request(app()).post("/api/companies/company-a/issues").send({ title: "Task", ...patch })).status).toBe(403);
    expect((await request(app()).patch(`/api/issues/${id}`).send(patch)).status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });
  it.each(sensitivePatches)("rejects non-admin board execution settings", async (patch) => {
    expect((await request(app("board")).post("/api/companies/company-a/issues").send({ title: "Task", ...patch })).status).toBe(403);
    expect((await request(app("board")).patch(`/api/issues/${id}`).send(patch)).status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });
  it.each(["session", "local_implicit"])("preserves authorized operator configuration through %s", async (source) => {
    const server = app("board", source === "session", source);
    const patch = sensitivePatches[1];
    expect((await request(server).post("/api/companies/company-a/issues").send({ title: "Task", ...patch })).status).toBe(201);
    expect((await request(server).patch(`/api/issues/${id}`).send(patch)).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(id, patch);
  });
  it.each(["agent", "board"])("preserves ordinary task creation and updates for %s", async (type) => {
    const server = app(type);
    expect((await request(server).post("/api/companies/company-a/issues").send({ title: "New task" })).status).toBe(201);
    expect((await request(server).patch(`/api/issues/${id}`).send({ status: "in_review", description: "Deliverable ready" })).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(id, { status: "in_review", description: "Deliverable ready" });
  });
  it("bulk updates cannot persist execution overrides and still update ordinary status", async () => {
    expect((await request(app()).post("/api/companies/company-a/issues/bulk-update").send({
      ids: [id], update: { status: "in_review", ...sensitivePatches[0], ...sensitivePatches[1] },
    })).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(id, { status: "in_review" });
  });
});
