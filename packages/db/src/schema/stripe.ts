import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const stripeSubscriptions = pgTable(
  "stripe_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: text("user_id").notNull(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    stripePriceId: text("stripe_price_id").notNull(),
    tierName: text("tier_name").notNull(),
    // active | past_due | canceled | unpaid | trialing
    status: text("status").notNull().default("active"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subscriptionUniqueIdx: uniqueIndex("stripe_sub_subscription_id_idx").on(table.stripeSubscriptionId),
    companyUserIdx: index("stripe_sub_company_user_idx").on(table.companyId, table.userId),
    customerIdx: index("stripe_sub_customer_idx").on(table.stripeCustomerId),
  }),
);

/**
 * Idempotency ledger for Stripe webhook events. Stripe delivers each event
 * at-least-once (retries + manual redelivery), so the webhook handler records
 * every processed event id here and skips any it has already seen — otherwise
 * credit awards and ledger writes would double-apply on redelivery.
 */
export const stripeProcessedEvents = pgTable(
  "stripe_processed_events",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const stripePrices = pgTable(
  "stripe_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // learner | builder | ambassador | earner | parent | community | volunteer | sponsor | donor
    tierName: text("tier_name").notNull(),
    stripeProductId: text("stripe_product_id").notNull(),
    stripePriceId: text("stripe_price_id").notNull(),
    currency: text("currency").notNull().default("usd"),
    // Amount in cents
    amount: integer("amount").notNull(),
    // month | year
    interval: text("interval").notNull().default("month"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    priceUniqueIdx: uniqueIndex("stripe_price_id_unique_idx").on(table.stripePriceId),
    companyTierIdx: index("stripe_price_company_tier_idx").on(table.companyId, table.tierName),
  }),
);
