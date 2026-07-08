import { pgTable, uuid, text, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { OpprcCategorySlug, OpprcAudience } from "@paperclipai/shared";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { assets } from "./assets.js";
import { agents } from "./agents.js";

/**
 * Mirrors OPPRRC_CATEGORY_SLUGS / OPPRRC_AUDIENCES in packages/shared/src/constants.ts.
 * Kept as literal values (not a runtime import) because drizzle-kit loads this file's
 * compiled dist/schema/*.js directly via a bare Node `require`, which cannot resolve
 * @paperclipai/shared's dev `exports` (its .ts source, used successfully by server/ui
 * via their bundler/tsx loaders — that resolution path isn't available here). If
 * OPPRRC_CATEGORY_SLUGS/OPPRRC_AUDIENCES change, update both places.
 */
const OPPRRC_CATEGORY_SLUGS_SQL: readonly OpprcCategorySlug[] = [
  "01_organizations",
  "02_programs",
  "03_projects",
  "04_resources",
  "05_reports",
  "06_certificates",
];
const OPPRRC_AUDIENCES_SQL: readonly OpprcAudience[] = ["BOARD-INTERNAL", "CLIENTS-EXTERNAL"];

function sqlLiteralList(values: readonly string[]): ReturnType<typeof sql.raw> {
  return sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", "));
}

const opprrcCategorySlugList = sqlLiteralList(OPPRRC_CATEGORY_SLUGS_SQL);
const opprrcAudienceList = sqlLiteralList(OPPRRC_AUDIENCES_SQL);

export const opprrcDeliveries = pgTable(
  "opprrc_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id),
    assetId: uuid("asset_id").references(() => assets.id),
    category: text("category").notNull(),
    audience: text("audience").notNull().default("CLIENTS-EXTERNAL"),
    locationSlug: text("location_slug"),

    // VPS (primary — live source of truth)
    liveStorage: text("live_storage").notNull().default("vps"),
    vpsFilePath: text("vps_file_path"),
    vpsFileUrl: text("vps_file_url"),
    vpsVerifiedAt: timestamp("vps_verified_at", { withTimezone: true }),

    // Google Drive (backup / proof vault)
    backupStorage: text("backup_storage").notNull().default("google_drive"),
    googleDriveFileId: text("google_drive_file_id"),
    googleDriveFolderId: text("google_drive_folder_id"),
    googleDriveFileUrl: text("google_drive_file_url"),
    backupStatus: text("backup_status").notNull().default("not_started"),
    lastBackupAt: timestamp("last_backup_at", { withTimezone: true }),

    // 100-run batch tracking
    runNumber: integer("run_number"),
    runBatchId: text("run_batch_id"),

    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredByAgentId: uuid("delivered_by_agent_id").references(() => agents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIssueIdx: index("opprrc_deliveries_company_issue_idx").on(table.companyId, table.issueId),
    companyBatchIdx: index("opprrc_deliveries_company_batch_idx").on(table.companyId, table.runBatchId),
    backupStatusIdx: index("opprrc_deliveries_backup_status_idx").on(table.backupStatus),
    categoryCheck: check("opprrc_deliveries_category_check", sql`${table.category} IN (${opprrcCategorySlugList})`),
    audienceCheck: check("opprrc_deliveries_audience_check", sql`${table.audience} IN (${opprrcAudienceList})`),
  }),
);

export const opprrcBackupJobs = pgTable(
  "opprrc_backup_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id").references(() => opprrcDeliveries.id),
    companyId: uuid("company_id").notNull(),
    sourceStorage: text("source_storage").notNull().default("vps"),
    targetStorage: text("target_storage").notNull().default("google_drive"),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("opprrc_backup_jobs_status_idx").on(table.status),
    deliveryIdx: index("opprrc_backup_jobs_delivery_idx").on(table.deliveryId),
  }),
);
