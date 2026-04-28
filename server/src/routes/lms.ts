import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { lmsService } from "../services/lmsService.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

const enrollSchema = z.object({
  workshopId: z.string().uuid(),
});

const completeEnrollmentSchema = z.object({
  score: z.number().int().min(0).max(100).default(100),
});

const completeGuidanceLessonSchema = z.object({
  lessonId: z.string().trim().min(1),
});

const completeGuidanceChecklistSchema = z.object({
  checklistId: z.string().trim().min(1),
});

export function lmsRoutes(db: Db) {
  const router = Router();
  const svc = lmsService(db);

  /**
   * GET /api/companies/:companyId/lms/dashboard
   * Returns courses, credits, and stats.
   */
  router.get("/companies/:companyId/lms/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const dashboard = await svc.getDashboard(companyId, actorId);
    res.json(dashboard);
  });

  /**
   * POST /api/companies/:companyId/lms/enroll
   * Enrolls in a workshop.
   */
  router.post("/companies/:companyId/lms/enroll", validate(enrollSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const enrollment = await svc.enroll(companyId, actorId, req.body.workshopId);
    res.status(201).json(enrollment);
  });

  router.post("/companies/:companyId/lms/workshops/:workshopId/launch-simulation", async (req, res) => {
    const companyId = req.params.companyId as string;
    const workshopId = Array.isArray(req.params.workshopId) ? req.params.workshopId[0] : req.params.workshopId;
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const enrollment = await svc.launchSimulation(companyId, actorId, workshopId);
    res.status(201).json(enrollment);
  });

  router.post(
    "/companies/:companyId/lms/enrollments/:enrollmentId/complete",
    validate(completeEnrollmentSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const enrollmentId = Array.isArray(req.params.enrollmentId) ? req.params.enrollmentId[0] : req.params.enrollmentId;
      assertCompanyAccess(req, companyId);
      const { actorId } = getActorInfo(req);
      const enrollment = await svc.complete(companyId, actorId, enrollmentId, req.body.score);
      res.status(201).json(enrollment);
    },
  );

  router.post(
    "/companies/:companyId/lms/guidance/lessons/:lessonId/complete",
    validate(completeGuidanceLessonSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const { actorId } = getActorInfo(req);
      const profile = await svc.completeGuidanceLesson(companyId, actorId, req.body.lessonId);
      res.status(201).json(profile);
    },
  );

  router.post(
    "/companies/:companyId/lms/guidance/checklist/:checklistId/complete",
    validate(completeGuidanceChecklistSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const { actorId } = getActorInfo(req);
      const profile = await svc.completeGuidanceChecklistItem(companyId, actorId, req.body.checklistId);
      res.status(201).json(profile);
    },
  );

  return router;
}
