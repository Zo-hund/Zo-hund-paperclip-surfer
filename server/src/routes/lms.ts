import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  lmsWorkshops,
  lmsEnrollments,
  lmsModules,
  lmsModuleProgress,
  lmsMemberProfiles,
  lmsSessions,
  lmsSessionAttendance,
  lmsAiAgentRoles,
  lmsBadgeDefinitions,
  lmsLearnerBadges,
  lmsXrSessions,
  lmsCommunityActivity,
  lmsWorkforceProfiles,
  lmsInterventions,
  lmsMarketplaceListings,
  lmsMarketplaceBookings,
  amxLedger,
  amxCertificates,
  amxTransactions,
} from "@paperclipai/db";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { lmsService } from "../services/lmsService.js";
import { lmsAnalyticsService } from "../services/lmsAnalyticsService.js";
import { lmsNarrationService } from "../services/lmsNarrationService.js";
import { assertCompanyAccess, assertCompanyRole, getActorInfo } from "./authz.js";
import { logActivity } from "../services/index.js";
import { notFound } from "../errors.js";

const workshopCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  format: z.enum(["in_person", "online", "metaverse"]).default("online"),
  category: z.enum(["AI", "Simulation", "Leadership", "XR", "Business"]).default("AI"),
  level: z.enum(["Beginner", "Intermediate", "Advanced", "Master"]).default("Beginner"),
  creditsRequired: z.number().int().default(0),
  creditsAwarded: z.number().int().default(100),
  status: z.enum(["active", "draft", "archived"]).default("active"),
});

const enrollSchema = z.object({
  workshopId: z.string().uuid(),
});

const moduleCreateSchema = z.object({
  workshopId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  orderIndex: z.number().int().default(0),
  contentType: z.enum(["video_upload", "video_embed", "audio_upload", "ai_narration"]),
  contentUrl: z.string().optional(),
  contentText: z.string().optional(),
  durationSeconds: z.number().int().optional(),
  quizData: z.object({ questions: z.array(z.object({ prompt: z.string(), options: z.array(z.string()), correctIndex: z.number().int() })) }).optional(),
  unlockCondition: z.enum(["immediate", "completion", "time"]).default("immediate"),
  prerequisiteModuleId: z.string().uuid().optional(),
  unlockDelayHours: z.number().int().optional(),
});

const progressSchema = z.object({
  watchedSeconds: z.number().int().min(0),
  totalSeconds: z.number().int().min(0).optional(),
  enrollmentId: z.string().uuid().optional(),
});

const quizSchema = z.object({
  answers: z.array(z.number().int()),
  enrollmentId: z.string().uuid().optional(),
});

const memberProfileSchema = z.object({
  memberTypes: z.array(z.string()).optional(),
  teamAssignment: z.string().optional(),
  phone: z.string().optional(),
  organization: z.string().optional(),
  cohort: z.string().optional(),
  learningStyle: z.string().optional(),
  careerInterest: z.string().optional(),
  linkedParentUserId: z.string().optional(),
  linkedLearnerIds: z.array(z.string()).optional(),
});

const interventionSchema = z.object({
  type: z.enum(["flag", "mentor", "nudge", "coaching", "course", "badge", "escalate", "task"]),
  notes: z.string().optional(),
});

const badgeCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(["achievement", "completion", "leadership", "community", "workforce"]).default("achievement"),
  criteria: z.record(z.unknown()).optional(),
  iconUrl: z.string().optional(),
});

const badgeAwardSchema = z.object({
  memberId: z.string().min(1),
  badgeDefinitionId: z.string().uuid(),
  notes: z.string().optional(),
});

const sessionCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  workshopId: z.string().uuid().optional(),
  format: z.enum(["in_person", "online", "xr_metaverse", "hybrid"]).default("in_person"),
  timeSlot: z.enum(["morning", "afternoon", "evening", "night"]).default("morning"),
  scheduledDate: z.string(), // ISO date string
  maxCapacity: z.number().int().optional(),
  location: z.string().optional(),
});

export function lmsRoutes(db: Db) {
  const router = Router();
  const svc = lmsService(db);
  const analytics = lmsAnalyticsService(db);
  const narration = lmsNarrationService(db);

  // ──────────────────────────────────────────────
  // TECH AT NITE LEARNER DASHBOARD (real data)
  // ──────────────────────────────────────────────

  router.get("/companies/:companyId/lms/dashboard", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const [workshops, ledgerRow, enrollmentRows, certRows, profileRow] = await Promise.all([
      db.select().from(lmsWorkshops).where(eq(lmsWorkshops.companyId, companyId)).orderBy(lmsWorkshops.createdAt),
      db.select({ creditBalance: amxLedger.creditBalance, tokenBalance: amxLedger.tokenBalance }).from(amxLedger)
        .where(and(eq(amxLedger.companyId, companyId), eq(amxLedger.principalId, actorId)))
        .then(rows => rows[0] ?? null),
      db.select({ status: lmsEnrollments.status })
        .from(lmsEnrollments)
        .where(and(eq(lmsEnrollments.companyId, companyId), eq(lmsEnrollments.userId, actorId))),
      db.select({ id: amxCertificates.id })
        .from(amxCertificates)
        .where(and(eq(amxCertificates.companyId, companyId), eq(amxCertificates.responsiblePrincipalId, actorId))),
      db.select({ progressionStage: lmsMemberProfiles.progressionStage })
        .from(lmsMemberProfiles)
        .where(and(eq(lmsMemberProfiles.companyId, companyId), eq(lmsMemberProfiles.userId, actorId)))
        .then(rows => rows[0] ?? null),
    ]);

    const completed = enrollmentRows.filter(e => e.status === "completed" || e.status === "certified");
    res.json({
      workshops,
      userLevel: Math.min(Math.floor(completed.length / 2) + 1, 10),
      userCredits: ledgerRow?.creditBalance ?? 0,
      tokenBalance: ledgerRow?.tokenBalance ?? 0,
      progressionStage: profileRow?.progressionStage ?? "explorer",
      stats: {
        certificates: certRows.length,
        simulationsCompleted: completed.length,
        hoursTrained: 0,
      },
    });
  });

  // ──────────────────────────────────────────────
  // WORKSHOPS (CRUD)
  // ──────────────────────────────────────────────

  router.post("/companies/:companyId/lms/workshops", validate(workshopCreateSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const { name, description, format, category, level, creditsRequired, creditsAwarded, status } = req.body as z.infer<typeof workshopCreateSchema>;
    const [workshop] = await db.insert(lmsWorkshops).values({
      companyId,
      name,
      description,
      format,
      category,
      level,
      creditsRequired,
      creditsAwarded,
      status,
    }).returning();
    res.status(201).json(workshop);
  });

  router.patch("/companies/:companyId/lms/workshops/:workshopId", async (req, res) => {
    const { companyId, workshopId } = req.params as { companyId: string; workshopId: string };
    assertCompanyAccess(req, companyId);
    const allowed = ["name", "description", "format", "category", "level", "creditsRequired", "creditsAwarded", "status"] as const;
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(lmsWorkshops).set(updates)
      .where(and(eq(lmsWorkshops.id, workshopId), eq(lmsWorkshops.companyId, companyId)))
      .returning();
    if (!updated) throw notFound("Workshop");
    res.json(updated);
  });

  // ──────────────────────────────────────────────
  // ENROLLMENT
  // ──────────────────────────────────────────────

  router.post("/companies/:companyId/lms/enroll", validate(enrollSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);
    const enrollment = await svc.enroll(companyId, actorId, req.body.workshopId);
    res.status(201).json(enrollment);
  });

  // ──────────────────────────────────────────────
  // MODULES (CRUD + PROGRESS + QUIZ + NARRATION)
  // ──────────────────────────────────────────────

  router.get("/companies/:companyId/lms/workshops/:workshopId/modules", async (req, res) => {
    const { companyId, workshopId } = req.params as { companyId: string; workshopId: string };
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);

    const [modules, progressRows] = await Promise.all([
      db.select().from(lmsModules)
        .where(and(eq(lmsModules.workshopId, workshopId), eq(lmsModules.companyId, companyId)))
        .orderBy(lmsModules.orderIndex),
      db.select().from(lmsModuleProgress)
        .where(eq(lmsModuleProgress.memberId, actorId)),
    ]);

    const progressMap = new Map(progressRows.map(p => [p.moduleId, p]));

    // Compute unlock status for each module
    const enriched = modules.map(m => {
      const progress = progressMap.get(m.id);
      let unlocked = m.unlockCondition === "immediate";
      if (m.unlockCondition === "completion" && m.prerequisiteModuleId) {
        const prereqProgress = progressMap.get(m.prerequisiteModuleId);
        unlocked = !!prereqProgress?.completedAt;
      } else if (m.unlockCondition === "time" && m.unlockDelayHours) {
        // Would need enrollment date — simplified: unlocked if 0 delay
        unlocked = true;
      }
      return {
        ...m,
        progress: progress ?? null,
        unlocked,
      };
    });

    res.json(enriched);
  });

  router.post("/companies/:companyId/lms/modules", validate(moduleCreateSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const [module] = await db.insert(lmsModules).values({ ...req.body, companyId }).returning();
    res.status(201).json(module);
  });

  router.patch("/companies/:companyId/lms/modules/:moduleId", async (req, res) => {
    const { companyId, moduleId } = req.params as { companyId: string; moduleId: string };
    assertCompanyAccess(req, companyId);
    const [updated] = await db.update(lmsModules)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(lmsModules.id, moduleId), eq(lmsModules.companyId, companyId)))
      .returning();
    if (!updated) throw notFound("Module not found");
    res.json(updated);
  });

  router.delete("/companies/:companyId/lms/modules/:moduleId", async (req, res) => {
    const { companyId, moduleId } = req.params as { companyId: string; moduleId: string };
    assertCompanyAccess(req, companyId);
    await db.delete(lmsModules).where(and(eq(lmsModules.id, moduleId), eq(lmsModules.companyId, companyId)));
    res.status(204).end();
  });

  router.post("/companies/:companyId/lms/modules/:moduleId/progress", validate(progressSchema), async (req, res) => {
    const { companyId, moduleId } = req.params as { companyId: string; moduleId: string };
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);
    const { watchedSeconds, totalSeconds, enrollmentId } = req.body;

    const existing = await db.select().from(lmsModuleProgress)
      .where(and(eq(lmsModuleProgress.memberId, actorId), eq(lmsModuleProgress.moduleId, moduleId)))
      .then(rows => rows[0]);

    let row;
    if (existing) {
      [row] = await db.update(lmsModuleProgress)
        .set({ watchedSeconds: Math.max(existing.watchedSeconds, watchedSeconds), totalSeconds: totalSeconds ?? existing.totalSeconds, lastWatchedAt: new Date() })
        .where(eq(lmsModuleProgress.id, existing.id))
        .returning();
    } else {
      [row] = await db.insert(lmsModuleProgress).values({
        memberId: actorId,
        moduleId,
        enrollmentId: enrollmentId ?? null,
        watchedSeconds,
        totalSeconds: totalSeconds ?? null,
        lastWatchedAt: new Date(),
      }).returning();
    }

    res.json(row);
  });

  router.post("/companies/:companyId/lms/modules/:moduleId/quiz", validate(quizSchema), async (req, res) => {
    const { companyId, moduleId } = req.params as { companyId: string; moduleId: string };
    assertCompanyAccess(req, companyId);
    const { actorId } = getActorInfo(req);
    const { answers, enrollmentId } = req.body;

    const [module] = await db.select().from(lmsModules).where(eq(lmsModules.id, moduleId));
    if (!module?.quizData) return res.status(400).json({ error: "Module has no quiz." });

    const questions = (module.quizData as { questions: Array<{ correctIndex: number }> }).questions;
    const correct = answers.filter((a: number, i: number) => a === questions[i]?.correctIndex).length;
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= 70;

    const existing = await db.select().from(lmsModuleProgress)
      .where(and(eq(lmsModuleProgress.memberId, actorId), eq(lmsModuleProgress.moduleId, moduleId)))
      .then(rows => rows[0]);

    if (existing) {
      await db.update(lmsModuleProgress)
        .set({
          quizScore: Math.max(existing.quizScore ?? 0, score),
          quizAttempts: (existing.quizAttempts ?? 0) + 1,
          completedAt: passed && !existing.completedAt ? new Date() : existing.completedAt,
        })
        .where(eq(lmsModuleProgress.id, existing.id));
    } else {
      await db.insert(lmsModuleProgress).values({
        memberId: actorId,
        moduleId,
        enrollmentId: enrollmentId ?? null,
        watchedSeconds: 0,
        quizScore: score,
        quizAttempts: 1,
        completedAt: passed ? new Date() : null,
        lastWatchedAt: new Date(),
      });
    }

    res.json({ score, passed, correct, total: questions.length });
  });

  router.post("/companies/:companyId/lms/modules/:moduleId/narration", async (req, res) => {
    const { companyId, moduleId } = req.params as { companyId: string; moduleId: string };
    assertCompanyAccess(req, companyId);
    const result = await narration.generateNarration(companyId, moduleId);
    if ("error" in result) return res.status(422).json(result);
    res.json(result);
  });

  // ──────────────────────────────────────────────
  // CRM ANALYTICS COMMAND CENTER
  // ──────────────────────────────────────────────

  router.get("/companies/:companyId/lms/analytics/overview", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const overview = await analytics.getExecutiveOverview(companyId);
    res.json(overview);
  });

  // Member profiles
  router.get("/companies/:companyId/lms/members", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const roster = await analytics.getLearnerRoster(companyId);
    res.json(roster);
  });

  router.get("/companies/:companyId/lms/members/:userId", async (req, res) => {
    const { companyId, userId } = req.params as { companyId: string; userId: string };
    assertCompanyAccess(req, companyId);
    const detail = await analytics.getLearnerDetail(companyId, userId);
    if (!detail) throw notFound("Member not found");
    res.json(detail);
  });

  router.put("/companies/:companyId/lms/members/:userId/profile", validate(memberProfileSchema), async (req, res) => {
    const { companyId, userId } = req.params as { companyId: string; userId: string };
    assertCompanyAccess(req, companyId);

    const existing = await db.select().from(lmsMemberProfiles)
      .where(and(eq(lmsMemberProfiles.companyId, companyId), eq(lmsMemberProfiles.userId, userId)))
      .then(rows => rows[0]);

    let row;
    if (existing) {
      [row] = await db.update(lmsMemberProfiles)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(lmsMemberProfiles.id, existing.id))
        .returning();
    } else {
      [row] = await db.insert(lmsMemberProfiles).values({ companyId, userId, ...req.body }).returning();
    }
    res.json(row);
  });

  // Interventions
  router.post("/companies/:companyId/lms/members/:userId/interventions", validate(interventionSchema), async (req, res) => {
    const { companyId, userId } = req.params as { companyId: string; userId: string };
    assertCompanyAccess(req, companyId);
    const { actorType, actorId } = getActorInfo(req);

    const row = await analytics.createIntervention(
      companyId,
      {
        memberId: userId,
        type: req.body.type,
        notes: req.body.notes,
        createdByUserId: actorType === "user" ? actorId : undefined,
        createdByAgentId: actorType === "agent" ? actorId : undefined,
      },
      actorType,
      actorId,
    );
    res.status(201).json(row);
  });

  // Course analytics
  router.get("/companies/:companyId/lms/courses", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    res.json(await analytics.getCourseAnalytics(companyId));
  });

  // Sessions
  router.get("/companies/:companyId/lms/sessions", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const sessions = await db.select().from(lmsSessions)
      .where(eq(lmsSessions.companyId, companyId))
      .orderBy(desc(lmsSessions.scheduledDate));
    res.json(sessions);
  });

  router.post("/companies/:companyId/lms/sessions", validate(sessionCreateSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const { actorType, actorId } = getActorInfo(req);
    const [session] = await db.insert(lmsSessions).values({
      companyId,
      ...req.body,
      scheduledDate: new Date(req.body.scheduledDate),
    }).returning();
    await logActivity(db, {
      companyId,
      actorType,
      actorId,
      action: "lms.session.created",
      entityType: "lms_session",
      entityId: session!.id,
      details: { title: session!.title, format: session!.format },
    });
    res.status(201).json(session);
  });

  // Badges
  router.get("/companies/:companyId/lms/badges", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const [defs, awarded] = await Promise.all([
      db.select().from(lmsBadgeDefinitions).where(eq(lmsBadgeDefinitions.companyId, companyId)),
      db.select().from(lmsLearnerBadges).where(eq(lmsLearnerBadges.companyId, companyId)),
    ]);
    const awardCounts = defs.map(d => ({
      ...d,
      awardedCount: awarded.filter(a => a.badgeDefinitionId === d.id).length,
    }));
    res.json(awardCounts);
  });

  router.post("/companies/:companyId/lms/badges", validate(badgeCreateSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const [badge] = await db.insert(lmsBadgeDefinitions).values({ companyId, ...req.body }).returning();
    res.status(201).json(badge);
  });

  router.post("/companies/:companyId/lms/badges/award", validate(badgeAwardSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const { actorType, actorId } = getActorInfo(req);
    const [awarded] = await db.insert(lmsLearnerBadges).values({
      companyId,
      memberId: req.body.memberId,
      badgeDefinitionId: req.body.badgeDefinitionId,
      notes: req.body.notes,
      awardedByUserId: actorType === "user" ? actorId : undefined,
      awardedByAgentId: actorType === "agent" ? actorId : undefined,
    }).returning();
    await logActivity(db, {
      companyId,
      actorType,
      actorId,
      action: "lms.badge.awarded",
      entityType: "lms_member",
      entityId: req.body.memberId,
      details: { badgeDefinitionId: req.body.badgeDefinitionId },
    });
    res.status(201).json(awarded);
  });

  // XR Sessions
  router.get("/companies/:companyId/lms/xr-sessions", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    res.json(await analytics.getXrMetrics(companyId));
  });

  // Workforce readiness
  router.get("/companies/:companyId/lms/workforce", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    res.json(await analytics.getWorkforceMetrics(companyId));
  });

  // Community engagement
  router.get("/companies/:companyId/lms/community", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    res.json(await analytics.getCommunityMetrics(companyId));
  });

  // AI Agent Roles (TAZ/JAZ/RAZ/NAZ/GAZ/OPS)
  router.get("/companies/:companyId/lms/agent-roles", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const roles = await db.select().from(lmsAiAgentRoles).where(eq(lmsAiAgentRoles.companyId, companyId));
    res.json(roles);
  });

  router.post("/companies/:companyId/lms/agent-roles", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const schema = z.object({
      agentId: z.string().uuid(),
      codeName: z.enum(["TAZ", "JAZ", "RAZ", "NAZ", "GAZ", "OPS"]),
      primaryDomain: z.string(),
    });
    const parsed = schema.parse(req.body);
    const [row] = await db.insert(lmsAiAgentRoles).values({ companyId, ...parsed }).returning();
    res.status(201).json(row);
  });

  // ── Gap 1: Progression Stage Check & Advance ───────────────────────────────

  router.post("/companies/:companyId/lms/members/:userId/progression/check", async (req, res) => {
    const { companyId, userId } = req.params as { companyId: string; userId: string };
    assertCompanyAccess(req, companyId);

    const [profile] = await db.select().from(lmsMemberProfiles)
      .where(and(eq(lmsMemberProfiles.companyId, companyId), eq(lmsMemberProfiles.userId, userId)));
    if (!profile) return res.status(404).json({ error: "Member profile not found" });

    const [completions, badges, community, workforce, listings, mentorInterventions] = await Promise.all([
      db.select({ id: lmsEnrollments.id }).from(lmsEnrollments)
        .where(and(eq(lmsEnrollments.companyId, companyId), eq(lmsEnrollments.userId, userId), eq(lmsEnrollments.status, "completed"))),
      db.select({ id: lmsLearnerBadges.id }).from(lmsLearnerBadges)
        .where(and(eq(lmsLearnerBadges.companyId, companyId), eq(lmsLearnerBadges.memberId, userId))),
      db.select({ id: lmsCommunityActivity.id }).from(lmsCommunityActivity)
        .where(and(eq(lmsCommunityActivity.companyId, companyId), eq(lmsCommunityActivity.memberId, userId))),
      db.select({ internshipReady: lmsWorkforceProfiles.internshipReady }).from(lmsWorkforceProfiles)
        .where(and(eq(lmsWorkforceProfiles.companyId, companyId), eq(lmsWorkforceProfiles.memberId, userId)))
        .then(rows => rows[0] ?? null),
      db.select({ id: lmsMarketplaceListings.id }).from(lmsMarketplaceListings)
        .where(and(eq(lmsMarketplaceListings.companyId, companyId), eq(lmsMarketplaceListings.memberId, userId), eq(lmsMarketplaceListings.isActive, 1))),
      db.select({ id: lmsInterventions.id }).from(lmsInterventions)
        .where(and(eq(lmsInterventions.companyId, companyId), eq(lmsInterventions.createdByUserId, userId), eq(lmsInterventions.type, "mentor"))),
    ]);

    const completionCount = completions.length;
    const badgeCount = badges.length;
    const hasCommunity = community.length > 0;
    const isInternshipReady = workforce?.internshipReady === 1;
    const hasListing = listings.length > 0;
    const hasMentored = mentorInterventions.length > 0;
    const { engagementScore } = profile;

    const stages = ["explorer", "builder", "ambassador", "earner", "leader"] as const;
    function computeStage(): typeof stages[number] {
      if (engagementScore >= 85 && hasMentored && hasListing && isInternshipReady && badgeCount >= 1 && completionCount >= 5 && hasCommunity) return "leader";
      if (hasListing && isInternshipReady && completionCount >= 5 && badgeCount >= 1 && hasCommunity) return "earner";
      if (completionCount >= 5 && badgeCount >= 1 && hasCommunity) return "ambassador";
      if (completionCount >= 2 || engagementScore >= 50) return "builder";
      return "explorer";
    }

    const newStage = computeStage();
    const currentIdx = stages.indexOf(profile.progressionStage as typeof stages[number]);
    const newIdx = stages.indexOf(newStage);
    const advanced = newIdx > currentIdx;

    if (advanced) {
      await db.update(lmsMemberProfiles)
        .set({ progressionStage: newStage, updatedAt: new Date() })
        .where(and(eq(lmsMemberProfiles.companyId, companyId), eq(lmsMemberProfiles.userId, userId)));
    }

    const nextStageMap: Record<string, { stage: string; criteria: string }> = {
      explorer: { stage: "builder", criteria: "Complete 2 workshops or reach engagement score 50" },
      builder: { stage: "ambassador", criteria: "Complete 5 workshops, earn 1 badge, and log community activity" },
      ambassador: { stage: "earner", criteria: "Be internship-ready and create a marketplace listing" },
      earner: { stage: "leader", criteria: "Reach engagement score 85 and mentor other members" },
      leader: { stage: "leader", criteria: "You have reached the highest stage" },
    };

    res.json({
      stage: advanced ? newStage : profile.progressionStage,
      advanced,
      previousStage: profile.progressionStage,
      criteria: { completionCount, badgeCount, hasCommunity, isInternshipReady, hasListing, hasMentored, engagementScore },
      nextStage: nextStageMap[newStage] ?? null,
    });
  });

  // ── Gap 2: Leaderboard ─────────────────────────────────────────────────────

  router.get("/companies/:companyId/lms/leaderboard", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 50);

    const [profiles, enrollments, badges, community] = await Promise.all([
      db.select().from(lmsMemberProfiles).where(eq(lmsMemberProfiles.companyId, companyId)),
      db.select({ userId: lmsEnrollments.userId }).from(lmsEnrollments)
        .where(and(eq(lmsEnrollments.companyId, companyId), eq(lmsEnrollments.status, "completed"))),
      db.select({ memberId: lmsLearnerBadges.memberId }).from(lmsLearnerBadges)
        .where(eq(lmsLearnerBadges.companyId, companyId)),
      db.select({ memberId: lmsCommunityActivity.memberId, durationMinutes: lmsCommunityActivity.durationMinutes })
        .from(lmsCommunityActivity).where(eq(lmsCommunityActivity.companyId, companyId)),
    ]);

    const completionsByUser = new Map<string, number>();
    for (const e of enrollments) completionsByUser.set(e.userId, (completionsByUser.get(e.userId) ?? 0) + 1);
    const badgesByUser = new Map<string, number>();
    for (const b of badges) badgesByUser.set(b.memberId, (badgesByUser.get(b.memberId) ?? 0) + 1);
    const communityMinsByUser = new Map<string, number>();
    for (const c of community) communityMinsByUser.set(c.memberId, (communityMinsByUser.get(c.memberId) ?? 0) + c.durationMinutes);

    const ranked = profiles
      .map(p => {
        const completions = completionsByUser.get(p.userId) ?? 0;
        const badgeCount = badgesByUser.get(p.userId) ?? 0;
        const communityMins = communityMinsByUser.get(p.userId) ?? 0;
        const totalScore = p.engagementScore * 2 + completions * 10 + badgeCount * 15 + Math.floor(communityMins / 60) * 5;
        return { userId: p.userId, progressionStage: p.progressionStage, engagementScore: p.engagementScore, completions, badgeCount, totalScore };
      })
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit)
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    res.json(ranked);
  });

  // ── Gap 3: Marketplace Listings & Bookings ─────────────────────────────────

  router.get("/companies/:companyId/lms/marketplace/listings", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const rows = await db.select().from(lmsMarketplaceListings)
      .where(and(eq(lmsMarketplaceListings.companyId, companyId), eq(lmsMarketplaceListings.isActive, 1)))
      .orderBy(desc(lmsMarketplaceListings.createdAt));
    res.json(rows);
  });

  const listingCreateSchema = z.object({
    memberId: z.string().min(1),
    displayName: z.string().min(1),
    title: z.string().min(1),
    bio: z.string().optional(),
    skills: z.array(z.string()).default([]),
    hourlyRateSims: z.number().int().min(0).default(50),
    availability: z.enum(["available", "busy", "on_project"]).default("available"),
  });

  router.post("/companies/:companyId/lms/marketplace/listings", validate(listingCreateSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const body = req.body as z.infer<typeof listingCreateSchema>;
    const [row] = await db.insert(lmsMarketplaceListings).values({ companyId, ...body }).returning();
    res.status(201).json(row);
  });

  const listingUpdateSchema = z.object({
    displayName: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    bio: z.string().optional(),
    skills: z.array(z.string()).optional(),
    hourlyRateSims: z.number().int().min(0).optional(),
    availability: z.enum(["available", "busy", "on_project"]).optional(),
    isActive: z.union([z.literal(0), z.literal(1)]).optional(),
  });

  // Admin-gated: a listing is a public storefront entry (visible to anyone
  // booking through the marketplace), so editing/deactivating someone else's
  // listing is a moderation action, not a self-service one.
  router.patch("/companies/:companyId/lms/marketplace/listings/:listingId", validate(listingUpdateSchema), async (req, res) => {
    const { companyId, listingId } = req.params as { companyId: string; listingId: string };
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "admin");
    const body = req.body as z.infer<typeof listingUpdateSchema>;

    const [row] = await db.update(lmsMarketplaceListings)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(lmsMarketplaceListings.id, listingId), eq(lmsMarketplaceListings.companyId, companyId)))
      .returning();

    if (!row) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    res.json(row);
  });

  // No hard DELETE — deactivating (isActive: 0) via PATCH above preserves the
  // listing's booking history (lmsMarketplaceBookings.listingId references it).

  const bookingCreateSchema = z.object({
    listingId: z.string().uuid(),
    clientMemberId: z.string().min(1),
    projectTitle: z.string().min(1),
    description: z.string().optional(),
    budgetSims: z.number().int().min(0).default(0),
    // One of MARKETPLACE_PHASE_MULTIPLIERS' keys (@paperclipai/shared); optional
    // since not every caller prices a hire by phase.
    phase: z.string().optional(),
  });

  router.post("/companies/:companyId/lms/marketplace/bookings", validate(bookingCreateSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const body = req.body as z.infer<typeof bookingCreateSchema>;

    // Deduct tokens from client if budgetSims > 0
    if (body.budgetSims > 0) {
      const [clientLedger] = await db.select().from(amxLedger)
        .where(and(eq(amxLedger.companyId, companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, body.clientMemberId)));

      if (!clientLedger || clientLedger.tokenBalance < body.budgetSims) {
        res.status(402).json({ error: "Insufficient token balance" });
        return;
      }

      await db.update(amxLedger)
        .set({ tokenBalance: clientLedger.tokenBalance - body.budgetSims, updatedAt: new Date() })
        .where(and(eq(amxLedger.companyId, companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, body.clientMemberId)));

      await db.insert(amxTransactions).values({
        fromCompanyId: companyId,
        toCompanyId: companyId,
        fromPrincipalType: "user",
        fromPrincipalId: body.clientMemberId,
        toPrincipalType: "system",
        toPrincipalId: "marketplace-escrow",
        amount: body.budgetSims,
        currency: "AMX",
        transactionType: "marketplace_booking",
        status: "completed",
        metadata: { projectTitle: body.projectTitle },
      });
    }

    const [row] = await db.insert(lmsMarketplaceBookings).values({ companyId, ...body }).returning();
    res.status(201).json(row);
  });

  const bookingUpdateSchema = z.object({
    status: z.enum(["pending", "active", "completed", "cancelled"]),
  });

  router.patch("/companies/:companyId/lms/marketplace/bookings/:bookingId", validate(bookingUpdateSchema), async (req, res) => {
    const { companyId, bookingId } = req.params as { companyId: string; bookingId: string };
    assertCompanyAccess(req, companyId);
    const { status } = req.body as z.infer<typeof bookingUpdateSchema>;

    const [booking] = await db.select().from(lmsMarketplaceBookings)
      .where(and(eq(lmsMarketplaceBookings.id, bookingId), eq(lmsMarketplaceBookings.companyId, companyId)))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    await db.update(lmsMarketplaceBookings)
      .set({ status, ...(status === "completed" ? { completedAt: new Date() } : {}) })
      .where(eq(lmsMarketplaceBookings.id, bookingId));

    // On completion, credit tokens to earner
    if (status === "completed" && booking.budgetSims > 0) {
      const [listingRow] = await db.select({ memberId: lmsMarketplaceListings.memberId })
        .from(lmsMarketplaceListings)
        .where(eq(lmsMarketplaceListings.id, booking.listingId))
        .limit(1);

      const earnerMemberId = listingRow?.memberId;
      if (earnerMemberId) {
        const [earnerLedger] = await db.select().from(amxLedger)
          .where(and(eq(amxLedger.companyId, companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, earnerMemberId)));

        if (earnerLedger) {
          await db.update(amxLedger)
            .set({ tokenBalance: earnerLedger.tokenBalance + booking.budgetSims, updatedAt: new Date() })
            .where(and(eq(amxLedger.companyId, companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, earnerMemberId)));
        } else {
          await db.insert(amxLedger).values({
            companyId,
            principalType: "user",
            principalId: earnerMemberId,
            creditBalance: 0,
            tokenBalance: booking.budgetSims,
          });
        }

        await db.insert(amxTransactions).values({
          fromCompanyId: companyId,
          toCompanyId: companyId,
          fromPrincipalType: "system",
          fromPrincipalId: "marketplace-escrow",
          toPrincipalType: "user",
          toPrincipalId: earnerMemberId,
          amount: booking.budgetSims,
          currency: "AMX",
          transactionType: "marketplace_booking",
          status: "completed",
          metadata: { bookingId, projectTitle: booking.projectTitle },
        });
      }
    }

    const [updated] = await db.select().from(lmsMarketplaceBookings)
      .where(eq(lmsMarketplaceBookings.id, bookingId)).limit(1);
    res.json(updated);
  });

  /**
   * GET /api/companies/:companyId/lms/marketplace/listings/:listingId/earnings-by-phase
   * Groups a listing's completed bookings by run phase — powers the profile
   * page's earnings breakdown. Bookings created before the `phase` column
   * existed fall into a `phase: null` ("unspecified") bucket rather than
   * being dropped.
   */
  router.get("/companies/:companyId/lms/marketplace/listings/:listingId/earnings-by-phase", async (req, res) => {
    const { companyId, listingId } = req.params as { companyId: string; listingId: string };
    assertCompanyAccess(req, companyId);

    const [listing] = await db.select({ id: lmsMarketplaceListings.id })
      .from(lmsMarketplaceListings)
      .where(and(eq(lmsMarketplaceListings.id, listingId), eq(lmsMarketplaceListings.companyId, companyId)))
      .limit(1);
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const rows = await db
      .select({
        phase: lmsMarketplaceBookings.phase,
        totalSims: sql<number>`coalesce(sum(${lmsMarketplaceBookings.budgetSims}), 0)::int`,
        bookingCount: sql<number>`count(*)::int`,
      })
      .from(lmsMarketplaceBookings)
      .where(and(
        eq(lmsMarketplaceBookings.listingId, listingId),
        eq(lmsMarketplaceBookings.companyId, companyId),
        eq(lmsMarketplaceBookings.status, "completed"),
      ))
      .groupBy(lmsMarketplaceBookings.phase);

    res.json(rows);
  });

  // ── Gap 4: Earn Route ──────────────────────────────────────────────────────

  const earnSchema = z.object({
    principalId: z.string().min(1),
    amount: z.number().int().min(1),
    currency: z.enum(["CREDIT", "AMX"]).default("CREDIT"),
    transactionType: z.enum(["learning_workshop", "quiz_bonus", "community_activity", "mentor_session", "marketplace_booking"]).default("learning_workshop"),
    metadata: z.record(z.unknown()).optional(),
  });

  router.post("/companies/:companyId/lms/earn", validate(earnSchema), async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);
    const { principalId, amount, currency, transactionType, metadata } = req.body as z.infer<typeof earnSchema>;
    const isCredit = currency === "CREDIT";

    const [tx] = await db.insert(amxTransactions).values({
      fromCompanyId: companyId,
      toCompanyId: companyId,
      fromPrincipalType: "system",
      fromPrincipalId: "lms-earn",
      toPrincipalType: "user",
      toPrincipalId: principalId,
      amount,
      currency,
      transactionType,
      status: "completed",
      metadata: metadata ?? {},
    }).returning();

    const [existing] = await db.select().from(amxLedger)
      .where(and(eq(amxLedger.companyId, companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, principalId)));

    if (existing) {
      await db.update(amxLedger)
        .set(isCredit
          ? { creditBalance: existing.creditBalance + amount, updatedAt: new Date() }
          : { tokenBalance: existing.tokenBalance + amount, updatedAt: new Date() })
        .where(and(eq(amxLedger.companyId, companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, principalId)));
    } else {
      await db.insert(amxLedger).values({
        companyId,
        principalType: "user",
        principalId,
        creditBalance: isCredit ? amount : 0,
        tokenBalance: isCredit ? 0 : amount,
      });
    }

    res.status(201).json({ transaction: tx, awarded: amount, currency });
  });

  return router;
}
