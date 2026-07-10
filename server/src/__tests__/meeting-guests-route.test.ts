import express from "express";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { meetingGuestRoutes } from "../routes/meeting-guests.js";
import { boardMutationGuard } from "../middleware/board-mutation-guard.js";
import { errorHandler } from "../middleware/index.js";

const MEETING_ID = "11111111-1111-1111-1111-111111111111";
const INVITE_ID = "22222222-2222-2222-2222-222222222222";
const COMPANY_ID = "company-1";

const {
  resolveInviteMock,
  joinAsGuestMock,
  logActivityMock,
  dispatchVoiceAgentMock,
} = vi.hoisted(() => ({
  resolveInviteMock: vi.fn(),
  joinAsGuestMock: vi.fn(),
  logActivityMock: vi.fn(),
  dispatchVoiceAgentMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/index.js", () => ({
  meetingGuestService: () => ({
    resolveInvite: resolveInviteMock,
    joinAsGuest: joinAsGuestMock,
  }),
  logActivity: logActivityMock,
}));

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn(),
}));

vi.mock("../routes/livekit.js", () => ({
  dispatchVoiceAgent: dispatchVoiceAgentMock,
}));

/** Minimal chainable drizzle-ish db: every select resolves to a fixed company row. */
function createFakeDb() {
  const companyRow = { name: "Acme Corp" };
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [companyRow],
  };
  return chain as never;
}

function createApp() {
  const app = express();
  app.use(express.json());
  // No actor middleware sets req.actor to a real board session — mirrors a
  // genuinely anonymous guest caller. boardMutationGuard still runs first,
  // exactly as it does in the real app, to prove it doesn't block this router.
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = { type: "none", source: "none" };
    next();
  });
  app.use(boardMutationGuard());
  app.use("/api", meetingGuestRoutes(createFakeDb()));
  app.use(errorHandler);
  return app;
}

const activeInvite = {
  meetingId: MEETING_ID,
  meetingTitle: "Board Sync",
  meetingStatus: "active",
  meetingType: "board_meet",
  podKey: "weekly-board",
  companyId: COMPANY_ID,
  invite: {
    id: INVITE_ID,
    meetingId: MEETING_ID,
    tokenHash: "hash",
    guestLabel: null,
    createdByUserId: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
  },
};

describe("GET /api/guest/meetings/:token", () => {
  beforeAll(() => {
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
  });

  afterEach(() => {
    resolveInviteMock.mockReset();
    joinAsGuestMock.mockReset();
    logActivityMock.mockReset();
    dispatchVoiceAgentMock.mockClear();
  });

  it("resolves a valid token to a lobby DTO with no internal data", async () => {
    resolveInviteMock.mockResolvedValue(activeInvite);

    const res = await request(createApp()).get("/api/guest/meetings/valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      meetingId: MEETING_ID,
      meetingTitle: "Board Sync",
      companyName: "Acme Corp",
      // Fake db rows carry no brandColor/logo assetId/host name — all
      // lobby-enrichment fields must degrade to null, never leak junk URLs.
      companyBrandColor: null,
      companyLogoUrl: null,
      hostName: null,
      meetingType: "board_meet",
      podKey: "weekly-board",
      meetingStatus: "active",
      expiresAt: activeInvite.invite.expiresAt.toISOString(),
    });
    // Never leaks issueId, participants, or outcomes.
    expect(res.body.issueId).toBeUndefined();
    expect(res.body.participants).toBeUndefined();
    expect(res.body.outcomes).toBeUndefined();
  });

  it("returns 404 (not 401/403) for an unknown/expired/revoked token", async () => {
    resolveInviteMock.mockResolvedValue(null);

    const res = await request(createApp()).get("/api/guest/meetings/garbage-token");

    expect(res.status).toBe(404);
  });

  it("is not blocked by boardMutationGuard for a type:none actor", async () => {
    resolveInviteMock.mockResolvedValue(activeInvite);
    const res = await request(createApp()).get("/api/guest/meetings/valid-token");
    expect(res.status).not.toBe(403);
  });

  it("rate limits repeated resolve requests from the same IP", async () => {
    resolveInviteMock.mockResolvedValue(activeInvite);
    const app = createApp();
    let lastStatus = 200;
    for (let i = 0; i < 35; i++) {
      const res = await request(app).get("/api/guest/meetings/valid-token");
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe("POST /api/guest/meetings/:token/join", () => {
  beforeAll(() => {
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";
    process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
  });

  afterEach(() => {
    resolveInviteMock.mockReset();
    joinAsGuestMock.mockReset();
    logActivityMock.mockReset();
    dispatchVoiceAgentMock.mockClear();
  });

  it("joins a guest, mints a non-board-user-prefixed identity, and inserts a participant row", async () => {
    resolveInviteMock.mockResolvedValue(activeInvite);
    joinAsGuestMock.mockResolvedValue({ id: "participant-1", meetingId: MEETING_ID, guestInviteId: INVITE_ID, guestName: "Jane" });

    const res = await request(createApp())
      .post("/api/guest/meetings/valid-token/join")
      .send({ guestName: "Jane" });

    expect(res.status).toBe(200);
    expect(res.body.identity).toMatch(/^guest-[0-9a-f]{12}$/);
    expect(res.body.identity.startsWith("board-user")).toBe(false);
    expect(res.body.roomName).toBe(`meeting-${MEETING_ID}`);
    expect(typeof res.body.token).toBe("string");
    expect(joinAsGuestMock).toHaveBeenCalledWith(MEETING_ID, INVITE_ID, "Jane");
    expect(dispatchVoiceAgentMock).toHaveBeenCalled();
  });

  it("rejects a missing guestName with 422", async () => {
    resolveInviteMock.mockResolvedValue(activeInvite);

    const res = await request(createApp())
      .post("/api/guest/meetings/valid-token/join")
      .send({});

    expect(res.status).toBe(422);
    expect(joinAsGuestMock).not.toHaveBeenCalled();
  });

  it("rejects joining a meeting that has ended", async () => {
    resolveInviteMock.mockResolvedValue({ ...activeInvite, meetingStatus: "completed" });

    const res = await request(createApp())
      .post("/api/guest/meetings/valid-token/join")
      .send({ guestName: "Jane" });

    expect(res.status).toBe(404);
    expect(joinAsGuestMock).not.toHaveBeenCalled();
  });

  it("returns 404 for an invalid/expired/revoked token", async () => {
    resolveInviteMock.mockResolvedValue(null);

    const res = await request(createApp())
      .post("/api/guest/meetings/garbage-token/join")
      .send({ guestName: "Jane" });

    expect(res.status).toBe(404);
    expect(joinAsGuestMock).not.toHaveBeenCalled();
  });

  it("rate limits repeated join requests from the same IP", async () => {
    resolveInviteMock.mockResolvedValue(activeInvite);
    joinAsGuestMock.mockResolvedValue({ id: "participant-1" });
    const app = createApp();
    let lastStatus = 200;
    for (let i = 0; i < 15; i++) {
      const res = await request(app).post("/api/guest/meetings/valid-token/join").send({ guestName: "Jane" });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
