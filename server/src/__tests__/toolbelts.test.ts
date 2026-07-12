import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { toolbeltRoutes } from "../routes/toolbelts.js";
import { errorHandler } from "../middleware/index.js";

const mockLogActivity = vi.hoisted(() => vi.fn());

// toolbeltRoutes only imports logActivity from services/index.js — mock the
// whole module out (same pattern as company-skills-routes.test.ts) so tests
// don't need to satisfy logActivity's own db dependency (instanceSettingsService).
vi.mock("../services/index.js", () => ({ logActivity: mockLogActivity }));

const COMPANY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/**
 * Minimal fake db covering the three query shapes toolbeltRoutes uses for
 * company/instance CRUD: select().from().where(), insert().values().returning(),
 * update().set().where().returning(). Same spirit as chain-tracking.test.ts's
 * createFakeDb — a stateful stub, not a real query engine, so these tests
 * verify route wiring/authz/response-shaping and trust drizzle's typed query
 * builder for the underlying SQL.
 */
function createFakeDb(opts: {
  selectRows?: unknown[];
  insertRow?: Record<string, unknown> | null;
  updateRow?: Record<string, unknown> | null;
}) {
  const state = {
    inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
    updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  };
  const db = {
    // .from() is awaited directly by the unfiltered instance-list routes, and
    // chained with .where() by the company-scoped (filtered) list routes —
    // support both by making the .from() result itself thenable.
    select: () => ({
      from: () => ({
        where: async () => opts.selectRows ?? [],
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(opts.selectRows ?? []).then(resolve, reject),
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: getTableName(table), values });
        return {
          returning: async () =>
            opts.insertRow === null ? [] : [{ id: "new-id", ...values, ...(opts.insertRow ?? {}) }],
        };
      },
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.updates.push({ table: getTableName(table), values });
            return opts.updateRow ? [opts.updateRow] : [];
          },
        }),
      }),
    }),
  };
  return { db: db as never, state };
}

function createApp(db: unknown, actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { actor: unknown }).actor = actor;
    next();
  });
  app.use("/api", toolbeltRoutes(db as never));
  app.use(errorHandler);
  return app;
}

const admin = {
  type: "board",
  source: "session",
  userId: "admin-user",
  companyIds: [COMPANY],
  companyRoles: { [COMPANY]: "admin" },
};
const member = {
  type: "board",
  source: "session",
  userId: "member-user",
  companyIds: [COMPANY],
  companyRoles: { [COMPANY]: "member" },
};
const outsider = {
  type: "board",
  source: "session",
  userId: "outsider-user",
  companyIds: [OTHER_COMPANY],
  companyRoles: { [OTHER_COMPANY]: "owner" },
};
const instanceAdmin = {
  type: "board",
  source: "session",
  userId: "instance-admin",
  isInstanceAdmin: true,
  companyIds: [],
  companyRoles: {},
};

describe("toolbelts + harnesses routes", () => {
  beforeEach(() => {
    mockLogActivity.mockReset().mockResolvedValue(undefined);
  });

  describe("GET /companies/:companyId/toolbelts", () => {
    it("returns the company's own toolbelts plus public instance-wide presets", async () => {
      const ownToolbelt = { id: "t1", companyId: COMPANY, key: "custom", name: "Custom", isPublic: false };
      const presetToolbelt = { id: "t2", companyId: null, key: "devsecops", name: "DevSecOps", isPublic: true };
      const { db } = createFakeDb({ selectRows: [ownToolbelt, presetToolbelt] });

      const res = await request(createApp(db, member)).get(`/api/companies/${COMPANY}/toolbelts`);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toEqual([ownToolbelt, presetToolbelt]);
    });

    it("rejects a caller with no access to the company (403)", async () => {
      const { db } = createFakeDb({ selectRows: [] });
      const res = await request(createApp(db, outsider)).get(`/api/companies/${COMPANY}/toolbelts`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /companies/:companyId/toolbelts", () => {
    it("allows an admin to create a company-scoped toolbelt", async () => {
      const { db, state } = createFakeDb({ insertRow: {} });
      const res = await request(createApp(db, admin))
        .post(`/api/companies/${COMPANY}/toolbelts`)
        .send({ key: "devsecops", name: "DevSecOps", category: "devsecops", toolPermissions: ["Bash", "Read"] });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(state.inserts).toHaveLength(1);
      expect(state.inserts[0]).toMatchObject({
        table: "toolbelts",
        values: { companyId: COMPANY, key: "devsecops", name: "DevSecOps" },
      });
      expect(mockLogActivity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        companyId: COMPANY,
        action: "toolbelt.created",
      }));
    });

    it("rejects a non-admin member (403) and does not touch the db", async () => {
      const { db, state } = createFakeDb({});
      const res = await request(createApp(db, member))
        .post(`/api/companies/${COMPANY}/toolbelts`)
        .send({ key: "devsecops", name: "DevSecOps" });

      expect(res.status).toBe(403);
      expect(state.inserts).toHaveLength(0);
    });
  });

  describe("PATCH /companies/:companyId/toolbelts/:toolbeltId", () => {
    it("allows an admin to update the company's own toolbelt", async () => {
      const { db } = createFakeDb({
        updateRow: { id: "t1", companyId: COMPANY, key: "devsecops", name: "Updated" },
      });
      const res = await request(createApp(db, admin))
        .patch(`/api/companies/${COMPANY}/toolbelts/t1`)
        .send({ name: "Updated" });

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.name).toBe("Updated");
    });

    it("404s on a cross-company PATCH attempt (toolbelt belongs to another company)", async () => {
      // Simulates WHERE eq(id, toolbeltId) AND eq(companyId, companyId) matching
      // zero rows because the toolbelt actually belongs to a different company.
      const { db } = createFakeDb({ updateRow: null });
      const res = await request(createApp(db, admin))
        .patch(`/api/companies/${COMPANY}/toolbelts/t1`)
        .send({ name: "Hijacked" });

      expect(res.status).toBe(404);
    });

    it("rejects a non-admin member (403)", async () => {
      const { db } = createFakeDb({});
      const res = await request(createApp(db, member))
        .patch(`/api/companies/${COMPANY}/toolbelts/t1`)
        .send({ name: "Nope" });

      expect(res.status).toBe(403);
    });
  });

  describe("GET/POST/PATCH /instance/toolbelts", () => {
    it("rejects a non-instance-admin board user (403)", async () => {
      const { db } = createFakeDb({ selectRows: [] });
      const res = await request(createApp(db, member)).get("/api/instance/toolbelts");
      expect(res.status).toBe(403);
    });

    it("allows an instance admin to list every toolbelt (every company's + presets)", async () => {
      const rows = [{ id: "t1", companyId: COMPANY }, { id: "t2", companyId: null }];
      const { db } = createFakeDb({ selectRows: rows });
      const res = await request(createApp(db, instanceAdmin)).get("/api/instance/toolbelts");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(rows);
    });

    it("allows an instance admin to create an instance-wide preset (companyId null)", async () => {
      const { db, state } = createFakeDb({ insertRow: {} });
      const res = await request(createApp(db, instanceAdmin))
        .post("/api/instance/toolbelts")
        .send({ key: "devsecops", name: "DevSecOps", isPublic: true });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(state.inserts[0]).toMatchObject({ values: { companyId: null, isPublic: true } });
    });

    it("rejects a board member without instance-admin (403) on the preset PATCH route", async () => {
      const { db } = createFakeDb({});
      const res = await request(createApp(db, member))
        .patch("/api/instance/toolbelts/t1")
        .send({ name: "Nope" });
      expect(res.status).toBe(403);
    });
  });

  describe("GET/POST/PATCH harnesses (company + instance)", () => {
    it("returns the company's own harnesses plus public instance-wide presets", async () => {
      const rows = [
        { id: "h1", companyId: COMPANY, key: "custom", adapterType: "openrouter", model: "openrouter/auto" },
        { id: "h2", companyId: null, key: "devsecops-engineer", adapterType: "openrouter", model: "openrouter/auto" },
      ];
      const { db } = createFakeDb({ selectRows: rows });
      const res = await request(createApp(db, member)).get(`/api/companies/${COMPANY}/harnesses`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(rows);
    });

    it("rejects a non-admin member creating a harness (403)", async () => {
      const { db, state } = createFakeDb({});
      const res = await request(createApp(db, member))
        .post(`/api/companies/${COMPANY}/harnesses`)
        .send({ key: "devsecops-engineer", name: "DevSecOps Engineer" });
      expect(res.status).toBe(403);
      expect(state.inserts).toHaveLength(0);
    });

    it("allows an admin to create a company-scoped harness with a toolbelt reference", async () => {
      const { db, state } = createFakeDb({ insertRow: {} });
      const res = await request(createApp(db, admin))
        .post(`/api/companies/${COMPANY}/harnesses`)
        .send({
          key: "devsecops-engineer",
          name: "DevSecOps Engineer",
          category: "devsecops",
          adapterType: "openrouter",
          model: "openrouter/auto",
          toolbeltId: "11111111-1111-4111-8111-111111111111",
        });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(state.inserts[0]).toMatchObject({
        table: "harnesses",
        values: { companyId: COMPANY, key: "devsecops-engineer", adapterType: "openrouter" },
      });
    });

    it("404s on a cross-company harness PATCH attempt", async () => {
      const { db } = createFakeDb({ updateRow: null });
      const res = await request(createApp(db, admin))
        .patch(`/api/companies/${COMPANY}/harnesses/h1`)
        .send({ name: "Hijacked" });
      expect(res.status).toBe(404);
    });

    it("rejects a non-instance-admin on GET /instance/harnesses (403)", async () => {
      const { db } = createFakeDb({ selectRows: [] });
      const res = await request(createApp(db, member)).get("/api/instance/harnesses");
      expect(res.status).toBe(403);
    });

    it("allows an instance admin to create an instance-wide harness preset", async () => {
      const { db, state } = createFakeDb({ insertRow: {} });
      const res = await request(createApp(db, instanceAdmin))
        .post("/api/instance/harnesses")
        .send({ key: "devsecops-engineer", name: "DevSecOps Engineer", isPublic: true });

      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(state.inserts[0]).toMatchObject({ values: { companyId: null, isPublic: true } });
    });
  });

  describe("GET /public/directory/skills", () => {
    /** This route runs three parallel innerJoin queries; support that shape. */
    function createDirectoryFakeDb(queue: unknown[][]) {
      let call = 0;
      const db = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: async () => queue[call++] ?? [],
            }),
          }),
        }),
      };
      return db as never;
    }

    it("is fully unauthenticated and aggregates/dedupes skills across all three sources", async () => {
      const db = createDirectoryFakeDb([
        [{ skills: ["Python", "SQL"] }, { skills: ["SQL"] }], // agents.skills
        [{ skills: ["SQL", "Design"] }], // lmsMarketplaceListings.skills
        [{ name: "Python" }, { name: "DevOps" }], // companySkills.name
      ]);

      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        (req as never as { actor: unknown }).actor = { type: "none" };
        next();
      });
      app.use("/api", toolbeltRoutes(db));
      app.use(errorHandler);

      const res = await request(app).get("/api/public/directory/skills");

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const byName = Object.fromEntries(
        (res.body.skills as Array<{ name: string; sourceCount: number; sources: string[] }>).map((s) => [s.name, s]),
      );
      expect(byName.SQL).toMatchObject({ sourceCount: 2, sources: ["agent_skills", "marketplace_listings"] });
      expect(byName.Python).toMatchObject({ sourceCount: 2, sources: ["agent_skills", "company_skills"] });
      expect(byName.Design).toMatchObject({ sourceCount: 1, sources: ["marketplace_listings"] });
      expect(byName.DevOps).toMatchObject({ sourceCount: 1, sources: ["company_skills"] });
    });
  });
});
