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
  getAgentByIdMock,
  updateCompanyMock,
} = vi.hoisted(() => ({
  addOutcomeMock: vi.fn(),
  processInteractionMock: vi.fn(),
  getIssueByIdMock: vi.fn(),
  addCommentMock: vi.fn(),
  logActivityMock: vi.fn(),
  getAgentByIdMock: vi.fn(),
  updateCompanyMock: vi.fn(),
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
  meetingGuestService: () => ({ createInvite: vi.fn(), listInvites: vi.fn(), revokeInvite: vi.fn() }),
  googleCalendarService: () => ({ isLinked: vi.fn(), createEventForMeeting: vi.fn(), completeEventForMeeting: vi.fn() }),
  agentService: () => ({ getById: getAgentByIdMock }),
  companyService: () => ({ update: updateCompanyMock }),
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

const BOARD_ACTOR = { type: "board", userId: "local-board", source: "local_implicit" };
// A company-scoped agent actor. assertCompanyAccess keys off `companyId`
// (singular) for agents, and assertCompanyRole bypasses agents entirely — so
// this actor clears the endpoint's top-level gate, and the CEO restriction is
// enforced only by the update_company_branding branch itself.
const AGENT_ACTOR = {
  type: "agent",
  agentId: "agent-1",
  source: "api_key",
  companyId: COMPANY_ID,
};

function createApp(actor: Record<string, unknown> = BOARD_ACTOR) {
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

describe("POST /api/meetings/:id/actions — add_outcome & add_issue_comment", () => {
  afterEach(() => {
    addOutcomeMock.mockReset();
    processInteractionMock.mockReset();
    getIssueByIdMock.mockReset();
    addCommentMock.mockReset();
    logActivityMock.mockReset();
    getAgentByIdMock.mockReset();
    updateCompanyMock.mockReset();
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

describe("POST /api/meetings/:id/actions — update_company_branding", () => {
  afterEach(() => {
    processInteractionMock.mockReset();
    logActivityMock.mockReset();
    getAgentByIdMock.mockReset();
    updateCompanyMock.mockReset();
  });

  it("a board actor updates branding, logs company.branding_updated, and summarizes the change", async () => {
    updateCompanyMock.mockResolvedValue({ id: COMPANY_ID, name: "AMX Air Hubs", brandColor: "#1f3a5f" });
    processInteractionMock.mockResolvedValue({ id: "t-3" });

    const res = await request(createApp())
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "update_company_branding", params: { brandColor: "#1F3A5F" } });

    expect(res.status).toBe(200);
    expect(updateCompanyMock).toHaveBeenCalledWith(COMPANY_ID, { brandColor: "#1F3A5F" });
    expect(res.body.summary).toContain("brand color");
    expect(logActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "company.branding_updated", entityId: COMPANY_ID }),
    );
  });

  it("rejects a non-CEO agent with 403 without touching the company", async () => {
    getAgentByIdMock.mockResolvedValue({ id: "agent-1", role: "worker", companyId: COMPANY_ID });

    const res = await request(createApp(AGENT_ACTOR))
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "update_company_branding", params: { name: "Renamed Co" } });

    expect(res.status).toBe(403);
    expect(updateCompanyMock).not.toHaveBeenCalled();
  });

  it("allows a CEO agent of the same company", async () => {
    getAgentByIdMock.mockResolvedValue({ id: "agent-1", role: "ceo", companyId: COMPANY_ID });
    updateCompanyMock.mockResolvedValue({ id: COMPANY_ID, name: "Renamed Co" });
    processInteractionMock.mockResolvedValue({ id: "t-4" });

    const res = await request(createApp(AGENT_ACTOR))
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "update_company_branding", params: { name: "Renamed Co" } });

    expect(res.status).toBe(200);
    expect(updateCompanyMock).toHaveBeenCalledWith(COMPANY_ID, { name: "Renamed Co" });
  });

  it("rejects a CEO agent of a DIFFERENT company with 403", async () => {
    getAgentByIdMock.mockResolvedValue({ id: "agent-1", role: "ceo", companyId: "other-co" });

    const res = await request(createApp(AGENT_ACTOR))
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "update_company_branding", params: { name: "Renamed Co" } });

    expect(res.status).toBe(403);
    expect(updateCompanyMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid brand color (non-hex) with 422", async () => {
    const res = await request(createApp())
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "update_company_branding", params: { brandColor: "navy blue" } });

    expect(res.status).toBe(422);
    expect(updateCompanyMock).not.toHaveBeenCalled();
  });

  it("rejects an empty params payload with 422", async () => {
    const res = await request(createApp())
      .post(`/api/meetings/${MEETING_ID}/actions`)
      .send({ action: "update_company_branding", params: {} });

    expect(res.status).toBe(422);
    expect(updateCompanyMock).not.toHaveBeenCalled();
  });
});
