import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRoutes } from "../routes/access.js";
import { errorHandler } from "../middleware/index.js";

const mockAccessService = vi.hoisted(() => ({
  isInstanceAdmin: vi.fn(),
  ensureMembership: vi.fn(),
  setPrincipalGrants: vi.fn(),
}));
const mockAgentService = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
const mockBoardAuthService = vi.hoisted(() => ({ resolveBoardAccess: vi.fn() }));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  boardAuthService: () => mockBoardAuthService,
  companyService: () => ({ getById: vi.fn() }),
  deduplicateAgentName: (name: string) => name,
  logActivity: mockLogActivity,
  notifyHireApproved: vi.fn(),
}));

function createDbStub(defaultsPayload: Record<string, unknown> | null) {
  const invite = {
    id: "invite-1",
    companyId: "company-1",
    inviteType: "company_join",
    allowedJoinTypes: "both",
    defaultsPayload,
    expiresAt: new Date(Date.now() + 1000000),
    invitedByUserId: "creator-user",
    tokenHash: "accept-hash",
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const joinRequest = {
    id: "request-1",
    inviteId: "invite-1",
    companyId: "company-1",
    requestType: "human",
    status: "pending_approval",
    requestIp: "127.0.0.1",
    requestingUserId: "user-1",
  };
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ then: (fn: any) => fn([invite]) }) }),
  });
  const update = vi.fn().mockReturnValue({ returning: () => Promise.resolve([invite]) });
  const insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: () => Promise.resolve([joinRequest]) }) });
  const transaction = vi.fn().mockImplementation((cb) =>
    cb({
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(Promise.resolve([invite])) }) }),
      insert: vi.fn().mockImplementation(() => ({ values: vi.fn().mockImplementation((vals) => ({ returning: vi.fn().mockResolvedValue([{ ...joinRequest, ...vals }]) })) })),
    }),
  );
  return { select, update, insert, transaction };
}

function createApp(db: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { type: "board", userId: "user-1", companyIds: ["company-1"], source: "session" };
    next();
  });
  app.use("/api", accessRoutes(db as any, {
    deploymentMode: "authenticated",
    deploymentExposure: "private",
    bindHost: "127.0.0.1",
    allowedHostnames: [],
  }));
  app.use(errorHandler);
  return app;
}

describe("Invite membership role on accept", () => {
  beforeEach(() => {
    mockAccessService.isInstanceAdmin.mockReset();
    mockAccessService.ensureMembership.mockReset();
    mockAccessService.setPrincipalGrants.mockReset();
    mockLogActivity.mockResolvedValue(undefined);
    // Auto-approve so the membership is created in the same request.
    mockAccessService.isInstanceAdmin.mockResolvedValue(true);
  });

  it("grants the invite's membershipRole (owner) when specified", async () => {
    const db = createDbStub({ membershipRole: "owner", human: { grants: [] } });
    const res = await request(createApp(db)).post("/api/invites/tok/accept").send({ requestType: "human" });
    expect(res.status).toBe(202);
    expect(mockAccessService.ensureMembership).toHaveBeenCalledWith("company-1", "user", "user-1", "owner", "active");
  });

  it("defaults to client when the invite specifies no role", async () => {
    const db = createDbStub({ human: { grants: [] } });
    const res = await request(createApp(db)).post("/api/invites/tok/accept").send({ requestType: "human" });
    expect(res.status).toBe(202);
    expect(mockAccessService.ensureMembership).toHaveBeenCalledWith("company-1", "user", "user-1", "client", "active");
  });

  it("ignores an invalid role value and falls back to client", async () => {
    const db = createDbStub({ membershipRole: "superadmin", human: { grants: [] } });
    const res = await request(createApp(db)).post("/api/invites/tok/accept").send({ requestType: "human" });
    expect(res.status).toBe(202);
    expect(mockAccessService.ensureMembership).toHaveBeenCalledWith("company-1", "user", "user-1", "client", "active");
  });
});
