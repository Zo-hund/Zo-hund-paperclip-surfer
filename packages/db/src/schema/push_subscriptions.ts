import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Web Push subscriptions for mobile/desktop dispatch notifications (e.g. an
 * approval request or meeting invite reaching a user who isn't currently
 * connected via WebSocket). userId is a plain text column (no FK) matching
 * instance_user_roles — Better Auth manages the user identity table itself.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    companyId: uuid("company_id").references(() => companies.id),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    authKey: text("auth_key").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => ({
    endpointUniqueIdx: uniqueIndex("push_subscriptions_endpoint_unique_idx").on(table.endpoint),
    userIdx: index("push_subscriptions_user_idx").on(table.userId),
    companyIdx: index("push_subscriptions_company_idx").on(table.companyId),
  }),
);
