import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { lmsEnrollments, lmsSimulations, lmsWorkshops, marketplaceProfiles } from "@paperclipai/db";
import { amxChainService } from "./amxChainService.js";
import { marketplaceService } from "./marketplace.js";
import { badRequest, forbidden, notFound } from "../errors.js";

export function lmsService(db: Db) {
  const chain = amxChainService(db);
  const marketplace = marketplaceService(db);

  async function ensureCatalog(companyId: string) {
    const existing = await db
      .select()
      .from(lmsWorkshops)
      .where(eq(lmsWorkshops.companyId, companyId));

    if (existing.length > 0) return existing;

    const simulation = await db
      .insert(lmsSimulations)
      .values({
        companyId,
        name: "West Louisville FoodPort",
        scenario: "Live High-Fidelity Simulation: The West Louisville FoodPort",
        config: {
          category: "Simulation",
          location: "West Louisville FoodPort",
          launchMode: "real_time_collaboration",
        },
      })
      .returning()
      .then((rows) => rows[0]);

    return db
      .insert(lmsWorkshops)
      .values([
        {
          companyId,
          name: "AI Production Basics",
          description: "Learn foundations of AI-agent collaboration.",
          creditsRequired: 50,
          creditsAwarded: 50,
          format: "online",
          schedule: { cadence: "self-paced", level: "Beginner", category: "AI" },
          status: "active",
        },
        {
          companyId,
          name: "Louisville FoodPort Simulation",
          description: "Participate in AI-driven food distribution strategy.",
          creditsRequired: 200,
          creditsAwarded: 200,
          format: "simulation",
          schedule: { cadence: "live", level: "Advanced", category: "Simulation" },
          activeSimulationId: simulation.id,
          status: "active",
        },
        {
          companyId,
          name: "XR Design for Agents",
          description: "Spatial computing requirements for autonomous earners.",
          creditsRequired: 100,
          creditsAwarded: 100,
          format: "online",
          schedule: { cadence: "self-paced", level: "Intermediate", category: "XR" },
          status: "active",
        },
      ])
      .returning();
  }

  /**
   * Creates a new workshop/training session.
   */
  async function createWorkshop(companyId: string, data: {
    name: string;
    description: string;
    creditsRequired: number;
    creditsAwarded: number;
    format: string;
    schedule: Record<string, unknown>;
  }) {
    return db.insert(lmsWorkshops).values({
      ...data,
      companyId,
    }).returning().then(rows => rows[0]);
  }

  /**
   * Enrolls a user in a workshop.
   */
  async function enroll(companyId: string, userId: string, workshopId: string) {
    await ensureCatalog(companyId);
    const workshop = await db.select()
      .from(lmsWorkshops)
      .where(and(eq(lmsWorkshops.id, workshopId), eq(lmsWorkshops.companyId, companyId)))
      .then(rows => rows[0]);
    
    if (!workshop) throw new Error("Workshop not found.");

    const profile = await marketplace.ensureProfile(userId, { displayName: await marketplace.getAuthUserName(userId) });
    if (profile.lmsCredits < workshop.creditsRequired) {
      throw badRequest("Not enough LMS credits to enroll in this workshop.");
    }

    const existing = await db.select()
      .from(lmsEnrollments)
      .where(and(eq(lmsEnrollments.userId, userId), eq(lmsEnrollments.workshopId, workshopId)))
      .then(rows => rows[0] ?? null);

    if (existing) return existing;

    await db
      .update(marketplaceProfiles)
      .set({ lmsCredits: profile.lmsCredits - workshop.creditsRequired, updatedAt: new Date() })
      .where(eq(marketplaceProfiles.userId, userId));

    return db.insert(lmsEnrollments).values({
      companyId,
      userId,
      workshopId,
      status: "enrolled",
      progress: 10,
    }).returning().then(rows => rows[0]);
  }

  async function launchSimulation(companyId: string, userId: string, workshopId: string) {
    const enrollment = await enroll(companyId, userId, workshopId);
    if (enrollment.status === "completed" || enrollment.status === "certified") return enrollment;

    return db
      .update(lmsEnrollments)
      .set({
        status: "active_simulation",
        progress: Math.max(enrollment.progress ?? 0, 60),
      })
      .where(eq(lmsEnrollments.id, enrollment.id))
      .returning()
      .then((rows) => rows[0]);
  }

  /**
   * Completes a workshop and awards credits/certificates.
   */
  async function complete(companyId: string, userId: string, enrollmentId: string, score: number) {
    const enrollment = await db.select()
      .from(lmsEnrollments)
      .where(eq(lmsEnrollments.id, enrollmentId))
      .then(rows => rows[0]);

    if (!enrollment || enrollment.companyId !== companyId) {
      throw notFound("Enrollment not found.");
    }
    if (enrollment.userId !== userId) {
      throw forbidden("You can only complete your own enrollment.");
    }

    if (enrollment.status === "completed" || enrollment.status === "certified") {
      return enrollment;
    }

    const workshop = await db
      .select()
      .from(lmsWorkshops)
      .where(eq(lmsWorkshops.id, enrollment.workshopId))
      .then((rows) => rows[0]);

    if (!workshop) throw notFound("Workshop not found.");

    const certificate = await chain.issueCertificate(enrollment.companyId, {
      responsiblePrincipalId: enrollment.userId,
      commitHashes: [],
      completionTimeMs: 0,
      finalCostTokens: 0,
      projects: ["LMS Training"],
      resources: [],
      reports: [],
    });

    const updated = await db.update(lmsEnrollments)
      .set({
        status: "completed",
        score,
        progress: 100,
        completedAt: new Date(),
        certificatesAwarded: [certificate.id],
      })
      .where(eq(lmsEnrollments.id, enrollmentId))
      .returning().then(rows => rows[0]);

    const profile = await marketplace.ensureProfile(enrollment.userId, {
      displayName: await marketplace.getAuthUserName(enrollment.userId),
    });
    await db
      .update(marketplaceProfiles)
      .set({
        lmsCredits: profile.lmsCredits + workshop.creditsAwarded,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, enrollment.userId));

    await marketplace.syncEligibility(enrollment.userId);

    return updated;
  }

  async function getDashboard(companyId: string, userId: string) {
    const workshops = await ensureCatalog(companyId);
    const enrollments = await db
      .select()
      .from(lmsEnrollments)
      .where(and(eq(lmsEnrollments.companyId, companyId), eq(lmsEnrollments.userId, userId)));
    const enrollmentMap = new Map(enrollments.map((row) => [row.workshopId, row]));
    const { profile, summary } = await marketplace.syncEligibility(userId);
    const readiness = await marketplace.summarizeReadiness(userId, companyId);

    const stats = {
      certificates: summary.totalCertificates,
      simulationsCompleted: summary.completedEnrollments,
      hoursTrained: summary.totalHoursTrained,
    };

    const userLevel = Math.max(1, 1 + summary.completedEnrollments + summary.totalCertificates);

    return {
      workshops: workshops.map((workshop) => {
        const enrollment = enrollmentMap.get(workshop.id) ?? null;
        const schedule = (workshop.schedule ?? {}) as Record<string, unknown>;
        return {
          id: workshop.id,
          name: workshop.name,
          description: workshop.description,
          level: typeof schedule.level === "string" ? schedule.level : "Intermediate",
          category: typeof schedule.category === "string" ? schedule.category : "AI",
          credits: workshop.creditsAwarded,
          creditsRequired: workshop.creditsRequired,
          format: workshop.format,
          activeSimulationId: workshop.activeSimulationId,
          enrollment,
        };
      }),
      userLevel,
      userCredits: profile.lmsCredits,
      userTokenBalance: profile.amxTokenBalance,
      stats,
      eligibility: summary,
      marketplaceProfile: profile,
      guidanceSections: marketplace.getGuidanceSections().map((section) => ({
        ...section,
        lessons: section.lessons.map((lesson) => ({
          ...lesson,
          completed: readiness.guidance.completedLessonIds.includes(lesson.id),
        })),
        checklist: section.checklist.map((item) => ({
          ...item,
          completed: readiness.guidance.completedChecklistIds.includes(item.id),
        })),
      })),
      guidanceProgress: readiness.guidance,
      requiredChecklistComplete: readiness.guidance.requiredChecklistComplete,
      nextRecommendedStep: readiness.guidance.nextRecommendedStep,
    };
  }

  async function completeGuidanceLesson(companyId: string, userId: string, lessonId: string) {
    await ensureCatalog(companyId);
    return marketplace.completeGuidanceLesson(userId, lessonId);
  }

  async function completeGuidanceChecklistItem(companyId: string, userId: string, checklistId: string) {
    await ensureCatalog(companyId);
    return marketplace.completeGuidanceChecklistItem(userId, checklistId);
  }

  return {
    ensureCatalog,
    createWorkshop,
    getDashboard,
    enroll,
    launchSimulation,
    complete,
    completeGuidanceLesson,
    completeGuidanceChecklistItem,
  };
}
