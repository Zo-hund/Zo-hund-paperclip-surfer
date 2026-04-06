import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

/**
 * AMX Context AI Factory - Requirement Portal
 * Manufacturing intelligence based on 3-standard tiers ($1k-$3k).
 */
export const rqSubmissions = pgTable(
  "rq_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: text("user_id").notNull(), // The requester (Human)
    tier: text("tier").notNull(), // 'digital_foundation', 'hybrid_growth', 'metaverse_enterprise'
    status: text("status").notNull().default("submitted"), // 'submitted', 'activating_agents', 'review', 'deploying', 'certified'
    contextData: jsonb("context_data").$type<{
      userContext?: string;
      domainContext?: string;
      institutionalMemory?: string;
    }>().notNull(),
    deploymentMode: text("deployment_mode").notNull().default("online"), // 'in_person', 'online', 'metaverse'
    agentSwarmIds: jsonb("agent_swarm_ids").$type<string[]>().default([]), // The Strategy/Visual/Spatial/Doc/Content swarm
    amountPaidCents: integer("amount_paid_cents").notNull(), 
    currency: text("currency").notNull().default("USD"), // Fiat/Crypto
    amxTxId: uuid("amx_tx_id"), // Linked to AMX Ledger
    issueId: uuid("issue_id").references(() => issues.id), // Linked Paperclip Issue for tracking
    lifecycleStage: text("lifecycle_stage").notNull().default("pre_production"), // 'pre_production', 'simulation', 'production', 'live', 'post_production'
    isSimulation: boolean("is_simulation").notNull().default(true),
    creditCost: integer("credit_cost").notNull().default(0),
    tokenCost: integer("token_cost").notNull().default(0),
    simulationStatus: text("simulation_status").notNull().default("idle"), // 'idle', 'running', 'completed', 'certified'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("rq_company_status_idx").on(table.companyId, table.status),
    companyLifecycleIdx: index("rq_company_lifecycle_idx").on(table.companyId, table.lifecycleStage),
  }),
);

/**
 * AI Factory Agent Configs
 * Configuration for the swarm that processes the requirements.
 */
export const rqAgentConfigs = pgTable(
  "rq_agent_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(), // 'Strategy Agent', 'Visual Agent', etc
    role: text("role").notNull(), // 'strategy', 'visual', 'spatial', 'document', 'content'
    defaultAdapterOverride: text("default_adapter_override"),
    config: jsonb("config"), // Specific prompts/capabilities for this factory role
  }
);
