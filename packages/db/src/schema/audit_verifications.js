import { pgTable, uuid, text, timestamp, jsonb, index, } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
/**
 * Audit Verifications
 * Records every verification a member of the Audit Team runs against a task,
 * issue, or agent. A "passed" verification triggers an AMX Chain certificate.
 * A "failed" verification surfaces a finding for the board.
 */
export const auditVerifications = pgTable("audit_verifications", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // Which auditor agent ran this check
    auditorAgentId: uuid("auditor_agent_id").notNull().references(() => agents.id),
    // What was audited
    targetType: text("target_type").notNull(), // 'issue' | 'agent' | 'task'
    targetId: text("target_id").notNull(),
    targetLabel: text("target_label"), // human-readable name e.g. "ENG-42 – Build API"
    // Verdict
    status: text("status").notNull().default("pending"), // 'pending' | 'in_progress' | 'passed' | 'failed' | 'flagged'
    verdict: text("verdict"), // short summary written by auditor agent
    // Structured findings (non-empty only when status='failed'/'flagged')
    findings: jsonb("findings").$type().default([]),
    // AMX Chain certificate issued on pass
    certificateFootprint: text("certificate_footprint"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    companyTargetIdx: index("audit_verif_company_target_idx").on(table.companyId, table.targetType, table.targetId),
    companyStatusIdx: index("audit_verif_company_status_idx").on(table.companyId, table.status),
    auditorIdx: index("audit_verif_auditor_idx").on(table.auditorAgentId),
}));
//# sourceMappingURL=audit_verifications.js.map