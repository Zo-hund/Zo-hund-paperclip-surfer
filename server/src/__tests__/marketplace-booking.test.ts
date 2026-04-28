import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  agents,
  amxTransactions,
  authUsers,
  companies,
  createDb,
  issues,
  marketplaceListings,
  marketplaceProfiles,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { marketplaceRoutes } from "../routes/marketplace.js";
import { marketplaceService } from "../services/marketplace.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres marketplace booking tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

const REQUIRED_AGENT_SKILLS = [
  "image-microservice-router",
  "video-microservice-router",
  "audio-microservice-router",
  "ondemand-webhook-intake",
] as const;

describeEmbeddedPostgres("marketplace microservice booking route", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-marketplace-booking-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(amxTransactions);
    await db.delete(agents);
    await db.delete(marketplaceListings);
    await db.delete(marketplaceProfiles);
    await db.delete(authUsers);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  function createApp(userId: string, companyId: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        userId,
        source: "local_implicit",
        companyIds: [companyId],
        isInstanceAdmin: false,
      };
      next();
    });
    app.use("/api", marketplaceRoutes(db));
    app.use(errorHandler);
    return app;
  }

  async function countRows(table: typeof amxTransactions | typeof issues) {
    return db.select().from(table).then((rows) => rows.length);
  }

  async function seedFixture(options?: {
    buyerBalance?: number;
    listingStatus?: "active" | "paused";
    assignedAgentReady?: boolean;
    createConflictingIssue?: boolean;
  }) {
    const buyerUserId = randomUUID();
    const companyId = randomUUID();
    const issuePrefix = options?.createConflictingIssue ? "AMX" : `AMX${companyId.slice(0, 4).toUpperCase()}`;
    const svc = marketplaceService(db);

    await db.insert(companies).values({
      id: companyId,
      name: "AMX Test Company",
      issuePrefix,
      issueCounter: 0,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(authUsers).values({
      id: buyerUserId,
      name: "Buyer",
      email: "buyer@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await svc.ensureAmxMicroservicesProviderListing(companyId);
    await svc.ensureProfile(buyerUserId, { displayName: "Buyer" });

    if (typeof options?.buyerBalance === "number") {
      await db
        .update(marketplaceProfiles)
        .set({ amxTokenBalance: options.buyerBalance, updatedAt: new Date() })
        .where(eq(marketplaceProfiles.userId, buyerUserId));
    }

    const listing = await db
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.companyId, companyId),
          eq(marketplaceListings.providerUserId, "amx-microservices-provider"),
          eq(marketplaceListings.name, "amx-microservices-provider"),
        ),
      )
      .then((rows) => rows[0]!);

    if (options?.listingStatus === "paused") {
      await db
        .update(marketplaceListings)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(marketplaceListings.id, listing.id));
    }

    const assignedAgentId = randomUUID();
    const desiredSkills = options?.assignedAgentReady === false
      ? ["paperclipai/paperclip/firecrawl"]
      : [
          "paperclipai/paperclip/firecrawl",
          "paperclipai/paperclip/page-agent",
          ...REQUIRED_AGENT_SKILLS.map((slug) => `company/${companyId}/${slug}`),
        ];

    await db.insert(agents).values({
      id: assignedAgentId,
      companyId,
      name: options?.assignedAgentReady === false ? "CMO-lite" : "CMO",
      role: "cmo",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {
        paperclipSkillSync: {
          desiredSkills,
        },
      },
      runtimeConfig: {},
      permissions: {},
    });

    if (options?.createConflictingIssue) {
      await db.insert(issues).values({
        companyId,
        title: "Existing conflict",
        identifier: `${issuePrefix}-1`,
        issueNumber: 1,
        status: "todo",
        priority: "medium",
      });
    }

    return { buyerUserId, companyId, listingId: listing.id, assignedAgentId };
  }

  it("creates one transaction and one issue and returns readiness metadata", async () => {
    const fixture = await seedFixture();
    const app = createApp(fixture.buyerUserId, fixture.companyId);

    const res = await request(app)
      .post(`/api/companies/${fixture.companyId}/amx/microservice-bookings`)
      .send({
        listingId: fixture.listingId,
        hours: 1,
        runPhase: "content-production",
        taskType: "image_generate",
        title: "Verification booking",
        instructions: "Create a verification issue only.",
        assignedAgentId: fixture.assignedAgentId,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.purchase.totalCostTokens).toBe(100);
    expect(res.body.purchase.providerPayoutTokens).toBe(90);
    expect(res.body.purchase.platformFeeTokens).toBe(10);
    expect(res.body.purchase.transactionId).toBeTruthy();
    expect(res.body.issue.identifier).toBeTruthy();
    expect(res.body.issue.assigneeAgentId).toBe(fixture.assignedAgentId);
    expect(res.body.listing.id).toBe(fixture.listingId);
    expect(res.body.microserviceReady.listing).toEqual({ ready: true, missingSkills: [] });
    expect(res.body.microserviceReady.assignedAgent.ready).toBe(true);
    expect(res.body.microserviceReady.assignedAgent.missingSkills).toEqual([]);

    expect(await countRows(amxTransactions)).toBe(1);
    expect(await countRows(issues)).toBe(1);
  });

  it("returns readiness warnings for an assigned agent missing microservice skills", async () => {
    const fixture = await seedFixture({ assignedAgentReady: false });
    const app = createApp(fixture.buyerUserId, fixture.companyId);

    const res = await request(app)
      .post(`/api/companies/${fixture.companyId}/amx/microservice-bookings`)
      .send({
        listingId: fixture.listingId,
        hours: 1,
        runPhase: "content-production",
        taskType: "image_edit",
        title: "Warning booking",
        instructions: "Still book even when the assigned agent lacks tooling.",
        assignedAgentId: fixture.assignedAgentId,
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.microserviceReady.assignedAgent.ready).toBe(false);
    expect(res.body.microserviceReady.assignedAgent.missingSkills).toEqual(
      expect.arrayContaining(REQUIRED_AGENT_SKILLS),
    );
    expect(await countRows(amxTransactions)).toBe(1);
    expect(await countRows(issues)).toBe(1);
  });

  it("rejects booking when buyer balance is too low without persisting side effects", async () => {
    const fixture = await seedFixture({ buyerBalance: 50 });
    const app = createApp(fixture.buyerUserId, fixture.companyId);

    const beforeTransactions = await countRows(amxTransactions);
    const beforeIssues = await countRows(issues);

    const res = await request(app)
      .post(`/api/companies/${fixture.companyId}/amx/microservice-bookings`)
      .send({
        listingId: fixture.listingId,
        hours: 1,
        runPhase: "content-production",
        taskType: "video",
        title: "Low balance booking",
        instructions: "Should fail.",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error).toMatch(/Insufficient AMX token balance/i);
    expect(await countRows(amxTransactions)).toBe(beforeTransactions);
    expect(await countRows(issues)).toBe(beforeIssues);
  });

  it("rejects missing or inactive listings without creating transactions", async () => {
    const missingFixture = await seedFixture();
    const app = createApp(missingFixture.buyerUserId, missingFixture.companyId);

    const missingRes = await request(app)
      .post(`/api/companies/${missingFixture.companyId}/amx/microservice-bookings`)
      .send({
        listingId: randomUUID(),
        hours: 1,
        runPhase: "content-production",
        taskType: "audio",
        title: "Missing listing",
        instructions: "Should fail.",
      });

    expect(missingRes.status, JSON.stringify(missingRes.body)).toBe(400);
    expect(missingRes.body.error).toMatch(/Marketplace listing not found/i);

    const pausedFixture = await seedFixture({ listingStatus: "paused" });
    const pausedApp = createApp(pausedFixture.buyerUserId, pausedFixture.companyId);
    const pausedRes = await request(pausedApp)
      .post(`/api/companies/${pausedFixture.companyId}/amx/microservice-bookings`)
      .send({
        listingId: pausedFixture.listingId,
        hours: 1,
        runPhase: "content-production",
        taskType: "browser_task",
        title: "Paused listing",
        instructions: "Should fail.",
      });

    expect(pausedRes.status, JSON.stringify(pausedRes.body)).toBe(400);
    expect(pausedRes.body.error).toMatch(/Only active listings can be booked/i);
  });

  it("rolls back token movement when issue creation fails downstream", async () => {
    const fixture = await seedFixture({ createConflictingIssue: true });
    const app = createApp(fixture.buyerUserId, fixture.companyId);

    const buyerBefore = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, fixture.buyerUserId))
      .then((rows) => rows[0]!);
    const providerBefore = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, "amx-microservices-provider"))
      .then((rows) => rows[0]!);
    const txBefore = await countRows(amxTransactions);
    const issuesBefore = await countRows(issues);

    const res = await request(app)
      .post(`/api/companies/${fixture.companyId}/amx/microservice-bookings`)
      .send({
        listingId: fixture.listingId,
        hours: 1,
        runPhase: "content-production",
        taskType: "image_generate",
        title: "Conflict booking",
        instructions: "Should roll back transaction and balances.",
      });

    expect(res.status).toBeGreaterThanOrEqual(500);

    const buyerAfter = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, fixture.buyerUserId))
      .then((rows) => rows[0]!);
    const providerAfter = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, "amx-microservices-provider"))
      .then((rows) => rows[0]!);

    expect(buyerAfter.amxTokenBalance).toBe(buyerBefore.amxTokenBalance);
    expect(providerAfter.amxTokenBalance).toBe(providerBefore.amxTokenBalance);
    expect(await countRows(amxTransactions)).toBe(txBefore);
    expect(await countRows(issues)).toBe(issuesBefore);
  });
});
