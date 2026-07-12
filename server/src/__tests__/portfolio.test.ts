import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { amxRoutes } from "../routes/amx.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("../services/amxChainService.js", () => ({ amxChainService: () => ({}) }));
vi.mock("../services/rqPortalService.js", () => ({ rqPortalService: () => ({}) }));
vi.mock("../services/finance.js", () => ({ financeService: () => ({}) }));

/** Fake db supporting both portfolio queries: the member route chains
 * .from().leftJoin().where().orderBy(), the agent route chains
 * .from().where().orderBy() (no join) — both terminal shapes are exposed
 * off the same from() result, same technique as
 * chain-tracking.test.ts's createInstanceDirectoryFakeDb. */
function createPortfolioFakeDb(rows: unknown[]) {
  function terminal() {
    return { orderBy: async () => rows };
  }
  const db = {
    select: () => ({
      from: () => ({
        leftJoin: () => ({ where: () => terminal() }),
        where: () => terminal(),
      }),
    }),
  };
  return db as never;
}

function createApp(actor: Record<string, unknown>, rows: unknown[]) {
  const db = createPortfolioFakeDb(rows);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", amxRoutes(db));
  app.use(errorHandler);
  return app;
}

const member = {
  type: "board", source: "session", userId: "member-1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "member" },
};
const outsider = {
  type: "board", source: "session", userId: "outsider-1",
  companyIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"], companyRoles: {},
};

describe("GET /companies/:companyId/amx/members/:memberId/portfolio", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns only completed bookings, tagging role by which side matched the memberId", async () => {
    const rows = [
      {
        bookingId: "bk-client",
        projectTitle: "Hired a designer",
        description: "Logo refresh",
        phase: "production",
        budgetSims: 500,
        completedAt: new Date("2026-07-02T00:00:00Z"),
        clientMemberId: "member-a",
        listingMemberId: "someone-else",
      },
      {
        bookingId: "bk-provider",
        projectTitle: "Built a landing page",
        description: null,
        phase: null,
        budgetSims: 800,
        completedAt: new Date("2026-07-01T00:00:00Z"),
        clientMemberId: "someone-else",
        listingMemberId: "member-a",
      },
    ];
    const res = await request(createApp(member, rows))
      .get(`/api/companies/${COMPANY}/amx/members/member-a/portfolio`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          bookingId: "bk-client",
          projectTitle: "Hired a designer",
          description: "Logo refresh",
          phase: "production",
          budgetSims: 500,
          completedAt: "2026-07-02T00:00:00.000Z",
          role: "client",
        },
        {
          bookingId: "bk-provider",
          projectTitle: "Built a landing page",
          description: null,
          phase: null,
          budgetSims: 800,
          completedAt: "2026-07-01T00:00:00.000Z",
          role: "provider",
        },
      ],
    });
  });

  it("returns an empty list when the member has no completed bookings", async () => {
    const res = await request(createApp(member, []))
      .get(`/api/companies/${COMPANY}/amx/members/member-x/portfolio`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const res = await request(createApp(outsider, []))
      .get(`/api/companies/${COMPANY}/amx/members/member-a/portfolio`);
    expect(res.status).toBe(403);
  });
});

describe("GET /companies/:companyId/amx/agents/:agentId/portfolio", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns only certified submissions where the agent is in the fulfilling swarm", async () => {
    const rows = [
      {
        id: "sub-1",
        companyId: COMPANY,
        tier: "digital_foundation",
        status: "certified",
        creditCost: 1000,
        agentSwarmIds: ["agent-a", "agent-b"],
        updatedAt: new Date("2026-07-03T00:00:00Z"),
      },
      {
        id: "sub-2",
        companyId: COMPANY,
        tier: "hybrid_growth",
        status: "certified",
        creditCost: 2000,
        agentSwarmIds: ["agent-b"], // agent-a not in this swarm — excluded
        updatedAt: new Date("2026-07-04T00:00:00Z"),
      },
    ];
    const res = await request(createApp(member, rows))
      .get(`/api/companies/${COMPANY}/amx/agents/agent-a/portfolio`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          submissionId: "sub-1",
          tier: "digital_foundation",
          creditCost: 1000,
          completedAt: "2026-07-03T00:00:00.000Z",
        },
      ],
    });
  });

  it("returns an empty list when the agent has no certified runs", async () => {
    const res = await request(createApp(member, []))
      .get(`/api/companies/${COMPANY}/amx/agents/agent-z/portfolio`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it("rejects a caller with no access to the target company (403)", async () => {
    const res = await request(createApp(outsider, []))
      .get(`/api/companies/${COMPANY}/amx/agents/agent-a/portfolio`);
    expect(res.status).toBe(403);
  });
});
