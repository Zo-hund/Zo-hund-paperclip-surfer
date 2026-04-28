import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  amxCertificates,
  authUsers,
  companies,
  createDb,
  lmsEnrollments,
  lmsSimulations,
  lmsWorkshops,
  marketplaceListings,
  marketplaceProfiles,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { lmsRoutes } from "../routes/lms.js";
import { marketplaceRoutes } from "../routes/marketplace.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("lms guidance flow", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-lms-guidance-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterEach(async () => {
    await db.delete(lmsEnrollments);
    await db.delete(lmsWorkshops);
    await db.delete(lmsSimulations);
    await db.delete(amxCertificates);
    await db.delete(marketplaceListings);
    await db.delete(marketplaceProfiles);
    await db.delete(authUsers);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedFixture() {
    const userId = randomUUID();
    const companyId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Guidance Co",
      issuePrefix: "GUIDE",
      issueCounter: 0,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(authUsers).values({
      id: userId,
      name: "Guide User",
      email: "guide@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { userId, companyId };
  }

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
    app.use("/api", lmsRoutes(db));
    app.use("/api", marketplaceRoutes(db));
    app.use(errorHandler);
    return app;
  }

  it("persists guidance progress in the lms dashboard and blocks partner apply until complete", async () => {
    const fixture = await seedFixture();
    const app = createApp(fixture.userId, fixture.companyId);

    const initialDashboard = await request(app).get(`/api/companies/${fixture.companyId}/lms/dashboard`);
    expect(initialDashboard.status).toBe(200);
    expect(initialDashboard.body.requiredChecklistComplete).toBe(false);
    expect(initialDashboard.body.guidanceSections.length).toBeGreaterThan(0);

    const workshopId = initialDashboard.body.workshops[0].id as string;
    const enrollRes = await request(app)
      .post(`/api/companies/${fixture.companyId}/lms/enroll`)
      .send({ workshopId });
    expect(enrollRes.status).toBe(201);

    const completeRes = await request(app)
      .post(`/api/companies/${fixture.companyId}/lms/enrollments/${enrollRes.body.id}/complete`)
      .send({ score: 100 });
    expect(completeRes.status).toBe(201);

    const blockedPartnerApply = await request(app).post("/api/marketplace/me/partner-application").send({});
    expect(blockedPartnerApply.status).toBe(422);
    expect(blockedPartnerApply.body.error).toMatch(/onboarding guidance/i);

    for (const section of initialDashboard.body.guidanceSections as Array<{
      lessons: Array<{ id: string }>;
      checklist: Array<{ id: string }>;
    }>) {
      for (const lesson of section.lessons) {
        const lessonRes = await request(app)
          .post(`/api/companies/${fixture.companyId}/lms/guidance/lessons/${lesson.id}/complete`)
          .send({ lessonId: lesson.id });
        expect(lessonRes.status).toBe(201);
      }

      for (const item of section.checklist) {
        const checklistRes = await request(app)
          .post(`/api/companies/${fixture.companyId}/lms/guidance/checklist/${item.id}/complete`)
          .send({ checklistId: item.id });
        expect(checklistRes.status).toBe(201);
      }
    }

    const completedDashboard = await request(app).get(`/api/companies/${fixture.companyId}/lms/dashboard`);
    expect(completedDashboard.status).toBe(200);
    expect(completedDashboard.body.requiredChecklistComplete).toBe(true);
    expect(completedDashboard.body.guidanceProgress.progressPercent).toBe(100);

    const profileRes = await request(app).get("/api/marketplace/me/profile");
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.guidance.requiredChecklistComplete).toBe(true);

    const partnerApplyRes = await request(app).post("/api/marketplace/me/partner-application").send({});
    expect(partnerApplyRes.status).toBe(201);
    expect(partnerApplyRes.body.profile.partnerStatus).toBe("pending");

    const profileRow = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, fixture.userId))
      .then((rows) => rows[0]!);
    expect(profileRow.guidanceCompletedLessons.length).toBeGreaterThan(0);
    expect(profileRow.guidanceCompletedChecklist.length).toBeGreaterThan(0);
  });
});
