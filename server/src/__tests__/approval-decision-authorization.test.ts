import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalRoutes } from "../routes/approvals.js";
import { errorHandler } from "../middleware/index.js";

const mocks = vi.hoisted(() => ({
  approval: { getById: vi.fn(), approve: vi.fn(), reject: vi.fn(), requestRevision: vi.fn(), escalate: vi.fn() },
  log: vi.fn(), wakeup: vi.fn(),
}));
vi.mock("../services/index.js", () => ({
  approvalService: () => mocks.approval,
  heartbeatService: () => ({ wakeup: mocks.wakeup }),
  issueApprovalService: () => ({ listIssuesForApproval: vi.fn().mockResolvedValue([]) }),
  secretService: () => ({}), logActivity: mocks.log,
}));

const existing = { id: "approval-fixture", companyId: "company-a", type: "approve_ceo_strategy", status: "pending", payload: {} };
const member = { type: "board", source: "session", userId: "actual-reviewer", companyIds: ["company-a"], isInstanceAdmin: false };
function app(actor: Record<string, unknown> = member) {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { (req as any).actor = actor; next(); });
  server.use("/api", approvalRoutes({} as any));
  server.use(errorHandler);
  return server;
}
const actions = [
  ["approve", "approve"], ["reject", "reject"],
  ["request-revision", "requestRevision"], ["escalate", "escalate"],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.approval.getById.mockResolvedValue(existing);
  mocks.approval.approve.mockResolvedValue({ approval: existing, applied: false });
  mocks.approval.reject.mockResolvedValue({ approval: existing, applied: false });
  mocks.approval.requestRevision.mockResolvedValue(existing);
  mocks.approval.escalate.mockResolvedValue(existing);
});

describe.each(actions)("approval %s authorization", (action, method) => {
  const send = (actor: Record<string, unknown> = member, body = {}) =>
    request(app(actor)).post(`/api/approvals/approval-fixture/${action}`).send(body);

  it.each([{ type: "none", source: "none" }, { type: "agent", agentId: "agent-a", companyId: "company-a" }])(
    "rejects $type before target lookup or decisions", async actor => {
      expect((await send(actor)).status).toBe(403);
      expect(mocks.approval.getById).not.toHaveBeenCalled();
      expect(mocks.approval[method]).not.toHaveBeenCalled();
    },
  );
  it("rejects a foreign company before decisions or side effects", async () => {
    expect((await send({ ...member, companyIds: ["company-b"] })).status).toBe(403);
    expect(mocks.approval[method]).not.toHaveBeenCalled();
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.wakeup).not.toHaveBeenCalled();
  });
  it("preserves 404 for a missing approval", async () => {
    mocks.approval.getById.mockResolvedValue(null);
    expect((await send()).status).toBe(404);
    expect(mocks.approval[method]).not.toHaveBeenCalled();
  });
  it("uses the authenticated reviewer and ignores a spoofed body identity", async () => {
    expect((await send(member, { decidedByUserId: "spoofed-reviewer", decisionNote: "Reviewed" })).status).toBe(200);
    expect(mocks.approval[method]).toHaveBeenCalledWith(existing.id, "actual-reviewer", "Reviewed");
  });
  it("rejects a session without an authenticated reviewer identity", async () => {
    expect((await send({ ...member, userId: undefined })).status).toBe(403);
    expect(mocks.approval[method]).not.toHaveBeenCalled();
  });
  it("requires an instance administrator for executable hire decisions", async () => {
    mocks.approval.getById.mockResolvedValue({ ...existing, type: "hire_agent" });
    expect((await send()).status).toBe(403);
    expect(mocks.approval[method]).not.toHaveBeenCalled();
  });
  it("preserves an instance administrator's hire decision", async () => {
    mocks.approval.getById.mockResolvedValue({ ...existing, type: "hire_agent" });
    expect((await send({ ...member, isInstanceAdmin: true })).status).toBe(200);
    expect(mocks.approval[method]).toHaveBeenCalledWith(existing.id, "actual-reviewer", undefined);
  });
  it("attributes the trusted local operator without trusting a body identity", async () => {
    expect((await send({ type: "board", source: "local_implicit" }, { decidedByUserId: "spoofed-reviewer" })).status).toBe(200);
    expect(mocks.approval[method]).toHaveBeenCalledWith(existing.id, "local-board", undefined);
  });
});
