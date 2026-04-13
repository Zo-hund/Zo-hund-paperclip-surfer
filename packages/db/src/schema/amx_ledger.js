import { pgTable, uuid, text, integer, timestamp, jsonb, index, boolean, uniqueIndex, } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
/**
 * AMX LABS Global Ledger
 * Distinguishes between Production Tokens (AMX/SIMS) and Learning Credits.
 */
export const amxLedger = pgTable("amx_ledger", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    principalType: text("principal_type").notNull(), // 'user', 'agent', 'collective'
    principalId: text("principal_id").notNull(),
    tokenBalance: integer("token_balance").notNull().default(0), // Production Tokens
    creditBalance: integer("credit_balance").notNull().default(0), // Learning Credits
    walletAddress: text("wallet_address"), // External MetaMask address
    autoTopUpEnabled: boolean("auto_top_up_enabled").notNull().default(false),
    spendingLimitTokens: integer("spending_limit_tokens").notNull().default(0), // For A2A tasks
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    principalUniqueIdx: uniqueIndex("amx_ledger_principal_idx").on(table.companyId, table.principalType, table.principalId),
}));
/**
 * AMX Global Transactions
 * Auditable P2P, H2A, A2A, and A2H transactions.
 */
export const amxTransactions = pgTable("amx_transactions", {
    id: uuid("id").primaryKey().defaultRandom(),
    fromCompanyId: uuid("from_company_id").references(() => companies.id),
    toCompanyId: uuid("to_company_id").references(() => companies.id),
    fromPrincipalType: text("from_principal_type").notNull(),
    fromPrincipalId: text("from_principal_id").notNull(),
    toPrincipalType: text("to_principal_type").notNull(),
    toPrincipalId: text("to_principal_id").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("AMX"), // 'AMX', 'CREDIT', 'USD', 'ETH'
    transactionType: text("transaction_type").notNull(), // 'p2p', 'production_run', 'learning_workshop', 'a2a_hire'
    status: text("status").notNull().default("completed"),
    proofOfWorkCertificateId: uuid("proof_of_work_certificate_id"), // Linked to AMX Chain
    metadata: jsonb("metadata").$type(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    fromPrincipalIdx: index("amx_tx_from_idx").on(table.fromPrincipalId),
    toPrincipalIdx: index("amx_tx_to_idx").on(table.toPrincipalId),
    currencyIdx: index("amx_tx_currency_idx").on(table.currency),
}));
//# sourceMappingURL=amx_ledger.js.map