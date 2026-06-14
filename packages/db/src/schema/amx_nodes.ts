import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const amxNodes = pgTable(
  "amx_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("local_desktop"),
    status: text("status").notNull().default("enrolling"),
    trustTier: text("trust_tier").notNull().default("paired"),
    connectionMode: text("connection_mode").notNull().default("outbound_websocket"),
    publicKey: text("public_key"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    labels: jsonb("labels").$type<Record<string, string>>().notNull().default({}),
    posture: jsonb("posture").$type<Record<string, unknown>>().notNull().default({}),
    constraints: jsonb("constraints").$type<Record<string, unknown>>().notNull().default({}),
    load: jsonb("load").$type<Record<string, unknown>>().notNull().default({}),
    network: jsonb("network").$type<Record<string, unknown>>().notNull().default({}),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("amx_nodes_company_status_idx").on(table.companyId, table.status),
    companyTrustIdx: index("amx_nodes_company_trust_idx").on(table.companyId, table.trustTier),
    companyLastSeenIdx: index("amx_nodes_company_last_seen_idx").on(table.companyId, table.lastSeenAt),
  }),
);

export const amxDispatchLeases = pgTable(
  "amx_dispatch_leases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    nodeId: uuid("node_id").notNull().references(() => amxNodes.id, { onDelete: "cascade" }),
    requestedByType: text("requested_by_type").notNull(),
    requestedById: text("requested_by_id"),
    capability: text("capability").notNull(),
    riskLevel: text("risk_level").notNull().default("read"),
    status: text("status").notNull().default("pending_approval"),
    commandSummary: text("command_summary").notNull(),
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull().default({}),
    policyDecision: jsonb("policy_decision").$type<Record<string, unknown>>().notNull().default({}),
    leaseTokenHash: text("lease_token_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("amx_dispatch_leases_company_status_idx").on(table.companyId, table.status),
    nodeStatusIdx: index("amx_dispatch_leases_node_status_idx").on(table.nodeId, table.status),
    companyExpiresIdx: index("amx_dispatch_leases_company_expires_idx").on(table.companyId, table.expiresAt),
  }),
);

export const amxDispatchEvidence = pgTable(
  "amx_dispatch_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    nodeId: uuid("node_id").notNull().references(() => amxNodes.id, { onDelete: "cascade" }),
    leaseId: uuid("lease_id").notNull().references(() => amxDispatchLeases.id, { onDelete: "cascade" }),
    evidenceId: text("evidence_id").notNull(),
    status: text("status").notNull().default("submitted"),
    capability: text("capability").notNull(),
    riskLevel: text("risk_level").notNull(),
    commandSummary: text("command_summary").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    resultSha256: text("result_sha256").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyReceivedIdx: index("amx_dispatch_evidence_company_received_idx").on(table.companyId, table.receivedAt),
    leaseIdx: index("amx_dispatch_evidence_lease_idx").on(table.leaseId),
    nodeReceivedIdx: index("amx_dispatch_evidence_node_received_idx").on(table.nodeId, table.receivedAt),
  }),
);
