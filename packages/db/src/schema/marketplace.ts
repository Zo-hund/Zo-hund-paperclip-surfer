import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const marketplaceProfiles = pgTable(
  "marketplace_profiles",
  {
    userId: text("user_id").primaryKey(),
    displayName: text("display_name"),
    headline: text("headline"),
    bio: text("bio"),
    location: text("location"),
    roleIntent: text("role_intent").notNull().default("none"),
    partnerStatus: text("partner_status").notNull().default("none"),
    eligibilityStatus: text("eligibility_status").notNull().default("ineligible"),
    reviewReason: text("review_reason"),
    applicationSubmittedAt: timestamp("application_submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    lmsCredits: integer("lms_credits").notNull().default(500),
    amxTokenBalance: integer("amx_token_balance").notNull().default(750),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    badges: jsonb("badges").$type<string[]>().notNull().default([]),
    payoutWallet: text("payout_wallet"),
    availability: text("availability").notNull().default("available"),
    supportedRunPhases: jsonb("supported_run_phases").$type<string[]>().notNull().default([]),
    guidanceCompletedLessons: jsonb("guidance_completed_lessons").$type<string[]>().notNull().default([]),
    guidanceCompletedChecklist: jsonb("guidance_completed_checklist").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    partnerStatusIdx: index("marketplace_profiles_partner_status_idx").on(table.partnerStatus),
    roleIntentIdx: index("marketplace_profiles_role_intent_idx").on(table.roleIntent),
  }),
);

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    providerUserId: text("provider_user_id").notNull(),
    listingType: text("listing_type").notNull(),
    status: text("status").notNull().default("draft"),
    name: text("name").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    badges: jsonb("badges").$type<string[]>().notNull().default([]),
    hourlyRateTokens: integer("hourly_rate_tokens").notNull(),
    availability: text("availability").notNull().default("available"),
    supportedRunPhases: jsonb("supported_run_phases").$type<string[]>().notNull().default([]),
    payoutWallet: text("payout_wallet"),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("marketplace_listings_company_status_idx").on(table.companyId, table.status),
    providerIdx: index("marketplace_listings_provider_idx").on(table.providerUserId),
    listingTypeIdx: index("marketplace_listings_type_idx").on(table.listingType),
  }),
);
