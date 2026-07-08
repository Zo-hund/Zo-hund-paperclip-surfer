import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { meetingsRouter } from "../routes/meetings.js";
import { errorHandler } from "../middleware/index.js";

const MEETING_ID = "11111111-1111-1111-1111-111111111111";
const ISSUE_ID = "22222222-2222-2222-2222-222222222222";
const COMPANY_ID = "company-1";

const {
  addOutcomeMock,
  processInteractionMock,
  getIssueByIdMock,
  addCommentMock,
  logActivityMock,
} = vi.hoisted(() => ({
  addOutcomeMock: vi.fn(),
  processInteractionMock: vi.fn(),
  getIssueByIdMock: vi.fn(),
  addCommentMock: vi.fn(),
  logActivityMock: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  recordingService: () => ({}),
  meetingAgentService: () => ({
    addOutcome: addOutcomeMock,
    processInteraction: processInteractionMock,
  }),
  issueService: () => ({
    getById: getIssueByIdMock,
    addComment: addCommentMock,
  }),
  pushNotificationService: () => ({}),
  accessService: () => ({}),
  logActivity: logActivityMock,
}));

vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn(),
}));

/** Minimal chainable drizzle-ish db: every select resolves to the meeting row. */
function createFakeDb() {
  const meetingRow = { companyId: COMPANY_ID, issueId: ISSUE_ID };
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [meetingRow],
  };
  return chain as never;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = {
      type: "board",
      userId: "local-board",
      source: "local_implicit",
    };
    next();
  });
  app.use("/api/meetings", meetingsRouter(createFakeDb()));
  app.use(errorHandler);
  return app;
}

describe("POST /api/meetings/:id/actions — add_outcome & add_issue_comment", () => {
  afterEach(() => {
    addOutcomeMock.mockReset();
    processInteractionMock.mockReset();
    getIssueByIdMock.mockReset();
    addCommentMock.mockReset();
    logActivityMock.mockReset();
  });

  it("add_outcome attaches an artifact outcome and logs activity", async () => {
    addOutcomeMock.mockResolvedValue({ id: "outcome-1", type: "artifact" });
    processInteractionMock.mockResolvedValue({ id: "t-1" });

    const content = JSON.stringify({ label: "Canvas", assetId: "a-1", contentPath: "/api/assets/a-1/content" });
    const res = await request(createApp())
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "add_outcome", params: { type: "artifact", content } });

    expect(res.status).toBe(200);
    expect(addOutcomeMock).toHaveBeenCalledWith(MEETING_ID, "artifact", content, "local-board");
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "meeting.outcome_added", entityId: MEETING_ID }),
    );
    expect(res.body.summary).toContain("canvas snapshot");
  });

  it("add_outcome rejects a missing type with 422", async () => {
    const res = await request(createApp())
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "add_outcome", params: { content: "x" } });

    expect(res.status).toBe(422);
    expect(addOutcomeMock).not.toHaveBeenCalled();
  });

  it("add_issue_comment defaults to the meeting's linked issue", async () => {
    getIssueByIdMock.mockResolvedValue({ id: ISSUE_ID, companyId: COMPANY_ID, identifier: "AMX-9" });
    addCommentMock.mockResolvedValue({ id: "c-1" });
    processInteractionMock.mockResolvedValue({ id: "t-2" });

    const res = await request(createApp())
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "add_issue_comment", params: { body: "Vision finding: dashboard renders wrong totals" } });

    expect(res.status).toBe(200);
    expect(getIssueByIdMock).toHaveBeenCalledWith(ISSUE_ID);
    expect(addCommentMock).toHaveBeenCalledWith(
      ISSUE_ID,
      "Vision finding: dashboard renders wrong totals",
      expect.objectContaining({ userId: "local-board" }),
    );
    expect(res.body.summary).toContain("AMX-9");
  });

  it("add_issue_comment 404s when the issue belongs to another company", async () => {
    getIssueByIdMock.mockResolvedValue({ id: ISSUE_ID, companyId: "other-co", identifier: "OTH-1" });

    const res = await request(createApp())
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "add_issue_comment", params: { body: "nope" } });

    expect(res.status).toBe(404);
    expect(addCommentMock).not.toHaveBeenCalled();
  });

  it("add_issue_comment rejects an empty body with 422", async () => {
    const res = await request(createApp())
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "add_issue_comment", params: {} });

    expect(res.status).toBe(422);
    expect(addCommentMock).not.toHaveBeenCalled();
  });
});
