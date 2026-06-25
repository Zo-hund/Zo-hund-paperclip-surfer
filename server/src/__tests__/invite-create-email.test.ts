import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRoutes } from "../routes/access.js";
import { errorHandler } from "../middleware/index.js";

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  isInstanceAdmin: vi.fn(),
  ensureMembership: vi.fn(),
  setPrincipalGrants: vi.fn(),
}));
const mockAgentService = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), getById: vi.fn() }));
const mockBoardAuthService = vi.hoisted(() => ({ resolveBoardAccess: vi.fn() }));
const mockCompanyService = vi.hoisted(() => ({ getById: vi.fn() }));
const mockLogActivity = vi.hoisted(() => vi.fn());

const mockSendEmail = vi.hoisted(() => vi.fn());
const mockIsEmailConfigured = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  boardAuthService: () => mockBoardAuthService,
  companyService: () => mockCompanyService,
  deduplicateAgentName: (name: string) => name,
  logActivity: mockLogActivity,
  notifyHireApproved: vi.fn(),
}));

vi.mock("../auth/email-service.js", () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  isEmailConfigured: (...args: any[]) => mockIsEmailConfigured(...args),
}));

function createDbStub() {
  // createCompanyInviteForCompany does: db.insert(invites).values({...}).returning().then(rows => rows[0])
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: "invite-1",
          companyId: "company-1",
          inviteType: "company_join",
          allowedJoinTypes: "both",
          defaultsPayload: { inviteEmail: "charles@h3atsolutions.com", membershipRole: "owner" },
          expiresAt: new Date(Date.now() + 1000000),
          invitedByUserId: "user-1",
          tokenHash: "hash",
          revokedAt: null,
          acceptedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    }),
  });
  return { insert };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { type: "board", userId: "user-1", companyIds: ["company-1"], companyRoles: { "company-1": "owner" }, source: "session" };
    next();
  });
  app.use("/api", accessRoutes(createDbStub() as any, {
    deploymentMode: "authenticated",
    deploymentExposure: "private",
    bindHost: "127.0.0.1",
    allowedHostnames: [],
  }));
  app.use(errorHandler);
  return app;
}

describe("POST /companies/:companyId/invites — onboarding email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessService.canUser.mockResolvedValue(true);
    mockLogActivity.mockResolvedValue(undefined);
    mockCompanyService.getById.mockResolvedValue({ id: "company-1", name: "H3AT Consulting & Development" });
    process.env.PAPERCLIP_PUBLIC_URL = "https://amx-air-hubs.cc";
  });

  it("sends an onboarding email and reports emailSent:true when delivery succeeds", async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockResolvedValue(true);

    const res = await request(createApp())
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", inviteEmail: "charles@h3atsolutions.com", membershipRole: "owner" });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.emailConfigured).toBe(true);
    expect(res.body.invitedEmail).toBe("charles@h3atsolutions.com");
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.to).toBe("charles@h3atsolutions.com");
    expect(emailArg.subject).toContain("H3AT Consulting & Development");
    // Absolute invite URL built from PAPERCLIP_PUBLIC_URL
    expect(emailArg.text).toContain("https://amx-air-hubs.cc/invite/");
  });

  it("reports emailSent:false and emailConfigured:false when no transport is set", async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    mockSendEmail.mockResolvedValue(false);

    const res = await request(createApp())
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", inviteEmail: "charles@h3atsolutions.com", membershipRole: "owner" });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.emailConfigured).toBe(false);
  });

  it("does not send any email when inviteEmail is omitted", async () => {
    mockIsEmailConfigured.mockReturnValue(true);

    const res = await request(createApp())
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human" });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("still returns 201 with emailSent:false if the email transport throws", async () => {
    mockIsEmailConfigured.mockReturnValue(true);
    mockSendEmail.mockRejectedValue(new Error("Resend 500"));

    const res = await request(createApp())
      .post("/api/companies/company-1/invites")
      .send({ allowedJoinTypes: "human", inviteEmail: "charles@h3atsolutions.com" });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
  });
});
