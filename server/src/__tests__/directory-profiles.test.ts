import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { directoryProfileRoutes } from "../routes/directory-profiles.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Fake db for directoryProfileRoutes. Both queries in the route (agent rows
 * / count, member rows / count) end their chain the same way — from() ->
 * innerJoin() -> [leftJoin() ->] where() — served from an ordered queue
 * (Promise.all constructs agentRows, agentTotal, memberRows, memberTotal in
 * that order, left-to-right, so the queue is consumed in that order too).
 * Each where() call's argument is also captured so tests can assert whether
 * the isPublicProfile/companies.isPublic gate was applied (public route) or
 * omitted (instance route, which sees everyone).
 */
function createDirectoryFakeDb(queue: unknown[][]) {
  let call = 0;
  const state = { limits: [] as number[], wheres: [] as unknown[] };
  function terminal(rows: unknown[]) {
    return {
      orderBy: () => ({
        limit: async (n: number) => {
          state.limits.push(n);
          return rows;
        },
      }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
  }
  function where() {
    return {
      where: (arg: unknown) => {
        state.wheres.push(arg);
        return terminal(queue[call++] ?? []);
      },
    };
  }
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          ...where(),
          leftJoin: () => where(),
        }),
      }),
    }),
  };
  return { db: db as never, state };
}

function createApp(actor: Record<string, unknown>, queue: unknown[][]) {
  const { db, state } = createDirectoryFakeDb(queue);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", directoryProfileRoutes(db));
  app.use(errorHandler);
  return { app, state };
}

const AGENT_ROW = {
  id: "agent-1",
  name: "Astra",
  title: "Senior Engineer",
  companyId: COMPANY,
  companyName: "AMX Labs",
  companyPrefix: "AMXA",
  skills: ["React", "Node.js"],
  isPublicProfile: true,
};

const MEMBER_ROW = {
  id: "member-1",
  userId: "user-1",
  companyId: COMPANY,
  companyName: "AMX Labs",
  companyPrefix: "AMXA",
  careerInterest: "Product Design",
  organization: null,
  isPublicProfile: true,
  userName: "Sarah Chen",
  userImage: null,
};

const noActor = { type: "none" };

const member = {
  type: "board", source: "session", userId: "u1",
  companyIds: [COMPANY], companyRoles: { [COMPANY]: "member" },
};

const instanceAdmin = {
  type: "board", source: "session", userId: "admin-1",
  isInstanceAdmin: true, companyIds: [], companyRoles: {},
};

describe("GET /public/directory/profiles", () => {
  it("is fully public — applies the isPublicProfile/companies.isPublic gate and merges agent + human rows", async () => {
    const { app, state } = createApp(noActor, [[AGENT_ROW], [{ total: 1 }], [MEMBER_ROW], [{ total: 1 }]]);
    const res = await request(app).get("/api/public/directory/profiles");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.profiles).toHaveLength(2);
    // Sorted by name: "Astra" before "Sarah Chen".
    expect(res.body.profiles[0]).toMatchObject({
      id: "agent-1", type: "agent", name: "Astra", companyId: COMPANY,
      href: "/AMXA/marketplace/agent/agent-1",
    });
    expect(res.body.profiles[1]).toMatchObject({
      id: "member-1", type: "human", name: "Sarah Chen", companyId: COMPANY,
      href: "/AMXA/marketplace",
    });
    // Public route never returns isPublicProfile on rows (every row it
    // returns is already known to be public).
    expect(res.body.profiles[0].isPublicProfile).toBeUndefined();
    expect(res.body.profiles[1].isPublicProfile).toBeUndefined();

    // Each of the 4 where() calls (agent rows, agent count, member rows,
    // member count) received a defined filter — the visibility gate —
    // since this is the public route.
    expect(state.wheres).toHaveLength(4);
    expect(state.wheres.every((w) => w !== undefined)).toBe(true);
  });

  it("clamps an oversized limit down to 200 rather than rejecting the request", async () => {
    const { app, state } = createApp(noActor, [[], [{ total: 0 }], [], [{ total: 0 }]]);
    const res = await request(app).get("/api/public/directory/profiles").query({ limit: "5000" });
    expect(res.status).toBe(200);
    expect(state.limits).toEqual([200, 200]);
  });

  it("skips the human query entirely when type=agent", async () => {
    const { app } = createApp(noActor, [[AGENT_ROW], [{ total: 1 }]]);
    const res = await request(app).get("/api/public/directory/profiles").query({ type: "agent" });
    expect(res.status).toBe(200);
    expect(res.body.profiles).toEqual([expect.objectContaining({ id: "agent-1", type: "agent" })]);
    expect(res.body.total).toBe(1);
  });
});

describe("GET /instance/directory/profiles", () => {
  it("rejects a non-instance-admin board user (403)", async () => {
    const { app } = createApp(member, []);
    const res = await request(app).get("/api/instance/directory/profiles");
    expect(res.status).toBe(403);
  });

  it("returns every profile — public or private — for an instance admin, with isPublicProfile on each row", async () => {
    const { app, state } = createApp(instanceAdmin, [[AGENT_ROW], [{ total: 1 }], [MEMBER_ROW], [{ total: 1 }]]);
    const res = await request(app).get("/api/instance/directory/profiles");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.profiles).toHaveLength(2);
    expect(res.body.profiles[0]).toMatchObject({ id: "agent-1", type: "agent", isPublicProfile: true });
    expect(res.body.profiles[1]).toMatchObject({ id: "member-1", type: "human", isPublicProfile: true });

    // No filters were passed, and the instance route doesn't apply the
    // visibility gate, so every where() call receives `undefined`.
    expect(state.wheres).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("clamps an oversized limit down to 200", async () => {
    const { app, state } = createApp(instanceAdmin, [[], [{ total: 0 }], [], [{ total: 0 }]]);
    const res = await request(app).get("/api/instance/directory/profiles").query({ limit: "5000" });
    expect(res.status).toBe(200);
    expect(state.limits).toEqual([200, 200]);
  });

  it("still applies an explicit companyId filter even though the visibility gate is off", async () => {
    const { app, state } = createApp(instanceAdmin, [[AGENT_ROW], [{ total: 1 }], [MEMBER_ROW], [{ total: 1 }]]);
    const res = await request(app).get("/api/instance/directory/profiles").query({ companyId: COMPANY });
    expect(res.status).toBe(200);
    expect(state.wheres.every((w) => w !== undefined)).toBe(true);
  });
});
