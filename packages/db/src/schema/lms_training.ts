import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * TECH AT NITE LMS
 * Learning Mode infrastructure powered by Credits.
 */
export const lmsWorkshops = pgTable(
  "lms_workshops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("AI"), // 'AI', 'Simulation', 'Leadership', 'XR', 'Business'
    level: text("level").notNull().default("Beginner"), // 'Beginner', 'Intermediate', 'Advanced', 'Master'
    creditsRequired: integer("credits_required").notNull(), // Cost to enroll
    creditsAwarded: integer("credits_awarded").notNull(), // Reward for completion
    format: text("format").notNull(), // 'in_person', 'online', 'metaverse'
    schedule: jsonb("schedule").$type<Record<string, unknown>>(), // Morning/Afternoon/Evening/Night slots
    activeSimulationId: uuid("active_simulation_id"), // Linked to a Market Simulation
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("lms_workshop_company_status_idx").on(table.companyId, table.status),
  }),
);

/**
 * LMS Enrollments & Progress
 * Tracking learner journey and badge/credential earning.
 */
export const lmsEnrollments = pgTable(
  "lms_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: text("user_id").notNull(),
    workshopId: uuid("workshop_id").notNull().references(() => lmsWorkshops.id),
    status: text("status").notNull().default("enrolled"), // 'enrolled', 'active_simulation', 'completed', 'certified'
    progress: integer("progress").notNull().default(0), // 0-100
    score: integer("score"),
    certificatesAwarded: jsonb("certificates_awarded").$type<string[]>().default([]), // Links to AMX Certificates
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    userContextIdx: index("lms_enrollment_user_idx").on(table.userId),
    userWorkshopUnique: index("lms_enrollment_user_workshop_idx").on(table.userId, table.workshopId),
  }),
);

/**
 * Market Simulations
 * High-fidelity AI-Human collaborative environments.
 */
export const lmsSimulations = pgTable(
  "lms_simulations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    scenario: text("scenario").notNull(), // ' Louisville FoodPort', 'AI/XR Marketing', etc
    config: jsonb("config"), // The specialized agents and context for this simulation
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);
