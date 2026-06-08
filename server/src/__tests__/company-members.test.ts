import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  companyMemberships,
  createDb,
  activityLog,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companyMembersRoutes } from "../routes/company-members.js";
import { errorHandler } from "../middleware/index.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres company members route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("Company Members Route & Role Security", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-company-members-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(companyMemberships);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  function createApp(actor: any) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = actor;
      next();
    });
    app.use("/api/companies/:companyId/members", companyMembersRoutes(db));
    app.use(errorHandler);
    return app;
  }

  describe("GET /companies/:companyId/members (admin+)", () => {
    it("allows owner to list company members", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      await db.insert(companyMemberships).values({
        companyId,
        principalType: "user",
        principalId: "owner-user",
        membershipRole: "owner",
        status: "active",
      });

      const app = createApp({
        type: "board",
        userId: "owner-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "owner" },
      });

      const res = await request(app)
        .get(`/api/companies/${companyId}/members`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].principalId).toBe("owner-user");
      expect(res.body[0].membershipRole).toBe("owner");
    });

    it("allows admin to list company members", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      await db.insert(companyMemberships).values({
        companyId,
        principalType: "user",
        principalId: "admin-user",
        membershipRole: "admin",
        status: "active",
      });

      const app = createApp({
        type: "board",
        userId: "admin-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "admin" },
      });

      await request(app)
        .get(`/api/companies/${companyId}/members`)
        .expect(200);
    });

    it("denies access to member or viewer roles", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      const app = createApp({
        type: "board",
        userId: "member-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "member" },
      });

      await request(app)
        .get(`/api/companies/${companyId}/members`)
        .expect(403);
    });
  });

  describe("POST /companies/:companyId/members (owner only)", () => {
    it("allows owner to add new members", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      const app = createApp({
        type: "board",
        userId: "owner-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "owner" },
      });

      const res = await request(app)
        .post(`/api/companies/${companyId}/members`)
        .send({ userId: "new-user-123", role: "member" })
        .expect(201);

      expect(res.body.principalId).toBe("new-user-123");
      expect(res.body.membershipRole).toBe("member");
    });

    it("denies admin role from adding new members", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      const app = createApp({
        type: "board",
        userId: "admin-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "admin" },
      });

      await request(app)
        .post(`/api/companies/${companyId}/members`)
        .send({ userId: "new-user-123", role: "member" })
        .expect(403);
    });
  });

  describe("PATCH /companies/:companyId/members/:memberId (owner only)", () => {
    it("allows owner to modify another member's role", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      await db.insert(companyMemberships).values({
        companyId,
        principalType: "user",
        principalId: "member-user",
        membershipRole: "member",
        status: "active",
      });

      const app = createApp({
        type: "board",
        userId: "owner-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "owner" },
      });

      const res = await request(app)
        .patch(`/api/companies/${companyId}/members/member-user`)
        .send({ role: "admin" })
        .expect(200);

      expect(res.body.membershipRole).toBe("admin");
    });

    it("prevents owner from demoting themselves", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      const app = createApp({
        type: "board",
        userId: "owner-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "owner" },
      });

      const res = await request(app)
        .patch(`/api/companies/${companyId}/members/owner-user`)
        .send({ role: "member" })
        .expect(422);

      expect(res.body.error).toContain("Cannot change your own membership role");
    });
  });

  describe("DELETE /companies/:companyId/members/:memberId (owner only)", () => {
    it("allows owner to remove another member", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      await db.insert(companyMemberships).values({
        companyId,
        principalType: "user",
        principalId: "member-user",
        membershipRole: "member",
        status: "active",
      });

      const app = createApp({
        type: "board",
        userId: "owner-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "owner" },
      });

      await request(app)
        .delete(`/api/companies/${companyId}/members/member-user`)
        .expect(200);
    });

    it("prevents owner from deleting themselves", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      const app = createApp({
        type: "board",
        userId: "owner-user",
        source: "session",
        companyIds: [companyId],
        companyRoles: { [companyId]: "owner" },
      });

      const res = await request(app)
        .delete(`/api/companies/${companyId}/members/owner-user`)
        .expect(422);

      expect(res.body.error).toContain("Cannot remove your own company membership");
    });
  });
});
