import { and, desc, eq, sql, inArray, gte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  authUsers,
  lmsMemberProfiles,
  lmsEnrollments,
  lmsModuleProgress,
  lmsBadgeDefinitions,
  lmsLearnerBadges,
  lmsXrSessions,
  lmsCommunityActivity,
  lmsWorkforceProfiles,
  lmsInterventions,
  lmsSessions,
  lmsSessionAttendance,
  lmsAiAgentRoles,
  amxCertificates,
  heartbeatRuns,
  agentChatMessages,
  lmsWorkshops,
  lmsModules,
} from "@paperclipai/db";
import { logActivity } from "./activity-log.js";

export interface LmsOverview {
  activeLearners: number;
  totalMembers: number;
  totalEnrollments: number;
  completionRate: number;
  badgesIssued: number;
  certificatesEarned: number;
  xrSessions: number;
  aiActivityRuns: number;
  workforcePlaced: number;
  volunteerHours: number;
  mentoringHours: number;
  communityProjects: number;
}

export interface LearnerRosterItem {
  userId: string;
  name: string;
  email: string;
  memberTypes: string[];
  teamAssignment: string | null;
  engagementScore: number;
  riskLevel: string;
  progressionStage: string;
  enrollmentCount: number;
  completedCourses: number;
  badgeCount: number;
  lastActive: string | null;
}

export interface LearnerDetail extends LearnerRosterItem {
  phone: string | null;
  organization: string | null;
  cohort: string | null;
  learningStyle: string | null;
  careerInterest: string | null;
  enrollments: Array<{
    id: string;
    workshopName: string;
    status: string;
    progress: number;
    score: number | null;
    enrolledAt: string;
    completedAt: string | null;
  }>;
  badges: Array<{
    id: string;
    name: string;
    category: string;
    awardedAt: string;
  }>;
  interventions: Array<{
    id: string;
    type: string;
    notes: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  xrSessionCount: number;
  communityMinutes: number;
}

export interface CourseAnalytics {
  workshopId: string;
  name: string;
  format: string;
  enrollmentCount: number;
  completionCount: number;
  completionRate: number;
  avgScore: number | null;
  avgProgress: number;
  sessionCount: number;
}

export interface InterventionInput {
  memberId: string;
  type: string;
  notes?: string;
  createdByUserId?: string;
  createdByAgentId?: string;
}

/** Compute engagement score (0–100) from weighted signals */
export function computeEngagementScore(opts: {
  sessionAttendanceCount: number;
  completedModules: number;
  totalModules: number;
  aiSessions: number;
  xrSessions: number;
  communityMinutes: number;
  mentorFeedbacks: number;
}): number {
  const { sessionAttendanceCount, completedModules, totalModules, aiSessions, xrSessions, communityMinutes, mentorFeedbacks } = opts;

  // Session frequency: 20% weight, saturates at 10 sessions
  const sessionScore = Math.min(sessionAttendanceCount / 10, 1) * 20;
  // Assignment completion: 25% weight
  const assignScore = totalModules > 0 ? (completedModules / totalModules) * 25 : 0;
  // AI interaction: 20% weight, saturates at 20 sessions
  const aiScore = Math.min(aiSessions / 20, 1) * 20;
  // Collaboration/community: 10% weight, saturates at 120 min
  const collabScore = Math.min(communityMinutes / 120, 1) * 10;
  // XR activity: 15% weight, saturates at 5 sessions
  const xrScore = Math.min(xrSessions / 5, 1) * 15;
  // Mentor feedback: 10% weight, saturates at 3 feedbacks
  const mentorScore = Math.min(mentorFeedbacks / 3, 1) * 10;

  return Math.round(sessionScore + assignScore + aiScore + collabScore + xrScore + mentorScore);
}

/** Compute risk level based on spec rules */
export function computeRiskLevel(opts: {
  daysSinceLogin: number | null;
  avgScore: number | null;
  failedAssessments: number;
  engagementScore: number;
  xrSessions: number;
  mentorContacts: number;
}): "green" | "yellow" | "orange" | "red" | "critical" {
  const { daysSinceLogin, avgScore, failedAssessments, engagementScore, xrSessions, mentorContacts } = opts;

  let riskPoints = 0;

  if (daysSinceLogin !== null && daysSinceLogin >= 7) riskPoints += 2;
  if (avgScore !== null && avgScore < 70) riskPoints += 2;
  if (failedAssessments >= 2) riskPoints += 1;
  if (engagementScore < 30) riskPoints += 2;
  if (xrSessions === 0) riskPoints += 1;
  if (mentorContacts === 0) riskPoints += 1;

  if (riskPoints >= 7) return "critical";
  if (riskPoints >= 5) return "red";
  if (riskPoints >= 3) return "orange";
  if (riskPoints >= 1) return "yellow";
  return "green";
}

export function lmsAnalyticsService(db: Db) {
  /** Executive Overview KPIs — real data only */
  async function getExecutiveOverview(companyId: string): Promise<LmsOverview> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      memberRows,
      enrollmentRows,
      badgeRows,
      certRows,
      xrRows,
      communityRows,
      workforceRows,
      aiAgentRows,
    ] = await Promise.all([
      db.select({ userId: lmsMemberProfiles.userId, types: lmsMemberProfiles.memberTypes })
        .from(lmsMemberProfiles)
        .where(eq(lmsMemberProfiles.companyId, companyId)),

      db.select({ status: lmsEnrollments.status })
        .from(lmsEnrollments)
        .where(eq(lmsEnrollments.companyId, companyId)),

      db.select({ id: lmsLearnerBadges.id })
        .from(lmsLearnerBadges)
        .where(eq(lmsLearnerBadges.companyId, companyId)),

      db.select({ id: amxCertificates.id })
        .from(amxCertificates)
        .where(eq(amxCertificates.companyId, companyId)),

      db.select({ id: lmsXrSessions.id })
        .from(lmsXrSessions)
        .where(eq(lmsXrSessions.companyId, companyId)),

      db.select({ activityType: lmsCommunityActivity.activityType, durationMinutes: lmsCommunityActivity.durationMinutes })
        .from(lmsCommunityActivity)
        .where(eq(lmsCommunityActivity.companyId, companyId)),

      db.select({ placementStatus: lmsWorkforceProfiles.placementStatus })
        .from(lmsWorkforceProfiles)
        .where(eq(lmsWorkforceProfiles.companyId, companyId)),

      db.select({ agentId: lmsAiAgentRoles.agentId })
        .from(lmsAiAgentRoles)
        .where(eq(lmsAiAgentRoles.companyId, companyId)),
    ]);

    const activeLearners = memberRows.filter(m => (m.types as string[]).includes("learner")).length;
    const completed = enrollmentRows.filter(e => e.status === "completed" || e.status === "certified").length;
    const completionRate = enrollmentRows.length > 0 ? Math.round((completed / enrollmentRows.length) * 100) : 0;
    const workforcePlaced = workforceRows.filter(w => w.placementStatus === "employed" || w.placementStatus === "placed").length;
    const volunteerHours = Math.round(
      communityRows.filter(c => c.activityType === "volunteer").reduce((s, c) => s + (c.durationMinutes ?? 0), 0) / 60
    );
    const mentoringHours = Math.round(
      communityRows.filter(c => c.activityType === "mentoring").reduce((s, c) => s + (c.durationMinutes ?? 0), 0) / 60
    );
    const communityProjects = communityRows.filter(c => c.activityType === "community_project" || c.activityType === "neighborhood_project").length;

    // AI activity: count runs by named LMS agents in last 7 days
    let aiActivityRuns = 0;
    if (aiAgentRows.length > 0) {
      const agentIds = aiAgentRows.map(r => r.agentId);
      const runRows = await db.select({ id: heartbeatRuns.id })
        .from(heartbeatRuns)
        .where(
          and(
            inArray(heartbeatRuns.agentId, agentIds),
            gte(heartbeatRuns.startedAt, sevenDaysAgo)
          )
        );
      aiActivityRuns = runRows.length;
    }

    return {
      activeLearners,
      totalMembers: memberRows.length,
      totalEnrollments: enrollmentRows.length,
      completionRate,
      badgesIssued: badgeRows.length,
      certificatesEarned: certRows.length,
      xrSessions: xrRows.length,
      aiActivityRuns,
      workforcePlaced,
      volunteerHours,
      mentoringHours,
      communityProjects,
    };
  }

  /** Learner roster with computed engagement score and risk */
  async function getLearnerRoster(companyId: string): Promise<LearnerRosterItem[]> {
    const members = await db.select()
      .from(lmsMemberProfiles)
      .where(eq(lmsMemberProfiles.companyId, companyId))
      .orderBy(desc(lmsMemberProfiles.engagementScore));

    if (members.length === 0) return [];

    const userIds = members.map(m => m.userId);

    const [users, enrollments, badges] = await Promise.all([
      db.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
        .from(authUsers)
        .where(inArray(authUsers.id, userIds)),

      db.select({ userId: lmsEnrollments.userId, status: lmsEnrollments.status, completedAt: lmsEnrollments.completedAt })
        .from(lmsEnrollments)
        .where(eq(lmsEnrollments.companyId, companyId)),

      db.select({ memberId: lmsLearnerBadges.memberId, id: lmsLearnerBadges.id })
        .from(lmsLearnerBadges)
        .where(eq(lmsLearnerBadges.companyId, companyId)),
    ]);

    const userMap = new Map(users.map(u => [u.id, u]));
    const badgeByMember = badges.reduce((acc, b) => {
      const list = acc.get(b.memberId) ?? [];
      list.push(b.id);
      acc.set(b.memberId, list);
      return acc;
    }, new Map<string, string[]>());

    return members.map(m => {
      const user = userMap.get(m.userId);
      const memberEnrollments = enrollments.filter(e => e.userId === m.userId);
      const completed = memberEnrollments.filter(e => e.status === "completed" || e.status === "certified");
      const lastEnrolled = memberEnrollments.sort((a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
      )[0];
      return {
        userId: m.userId,
        name: user?.name ?? "Unknown",
        email: user?.email ?? "",
        memberTypes: m.memberTypes as string[],
        teamAssignment: m.teamAssignment,
        engagementScore: m.engagementScore,
        riskLevel: m.riskLevel,
        progressionStage: m.progressionStage,
        enrollmentCount: memberEnrollments.length,
        completedCourses: completed.length,
        badgeCount: (badgeByMember.get(m.userId) ?? []).length,
        lastActive: lastEnrolled?.completedAt?.toISOString() ?? null,
      };
    });
  }

  /** Full learner detail — identity + timeline + achievements + interventions */
  async function getLearnerDetail(companyId: string, userId: string): Promise<LearnerDetail | null> {
    const [profile] = await db.select()
      .from(lmsMemberProfiles)
      .where(and(eq(lmsMemberProfiles.companyId, companyId), eq(lmsMemberProfiles.userId, userId)));

    if (!profile) return null;

    const [users, enrollRows, badgeRows, interventionRows, xrRows, communityRows] = await Promise.all([
      db.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
        .from(authUsers)
        .where(eq(authUsers.id, userId)),

      db.select({
        id: lmsEnrollments.id,
        workshopId: lmsEnrollments.workshopId,
        status: lmsEnrollments.status,
        progress: lmsEnrollments.progress,
        score: lmsEnrollments.score,
        enrolledAt: lmsEnrollments.enrolledAt,
        completedAt: lmsEnrollments.completedAt,
        workshopName: lmsWorkshops.name,
      })
        .from(lmsEnrollments)
        .leftJoin(lmsWorkshops, eq(lmsEnrollments.workshopId, lmsWorkshops.id))
        .where(and(eq(lmsEnrollments.companyId, companyId), eq(lmsEnrollments.userId, userId))),

      db.select({
        id: lmsLearnerBadges.id,
        name: lmsBadgeDefinitions.name,
        category: lmsBadgeDefinitions.category,
        awardedAt: lmsLearnerBadges.awardedAt,
      })
        .from(lmsLearnerBadges)
        .innerJoin(lmsBadgeDefinitions, eq(lmsLearnerBadges.badgeDefinitionId, lmsBadgeDefinitions.id))
        .where(and(eq(lmsLearnerBadges.companyId, companyId), eq(lmsLearnerBadges.memberId, userId))),

      db.select()
        .from(lmsInterventions)
        .where(and(eq(lmsInterventions.companyId, companyId), eq(lmsInterventions.memberId, userId)))
        .orderBy(desc(lmsInterventions.createdAt)),

      db.select({ id: lmsXrSessions.id })
        .from(lmsXrSessions)
        .where(and(eq(lmsXrSessions.companyId, companyId), eq(lmsXrSessions.memberId, userId))),

      db.select({ durationMinutes: lmsCommunityActivity.durationMinutes })
        .from(lmsCommunityActivity)
        .where(and(eq(lmsCommunityActivity.companyId, companyId), eq(lmsCommunityActivity.memberId, userId))),
    ]);

    const user = users[0];
    const memberEnrollments = enrollRows;
    const completed = memberEnrollments.filter(e => e.status === "completed" || e.status === "certified");

    return {
      userId,
      name: user?.name ?? "Unknown",
      email: user?.email ?? "",
      memberTypes: profile.memberTypes as string[],
      teamAssignment: profile.teamAssignment,
      engagementScore: profile.engagementScore,
      riskLevel: profile.riskLevel,
      progressionStage: profile.progressionStage,
      enrollmentCount: memberEnrollments.length,
      completedCourses: completed.length,
      badgeCount: badgeRows.length,
      lastActive: null,
      phone: profile.phone,
      organization: profile.organization,
      cohort: profile.cohort,
      learningStyle: profile.learningStyle,
      careerInterest: profile.careerInterest,
      enrollments: enrollRows.map(e => ({
        id: e.id,
        workshopName: e.workshopName ?? "Unknown Workshop",
        status: e.status,
        progress: e.progress,
        score: e.score,
        enrolledAt: e.enrolledAt.toISOString(),
        completedAt: e.completedAt?.toISOString() ?? null,
      })),
      badges: badgeRows.map(b => ({
        id: b.id,
        name: b.name,
        category: b.category ?? "achievement",
        awardedAt: b.awardedAt.toISOString(),
      })),
      interventions: interventionRows.map(i => ({
        id: i.id,
        type: i.type,
        notes: i.notes,
        createdAt: i.createdAt.toISOString(),
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
      })),
      xrSessionCount: xrRows.length,
      communityMinutes: communityRows.reduce((s, r) => s + (r.durationMinutes ?? 0), 0),
    };
  }

  /** Per-workshop course analytics */
  async function getCourseAnalytics(companyId: string): Promise<CourseAnalytics[]> {
    const workshops = await db.select()
      .from(lmsWorkshops)
      .where(eq(lmsWorkshops.companyId, companyId));

    if (workshops.length === 0) return [];

    const [enrollments, sessions] = await Promise.all([
      db.select({ workshopId: lmsEnrollments.workshopId, status: lmsEnrollments.status, score: lmsEnrollments.score, progress: lmsEnrollments.progress })
        .from(lmsEnrollments)
        .where(eq(lmsEnrollments.companyId, companyId)),

      db.select({ workshopId: lmsSessions.workshopId, id: lmsSessions.id })
        .from(lmsSessions)
        .where(eq(lmsSessions.companyId, companyId)),
    ]);

    return workshops.map(w => {
      const wEnrollments = enrollments.filter(e => e.workshopId === w.id);
      const completed = wEnrollments.filter(e => e.status === "completed" || e.status === "certified");
      const scores = completed.filter(e => e.score !== null).map(e => e.score as number);
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
      const avgProgress = wEnrollments.length > 0
        ? Math.round(wEnrollments.reduce((s, e) => s + e.progress, 0) / wEnrollments.length)
        : 0;
      const sessionCount = sessions.filter(s => s.workshopId === w.id).length;

      return {
        workshopId: w.id,
        name: w.name,
        format: w.format,
        enrollmentCount: wEnrollments.length,
        completionCount: completed.length,
        completionRate: wEnrollments.length > 0 ? Math.round((completed.length / wEnrollments.length) * 100) : 0,
        avgScore,
        avgProgress,
        sessionCount,
      };
    });
  }

  /** Create an intervention and log the activity */
  async function createIntervention(
    companyId: string,
    data: InterventionInput,
    actorType: "user" | "agent",
    actorId: string,
  ) {
    const [row] = await db.insert(lmsInterventions).values({
      companyId,
      memberId: data.memberId,
      type: data.type,
      notes: data.notes,
      createdByUserId: data.createdByUserId,
      createdByAgentId: data.createdByAgentId as string | undefined,
    }).returning();

    await logActivity(db, {
      companyId,
      actorType,
      actorId,
      action: "lms.intervention.created",
      entityType: "lms_member",
      entityId: data.memberId,
      details: { interventionId: row!.id, type: data.type },
    });

    return row;
  }

  /** Workforce readiness aggregate */
  async function getWorkforceMetrics(companyId: string) {
    const profiles = await db.select()
      .from(lmsWorkforceProfiles)
      .where(eq(lmsWorkforceProfiles.companyId, companyId));

    const byStatus = profiles.reduce((acc, p) => {
      acc[p.placementStatus] = (acc[p.placementStatus] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgResume = profiles.length > 0
      ? Math.round(profiles.reduce((s, p) => s + p.resumeComplete, 0) / profiles.length)
      : 0;
    const avgPortfolio = profiles.length > 0
      ? Math.round(profiles.reduce((s, p) => s + p.portfolioScore, 0) / profiles.length)
      : 0;

    return { total: profiles.length, byStatus, avgResume, avgPortfolio, profiles };
  }

  /** Community engagement aggregate */
  async function getCommunityMetrics(companyId: string) {
    const activities = await db.select()
      .from(lmsCommunityActivity)
      .where(eq(lmsCommunityActivity.companyId, companyId));

    const byType = activities.reduce((acc, a) => {
      acc[a.activityType] = (acc[a.activityType] ?? 0) + (a.durationMinutes ?? 0);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalActivities: activities.length,
      volunteerHours: Math.round((byType["volunteer"] ?? 0) / 60),
      mentoringHours: Math.round((byType["mentoring"] ?? 0) / 60),
      communityProjects: activities.filter(a => a.activityType === "community_project").length,
      innovationChallenges: activities.filter(a => a.activityType === "innovation_challenge").length,
      hackathons: activities.filter(a => a.activityType === "hackathon").length,
      byType,
    };
  }

  /** XR session aggregate */
  async function getXrMetrics(companyId: string) {
    const sessions = await db.select()
      .from(lmsXrSessions)
      .where(eq(lmsXrSessions.companyId, companyId))
      .orderBy(desc(lmsXrSessions.recordedAt));

    const totalDuration = sessions.reduce((s, r) => s + r.sessionDurationSeconds, 0);
    const totalWorldVisits = sessions.reduce((s, r) => s + r.worldVisits, 0);
    const totalSimulations = sessions.reduce((s, r) => s + r.simulationsCompleted, 0);

    return {
      totalSessions: sessions.length,
      totalDurationMinutes: Math.round(totalDuration / 60),
      totalWorldVisits,
      totalSimulations,
      sessions: sessions.slice(0, 50),
    };
  }

  return {
    getExecutiveOverview,
    getLearnerRoster,
    getLearnerDetail,
    getCourseAnalytics,
    createIntervention,
    getWorkforceMetrics,
    getCommunityMetrics,
    getXrMetrics,
    computeEngagementScore,
    computeRiskLevel,
  };
}
