import { pgTable, uuid, text, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Badge Definitions — the catalog of earnable badges.
 */
export const lmsBadgeDefinitions = pgTable(
  "lms_badge_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    criteria: jsonb("criteria").$type<Record<string, unknown>>(),
    iconUrl: text("icon_url"),
    // achievement | completion | leadership | community | workforce
    category: text("category").notNull().default("achievement"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("lms_badge_def_company_idx").on(table.companyId),
  }),
);

/**
 * Learner Badges — awarded badge instances.
 */
export const lmsLearnerBadges = pgTable(
  "lms_learner_badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(), // userId
    companyId: uuid("company_id").notNull().references(() => companies.id),
    badgeDefinitionId: uuid("badge_definition_id").notNull().references(() => lmsBadgeDefinitions.id),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    awardedByUserId: text("awarded_by_user_id"),
    awardedByAgentId: uuid("awarded_by_agent_id"),
    notes: text("notes"),
  },
  (table) => ({
    memberCompanyIdx: index("lms_learner_badge_member_idx").on(table.memberId, table.companyId),
    badgeDefIdx: index("lms_learner_badge_def_idx").on(table.badgeDefinitionId),
  }),
);

/**
 * XR Session Telemetry — Quest headset session data.
 */
export const lmsXrSessions = pgTable(
  "lms_xr_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(), // userId
    companyId: uuid("company_id").notNull().references(() => companies.id),
    enrollmentId: uuid("enrollment_id"),
    sessionDurationSeconds: integer("session_duration_seconds").notNull().default(0),
    worldVisits: integer("world_visits").notNull().default(0),
    simulationsCompleted: integer("simulations_completed").notNull().default(0),
    objectInteractions: integer("object_interactions").notNull().default(0),
    teamCollaboration: integer("team_collaboration").notNull().default(0),
    voiceActivitySeconds: integer("voice_activity_seconds").notNull().default(0),
    handTrackingEvents: integer("hand_tracking_events").notNull().default(0),
    assessmentCompletion: integer("assessment_completion").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberCompanyIdx: index("lms_xr_session_member_company_idx").on(table.memberId, table.companyId),
    recordedAtIdx: index("lms_xr_session_recorded_at_idx").on(table.companyId, table.recordedAt),
  }),
);

/**
 * Community Activity — volunteer hours, mentoring, projects.
 */
export const lmsCommunityActivity = pgTable(
  "lms_community_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(), // userId
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // volunteer | mentoring | community_project | innovation_challenge | hackathon | local_partnership | neighborhood_project
    activityType: text("activity_type").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    description: text("description"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberCompanyIdx: index("lms_community_activity_member_idx").on(table.memberId, table.companyId),
  }),
);

/**
 * Workforce Profiles — career readiness tracker (one per member per company).
 */
export const lmsWorkforceProfiles = pgTable(
  "lms_workforce_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    resumeComplete: integer("resume_complete").notNull().default(0), // 0–100
    portfolioScore: integer("portfolio_score").notNull().default(0), // 0–100
    mockInterviews: integer("mock_interviews").notNull().default(0),
    industryCerts: integer("industry_certs").notNull().default(0),
    employerConnections: integer("employer_connections").notNull().default(0),
    internshipReady: integer("internship_ready").notNull().default(0), // 0 or 1
    jobApplications: integer("job_applications").notNull().default(0),
    // not_started | in_progress | internship | employed | placed
    placementStatus: text("placement_status").notNull().default("not_started"),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberCompanyIdx: index("lms_workforce_profile_member_idx").on(table.memberId, table.companyId),
    companyIdx: index("lms_workforce_profile_company_idx").on(table.companyId),
  }),
);

/**
 * CRM Interventions — permanent action log for all learner-support actions.
 */
export const lmsInterventions = pgTable(
  "lms_interventions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").notNull(), // userId
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // flag | mentor | nudge | coaching | course | badge | escalate | task
    type: text("type").notNull(),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id"),
    createdByAgentId: uuid("created_by_agent_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberCompanyIdx: index("lms_intervention_member_company_idx").on(table.memberId, table.companyId),
    companyCreatedIdx: index("lms_intervention_company_created_idx").on(table.companyId, table.createdAt),
  }),
);

/**
 * Skills Marketplace — Earner listings.
 */
export const lmsMarketplaceListings = pgTable(
  "lms_marketplace_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    memberId: text("member_id").notNull(), // userId
    displayName: text("display_name").notNull(),
    title: text("title").notNull(),
    bio: text("bio"),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    hourlyRateSims: integer("hourly_rate_sims").notNull().default(50),
    // available | busy | on_project
    availability: text("availability").notNull().default("available"),
    rating: integer("rating").notNull().default(0), // stored ×10 (50 = 5.0)
    reviewCount: integer("review_count").notNull().default(0),
    projectsCompleted: integer("projects_completed").notNull().default(0),
    isActive: integer("is_active").notNull().default(1),
    // Directory visibility — separate from isActive so a listing can be
    // paused without losing its public directory placement, and vice versa.
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    memberCompanyIdx: index("lms_marketplace_listing_member_idx").on(table.memberId, table.companyId),
    companyActiveIdx: index("lms_marketplace_listing_company_active_idx").on(table.companyId, table.isActive),
  }),
);

/**
 * Skills Marketplace — Booking requests from clients to earners.
 */
export const lmsMarketplaceBookings = pgTable(
  "lms_marketplace_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    listingId: uuid("listing_id").notNull().references(() => lmsMarketplaceListings.id),
    clientMemberId: text("client_member_id").notNull(), // userId of person booking
    projectTitle: text("project_title").notNull(),
    description: text("description"),
    budgetSims: integer("budget_sims").notNull().default(0),
    // Run phase this booking was priced at — one of MARKETPLACE_PHASE_MULTIPLIERS'
    // keys in @paperclipai/shared ('simulation' | 'pre_production' | 'production'
    // | 'live' | 'post_production'). Free text (not enum) since the canonical set
    // lives in the shared package, not the db package; nullable because bookings
    // created before this column existed have no phase on record.
    phase: text("phase"),
    // pending | active | completed | cancelled
    status: text("status").notNull().default("pending"),
    // Optional scheduled engagement window — set when the client picks a
    // calendar slot instead of an ASAP/simulation-mode booking. Powers the
    // unified marketplace calendar alongside companyEvents.
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    listingIdx: index("lms_marketplace_booking_listing_idx").on(table.listingId),
    clientIdx: index("lms_marketplace_booking_client_idx").on(table.clientMemberId, table.companyId),
    statusIdx: index("lms_marketplace_booking_status_idx").on(table.companyId, table.status),
  }),
);
