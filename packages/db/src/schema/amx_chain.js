import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, integer, } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
/**
 * AMX Chain Security Events
 * An append-only ledger for all security-critical events (RLS changes, Membership grants).
 */
export const amxChainEvents = pgTable("amx_chain_events", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    action: text("action").notNull(), // 'PERMISSION_GRANT', 'MEMBERSHIP_REVOKED', 'LEDGER_SETTLEMENT'
    payload: jsonb("payload").$type().notNull(),
    signature: text("signature").notNull(), // Hmac or RSA-PSS signature of the payload
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    companyActionIdx: index("amx_chain_company_action_idx").on(table.companyId, table.action),
}));
/**
 * AMX Proof of Work Certificates
 * A verifiable footprint of AI manufacturing. Built for太平洋Pacific L2/L3 integration.
 */
export const amxCertificates = pgTable("amx_certificates", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id"), // Linked project/task
    taskId: text("task_id"), // Specific task id in the run
    responsiblePrincipalId: text("responsible_principal_id").notNull(), // The Lead (Collective or Agent)
    commitHashes: jsonb("commit_hashes").$type().notNull().default([]),
    taskLogsSummary: text("task_logs_summary"),
    completionTimeMs: integer("completion_time_ms").notNull(),
    finalCostTokens: integer("final_cost_tokens").notNull(),
    projects: jsonb("projects").$type().notNull().default([]), // OPPRRC mappings
    resources: jsonb("resources").$type().notNull().default([]), // OPPRRC mappings
    reports: jsonb("reports").$type().notNull().default([]), // OPPRRC mappings
    certificateFootprint: text("certificate_footprint").notNull(), // Unique cryptographic fingerprint
    status: text("status").notNull().default("active"), // 'active', 'revoked'
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => ({
    companyIssueIdx: index("amx_cert_company_issue_idx").on(table.companyId, table.issueId),
    footprintUniqueIdx: uniqueIndex("amx_cert_footprint_idx").on(table.certificateFootprint),
}));
//# sourceMappingURL=amx_chain.js.map