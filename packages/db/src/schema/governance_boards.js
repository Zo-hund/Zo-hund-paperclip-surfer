import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
/**
 * AMX Collectives
 * A league of Subject Matter Experts, Skill Providers, and Knowledge Heads (Supply Side).
 */
export const collectives = pgTable("collectives", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description"),
    knowledgeDomain: text("knowledge_domain").notNull(),
    skillProviders: jsonb("skill_providers").$type().notNull().default([]), // Links to users/agents
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    companyDomainIdx: index("collectives_company_domain_idx").on(table.companyId, table.knowledgeDomain),
}));
/**
 * AMX Electives
 * Employers, Businesses, and Non-profits looking to manufacture intelligence (Demand Side).
 */
export const electives = pgTable("electives", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description"),
    industry: text("industry").notNull(),
    authorizedPrincipals: jsonb("authorized_principals").$type().default([]), // Who can hire/buy
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    companyIndustryIdx: index("electives_company_industry_idx").on(table.companyId, table.industry),
}));
/**
 * AMX Community Boards
 * Coordination centers for shared projects and community needs.
 */
export const communityBoards = pgTable("community_boards", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    location: text("location").notNull(),
    activeNeeds: jsonb("active_needs").$type().default([]), // Requirements linked to this board
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    companyLocationIdx: index("comm_board_company_loc_idx").on(table.companyId, table.location),
}));
/**
 * Board Collaboration Mappings
 * Links Collectives and Electives to Community Projects.
 */
export const boardCollaborations = pgTable("board_collaborations", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    collectiveId: uuid("collective_id").notNull().references(() => collectives.id),
    electiveId: uuid("elective_id").notNull().references(() => electives.id),
    communityBoardId: uuid("community_board_id").references(() => communityBoards.id),
    projectId: uuid("project_id"), // Linked project
    role: text("role").notNull(), // 'primary_provider', 'funder', 'facilitator'
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=governance_boards.js.map