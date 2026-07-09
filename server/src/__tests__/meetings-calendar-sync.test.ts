import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meetingsRouter } from "../routes/meetings.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY_ID = "company-1";

const { isLinkedMock, createEventForMeetingMock } = vi.hoisted(() => ({
  isLinkedMock: vi.fn(),
  createEventForMeetingMock: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  recordingService: () => ({}),
  meetingAgentService: () => ({}),
  issueService: () => ({ getById: vi.fn() }),
  pushNotificationService: () => ({ notifyCompany: vi.fn().mockResolvedValue(undefined) }),
  accessService: () => ({}),
  meetingGuestService: () => ({}),
  googleCalendarService: () => ({ isLinked: isLinkedMock, createEventForMeeting: createEventForMeetingMock, completeEventForMeeting: vi.fn() }),
  logActivity: vi.fn(),
}));

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn(),
}));

/** Fake db: insert().returning() yields a fixed meeting row; captures update().set() args. */
function createFakeDb() {
  const updateSetMock = vi.fn();
  const insertedRow = { id: "new-meeting-id", companyId: COMPANY_ID, title: "Test Meeting", createdAt: new Date() };
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => [],
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => [{ ...insertedRow, ...values }],
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateSetMock(values);
        return { where: async () => {} };
      },
    }),
  };
  return { db: chain as never, updateSetMock };
}

function createApp(db: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = { type: "board", userId: "u1", source: "session", companyIds: [COMPANY_ID], companyRoles: { [COMPANY_ID]: "member" } };
    next();
  });
  app.use("/api/meetings", meetingsRouter(db as never));
  app.use(errorHandler);
  return app;
}

describe("POST /api/meetings — calendar sync", () => {
  afterEach(() => {
    isLinkedMock.mockReset();
    createEventForMeetingMock.mockReset();
  });

  it("creates a calendar event and persists the returned id when the company is linked", async () => {
    isLinkedMock.mockResolvedValue(true);
    createEventForMeetingMock.mockResolvedValue("gcal-event-1");
    const { db, updateSetMock } = createFakeDb();

    const res = await request(createApp(db))
      .post("/api/meetings")
      .send({ companyId: COMPANY_ID, title: "Test Meeting" });

    expect(res.status).toBe(200);
    expect(createEventForMeetingMock).toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalledWith({ calendarProvider: "google", calendarEventId: "gcal-event-1" });
    expect(res.body.calendarSyncWarning).toBeUndefined();
  });

  it("does not warn when the company hasn't linked Google Calendar", async () => {
    isLinkedMock.mockResolvedValue(false);
    const { db } = createFakeDb();

    const res = await request(createApp(db))
      .post("/api/meetings")
      .send({ companyId: COMPANY_ID, title: "Test Meeting" });

    expect(res.status).toBe(200);
    expect(createEventForMeetingMock).not.toHaveBeenCalled();
    expect(res.body.calendarSyncWarning).toBeUndefined();
  });

  it("surfaces a calendarSyncWarning without failing the request when linked but the API call fails", async () => {
    isLinkedMock.mockResolvedValue(true);
    createEventForMeetingMock.mockResolvedValue(null);
    const { db } = createFakeDb();

    const res = await request(createApp(db))
      .post("/api/meetings")
      .send({ companyId: COMPANY_ID, title: "Test Meeting" });

    expect(res.status).toBe(200);
    expect(res.body.calendarSyncWarning).toBeTruthy();
  });

  it("surfaces a calendarSyncWarning when the calendar service throws", async () => {
    isLinkedMock.mockResolvedValue(true);
    createEventForMeetingMock.mockRejectedValue(new Error("network error"));
    const { db } = createFakeDb();

    const res = await request(createApp(db))
      .post("/api/meetings")
      .send({ companyId: COMPANY_ID, title: "Test Meeting" });

    expect(res.status).toBe(200);
    expect(res.body.calendarSyncWarning).toBeTruthy();
  });
});
