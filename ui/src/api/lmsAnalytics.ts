import { api } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────

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

export type ProgressionStage = "explorer" | "builder" | "ambassador" | "earner" | "leader";

export interface LearnerRosterItem {
  userId: string;
  name: string;
  email: string;
  memberTypes: string[];
  teamAssignment: string | null;
  engagementScore: number;
  riskLevel: "green" | "yellow" | "orange" | "red" | "critical";
  progressionStage?: ProgressionStage;
  enrollmentCount: number;
  completedCourses: number;
  badgeCount: number;
  lastActive: string | null;
}

export interface ProgressionCheckResult {
  stage: ProgressionStage;
  advanced: boolean;
  previousStage: ProgressionStage;
  criteria: {
    completionCount: number;
    badgeCount: number;
    hasCommunity: boolean;
    isInternshipReady: boolean;
    hasListing: boolean;
    hasMentored: boolean;
    engagementScore: number;
  };
  nextStage: { stage: string; criteria: string } | null;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  progressionStage: ProgressionStage;
  engagementScore: number;
  completions: number;
  badgeCount: number;
  totalScore: number;
}

export interface MarketplaceListing {
  id: string;
  companyId: string;
  memberId: string;
  displayName: string;
  title: string;
  bio: string | null;
  skills: string[];
  hourlyRateSims: number;
  availability: string;
  rating: number;
  reviewCount: number;
  projectsCompleted: number;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceBooking {
  id: string;
  companyId: string;
  listingId: string;
  clientMemberId: string;
  projectTitle: string;
  description: string | null;
  budgetSims: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

export interface LearnerDetail extends LearnerRosterItem {
  phone: string | null;
  organization: string | null;
  cohort: string | null;
  learningStyle: string | null;
  careerInterest: string | null;
  partnerStatus: string | null;
  ambassadorStatus: string | null;
  marketplaceRevenue: number;
  donationAmount: number;
  sponsorshipTier: string | null;
  enrollments: Array<{
    id: string;
    workshopName: string;
    status: string;
    progress: number;
    score: number | null;
    enrolledAt: string;
    completedAt: string | null;
  }>;
  badges: Array<{ id: string; name: string; category: string; awardedAt: string }>;
  interventions: Array<{ id: string; type: string; notes: string | null; createdAt: string; resolvedAt: string | null }>;
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

export interface BadgeDefinition {
  id: string;
  companyId: string;
  name: string;
  description: string;
  category: string;
  iconUrl: string | null;
  awardedCount: number;
  createdAt: string;
}

export interface XrMetrics {
  totalSessions: number;
  totalDurationMinutes: number;
  totalWorldVisits: number;
  totalSimulations: number;
  sessions: Array<{
    id: string;
    memberId: string;
    sessionDurationSeconds: number;
    worldVisits: number;
    simulationsCompleted: number;
    recordedAt: string;
  }>;
}

export interface WorkforceMetrics {
  total: number;
  byStatus: Record<string, number>;
  avgResume: number;
  avgPortfolio: number;
  profiles: Array<{
    memberId: string;
    resumeComplete: number;
    portfolioScore: number;
    mockInterviews: number;
    placementStatus: string;
    placedAt: string | null;
  }>;
}

export interface CommunityMetrics {
  totalActivities: number;
  volunteerHours: number;
  mentoringHours: number;
  communityProjects: number;
  innovationChallenges: number;
  hackathons: number;
  byType: Record<string, number>;
}

export interface LmsModule {
  id: string;
  workshopId: string;
  companyId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  contentType: "video_upload" | "video_embed" | "audio_upload" | "ai_narration";
  contentUrl: string | null;
  contentText: string | null;
  aiNarrationUrl: string | null;
  durationSeconds: number | null;
  quizData: { questions: Array<{ prompt: string; options: string[]; correctIndex: number }> } | null;
  unlockCondition: "immediate" | "completion" | "time";
  prerequisiteModuleId: string | null;
  unlockDelayHours: number | null;
  unlocked: boolean;
  progress: {
    watchedSeconds: number;
    totalSeconds: number | null;
    completedAt: string | null;
    quizScore: number | null;
    quizAttempts: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LmsSession {
  id: string;
  companyId: string;
  workshopId: string | null;
  title: string;
  description: string | null;
  format: string;
  timeSlot: string;
  scheduledDate: string;
  maxCapacity: number | null;
  location: string | null;
  status: string;
}

// ── API functions ──────────────────────────────────────────────────────────

export const lmsAnalyticsApi = {
  getOverview: (companyId: string) =>
    api.get<LmsOverview>(`/companies/${companyId}/lms/analytics/overview`),

  getMembers: (companyId: string) =>
    api.get<LearnerRosterItem[]>(`/companies/${companyId}/lms/members`),

  getMemberDetail: (companyId: string, userId: string) =>
    api.get<LearnerDetail>(`/companies/${companyId}/lms/members/${userId}`),

  updateMemberProfile: (companyId: string, userId: string, data: Record<string, unknown>) =>
    api.put(`/companies/${companyId}/lms/members/${userId}/profile`, data),

  createIntervention: (companyId: string, userId: string, data: { type: string; notes?: string }) =>
    api.post(`/companies/${companyId}/lms/members/${userId}/interventions`, data),

  getCourseAnalytics: (companyId: string) =>
    api.get<CourseAnalytics[]>(`/companies/${companyId}/lms/courses`),

  getSessions: (companyId: string) =>
    api.get<LmsSession[]>(`/companies/${companyId}/lms/sessions`),

  createSession: (companyId: string, data: Record<string, unknown>) =>
    api.post(`/companies/${companyId}/lms/sessions`, data),

  getBadges: (companyId: string) =>
    api.get<BadgeDefinition[]>(`/companies/${companyId}/lms/badges`),

  createBadge: (companyId: string, data: { name: string; description: string; category?: string }) =>
    api.post(`/companies/${companyId}/lms/badges`, data),

  awardBadge: (companyId: string, data: { memberId: string; badgeDefinitionId: string; notes?: string }) =>
    api.post(`/companies/${companyId}/lms/badges/award`, data),

  getXrMetrics: (companyId: string) =>
    api.get<XrMetrics>(`/companies/${companyId}/lms/xr-sessions`),

  getWorkforceMetrics: (companyId: string) =>
    api.get<WorkforceMetrics>(`/companies/${companyId}/lms/workforce`),

  getCommunityMetrics: (companyId: string) =>
    api.get<CommunityMetrics>(`/companies/${companyId}/lms/community`),

  getModules: (companyId: string, workshopId: string) =>
    api.get<LmsModule[]>(`/companies/${companyId}/lms/workshops/${workshopId}/modules`),

  postProgress: (companyId: string, moduleId: string, data: { watchedSeconds: number; totalSeconds?: number; enrollmentId?: string }) =>
    api.post(`/companies/${companyId}/lms/modules/${moduleId}/progress`, data),

  submitQuiz: (companyId: string, moduleId: string, data: { answers: number[]; enrollmentId?: string }) =>
    api.post<{ score: number; passed: boolean; correct: number; total: number }>(`/companies/${companyId}/lms/modules/${moduleId}/quiz`, data),

  generateNarration: (companyId: string, moduleId: string) =>
    api.post<{ url: string } | { error: string }>(`/companies/${companyId}/lms/modules/${moduleId}/narration`, {}),

  checkProgression: (companyId: string, userId: string) =>
    api.post<ProgressionCheckResult>(`/companies/${companyId}/lms/members/${userId}/progression/check`, {}),

  getLeaderboard: (companyId: string, limit?: number) =>
    api.get<LeaderboardEntry[]>(`/companies/${companyId}/lms/leaderboard${limit ? `?limit=${limit}` : ""}`),

  getMarketplaceListings: (companyId: string) =>
    api.get<MarketplaceListing[]>(`/companies/${companyId}/lms/marketplace/listings`),

  createMarketplaceListing: (companyId: string, data: {
    memberId: string;
    displayName: string;
    title: string;
    bio?: string;
    skills?: string[];
    hourlyRateSims?: number;
    availability?: string;
  }) => api.post<MarketplaceListing>(`/companies/${companyId}/lms/marketplace/listings`, data),

  createMarketplaceBooking: (companyId: string, data: {
    listingId: string;
    clientMemberId: string;
    projectTitle: string;
    description?: string;
    budgetSims?: number;
  }) => api.post<MarketplaceBooking>(`/companies/${companyId}/lms/marketplace/bookings`, data),

  logEarn: (companyId: string, data: {
    principalId: string;
    amount: number;
    currency?: "CREDIT" | "AMX";
    transactionType?: string;
    metadata?: Record<string, unknown>;
  }) => api.post<{ transaction: unknown; awarded: number; currency: string }>(`/companies/${companyId}/lms/earn`, data),
};

// ── Helpers ────────────────────────────────────────────────────────────────

export function engagementLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Pathfinder Leader", color: "text-green-600" };
  if (score >= 70) return { label: "Strong", color: "text-blue-600" };
  if (score >= 40) return { label: "Progressing", color: "text-amber-600" };
  return { label: "Needs Support", color: "text-red-600" };
}

export function riskBadgeColor(risk: string): string {
  switch (risk) {
    case "green": return "bg-green-500/10 text-green-700 border-green-500/20";
    case "yellow": return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
    case "orange": return "bg-orange-500/10 text-orange-700 border-orange-500/20";
    case "red": return "bg-red-500/10 text-red-700 border-red-500/20";
    case "critical": return "bg-red-600/20 text-red-800 border-red-600/30 font-bold";
    default: return "bg-muted text-muted-foreground";
  }
}
