import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { lmsWorkshops, lmsEnrollments, lmsSimulations } from "@paperclipai/db";
import { amxChainService } from "./amxChainService.js";

export function lmsService(db: Db) {
  const chain = amxChainService(db);

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
    const workshop = await db.select()
      .from(lmsWorkshops)
      .where(eq(lmsWorkshops.id, workshopId))
      .then(rows => rows[0]);
    
    if (!workshop) throw new Error("Workshop not found.");

    // Note: Deducting credits would happen in the FinanceService.

    return db.insert(lmsEnrollments).values({
      companyId,
      userId,
      workshopId,
      status: "enrolled",
    }).returning().then(rows => rows[0]);
  }

  /**
   * Completes a workshop and awards credits/certificates.
   */
  async function complete(enrollmentId: string, score: number) {
    const enrollment = await db.select()
      .from(lmsEnrollments)
      .where(eq(lmsEnrollments.id, enrollmentId))
      .then(rows => rows[0]);

    if (!enrollment) throw new Error("Enrollment not found.");

    const updated = await db.update(lmsEnrollments)
      .set({ status: "completed", score, completedAt: new Date() })
      .where(eq(lmsEnrollments.id, enrollmentId))
      .returning().then(rows => rows[0]);

    // Issue Certificate on AMX Chain
    await chain.issueCertificate(enrollment.companyId, {
      responsiblePrincipalId: enrollment.userId,
      commitHashes: [],
      completionTimeMs: 0,
      finalCostTokens: 0,
      projects: ["LMS Training"],
      resources: [],
      reports: []
    });

    return updated;
  }

  return {
    createWorkshop,
    enroll,
    complete
  };
}
