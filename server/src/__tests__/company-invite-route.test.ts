import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRoutes } from "../routes/access.js";
import { errorHandler } from "../middleware/index.js";

const mockAccessService = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  canUser: vi.fn(),
  isInstanceAdmin: vi.fn(),
  getMembership: vi.fn(),
  ensureMembership: vi.fn(),
  listMembers: vi.fn(),
  setMemberPermissions: vi.fn(),
  promoteInstanceAdmin: vi.fn(),
  demoteInstanceAdmin: vi.fn(),
  listUserCompanyAccess: vi.fn(),
  setUserCompanyAccess: vi.fn(),
  setPrincipalGrants: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockBoardAuthService = vi.hoisted(() => ({
  createCliAuthChallenge: vi.fn(),
  describeCliAuthChallenge: vi.fn(),
  approveCliAuthChallenge: vi.fn(),
  cancelCliAuthChallenge: vi.fn(),
  resolveBoardAccess: vi.fn(),
  assertCurrentBoardKey: vi.fn(),
  revokeBoardApiKey: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockEmailService = vi.hoisted(() => ({
  enabled: true,
  provider: "resend" as const,
  sendCompanyInviteEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  boardAuthService: () => mockBoardAuthService,
  deduplicateAgentName: vi.fn(),
  logActivity: mockLogActivity,
  notifyHireApproved: vi.fn(),
}));

vi.mock("../services/email.js", () => ({
  createEmailService: () => mockEmailService,
}));

vi.mock("../config.js", () => ({
  loadConfig: vi.fn(() => ({})),
}));

function createDbStub() {
  const persistedInvites: Array<Record<string, unknown>> = [];
  const createdInvite = {
    id: "invite-1",
    companyId: "company-1",
    operatingEnvironment: "simulation",
    inviteType: "company_join",
    allowedJoinTypes: "human",
    defaultsPayload: null,
    expiresAt: new Date("2026-03-07T00:10:00.000Z"),
    invitedByUserId: "user-1",
    tokenHash: "hash",
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date("2026-03-07T00:00:00.000Z"),
    updatedAt: new Date("2026-03-07T00:00:00.000Z"),
  };

  const buildInsert = (stage?: Array<Record<string, unknown>>) => {
    const returning = vi.fn().mockImplementation(async () => {
      if (stage) {
        stage.push(createdInvite);
      } else {
        persistedInvites.push(createdInvite);
      }
      return [createdInvite];
    });
    const values = vi.fn().mockReturnValue({ returning });
    return vi.fn().mockReturnValue({ values });
  };

  const outerInsert = buildInsert();
  const transaction = vi.fn(async (callback: (tx: Record<string, unknown>) => unknown) => {
    const stage: Array<Record<string, unknown>> = [];
    const tx = {
      insert: buildInsert(stage),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ name: "Acme Labs" }]),
        }),
      }),
    };

    const result = await callback(tx);
    persistedInvites.push(...stage);
    return result;
  });

  return {
    persistedInvites,
    insert: outerInsert,
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
      deploymentMode: "local_trusted",
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
    }),
  );
  app.use(errorHandler);
  return app;
}

describe("POST /companies/:companyId/invites", () => {
  beforeEach(() => {
    mockLogActivity.mockReset();
    mockAccessService.canUser.mockResolvedValue(true);
    mockLogActivity.mockResolvedValue(undefined);
    mockEmailService.sendCompanyInviteEmail.mockReset();
    mockEmailService.sendCompanyInviteEmail.mockResolvedValue({
      provider: "resend",
      accepted: true,
      messageId: "email-123",
      recipient: "teammate@example.com",
      subject: "You're invited to join Acme Labs",
    });
  });

  it("creates an invite successfully without inviteeEmail", async () => {
    const db = createDbStub();
    const app = createApp(
      {
        type: "board",
        userId: "user-1",
        companyIds: ["company-1"],
        source: "session",
        isInstanceAdmin: false,
      },
      db,
    );

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human" });

    expect(res.status).toBe(201);
    expect(res.body.allowedJoinTypes).toBe("human");
    expect(res.body.operatingEnvironment).toBe("simulation");
    expect(mockEmailService.sendCompanyInviteEmail).not.toHaveBeenCalled();
    expect(res.body.delivery).toEqual({ attempted: false });
    expect(db.persistedInvites).toHaveLength(1);
  });

  it("creates an invite and sends email when inviteeEmail is present", async () => {
    const db = createDbStub();
    const app = createApp(
      {
        type: "board",
        userId: "user-1",
        companyIds: ["company-1"],
        source: "session",
        isInstanceAdmin: false,
      },
      db,
    );

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", inviteeEmail: "teammate@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.operatingEnvironment).toBe("simulation");
    expect(mockEmailService.sendCompanyInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "teammate@example.com",
        companyName: "Acme Labs",
        inviteUrl: expect.stringContaining("/invite/"),
        onboardingTextUrl: expect.stringContaining("/api/invites/"),
      }),
    );
    expect(res.body.delivery).toEqual({
      attempted: true,
      accepted: true,
      recipient: "teammate@example.com",
      provider: "resend",
      messageId: "email-123",
      subject: "You're invited to join Acme Labs",
    });
    expect(db.persistedInvites).toHaveLength(1);
  });

  it("fails and does not persist the invite when email sending fails", async () => {
    const db = createDbStub();
    mockEmailService.sendCompanyInviteEmail.mockRejectedValueOnce(new Error("Resend down"));
    const app = createApp(
      {
        type: "board",
        userId: "user-1",
        companyIds: ["company-1"],
        source: "session",
        isInstanceAdmin: false,
      },
      db,
    );

    const res = await request(app)
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", inviteeEmail: "teammate@example.com" });

    expect(res.status).toBe(500);
    expect(db.persistedInvites).toHaveLength(0);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
