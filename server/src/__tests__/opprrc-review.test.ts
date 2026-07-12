import express from "express";
import request from "supertest";
import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalRoutes } from "../routes/approvals.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// approvalRoutes talks to approvalService/heartbeatService/issueApprovalService/
// secretService for the generic CRUD paths — mocked wholesale the same way
// promote-to-live.test.ts does it, so these tests only exercise the NEW
// opprrc_delivery_review logic (eligibility guard on create, and the
// approve/reject/request-revision side effects), which reads/writes the
// fake db directly rather than through a service.
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
 * opprrc_deliveries.reviewStatus UPDATE in the create/approve/reject/
 * request-revision handlers. Select results are queue-driven (same
 * convention as promote-to-live.test.ts / chain-tracking.test.ts); updates
 * are captured by table name + values. */
function createFakeDb(selectQueue: unknown[][] = []) {
  const queue = [...selectQueue];
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
            returning: () => Promise.resolve([]),
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

function createApp(actor: Record<string, unknown>, selectQueue: unknown[][] = []) {
  const { db, state } = createFakeDb(selectQueue);
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

const DELIVERY_ID = "11111111-1111-4111-8111-111111111111";

const NOT_SUBMITTED_DELIVERY = {
  id: DELIVERY_ID,
  companyId: COMPANY,
  reviewStatus: "not_submitted",
};

const REVISION_REQUESTED_DELIVERY = {
  ...NOT_SUBMITTED_DELIVERY,
  reviewStatus: "revision_requested",
};

const PENDING_DELIVERY = {
  ...NOT_SUBMITTED_DELIVERY,
  reviewStatus: "pending_review",
};

const APPROVED_DELIVERY = {
  ...NOT_SUBMITTED_DELIVERY,
  reviewStatus: "approved",
};

describe("POST /companies/:companyId/approvals — opprrc_delivery_review eligibility guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockIssueApprovalService.linkManyForApproval.mockResolvedValue(undefined);
  });

  it("422s when the delivery is already pending_review", async () => {
    const { app, state } = createApp(boardActor, [[PENDING_DELIVERY]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "opprrc_delivery_review", payload: { deliveryId: DELIVERY_ID } });

    expect(res.status).toBe(422);
    expect(mockApprovalService.create).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("422s when the delivery is already approved", async () => {
    const { app, state } = createApp(boardActor, [[APPROVED_DELIVERY]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "opprrc_delivery_review", payload: { deliveryId: DELIVERY_ID } });

    expect(res.status).toBe(422);
    expect(mockApprovalService.create).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("404s when the delivery doesn't exist / isn't in this company", async () => {
    const { app, state } = createApp(boardActor, [[]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "opprrc_delivery_review", payload: { deliveryId: "ghost" } });

    expect(res.status).toBe(404);
    expect(mockApprovalService.create).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("succeeds (201) and sets reviewStatus=pending_review when the delivery is not_submitted", async () => {
    mockApprovalService.create.mockResolvedValue({
      id: "approval-1",
      companyId: COMPANY,
      type: "opprrc_delivery_review",
      status: "pending",
      payload: { deliveryId: DELIVERY_ID },
    });
    const { app, state } = createApp(boardActor, [[NOT_SUBMITTED_DELIVERY]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "opprrc_delivery_review", payload: { deliveryId: DELIVERY_ID } });

    expect(res.status).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledTimes(1);
    expect(mockApprovalService.create.mock.calls[0]![1]).toMatchObject({
      type: "opprrc_delivery_review",
      payload: { deliveryId: DELIVERY_ID },
    });
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      table: "opprrc_deliveries",
      values: { reviewStatus: "pending_review" },
    });
  });

  it("succeeds (201) when the delivery is revision_requested (re-submission)", async () => {
    mockApprovalService.create.mockResolvedValue({
      id: "approval-2",
      companyId: COMPANY,
      type: "opprrc_delivery_review",
      status: "pending",
      payload: { deliveryId: DELIVERY_ID },
    });
    const { app, state } = createApp(boardActor, [[REVISION_REQUESTED_DELIVERY]]);
    const res = await request(app)
      .post(`/api/companies/${COMPANY}/approvals`)
      .send({ type: "opprrc_delivery_review", payload: { deliveryId: DELIVERY_ID } });

    expect(res.status).toBe(201);
    expect(mockApprovalService.create).toHaveBeenCalledTimes(1);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      table: "opprrc_deliveries",
      values: { reviewStatus: "pending_review" },
    });
  });
});

describe("POST /approvals/:id/approve — opprrc_delivery_review side effect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockIssueApprovalService.listIssuesForApproval.mockResolvedValue([]);
    mockRecordSecurityEvent.mockResolvedValue({});
  });

  it("sets reviewStatus=approved, logs activity, and records a chain event", async () => {
    mockApprovalService.approve.mockResolvedValue({
      approval: {
        id: "approval-1",
        companyId: COMPANY,
        type: "opprrc_delivery_review",
        status: "approved",
        payload: { deliveryId: DELIVERY_ID },
        requestedByAgentId: null,
      },
      applied: true,
    });

    const { app, state } = createApp(boardActor);
    const res = await request(app).post("/api/approvals/approval-1/approve").send({});

    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      table: "opprrc_deliveries",
      values: { reviewStatus: "approved" },
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "approval.opprrc_delivery_approved" }),
    );
    expect(mockRecordSecurityEvent).toHaveBeenCalledWith(
      COMPANY,
      "user",
      "board-1",
      "OPPRRC_DELIVERY_APPROVED",
      expect.objectContaining({ deliveryId: DELIVERY_ID }),
    );
  });

  it("does not touch the delivery when the approval was already resolved (applied=false)", async () => {
    mockApprovalService.approve.mockResolvedValue({
      approval: {
        id: "approval-1",
        companyId: COMPANY,
        type: "opprrc_delivery_review",
        status: "approved",
        payload: { deliveryId: DELIVERY_ID },
        requestedByAgentId: null,
      },
      applied: false,
    });

    const { app, state } = createApp(boardActor);
    const res = await request(app).post("/api/approvals/approval-1/approve").send({});

    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(0);
  });
});

describe("POST /approvals/:id/reject — opprrc_delivery_review side effect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("sets reviewStatus=rejected and logs activity", async () => {
    mockApprovalService.reject.mockResolvedValue({
      approval: {
        id: "approval-3",
        companyId: COMPANY,
        type: "opprrc_delivery_review",
        status: "rejected",
        payload: { deliveryId: DELIVERY_ID },
        requestedByAgentId: null,
      },
      applied: true,
    });

    const { app, state } = createApp(boardActor);
    const res = await request(app).post("/api/approvals/approval-3/reject").send({});

    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      table: "opprrc_deliveries",
      values: { reviewStatus: "rejected" },
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "approval.opprrc_delivery_rejected" }),
    );
  });
});

describe("POST /approvals/:id/request-revision — opprrc_delivery_review side effect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("sets reviewStatus=revision_requested and logs activity", async () => {
    mockApprovalService.requestRevision.mockResolvedValue({
      id: "approval-4",
      companyId: COMPANY,
      type: "opprrc_delivery_review",
      status: "revision_requested",
      payload: { deliveryId: DELIVERY_ID },
      requestedByAgentId: null,
    });

    const { app, state } = createApp(boardActor);
    const res = await request(app).post("/api/approvals/approval-4/request-revision").send({});

    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      table: "opprrc_deliveries",
      values: { reviewStatus: "revision_requested" },
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "approval.opprrc_delivery_revision_requested" }),
    );
  });
});
