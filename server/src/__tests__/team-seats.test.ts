import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accessRoutes } from "../routes/access.js";
import { errorHandler } from "../middleware/index.js";
import { getPurchasedSeats, getUsedSeats } from "../services/stripeProvisioningService.js";

const COMPANY = "company-1";

// stripeProvisioningService's getPurchasedSeats/getUsedSeats are wrapped as
// pass-through mocks (default implementation = the REAL function) so:
//  - the accounting unit tests below can exercise the real aggregation logic
//    against a fake db, and
//  - the route-level seat-gate tests further down can override them with
//    `vi.mocked(...).mockResolvedValue(...)` to control purchased/used
//    without needing a fully-wired fake db for stripeSubscriptions +
//    company_memberships inside the access.ts route handlers.
vi.mock("../services/stripeProvisioningService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/stripeProvisioningService.js")>();
  return {
    ...actual,
    getPurchasedSeats: vi.fn(actual.getPurchasedSeats),
    getUsedSeats: vi.fn(actual.getUsedSeats),
  };
});

// ── Seat accounting (real implementation, fake db) ─────────────────────────

/** Fake db serving a single select() call. */
function createSelectDb(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
  } as never;
}

describe("getPurchasedSeats", () => {
  it("sums quantity across active/trialing team_seats subscriptions", async () => {
    const db = createSelectDb([{ quantity: 5 }, { quantity: 3 }]);
    await expect(getPurchasedSeats(db, COMPANY)).resolves.toBe(8);
  });

  it("returns 0 when the company has no seat subscription", async () => {
    const db = createSelectDb([]);
    await expect(getPurchasedSeats(db, COMPANY)).resolves.toBe(0);
  });
});

describe("getUsedSeats", () => {
  it("returns the active-human-member count (query already excludes owner + agents)", async () => {
    // getUsedSeats issues a single count() aggregate query filtered to
    // principalType="user", status="active", membershipRole <> "owner" —
    // the fake db returns what a real Postgres would return for that
    // filtered query: 2 active non-owner human members. The owner row and
    // any agent memberships never reach this count because the WHERE
    // clause excludes them server-side, not via post-processing here.
    const db = createSelectDb([{ value: 2 }]);
    await expect(getUsedSeats(db, COMPANY)).resolves.toBe(2);
  });

  it("returns 0 when the only active member is the owner", async () => {
    const db = createSelectDb([{ value: 0 }]);
    await expect(getUsedSeats(db, COMPANY)).resolves.toBe(0);
  });

  it("defaults to 0 when the aggregate query returns no row", async () => {
    const db = createSelectDb([]);
    await expect(getUsedSeats(db, COMPANY)).resolves.toBe(0);
  });
});

// ── Route-level seat gate (join-request approval + invite creation) ────────

const mockAccessService = vi.hoisted(() => ({
  isInstanceAdmin: vi.fn(),
  canUser: vi.fn(),
  ensureMembership: vi.fn(),
  setPrincipalGrants: vi.fn(),
}));
const mockAgentService = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
const mockBoardAuthService = vi.hoisted(() => ({ resolveBoardAccess: vi.fn() }));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockNotifyHireApproved = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  boardAuthService: () => mockBoardAuthService,
  companyService: () => ({ getById: vi.fn() }),
  deduplicateAgentName: (name: string) => name,
  logActivity: mockLogActivity,
  notifyHireApproved: mockNotifyHireApproved,
}));

const REQUEST_ID = "request-1";
const INVITE_ID = "invite-1";

function baseInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITE_ID,
    companyId: COMPANY,
    inviteType: "company_join",
    allowedJoinTypes: "both",
    defaultsPayload: null,
    expiresAt: new Date(Date.now() + 1_000_000),
    invitedByUserId: "creator-user",
    tokenHash: "hash",
    revokedAt: null,
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function baseJoinRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    inviteId: INVITE_ID,
    companyId: COMPANY,
    requestType: "human",
    status: "pending_approval",
    requestIp: "127.0.0.1",
    requestingUserId: "user-1",
    createdAgentId: null,
    ...overrides,
  };
}

/** Fake db for the approve route: two sequential selects (joinRequests then
 * invites), plus an update().set().where().returning() for the approval. */
function createApproveDbStub(joinRequestRow: Record<string, unknown>, inviteRow: Record<string, unknown>) {
  const queue = [[joinRequestRow], [inviteRow]];
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => {
        const rows = queue.shift() ?? [];
        return { then: (fn: (v: unknown[]) => unknown) => fn(rows) };
      }),
    }),
  }));
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue(
          Promise.resolve([{ ...joinRequestRow, status: "approved" }]),
        ),
      }),
    }),
  });
  return { select, update };
}

/** Fake db for the invite-creation route's insert-with-retry path. */
function createInviteCreateDbStub() {
  const created = baseInvite();
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockReturnValue(Promise.resolve([created])),
    }),
  });
  return { insert };
}

function createApp(db: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { actor: unknown }).actor = {
      type: "board",
      source: "local_implicit",
      userId: "board-1",
      companyIds: [COMPANY],
      companyRoles: { [COMPANY]: "owner" },
    };
    next();
  });
  app.use(
    "/api",
    accessRoutes(db as never, {
      deploymentMode: "authenticated",
      deploymentExposure: "private",
      bindHost: "127.0.0.1",
      allowedHostnames: [],
    }),
  );
  app.use(errorHandler);
  return app;
}

describe("POST /companies/:companyId/join-requests/:requestId/approve — seat gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockNotifyHireApproved.mockResolvedValue(undefined);
    mockAccessService.ensureMembership.mockResolvedValue(undefined);
    mockAccessService.setPrincipalGrants.mockResolvedValue(undefined);
  });

  it("402s a human join request when the company is at its seat cap", async () => {
    vi.mocked(getPurchasedSeats).mockResolvedValue(2);
    vi.mocked(getUsedSeats).mockResolvedValue(2);

    const db = createApproveDbStub(baseJoinRequest({ requestType: "human" }), baseInvite());
    const res = await request(createApp(db))
      .post(`/api/companies/${COMPANY}/join-requests/${REQUEST_ID}/approve`)
      .send({});

    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/No seats available \(2\/2 used\)/);
    expect(mockAccessService.ensureMembership).not.toHaveBeenCalled();
  });

  it("succeeds when a seat is available for a human join request", async () => {
    vi.mocked(getPurchasedSeats).mockResolvedValue(3);
    vi.mocked(getUsedSeats).mockResolvedValue(2);

    const db = createApproveDbStub(baseJoinRequest({ requestType: "human" }), baseInvite());
    const res = await request(createApp(db))
      .post(`/api/companies/${COMPANY}/join-requests/${REQUEST_ID}/approve`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(mockAccessService.ensureMembership).toHaveBeenCalledWith(
      COMPANY,
      "user",
      "user-1",
      "member",
      "active",
    );
  });

  it("is NOT gated at all for an agent-type join request, even at/over capacity", async () => {
    // Purposely set values that WOULD 402 a human request, to prove the
    // agent path never even calls these two functions.
    vi.mocked(getPurchasedSeats).mockResolvedValue(0);
    vi.mocked(getUsedSeats).mockResolvedValue(999);
    mockAgentService.list.mockResolvedValue([
      { id: "ceo-1", role: "ceo", reportsTo: null },
    ]);
    mockAgentService.create.mockResolvedValue({ id: "new-agent-1" });

    const db = createApproveDbStub(
      baseJoinRequest({ requestType: "agent", agentName: "New Agent", requestingUserId: null }),
      baseInvite(),
    );
    const res = await request(createApp(db))
      .post(`/api/companies/${COMPANY}/join-requests/${REQUEST_ID}/approve`)
      .send({});

    expect(res.status).toBe(200);
    expect(getPurchasedSeats).not.toHaveBeenCalled();
    expect(getUsedSeats).not.toHaveBeenCalled();
    expect(mockAgentService.create).toHaveBeenCalledTimes(1);
  });
});

describe("POST /companies/:companyId/invites — seat gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("402s early when creating a human-eligible invite at capacity (allowedJoinTypes default 'both')", async () => {
    vi.mocked(getPurchasedSeats).mockResolvedValue(1);
    vi.mocked(getUsedSeats).mockResolvedValue(1);

    const res = await request(createApp({}))
      .post(`/api/companies/${COMPANY}/invites`)
      .send({});

    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/No seats available \(1\/1 used\)/);
  });

  it("succeeds creating the invite when seats are available", async () => {
    vi.mocked(getPurchasedSeats).mockResolvedValue(5);
    vi.mocked(getUsedSeats).mockResolvedValue(1);

    const db = createInviteCreateDbStub();
    const res = await request(createApp(db))
      .post(`/api/companies/${COMPANY}/invites`)
      .send({});

    expect(res.status).toBe(201);
  });

  it("is not gated for an agent-only invite even at capacity", async () => {
    vi.mocked(getPurchasedSeats).mockResolvedValue(0);
    vi.mocked(getUsedSeats).mockResolvedValue(0);

    const db = createInviteCreateDbStub();
    const res = await request(createApp(db))
      .post(`/api/companies/${COMPANY}/invites`)
      .send({ allowedJoinTypes: "agent" });

    expect(res.status).toBe(201);
    expect(getPurchasedSeats).not.toHaveBeenCalled();
    expect(getUsedSeats).not.toHaveBeenCalled();
  });
});
