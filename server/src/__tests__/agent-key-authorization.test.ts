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
function app(companyIds = ["company-a"], type = "board") {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).actor = { type, source: "session", userId: "reviewer", companyIds, isInstanceAdmin: false };
    next();
  });
  server.use("/api", agentRoutes({} as any));
  server.use(errorHandler);
  return server;
}
async function call(method: string, companyIds?: string[], type?: string) {
  const client = request(app(companyIds, type));
  const url = `/api/agents/${id}/keys`;
  if (method === "POST") return client.post(url).send({ name: "test" });
  if (method === "DELETE") return client.delete(`${url}/key-b`);
  return client.get(url);
}
describe("agent API key tenant authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    service.getById.mockResolvedValue({ id, companyId: "company-b" });
    service.listKeys.mockResolvedValue([]);
    service.createApiKey.mockResolvedValue({ id: "key-b", name: "test", token: "test-token" });
    service.revokeKey.mockResolvedValue({ id: "key-b", agentId: id, companyId: "company-b" });
  });
  it.each(["GET", "POST", "DELETE"])("rejects cross-company %s before key access", async method => {
    expect((await call(method)).status).toBe(403);
    expect(service.listKeys).not.toHaveBeenCalled();
    expect(service.createApiKey).not.toHaveBeenCalled();
    expect(service.revokeKey).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
  });
  it.each(["GET", "POST", "DELETE"])("rejects non-board %s", async method => {
    expect((await call(method, ["company-b"], "agent")).status).toBe(403);
    expect(service.getById).not.toHaveBeenCalled();
  });
  it.each(["GET", "POST", "DELETE"])("returns 404 for missing target on %s", async method => {
    service.getById.mockResolvedValue(null);
    expect((await call(method, ["company-b"])).status).toBe(404);
    expect(service.createApiKey).not.toHaveBeenCalled();
    expect(service.revokeKey).not.toHaveBeenCalled();
  });
  it("allows a member to list and create keys for their company", async () => {
    expect((await call("GET", ["company-b"])).status).toBe(200);
    expect((await call("POST", ["company-b"])).status).toBe(201);
    expect(service.createApiKey).toHaveBeenCalledWith(id, "test");
  });
  it("binds revocation to the authorized agent and records successful activity", async () => {
    expect((await call("DELETE", ["company-b"])).status).toBe(200);
    expect(service.revokeKey).toHaveBeenCalledWith(id, "key-b");
    expect(activity).toHaveBeenCalledOnce();
  });
  it("returns 404 without logging success when the key is not owned by this agent", async () => {
    service.revokeKey.mockResolvedValue(null);
    expect((await call("DELETE", ["company-b"])).status).toBe(404);
    expect(activity).not.toHaveBeenCalled();
  });
});

describe("agent lifecycle tenant authorization", () => {
  const operations = ["pause", "resume", "terminate", "remove"] as const;
  const send = (operation: typeof operations[number], companies = ["company-a"], type = "board") => {
    const client = request(app(companies, type));
    return operation === "remove" ? client.delete(`/api/agents/${id}`) : client.post(`/api/agents/${id}/${operation}`);
  };
  beforeEach(() => {
    vi.resetAllMocks();
    const agent = { id, companyId: "company-b" };
    service.getById.mockResolvedValue(agent);
    for (const operation of operations) service[operation].mockResolvedValue(agent);
  });
  it.each(operations)("rejects cross-company %s before mutation or cancellation", async operation => {
    expect((await send(operation)).status).toBe(403);
    expect(service[operation]).not.toHaveBeenCalled();
    expect(heartbeat.cancelActiveForAgent).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
  });
  it.each(operations)("rejects agent callers on %s", async operation => {
    expect((await send(operation, ["company-b"], "agent")).status).toBe(403);
    expect(service[operation]).not.toHaveBeenCalled();
  });
  it.each(operations)("returns 404 without mutation for a missing agent on %s", async operation => {
    service.getById.mockResolvedValue(null);
    expect((await send(operation, ["company-b"])).status).toBe(404);
    expect(service[operation]).not.toHaveBeenCalled();
  });
  it.each(operations)("allows authorized company members to %s", async operation => {
    expect((await send(operation, ["company-b"])).status).toBe(200);
    expect(service[operation]).toHaveBeenCalledWith(id);
    expect(activity).toHaveBeenCalledOnce();
    if (operation === "pause" || operation === "terminate") {
      expect(heartbeat.cancelActiveForAgent).toHaveBeenCalledWith(id);
    }
  });
});
