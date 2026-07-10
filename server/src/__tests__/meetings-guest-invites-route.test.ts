import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meetingsRouter } from "../routes/meetings.js";
import { errorHandler } from "../middleware/index.js";

const MEETING_ID = "11111111-1111-1111-1111-111111111111";
const INVITE_ID = "22222222-2222-2222-2222-222222222222";
const COMPANY_ID = "company-1";

const {
  createInviteMock,
  listInvitesMock,
  revokeInviteMock,
  logActivityMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  createInviteMock: vi.fn(),
  listInvitesMock: vi.fn(),
  revokeInviteMock: vi.fn(),
  logActivityMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  recordingService: () => ({}),
  meetingAgentService: () => ({ getParticipants: vi.fn(), getOutcomes: vi.fn(), processInteraction: vi.fn() }),
  issueService: () => ({}),
  pushNotificationService: () => ({}),
  accessService: () => ({}),
  meetingGuestService: () => ({
    createInvite: createInviteMock,
    listInvites: listInvitesMock,
    revokeInvite: revokeInviteMock,
  }),
  googleCalendarService: () => ({ isLinked: vi.fn(), createEventForMeeting: vi.fn(), completeEventForMeeting: vi.fn() }),
  agentService: () => ({ getById: vi.fn() }),
  companyService: () => ({ update: vi.fn() }),
  logActivity: logActivityMock,
}));

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn(),
}));

vi.mock("../auth/email-service.js", () => ({
  sendEmail: sendEmailMock,
}));

/** Minimal chainable drizzle-ish db: every select resolves to the meeting row. */
function createFakeDb() {
  const meetingRow = { companyId: COMPANY_ID, issueId: null, title: "Client Kickoff" };
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [meetingRow],
  };
  return chain as never;
}

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api/meetings", meetingsRouter(createFakeDb()));
  app.use(errorHandler);
  return app;
}

const memberActor = {
  type: "board",
  source: "session",
  userId: "u1",
  companyIds: [COMPANY_ID],
  companyRoles: { [COMPANY_ID]: "member" },
};

const viewerActor = {
  type: "board",
  source: "session",
  userId: "u2",
  companyIds: [COMPANY_ID],
  companyRoles: { [COMPANY_ID]: "viewer" },
};

describe("meeting guest-invite CRUD routes", () => {
  afterEach(() => {
    createInviteMock.mockReset();
    listInvitesMock.mockReset();
    revokeInviteMock.mockReset();
    logActivityMock.mockReset();
    sendEmailMock.mockReset();
  });

  it("POST /:id/guest-invites creates an invite and returns the raw token once", async () => {
    createInviteMock.mockResolvedValue({
      invite: {
        id: INVITE_ID,
        meetingId: MEETING_ID,
        tokenHash: "should-never-be-returned",
        guestLabel: "Client link",
        createdByUserId: "u1",
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      },
      token: "raw-token-value",
    });

    const res = await request(createApp(memberActor))
      .post(`/api/meetings/${MEETING_ID}/guest-invites`)
      .send({ guestLabel: "Client link" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("raw-token-value");
    expect(res.body.tokenHash).toBeUndefined();
    expect(createInviteMock).toHaveBeenCalledWith(MEETING_ID, expect.objectContaining({ guestLabel: "Client link" }));
  });

  it("POST /:id/guest-invites rejects a non-member with 403", async () => {
    const res = await request(createApp(viewerActor))
      .post(`/api/meetings/${MEETING_ID}/guest-invites`)
      .send({});

    expect(res.status).toBe(403);
    expect(createInviteMock).not.toHaveBeenCalled();
  });

  it("POST /:id/guest-invites with guestEmail emails the link and reports emailSent", async () => {
    createInviteMock.mockResolvedValue({
      invite: {
        id: INVITE_ID,
        meetingId: MEETING_ID,
        tokenHash: "never-returned",
        guestLabel: "jane@acme.com",
        createdByUserId: "u1",
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      },
      token: "raw-token-value",
    });
    sendEmailMock.mockResolvedValue(true);

    const res = await request(createApp(memberActor))
      .post(`/api/meetings/${MEETING_ID}/guest-invites`)
      .send({ guestEmail: "jane@acme.com" });

    expect(res.status).toBe(200);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.token).toBe("raw-token-value");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArg = sendEmailMock.mock.calls[0][0];
    expect(emailArg.to).toBe("jane@acme.com");
    expect(emailArg.text).toContain("/guest/meeting/raw-token-value");
    // The email address doubles as the link's label when none was given.
    expect(createInviteMock).toHaveBeenCalledWith(MEETING_ID, expect.objectContaining({ guestLabel: "jane@acme.com" }));
  });

  it("POST /:id/guest-invites rejects a malformed guestEmail with 422", async () => {
    const res = await request(createApp(memberActor))
      .post(`/api/meetings/${MEETING_ID}/guest-invites`)
      .send({ guestEmail: "not-an-email" });

    expect(res.status).toBe(422);
    expect(createInviteMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("POST /:id/guest-invites still returns the link when email delivery fails", async () => {
    createInviteMock.mockResolvedValue({
      invite: {
        id: INVITE_ID,
        meetingId: MEETING_ID,
        tokenHash: "never-returned",
        guestLabel: "jane@acme.com",
        createdByUserId: "u1",
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      },
      token: "raw-token-value",
    });
    sendEmailMock.mockRejectedValue(new Error("resend down"));

    const res = await request(createApp(memberActor))
      .post(`/api/meetings/${MEETING_ID}/guest-invites`)
      .send({ guestEmail: "jane@acme.com" });

    expect(res.status).toBe(200);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.token).toBe("raw-token-value");
  });

  it("POST /:id/actions create_guest_invite creates and emails an invite for the voice agent", async () => {
    createInviteMock.mockResolvedValue({
      invite: {
        id: INVITE_ID,
        meetingId: MEETING_ID,
        tokenHash: "never-returned",
        guestLabel: "bob@client.com",
        createdByUserId: null,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      },
      token: "raw-token-value",
    });
    sendEmailMock.mockResolvedValue(true);

    const res = await request(createApp(memberActor))
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "create_guest_invite", params: { guestEmail: "bob@client.com" } });

    expect(res.status).toBe(200);
    expect(res.body.summary).toContain("bob@client.com");
    expect((res.body.result as { emailSent: boolean }).emailSent).toBe(true);
    expect((res.body.result as { url: string }).url).toContain("/guest/meeting/raw-token-value");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("POST /:id/actions create_guest_invite without email returns the link in the summary", async () => {
    createInviteMock.mockResolvedValue({
      invite: {
        id: INVITE_ID,
        meetingId: MEETING_ID,
        tokenHash: "never-returned",
        guestLabel: null,
        createdByUserId: null,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
      },
      token: "raw-token-value",
    });

    const res = await request(createApp(memberActor))
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "create_guest_invite", params: {} });

    expect(res.status).toBe(200);
    expect(res.body.summary).toContain("/guest/meeting/raw-token-value");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("GET /:id/guest-invites lists invites without tokenHash", async () => {
    listInvitesMock.mockResolvedValue([
      { id: INVITE_ID, meetingId: MEETING_ID, guestLabel: null, createdByUserId: "u1", expiresAt: new Date(), revokedAt: null, createdAt: new Date() },
    ]);

    const res = await request(createApp(memberActor)).get(`/api/meetings/${MEETING_ID}/guest-invites`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tokenHash).toBeUndefined();
  });

  it("GET /:id/guest-invites rejects a non-member with 403", async () => {
    const res = await request(createApp(viewerActor)).get(`/api/meetings/${MEETING_ID}/guest-invites`);
    expect(res.status).toBe(403);
    expect(listInvitesMock).not.toHaveBeenCalled();
  });

  it("DELETE /:id/guest-invites/:inviteId revokes an invite", async () => {
    revokeInviteMock.mockResolvedValue({
      id: INVITE_ID,
      meetingId: MEETING_ID,
      tokenHash: "x",
      guestLabel: null,
      createdByUserId: "u1",
      expiresAt: new Date(),
      revokedAt: new Date(),
      createdAt: new Date(),
    });

    const res = await request(createApp(memberActor)).delete(`/api/meetings/${MEETING_ID}/guest-invites/${INVITE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.tokenHash).toBeUndefined();
    expect(revokeInviteMock).toHaveBeenCalledWith(MEETING_ID, INVITE_ID);
  });

  it("DELETE /:id/guest-invites/:inviteId 404s when the invite doesn't exist", async () => {
    revokeInviteMock.mockResolvedValue(null);

    const res = await request(createApp(memberActor)).delete(`/api/meetings/${MEETING_ID}/guest-invites/${INVITE_ID}`);

    expect(res.status).toBe(404);
  });

  it("DELETE /:id/guest-invites/:inviteId rejects a non-member with 403", async () => {
    const res = await request(createApp(viewerActor)).delete(`/api/meetings/${MEETING_ID}/guest-invites/${INVITE_ID}`);
    expect(res.status).toBe(403);
    expect(revokeInviteMock).not.toHaveBeenCalled();
  });
});
