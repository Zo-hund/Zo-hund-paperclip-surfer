import express, { type Request, type ErrorRequestHandler } from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { activityLog, agentMemories, agents, companies, projects, createDb } from "@paperclipai/db";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { agentMemoryRoutes } from "../routes/agent-memories.js";
import { memoryLoaderService } from "../services/agent-runtime/memory-loader.js";

describe("AMX memory tenant and project boundaries", () => {
  let db: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  const companyA = randomUUID(), companyB = randomUUID();
  const agentA = randomUUID(), agentB = randomUUID(), colleague = randomUUID();
  const projectA = randomUUID(), projectB = randomUUID();
  const ownerA = { companyId: companyA, agentId: agentA };
  const actor: Request["actor"] = { type: "board", source: "session", userId: "test-owner",
    companyIds: [companyA], memberships: [{ companyId: companyA, membershipRole: "owner", status: "active" }] };
  const body = { scope: "global", category: "learning", title: "Test memory", content: "Private fixture" };
  let globalId: string, projectId: string;
  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("amx-memory-rehearsal-");
    db = createDb(tempDb.connectionString);
    await db.insert(companies).values([
      { id: companyA, name: "Tenant A", issuePrefix: "MEMA" },
      { id: companyB, name: "Tenant B", issuePrefix: "MEMB" },
    ]);
    await db.insert(agents).values([
      { id: agentA, companyId: companyA, name: "Agent A" },
      { id: colleague, companyId: companyA, name: "Colleague" },
      { id: agentB, companyId: companyB, name: "Agent B" },
    ]);
    await db.insert(projects).values([
      { id: projectA, companyId: companyA, name: "Project A" },
      { id: projectB, companyId: companyB, name: "Project B" },
    ]);
    const svc = memoryLoaderService(db);
    globalId = (await svc.saveMemory({ ...ownerA, ...body, scope: "global", category: "learning", source: "board" })).id;
    projectId = (await svc.saveMemory({ ...ownerA, ...body, scope: "project", category: "learning",
      source: "board", projectId: projectA })).id;
  }, 20_000);
  afterAll(async () => { await tempDb?.cleanup(); });

  function app(forActor = actor) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.actor = forActor; next(); });
    app.use(agentMemoryRoutes(db));
    const errors: ErrorRequestHandler = (error, _req, res, _next) => {
      res.status(error instanceof ZodError ? 400 : error.status ?? 500).json({ error: error.message });
    };
    app.use(errors);
    return app;
  }
  it("lists memories only inside the selected tenant", async () => {
    const result = await request(app()).get("/agents/" + agentA + "/memories");
    expect(result.status).toBe(200);
    expect(result.body.map((m: { id: string }) => m.id).sort()).toEqual([globalId, projectId].sort());
    const foreign = await request(app()).get("/agents/" + agentB + "/memories");
    const absent = await request(app()).get("/agents/" + randomUUID() + "/memories");
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(absent.body);
  });
  it("rejects a foreign project without inserting a memory", async () => {
    const result = await request(app()).post("/agents/" + agentA + "/memories")
      .send({ ...body, scope: "project", projectId: projectB });
    expect(result.status).toBe(404);
    expect(await db.select().from(agentMemories).where(eq(agentMemories.projectId, projectB))).toHaveLength(0);
  });
  it("rejects forged attribution, cross-agent access and unavailable responsible users", async () => {
    const self: Request["actor"] = { type: "agent", agentId: agentA, companyId: companyA };
    expect((await request(app(self)).post("/agents/me/memories").send({ ...body, source: "human" })).status).toBe(403);
    expect((await request(app(self)).get("/agents/" + colleague + "/memories")).status).toBe(403);
    expect((await request(app({ ...self, onBehalfOfUserId: "former-user", onBehalfOfMemberships: [] }))
      .post("/agents/me/memories").send(body)).status).toBe(403);
  });
  it("preserves agent self-write and derives its attribution", async () => {
    const self: Request["actor"] = { type: "agent", agentId: agentA, companyId: companyA };
    const result = await request(app(self)).post("/agents/me/memories").send(body);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ ...ownerA, source: "self" });
  });
  it.each([
    { scope: "project" }, { scope: "global", projectId: projectA }, { confidence: 2 },
    { confidence: -0.1 }, { category: "invalid" }, { content: "" }, { companyId: companyB },
  ])("rejects invalid memory fields before persistence: %j", async (invalid) => {
    expect((await request(app()).post("/agents/" + agentA + "/memories").send({ ...body, ...invalid })).status).toBe(400);
  });
  it("rejects viewer mutations while retaining read access", async () => {
    const viewer: Request["actor"] = { ...actor,
      memberships: [{ companyId: companyA, membershipRole: "viewer", status: "active" }] };
    expect((await request(app(viewer)).get("/agents/" + agentA + "/memories")).status).toBe(200);
    expect((await request(app(viewer)).patch("/agents/" + agentA + "/memories/" + globalId)
      .send({ title: "Forbidden" })).status).toBe(403);
  });
  it("scopes get, update and delete by both company and agent", async () => {
    const svc = memoryLoaderService(db);
    const wrongOwner = { companyId: companyB, agentId: agentA };
    expect(await svc.getMemory(wrongOwner, globalId)).toBeNull();
    expect(await svc.updateMemory(wrongOwner, globalId, { content: "Forbidden" })).toBeNull();
    expect(await svc.deleteMemory({ companyId: companyA, agentId: colleague }, globalId)).toBeNull();
    expect(await svc.getMemory(ownerA, globalId)).toMatchObject({ content: "Private fixture" });
  });
  it("keeps project memory out of runtime context without that project", async () => {
    const svc = memoryLoaderService(db);
    expect((await svc.loadMemories(ownerA)).every((m) => m.scope === "global")).toBe(true);
    expect((await svc.loadMemories(ownerA, projectA)).some((m) => m.id === projectId)).toBe(true);
    expect((await svc.loadMemories(ownerA, projectA, { category: "feedback" }))).toHaveLength(0);
    await expect(svc.loadMemories(ownerA, projectB)).rejects.toThrow("Project not found");
  });
  it("records mutations without copying private memory content into the audit", async () => {
    const created = await request(app()).post("/agents/" + agentA + "/memories").send(body);
    expect(created.status).toBe(201);
    expect((await request(app()).patch("/agents/" + agentA + "/memories/" + created.body.id)
      .send({ content: "Changed private fixture" })).status).toBe(200);
    expect((await request(app()).delete("/agents/" + agentA + "/memories/" + created.body.id)).status).toBe(200);
    const events = await db.select().from(activityLog).where(eq(activityLog.entityId, created.body.id));
    expect(events.map((e) => e.action).sort()).toEqual(["agent.memory.created", "agent.memory.deleted", "agent.memory.updated"]);
    expect(JSON.stringify(events)).not.toContain("Private fixture");
    expect(JSON.stringify(events)).not.toContain("Changed private fixture");
  });
});
