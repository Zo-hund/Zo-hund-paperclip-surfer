import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { lmsService } from "../services/lmsService.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";

const enrollSchema = z.object({
  workshopId: z.string().uuid(),
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
    
    // For demo, return the data used in LmsDashboard UI
    const workshops = [
      { id: "w_1", name: "AI Production Basics", description: "Learn foundations of AI-agent collaboration.", level: "Beginner", category: "AI", credits: 50 },
      { id: "w_2", name: "Louisville FoodPort Simulation", description: "Participate in AI-driven food distribution strategy.", level: "Advanced", category: "Simulation", credits: 200 },
      { id: "w_3", name: "XR Design for Agents", description: "Spatial computing requirements for autonomous earners.", level: "Intermediate", category: "XR", credits: 100 },
    ];

    res.json({
      workshops,
      userLevel: 4,
      userCredits: 500,
      stats: {
        certificates: 3,
        simulationsCompleted: 12,
        hoursTrained: 48
      }
    });
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

  return router;
}
