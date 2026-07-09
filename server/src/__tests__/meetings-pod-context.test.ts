import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meetingsRouter } from "../routes/meetings.js";
import { errorHandler } from "../middleware/index.js";

const MEETING_ID = "11111111-1111-1111-1111-111111111111";
const ISSUE_ID = "22222222-2222-2222-2222-222222222222";
const COMPANY_ID = "company-1";

const { getIssueByIdMock, logActivityMock } = vi.hoisted(() => ({
  getIssueByIdMock: vi.fn(),
  logActivityMock: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  recordingService: () => ({}),
  meetingAgentService: () => ({ processInteraction: vi.fn().mockResolvedValue({ id: "t-1" }) }),
  issueService: () => ({ getById: getIssueByIdMock }),
  pushNotificationService: () => ({ notifyCompany: vi.fn().mockResolvedValue(undefined) }),
  accessService: () => ({}),
  meetingGuestService: () => ({}),
  googleCalendarService: () => ({ isLinked: vi.fn().mockResolvedValue(false), createEventForMeeting: vi.fn(), completeEventForMeeting: vi.fn() }),
  logActivity: logActivityMock,
}));

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn(),
}));

/** Fake db supporting a queued sequence of select results (for the two distinct
 * lookups POST / makes: the prior-pod-meeting query, then none for insert),
 * plus insert/update capture. */
function createFakeDb(opts: { selectQueue?: unknown[][]; meetingRow?: Record<string, unknown> } = {}) {
  const selectQueue = [...(opts.selectQueue ?? [])];
  const updateSetMock = vi.fn();
  const insertValuesMock = vi.fn();
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => (opts.meetingRow ? [opts.meetingRow] : (selectQueue.shift() ?? [])),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertValuesMock(values);
        return { returning: async () => [{ id: "new-meeting-id", companyId: COMPANY_ID, title: "Test", createdAt: new Date(), ...values }] };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateSetMock(values);
        return { where: async () => {} };
      },
    }),
  };
  return { db: chain as never, updateSetMock, insertValuesMock };
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

describe("POST /api/meetings — podKey carries forward lastActiveContext", () => {
  it("copies the prior pod meeting's lastActiveContext onto the new meeting", async () => {
    const { db, insertValuesMock } = createFakeDb({
      selectQueue: [[{ lastActiveContext: { issueId: ISSUE_ID } }]],
    });

    const res = await request(createApp(db))
      .post("/api/meetings")
      .send({ companyId: COMPANY_ID, title: "Weekly Standup", podKey: "weekly-standup" });

    expect(res.status).toBe(200);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ podKey: "weekly-standup", lastActiveContext: { issueId: ISSUE_ID } }),
    );
  });

  it("inserts with null lastActiveContext when no prior pod meeting exists", async () => {
    const { db, insertValuesMock } = createFakeDb({ selectQueue: [[]] });

    const res = await request(createApp(db))
      .post("/api/meetings")
      .send({ companyId: COMPANY_ID, title: "New Pod", podKey: "brand-new-pod" });

    expect(res.status).toBe(200);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ podKey: "brand-new-pod", lastActiveContext: null }),
    );
  });
});

describe("POST /api/meetings/:id/actions — set_active_context", () => {
  afterEach(() => {
    getIssueByIdMock.mockReset();
    logActivityMock.mockReset();
  });

  it("updates lastActiveContext and logs meeting.context_updated", async () => {
    getIssueByIdMock.mockResolvedValue({ id: ISSUE_ID, companyId: COMPANY_ID, identifier: "AMX-9" });
    const { db, updateSetMock } = createFakeDb({ meetingRow: { companyId: COMPANY_ID, issueId: null } });

    const res = await request(createApp(db))
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "set_active_context", params: { issueId: ISSUE_ID } });

    expect(res.status).toBe(200);
    expect(updateSetMock).toHaveBeenCalledWith(expect.objectContaining({ lastActiveContext: { issueId: ISSUE_ID } }));
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "meeting.context_updated", entityId: MEETING_ID }),
    );
    expect(res.body.summary).toContain("AMX-9");
  });

  it("rejects a missing issueId with 422", async () => {
    const { db } = createFakeDb({ meetingRow: { companyId: COMPANY_ID, issueId: null } });

    const res = await request(createApp(db))
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "set_active_context", params: {} });

    expect(res.status).toBe(422);
    expect(getIssueByIdMock).not.toHaveBeenCalled();
  });

  it("404s when the issue belongs to another company", async () => {
    getIssueByIdMock.mockResolvedValue({ id: ISSUE_ID, companyId: "other-co", identifier: "OTH-1" });
    const { db } = createFakeDb({ meetingRow: { companyId: COMPANY_ID, issueId: null } });

    const res = await request(createApp(db))
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "set_active_context", params: { issueId: ISSUE_ID } });

    expect(res.status).toBe(404);
  });
});
