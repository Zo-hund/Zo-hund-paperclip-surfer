import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectRoutes } from "../routes/projects.js";
import { executionWorkspaceRoutes } from "../routes/execution-workspaces.js";
import { errorHandler } from "../middleware/index.js";

const mocks = vi.hoisted(() => ({
  project: { getById: vi.fn(), create: vi.fn(), update: vi.fn(), createWorkspace: vi.fn(),
    listWorkspaces: vi.fn(), updateWorkspace: vi.fn(), removeWorkspace: vi.fn() },
  execution: { getById: vi.fn(), update: vi.fn() },
  log: vi.fn(), cleanup: vi.fn(), stop: vi.fn(),
}));
vi.mock("../services/index.js", () => ({
  projectService: () => mocks.project,
  executionWorkspaceService: () => mocks.execution,
  workspaceOperationService: () => ({ createRecorder: vi.fn() }),
  logActivity: mocks.log,
}));
vi.mock("../services/workspace-runtime.js", () => ({
  cleanupExecutionWorkspaceArtifacts: mocks.cleanup,
  stopRuntimeServicesForExecutionWorkspace: mocks.stop,
}));

const companyId = "company-a";
const projectId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const projectUrl = "/api/projects/" + projectId;
const workspaceUrl = projectUrl + "/workspaces/" + workspaceId;
const executionUrl = "/api/execution-workspaces/" + workspaceId;
const createUrl = "/api/companies/" + companyId + "/projects";
const tenant = { type: "board", source: "session", userId: "member", companyIds: [companyId] };
const agent = { type: "agent", agentId: "agent-a", companyId };
const admin = { ...tenant, isInstanceAdmin: true };
const project = { id: projectId, companyId, name: "Storytelling" };
const workspace = { id: workspaceId, companyId, name: "Studio", cwd: "/approved/workspace" };
const db = { select: vi.fn(), from: vi.fn(), where: vi.fn() };
function app(actor: Record<string, unknown>) {
  const result = express();
  result.use(express.json());
  result.use((req, _res, next) => { (req as any).actor = actor; next(); });
  result.use("/api", projectRoutes(db as any));
  result.use("/api", executionWorkspaceRoutes(db as any));
  result.use(errorHandler);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.getById.mockResolvedValue(project);
  mocks.project.create.mockResolvedValue(project);
  mocks.project.update.mockResolvedValue(project);
  mocks.project.createWorkspace.mockResolvedValue(workspace);
  mocks.project.listWorkspaces.mockResolvedValue([workspace]);
  mocks.project.updateWorkspace.mockResolvedValue(workspace);
  mocks.project.removeWorkspace.mockResolvedValue(workspace);
  mocks.execution.getById.mockResolvedValue({ ...workspace, status: "idle", projectId: null, projectWorkspaceId: null });
  mocks.execution.update.mockImplementation(async (_id, patch) => ({ ...workspace, ...patch }));
  mocks.cleanup.mockResolvedValue({ cleaned: true, warnings: [] });
  mocks.stop.mockResolvedValue(undefined);
  db.select.mockReturnValue(db);
  db.from.mockReturnValue(db);
  db.where.mockResolvedValue([]);
});

describe.each([tenant, agent])("project execution boundary for $type", (actor) => {
  it.each([
    { executionWorkspacePolicy: { enabled: true, workspaceStrategy: { provisionCommand: "echo ready" } } },
    { executionWorkspacePolicy: { enabled: true, workspaceStrategy: { teardownCommand: "echo cleanup" } } },
    { executionWorkspacePolicy: { enabled: true, workspaceRuntime: { command: "echo service" } } },
    { executionWorkspacePolicy: null },
  ])("rejects execution policy before project writes: %j", async (payload) => {
    await request(app(actor)).post(createUrl).send({ name: "Demo", ...payload }).expect(403);
    await request(app(actor)).patch(projectUrl).send(payload).expect(403);
    expect(mocks.project.create).not.toHaveBeenCalled();
    expect(mocks.project.update).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("rejects embedded workspace before parent project creation", async () => {
    await request(app(actor)).post(createUrl)
      .send({ name: "Demo", workspace: { cwd: "/other", setupCommand: "echo setup" } }).expect(403);
    expect(mocks.project.create).not.toHaveBeenCalled();
    expect(mocks.project.createWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    { cwd: "/other" }, { setupCommand: "echo setup" }, { cleanupCommand: "echo cleanup" },
    { repoUrl: "https://example.com/repo.git" }, { isPrimary: true }, { metadata: { runtime: {} } },
  ])("rejects workspace execution changes: %j", async (payload) => {
    await request(app(actor)).patch(workspaceUrl).send(payload).expect(403);
    expect(mocks.project.updateWorkspace).not.toHaveBeenCalled();
  });

  it("rejects workspace creation and deletion", async () => {
    await request(app(actor)).post(projectUrl + "/workspaces").send({ cwd: "/other" }).expect(403);
    await request(app(actor)).delete(workspaceUrl).expect(403);
    expect(mocks.project.createWorkspace).not.toHaveBeenCalled();
    expect(mocks.project.removeWorkspace).not.toHaveBeenCalled();
  });

  it("preserves ordinary project and workspace presentation edits", async () => {
    await request(app(actor)).post(createUrl).send({ name: "Demo" }).expect(201);
    await request(app(actor)).patch(projectUrl).send({ name: "New name", description: "Context" }).expect(200);
    await request(app(actor)).patch(workspaceUrl).send({ name: "Display label", visibility: "advanced" }).expect(200);
  });

  it.each([{ status: "archived" }, { metadata: { createdByRuntime: true } }, { cleanupEligibleAt: null }])(
    "rejects execution lifecycle/provenance mutation: %j", async (payload) => {
      await request(app(actor)).patch(executionUrl).send(payload).expect(403);
      expect(mocks.execution.update).not.toHaveBeenCalled();
      expect(mocks.cleanup).not.toHaveBeenCalled();
      expect(mocks.stop).not.toHaveBeenCalled();
      expect(db.select).not.toHaveBeenCalled();
    },
  );
});

describe("operator execution configuration", () => {
  it.each([admin, { type: "board", source: "local_implicit" }])("allows an operator to configure execution", async (actor) => {
    await request(app(actor)).post(createUrl)
      .send({ name: "Demo", executionWorkspacePolicy: { enabled: true }, workspace: { cwd: "/approved" } }).expect(201);
    await request(app(actor)).patch(projectUrl)
      .send({ executionWorkspacePolicy: { enabled: true, workspaceStrategy: { provisionCommand: "echo ready" } } }).expect(200);
    await request(app(actor)).post(projectUrl + "/workspaces").send({ cwd: "/approved" }).expect(201);
    await request(app(actor)).patch(workspaceUrl).send({ cleanupCommand: "echo cleanup" }).expect(200);
    await request(app(actor)).delete(workspaceUrl).expect(200);
    expect(mocks.log).toHaveBeenCalled();
  });

  it("permits operator archive and records cleanup", async () => {
    await request(app(admin)).patch(executionUrl).send({ status: "archived" }).expect(200);
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.log).toHaveBeenCalled();
  });

  it("rejects arbitrary execution cwd/provider fields even for operators", async () => {
    await request(app(admin)).patch(executionUrl).send({ cwd: "/other", providerRef: "/other" }).expect(400);
    expect(mocks.execution.update).not.toHaveBeenCalled();
  });

  it("retains the open-issue archive conflict for operators", async () => {
    db.where.mockResolvedValue([{ id: "open-issue", status: "in_progress" }]);
    await request(app(admin)).patch(executionUrl).send({ status: "archived" }).expect(409);
    expect(mocks.execution.update).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("retains company isolation for ordinary project edits", async () => {
    await request(app({ ...tenant, companyIds: ["another-company"] }))
      .patch(projectUrl).send({ description: "Context" }).expect(403);
    expect(mocks.project.update).not.toHaveBeenCalled();
  });
});
