import express from "express";
import request from "supertest";
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalRoutes } from "../routes/approvals.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// approvalRoutes talks to approvalService/heartbeatService/issueApprovalService/
// secretService for the generic CRUD paths — mocked wholesale the same way
// approval-routes-idempotency.test.ts does it, so these tests only exercise
// the NEW promote_to_live logic (eligibility guard + approve-time side
// effect), which reads/writes the fake db directly rather than through a
// service.
const mockApprovalService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  requestRevision: vi.fn(),
  resubmit: vi.fn(),
  listComments: vi.fn(),
  addComment: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  listIssuesForApproval: vi.fn(),
  linkManyForApproval: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  normalizeHireApprovalPayloadForPersistence: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockRecordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  approvalService: () => mockApprovalService,
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => mockIssueApprovalService,
  logActivity: mockLogActivity,
  secretService: () => mockSecretService,
}));

vi.mock("../services/amxChainService.js", () => ({
  amxChainService: () => ({ recordSecurityEvent: mockRecordSecurityEvent }),
}));

/** Fake db serving the two direct-db paths this feature adds: the
 * eligibility-check SELECT in POST /companies/:companyId/approvals, and the
 * promotion UPDATE in the approve handler's promote_to_live branch. Select
 * results are queue-driven (same convention as marketplace-moderation.test.ts
 * / chain-tracking.test.ts); updates are captured by table name + values. */
function createFakeDb(selectQueue: unknown[][] = [], returningQueue: unknown[][] = []) {
  const queue = [...selectQueue];
  const retQueue = [...returningQueue];
  const state = {
    updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(queue.shift() ?? []),
      }),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          state.updates.push({ table: getTableName(table), values });
          return {
            then: (resolve: (v: unknown) => unknown) => resolve(undefined),
            returning: () => Promise.resolve(retQueue.shift() ?? []),
          };
        },
      }),
    }),
  };
  return { db: db as never, state };
}

const boardActor = {
  type: "board",
  source: "session",
  userId: "board-1",
  companyIds: [COMPANY],
  companyRoles: { [COMPANY]: "admin" },
};

const agentActor = {
  type: "agent",
  agentId: "agent-1",
  companyId: COMPANY,
};

function createApp(actor: Record<string, unknown>, selectQueue: unknown[][] = [], returningQueue: unknown[][] = []) {
  const { db, state } = createFakeDb(selectQueue, returningQueue);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", approvalRoutes(db));
  app.use(errorHandler);
  return { app, state };
}

const RQ_SUBMISSION_ELIGIBLE = {
  id: "rq-1",
  companyId: COMPANY,
  isSimulation: true,
  simulationStatus: "completed",
};

const BOOKING_ELIGIBLE = {
  id: "booking-1",
  companyId: COMPANY,
  phase: "simulation",
  status: "completed",
};

describe("POST /companies/:companyId/approvals — promote_to_live eligibility guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockIssueApprovalService.linkManyForApproval.mockResolvedValue(undefined);
  });

  it("422s when the RQ submission isn't in a completed simulation state", async () => {
    const { app } = createApp(boardActor, [
      [{ ...RQ_SUBMISSION_ELIGIBLE, simulationStatus: "running" }],
    ]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "promote_to_live", payload: { entityType: "rq_submission", entityId: "rq-1" } });

    expect(res.status).toBe(422);
    expect(mockApprovalService.create).not.toHaveBeenCalled();
  });

  it("422s when the marketplace booking isn't in a completed simulation state", async () => {
    const { app } = createApp(boardActor, [
      [{ ...BOOKING_ELIGIBLE, status: "active" }],
    ]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "promote_to_live", payload: { entityType: "marketplace_booking", entityId: "booking-1" } });

    expect(res.status).toBe(422);
    expect(mockApprovalService.create).not.toHaveBeenCalled();
  });

  it("404s when the entity doesn't exist / isn't in this company", async () => {
    const { app } = createApp(boardActor, [[]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "promote_to_live", payload: { entityType: "rq_submission", entityId: "ghost" } });

    expect(res.status).toBe(404);
    expect(mockApprovalService.create).not.toHaveBeenCalled();
  });

  it("succeeds (201) when the RQ submission is sim-eligible", async () => {
    mockApprovalService.create.mockResolvedValue({
      id: "approval-1",
      companyId: COMPANY,
      type: "promote_to_live",
      status: "pending",
      payload: { entityType: "rq_submission", entityId: "rq-1" },
    });
    const { app } = createApp(boardActor, [[RQ_SUBMISSION_ELIGIBLE]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "promote_to_live", payload: { entityType: "rq_submission", entityId: "rq-1" } });

    expect(res.status).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledTimes(1);
    expect(mockApprovalService.create.mock.calls[0]![1]).toMatchObject({
      type: "promote_to_live",
      payload: { entityType: "rq_submission", entityId: "rq-1" },
    });
  });

  it("succeeds (201) when the marketplace booking is sim-eligible", async () => {
    mockApprovalService.create.mockResolvedValue({
      id: "approval-2",
      companyId: COMPANY,
      type: "promote_to_live",
      status: "pending",
      payload: { entityType: "marketplace_booking", entityId: "booking-1" },
    });
    const { app } = createApp(boardActor, [[BOOKING_ELIGIBLE]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "promote_to_live", payload: { entityType: "marketplace_booking", entityId: "booking-1" } });

    expect(res.status).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledTimes(1);
  });
});

describe("POST /approvals/:id/approve — promote_to_live side effect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockIssueApprovalService.listIssuesForApproval.mockResolvedValue([]);
    mockRecordSecurityEvent.mockResolvedValue({});
  });

  it("flips isSimulation/lifecycleStage/simulationStatus for an rq_submission", async () => {
    mockApprovalService.approve.mockResolvedValue({
      approval: {
        id: "approval-1",
        companyId: COMPANY,
        type: "promote_to_live",
        status: "approved",
        payload: { entityType: "rq_submission", entityId: "rq-1" },
        requestedByAgentId: null,
      },
      applied: true,
    });

    const { app, state } = createApp(boardActor);
    const res = await request(app).post("/api/approvals/approval-1/approve").send({});

    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      table: "rq_submissions",
      values: {
        isSimulation: false,
        lifecycleStage: "live",
        simulationStatus: "certified",
      },
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "approval.promoted_to_live" }),
    );
    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      COMPANY,
      "user",
      "board-1",
      "MARKET_PROMOTION",
      expect.objectContaining({ entityType: "rq_submission", entityId: "rq-1" }),
    );
  });

  it("flips phase to 'live' for a marketplace_booking and publishes its listing to the catalog", async () => {
    mockApprovalService.approve.mockResolvedValue({
      approval: {
        id: "approval-2",
        companyId: COMPANY,
        type: "promote_to_live",
        status: "approved",
        payload: { entityType: "marketplace_booking", entityId: "booking-1" },
        requestedByAgentId: null,
      },
      applied: true,
    });

    const { app, state } = createApp(boardActor, [], [[{ id: "booking-1", listingId: "listing-1" }]]);
    const res = await request(app).post("/api/approvals/approval-2/approve").send({});

    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(2);
    expect(state.updates[0]).toMatchObject({
      table: "lms_marketplace_bookings",
      values: { phase: "live" },
    });
    expect(state.updates[1]).toMatchObject({
      table: "lms_marketplace_listings",
      values: { isPublic: true },
    });
  });

  it("does not touch the listing when the promoted booking has no listingId on the returned row", async () => {
    mockApprovalService.approve.mockResolvedValue({
      approval: {
        id: "approval-2",
        companyId: COMPANY,
        type: "promote_to_live",
        status: "approved",
        payload: { entityType: "marketplace_booking", entityId: "booking-1" },
        requestedByAgentId: null,
      },
      applied: true,
    });

    const { app, state } = createApp(boardActor, [], [[{ id: "booking-1", listingId: null }]]);
    const res = await request(app).post("/api/approvals/approval-2/approve").send({});

    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
  });

  it("rejecting a promote_to_live approval does NOT flip anything", async () => {
    mockApprovalService.reject.mockResolvedValue({
      approval: {
        id: "approval-3",
        companyId: COMPANY,
        type: "promote_to_live",
        status: "rejected",
        payload: { entityType: "rq_submission", entityId: "rq-1" },
        requestedByAgentId: null,
      },
      applied: true,
    });

    const { app, state } = createApp(boardActor);
    const res = await request(app).post("/api/approvals/approval-3/reject").send({});

    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(0);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "approval.rejected" }),
    );
  });

  it("rejects a non-board actor attempting to approve (403) — regression on assertBoard", async () => {
    const { app, state } = createApp(agentActor);
    const res = await request(app).post("/api/approvals/approval-1/approve").send({});

    expect(res.status).toBe(403);
    expect(mockApprovalService.approve).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });
});
