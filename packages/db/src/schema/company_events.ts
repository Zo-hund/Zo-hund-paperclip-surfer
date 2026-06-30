import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { assets } from "./assets.js";

export const companyEvents = pgTable(
  "company_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    timeRange: text("time_range"),
    ageRange: text("age_range"),
    description: text("description"),
    flyerAssetId: uuid("flyer_asset_id").references(() => assets.id),
    registrationUrl: text("registration_url"),
    qrCodeAssetId: uuid("qr_code_asset_id").references(() => assets.id),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStartIdx: index("company_events_company_start_idx").on(table.companyId, table.startDate),
  }),
);
