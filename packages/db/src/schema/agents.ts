import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    role: text("role").notNull().default("general"),
    title: text("title"),
    icon: text("icon"),
    status: text("status").notNull().default("idle"),
    reportsTo: uuid("reports_to").references((): AnyPgColumn => agents.id),
    capabilities: text("capabilities"),
    adapterType: text("adapter_type").notNull().default("process"),
    adapterConfig: jsonb("adapter_config").$type<Record<string, unknown>>().notNull().default({}),
    runtimeConfig: jsonb("runtime_config").$type<Record<string, unknown>>().notNull().default({}),
    budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
    spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
    pauseReason: text("pause_reason"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    permissions: jsonb("permissions").$type<Record<string, unknown>>().notNull().default({}),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    scheduleEnabled: boolean("schedule_enabled").notNull().default(false),
    cronExpression: text("cron_expression"),
    scheduleTimezone: text("schedule_timezone"),
    nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    // Directory visibility for this agent's resume/profile page — off by default.
    isPublicProfile: boolean("is_public_profile").notNull().default(false),
    // Free-text skill tags (matches lmsMarketplaceListings.skills' shape) —
    // used as a filter facet on the profile directory.
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    // Optional link to a harness preset (packages/db/schema/toolbelts.ts) that
    // defines this agent's tool bundle + guardrail profile. Nullable: most
    // agents keep using adapterConfig/runtimeConfig directly.
    harnessId: uuid("harness_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("agents_company_status_idx").on(table.companyId, table.status),
    companyReportsToIdx: index("agents_company_reports_to_idx").on(table.companyId, table.reportsTo),
    scheduleIdx: index("agents_schedule_idx").on(table.scheduleEnabled, table.nextScheduledAt),
  }),
);
