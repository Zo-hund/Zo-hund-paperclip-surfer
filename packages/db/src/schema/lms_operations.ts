import { pgTable, uuid, text, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { lmsWorkshops } from "./lms_training.js";

/**
 * AMX AI+LMS Member Profiles
 * Extended profile for every participant — supports 9 membership types.
 * One record per user per company.
 */
export const lmsMemberProfiles = pgTable(
  "lms_member_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: text("user_id").notNull(),
    // Array: learner | builder | ambassador | earner | parent | community | sponsor | volunteer | donor
    memberTypes: jsonb("member_types").$type<string[]>().notNull().default([]),
    // xrt_trainers | social_support | social_five
    teamAssignment: text("team_assignment"),
    phone: text("phone"),
    organization: text("organization"),
    cohort: text("cohort"),
    learningStyle: text("learning_style"), // visual, auditory, kinesthetic, reading_writing
    careerInterest: text("career_interest"),
    engagementScore: integer("engagement_score").notNull().default(0), // 0–100
    // green | yellow | orange | red | critical
    riskLevel: text("risk_level").notNull().default("green"),
    // explorer | builder | ambassador | earner | leader
    progressionStage: text("progression_stage").notNull().default("explorer"),
    linkedParentUserId: text("linked_parent_user_id"),
    linkedLearnerIds: jsonb("linked_learner_ids").$type<string[]>().notNull().default([]),
    // CRM extended fields
    partnerStatus: text("partner_status"), // pending | active | suspended
    ambassadorStatus: text("ambassador_status"), // candidate | active | alumni
    marketplaceRevenue: integer("marketplace_revenue").notNull().default(0), // cents earned via marketplace
    donationAmount: integer("donation_amount").notNull().default(0), // cents donated lifetime
    sponsorshipTier: text("sponsorship_tier"), // bronze | silver | gold | platinum
    // Directory visibility for this member's public profile page — off by default.
    isPublicProfile: boolean("is_public_profile").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserIdx: index("lms_member_profile_company_user_idx").on(table.companyId, table.userId),
    riskIdx: index("lms_member_profile_risk_idx").on(table.companyId, table.riskLevel),
  }),
);

/**
 * Schedulable Sessions (M–F, 4 time slots × 4 formats)
 */
export const lmsSessions = pgTable(
  "lms_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    workshopId: uuid("workshop_id").references(() => lmsWorkshops.id),
    instructorUserId: text("instructor_user_id"),
    instructorAgentId: uuid("instructor_agent_id"),
    title: text("title").notNull(),
    description: text("description"),
    // in_person | online | xr_metaverse | hybrid
    format: text("format").notNull().default("in_person"),
    // morning (9am–12pm) | afternoon (1pm–4pm) | evening (5pm–8pm) | night (9pm–12am)
    timeSlot: text("time_slot").notNull().default("morning"),
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }).notNull(),
    maxCapacity: integer("max_capacity").default(30),
    location: text("location"),
    // scheduled | active | completed | cancelled
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyDateIdx: index("lms_session_company_date_idx").on(table.companyId, table.scheduledDate),
    statusIdx: index("lms_session_status_idx").on(table.companyId, table.status),
  }),
);

/**
 * Session Attendance
 */
export const lmsSessionAttendance = pgTable(
  "lms_session_attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => lmsSessions.id),
    memberId: uuid("member_id").notNull().references(() => lmsMemberProfiles.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // registered | attended | no_show | late
    status: text("status").notNull().default("registered"),
    checkInAt: timestamp("check_in_at", { withTimezone: true }),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
  },
  (table) => ({
    sessionMemberIdx: index("lms_attendance_session_member_idx").on(table.sessionId, table.memberId),
    memberIdx: index("lms_attendance_member_idx").on(table.memberId),
  }),
);

/**
 * Named AI Agent Role Mappings
 * Connects Paperclip agent IDs to AMX codenames: TAZ / JAZ / RAZ / NAZ / GAZ / OPS
 */
export const lmsAiAgentRoles = pgTable(
  "lms_ai_agent_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // TAZ | JAZ | RAZ | NAZ | GAZ | OPS
    codeName: text("code_name").notNull(),
    // program_ops | education | business_workforce | creative_media | governance | infrastructure
    primaryDomain: text("primary_domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("lms_ai_agent_role_company_idx").on(table.companyId),
  }),
);
