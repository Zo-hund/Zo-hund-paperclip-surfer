import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  amxTransactions,
  authUsers,
  companies,
  createDb,
  issueWorkProducts,
  issues,
  marketplaceListings,
  marketplaceProfiles,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { issueRoutes } from "../routes/issues.js";
import { marketplaceRoutes } from "../routes/marketplace.js";
import { marketplaceService } from "../services/marketplace.js";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: sendMock,
    },
  })),
}));

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("microservice work order routes", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-microservice-work-order-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email-work-order-1" }, error: null });
    process.env.RESEND_API_KEY = "re_test";
    process.env.PAPERCLIP_EMAIL_FROM = "onboarding@amx-air-hubs.cc";
    process.env.PAPERCLIP_EMAIL_REPLY_TO = "support@amx-air-hubs.cc";
  });

  afterEach(async () => {
    await db.delete(issueWorkProducts);
    await db.delete(issues);
    await db.delete(amxTransactions);
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
        isInstanceAdmin: true,
      };
      next();
    });
    app.use("/api", marketplaceRoutes(db));
    app.use("/api", issueRoutes(db, {} as any));
    app.use(errorHandler);
    return app;
  }

  async function seedBookingFixture() {
    const buyerUserId = randomUUID();
    const companyId = randomUUID();
    const svc = marketplaceService(db);

    await db.insert(companies).values({
      id: companyId,
      name: "AMX Test Company",
      issuePrefix: "AMX",
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

    const app = createApp(buyerUserId, companyId);
    const bookingRes = await request(app)
      .post(`/api/companies/${companyId}/amx/microservice-bookings`)
      .send({
        listingId: listing.id,
        hours: 2,
        runPhase: "content-production",
        taskType: "image_generate",
        title: "Client launch creative",
        instructions: "Prepare creative for production handoff.",
        clientName: "Mario Duerson",
        clientEmail: "marioduerson1cte@gmail.com",
        clientCompany: "AMX Electives",
      });

    expect(bookingRes.status, JSON.stringify(bookingRes.body)).toBe(201);
    return { app, issueId: bookingRes.body.issue.id as string };
  }

  it("adds time cards and sends a client update email while preserving work-order history", async () => {
    const fixture = await seedBookingFixture();

    const timeCardRes = await request(fixture.app)
      .post(`/api/issues/${fixture.issueId}/microservice-work-order/time-cards`)
      .send({
        phase: "production",
        title: "Brand render pass",
        hours: 1.5,
        notes: "Finalized the production render set.",
      });

    expect(timeCardRes.status, JSON.stringify(timeCardRes.body)).toBe(201);
    expect(timeCardRes.body.metadata.timeCards).toHaveLength(1);
    expect(timeCardRes.body.metadata.tracking.currentStage).toBe("production");

    const emailRes = await request(fixture.app)
      .post(`/api/issues/${fixture.issueId}/microservice-client-update`)
      .send({
        stage: "production",
        intro: "Production is underway and the latest outputs are now in review.",
        nextStep: "Please confirm the final asset package for post-generation delivery.",
        customMessage: "The AMX creative team is holding the current style system steady across variants.",
      });

    expect(emailRes.status, JSON.stringify(emailRes.body)).toBe(201);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      to: "marioduerson1cte@gmail.com",
      subject: expect.stringContaining("Production update"),
      html: expect.stringContaining("AMX Air Hubs Client Update"),
    }));
    expect(emailRes.body.metadata.emailLog).toHaveLength(1);
    expect(emailRes.body.metadata.timeCards).toHaveLength(1);

    const storedWorkOrder = await db.select().from(issueWorkProducts).then((rows) => rows[0]!);
    const metadata = storedWorkOrder.metadata as Record<string, any>;
    expect(metadata.client.email).toBe("marioduerson1cte@gmail.com");
    expect(metadata.timeCards).toHaveLength(1);
    expect(metadata.emailLog).toHaveLength(1);
  });
});
