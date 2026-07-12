import { pgTable, uuid, text, timestamp, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Toolbelts — a named, reusable bundle of tool permissions an agent harness
 * can be granted. companyId is nullable: null rows are instance-wide presets
 * (e.g. a shared "DevSecOps" toolbelt every company can reference), non-null
 * rows are a company's own custom bundles.
 */
export const toolbelts = pgTable(
  "toolbelts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // devsecops | creative | research | ops | general | custom
    category: text("category").notNull().default("general"),
    toolPermissions: jsonb("tool_permissions").$type<string[]>().notNull().default([]),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKeyUniqueIdx: uniqueIndex("toolbelts_company_key_idx").on(table.companyId, table.key),
    categoryIdx: index("toolbelts_category_idx").on(table.category),
  }),
);

/**
 * Harnesses — a full agent execution profile: adapter/model choice + a
 * toolbelt reference + guardrail config. Agents optionally point at one via
 * agents.harnessId (see agents.ts). Like toolbelts, companyId null = an
 * instance-wide preset (e.g. a stock "DevSecOps Engineer" harness).
 */
export const harnesses = pgTable(
  "harnesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("general"),
    adapterType: text("adapter_type").notNull().default("openrouter"),
    model: text("model").notNull().default("openrouter/auto"),
    toolbeltId: uuid("toolbelt_id").references(() => toolbelts.id),
    guardrails: jsonb("guardrails").$type<Record<string, unknown>>().notNull().default({}),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKeyUniqueIdx: uniqueIndex("harnesses_company_key_idx").on(table.companyId, table.key),
    categoryIdx: index("harnesses_category_idx").on(table.category),
  }),
);
