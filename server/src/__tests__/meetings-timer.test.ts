import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meetingsRouter } from "../routes/meetings.js";
import { errorHandler } from "../middleware/index.js";

const MEETING_ID = "11111111-1111-1111-1111-111111111111";
const COMPANY_ID = "company-1";

const { logOutcomesToMemoryMock, completeEventForMeetingMock } = vi.hoisted(() => ({
  logOutcomesToMemoryMock: vi.fn().mockResolvedValue(undefined),
  completeEventForMeetingMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/index.js", () => ({
  recordingService: () => ({}),
  meetingAgentService: () => ({ logOutcomesToMemory: logOutcomesToMemoryMock }),
  issueService: () => ({}),
  pushNotificationService: () => ({}),
  accessService: () => ({}),
  meetingGuestService: () => ({}),
  googleCalendarService: () => ({ completeEventForMeeting: completeEventForMeetingMock, createEventForMeeting: vi.fn(), isLinked: vi.fn() }),
  agentService: () => ({ getById: vi.fn() }),
  companyService: () => ({ update: vi.fn() }),
  logActivity: vi.fn(),
}));

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn(),
}));

/** Chainable fake db: one select returns the meeting row; captures update().set() args. */
function createFakeDb(meetingRow: Record<string, unknown>) {
  const updateSetMock = vi.fn();
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [meetingRow],
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

describe("POST /api/meetings/:id/recording — timer finalize", () => {
  afterEach(() => {
    logOutcomesToMemoryMock.mockClear();
    completeEventForMeetingMock.mockClear();
  });

  it("sets endedAt and a correctly computed durationSeconds", async () => {
    const createdAt = new Date(Date.now() - 90_000); // 90s ago
    const { db, updateSetMock } = createFakeDb({ id: MEETING_ID, companyId: COMPANY_ID, createdAt, calendarEventId: null });

    const res = await request(createApp(db)).post(`/api/meetings/${MEETING_ID}/recording`);

    expect(res.status).toBe(200);
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const setArgs = updateSetMock.mock.calls[0][0] as { status: string; endedAt: Date; durationSeconds: number };
    expect(setArgs.status).toBe("completed");
    expect(setArgs.endedAt).toBeInstanceOf(Date);
    expect(setArgs.durationSeconds).toBeGreaterThanOrEqual(89);
    expect(setArgs.durationSeconds).toBeLessThanOrEqual(91);
    expect(completeEventForMeetingMock).not.toHaveBeenCalled();
  });

  it("completes the calendar event only when the meeting has a calendarEventId", async () => {
    const createdAt = new Date(Date.now() - 60_000);
    const { db } = createFakeDb({ id: MEETING_ID, companyId: COMPANY_ID, createdAt, calendarEventId: "gcal-event-1" });

    const res = await request(createApp(db)).post(`/api/meetings/${MEETING_ID}/recording`);

    expect(res.status).toBe(200);
    expect(completeEventForMeetingMock).toHaveBeenCalledWith(COMPANY_ID, "gcal-event-1", expect.any(Date));
  });
});
