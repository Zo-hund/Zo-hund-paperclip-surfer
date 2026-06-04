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

const mockAgentService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));

const mockBoardAuthService = vi.hoisted(() => ({
  resolveBoardAccess: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  boardAuthService: () => mockBoardAuthService,
  deduplicateAgentName: (name: string) => name,
  logActivity: mockLogActivity,
  notifyHireApproved: vi.fn(),
}));

function createDbStub(inviteData: Record<string, unknown> = {}) {
  const invite = {
    id: "invite-1",
    companyId: "company-1",
    inviteType: "company_join",
    allowedJoinTypes: "both",
    defaultsPayload: null,
    expiresAt: new Date(Date.now() + 1000000),
    invitedByUserId: "creator-user",
    tokenHash: "accept-hash",
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...inviteData,
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

  // Mocking drizzle transaction and updates
  const updateInviteResult = { returning: () => Promise.resolve([invite]) };
  const update = vi.fn().mockReturnValue(updateInviteResult);
  
  const insertJoinResult = {
    returning: () => Promise.resolve([joinRequest]),
  };
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue(insertJoinResult),
  });

  const selectResult = {
    then: (fn: any) => fn([invite]),
  };
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(selectResult),
    }),
  });

  const transaction = vi.fn().mockImplementation((callback) => {
    return callback({
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(Promise.resolve([invite])),
        }),
      }),
      insert: vi.fn().mockImplementation((table) => {
        return {
          values: vi.fn().mockImplementation((vals) => {
            return {
              returning: vi.fn().mockResolvedValue([{ ...joinRequest, ...vals }]),
            };
          }),
        };
      }),
    });
  });

  return {
    select,
    update,
    insert,
    transaction,
  };
}

function createApp(actor: Record<string, unknown>, db: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use(
    "/api",
    accessRoutes(db as any, {
      deploymentMode: "authenticated",
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
    }),
  );
  app.use(errorHandler);
  return app;
}

describe("POST /invites/:token/accept Auto Approval", () => {
  beforeEach(() => {
    mockAccessService.isInstanceAdmin.mockReset();
    mockAccessService.ensureMembership.mockReset();
    mockAccessService.setPrincipalGrants.mockReset();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("defaults human join request to pending_approval", async () => {
    const db = createDbStub();
    mockAccessService.isInstanceAdmin.mockResolvedValue(false); // creator not admin

    const app = createApp(
      {
        type: "board",
        userId: "user-1",
        companyIds: ["company-1"],
        source: "session",
      },
      db,
    );

    const res = await request(app)
      .post("/api/invites/accept-token/accept")
      .send({ requestType: "human" });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("pending_approval");
    expect(mockAccessService.ensureMembership).not.toHaveBeenCalled();
  });

  it("auto-approves human join request when autoApprove is in defaultsPayload", async () => {
    const db = createDbStub({
      defaultsPayload: { autoApprove: true, human: { grants: [] } },
    });
    mockAccessService.isInstanceAdmin.mockResolvedValue(false);

    const app = createApp(
      {
        type: "board",
        userId: "user-1",
        companyIds: ["company-1"],
        source: "session",
      },
      db,
    );

    const res = await request(app)
      .post("/api/invites/accept-token/accept")
      .send({ requestType: "human" });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("approved");
    expect(mockAccessService.ensureMembership).toHaveBeenCalledWith(
      "company-1",
      "user",
      "user-1",
      "member",
      "active"
    );
  });

  it("auto-approves human join request when creator is Super Admin", async () => {
    const db = createDbStub();
    mockAccessService.isInstanceAdmin.mockResolvedValue(true); // creator is Super Admin

    const app = createApp(
      {
        type: "board",
        userId: "user-1",
        companyIds: ["company-1"],
        source: "session",
      },
      db,
    );

    const res = await request(app)
      .post("/api/invites/accept-token/accept")
      .send({ requestType: "human" });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("approved");
    expect(mockAccessService.ensureMembership).toHaveBeenCalledWith(
      "company-1",
      "user",
      "user-1",
      "member",
      "active"
    );
  });
});
