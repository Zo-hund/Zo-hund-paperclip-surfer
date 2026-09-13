import express, { type Request, type ErrorRequestHandler } from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, authUsers, companies, lmsMemberProfiles, createDb } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { directoryProfileRoutes } from "../routes/directory-profiles.js";

describe("AMX profile directory privacy", () => {
  let db: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  const publicCompany = randomUUID(), privateCompany = randomUUID();
  const publicAgent = randomUUID(), privateAgent = randomUUID(), privateTenantAgent = randomUUID();
  const publicMember = randomUUID(), privateMember = randomUUID(), privateTenantMember = randomUUID();
  const userId = "synthetic-directory-user";
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("amx-directory-rehearsal-");
    db = createDb(tempDb.connectionString);
    await db.insert(companies).values([
      { id: publicCompany, name: "Public company", issuePrefix: "DPA", isPublic: true },
      { id: privateCompany, name: "Private company", issuePrefix: "DPB" },
    ]);
    await db.insert(agents).values([
      { id: publicAgent, companyId: publicCompany, name: "Public agent", isPublicProfile: true, skills: ["Docker"], adapterConfig: { secretMarker: "private" } },
      { id: privateAgent, companyId: publicCompany, name: "Private agent" },
      { id: privateTenantAgent, companyId: privateCompany, name: "Private tenant agent", isPublicProfile: true },
    ]);
    await db.insert(authUsers).values({ id: userId, name: "Public member", email: "synthetic@example.invalid", emailVerified: false,
      createdAt: new Date(), updatedAt: new Date() });
    await db.insert(lmsMemberProfiles).values([
      { id: publicMember, companyId: publicCompany, userId, isPublicProfile: true, phone: "private-phone", riskLevel: "critical" },
      { id: privateMember, companyId: publicCompany, userId: "private-user" },
      { id: privateTenantMember, companyId: privateCompany, userId, isPublicProfile: true },
    ]);
  }, 20_000);
  afterAll(async () => { await tempDb?.cleanup(); });
  function app(actor: Request["actor"] = { type: "none" }) {
    const app = express();
    app.use((req, _res, next) => { req.actor = actor; next(); });
    app.use(directoryProfileRoutes(db));
    const errors: ErrorRequestHandler = (error, _req, res, _next) => { res.status(error.status ?? 500).json({ error: error.message }); };
    app.use(errors);
    return app;
  }
  it("requires both company and individual opt-in in rows and counts", async () => {
    const res = await request(app()).get("/public/directory/profiles");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.profiles.map((p: { id: string }) => p.id).sort()).toEqual([publicAgent, publicMember].sort());
    expect(JSON.stringify(res.body)).not.toMatch(/private-phone|secretMarker|riskLevel|synthetic-directory-user/);
  });
  it("does not reveal profiles or counts by filtering a private company", async () => {
    const res = await request(app()).get("/public/directory/profiles").query({ companyId: privateCompany });
    expect(res.body).toEqual({ profiles: [], total: 0 });
  });
  it("treats skill wildcards as literal search text", async () => {
    const match = await request(app()).get("/public/directory/profiles").query({ type: "agent", skill: "Docker" });
    expect(match.body.total).toBe(1);
    const wildcard = await request(app()).get("/public/directory/profiles").query({ type: "agent", skill: "%" });
    expect(wildcard.body.total).toBe(0);
  });
  it.each([{ type: "none" }, { type: "agent", companyId: publicCompany },
    { type: "board", source: "session", companyIds: [publicCompany] }] as Request["actor"][])("protects the instance-wide private directory: %j", async (actor) => {
    const res = await request(app(actor)).get("/instance/directory/profiles");
    expect(res.status).toBe(403);
    expect(res.body.profiles).toBeUndefined();
  });
  it("lets the instance administrator inspect all profile visibility states", async () => {
    const res = await request(app({ type: "board", source: "session", isInstanceAdmin: true })).get("/instance/directory/profiles");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.profiles.every((p: { isPublicProfile: unknown }) => typeof p.isPublicProfile === "boolean")).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("private-user");
  });
  it.each([{ companyId: "invalid" }, { skill: "a".repeat(201) }, { limit: -1 }])("rejects invalid query %j", async (query) => {
    expect((await request(app()).get("/public/directory/profiles").query(query)).status).toBe(400);
  });
});
