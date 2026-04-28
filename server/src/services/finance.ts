import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, costEvents, financeEvents, goals, heartbeatRuns, issues, projects, amxLedger, amxTransactions } from "@paperclipai/db";
import { amxChainService } from "./amxChainService.js";
import { notFound, unprocessable } from "../errors.js";

export interface FinanceDateRange {
  from?: Date;
  to?: Date;
}

type OperatingEnvironment = "simulation" | "live";

function environmentCondition(environment?: OperatingEnvironment | null) {
  if (environment === undefined) return null;
  if (environment === null) return isNull(financeEvents.operatingEnvironment);
  return eq(financeEvents.operatingEnvironment, environment);
}

function ledgerEnvironmentCondition(environment?: OperatingEnvironment | null) {
  if (environment === undefined) return null;
  if (environment === null) return isNull(amxLedger.operatingEnvironment);
  return eq(amxLedger.operatingEnvironment, environment);
}

async function assertBelongsToCompany(
  db: Db,
  table: any,
  id: string,
  companyId: string,
  label: string,
) {
  const row = await db
    .select()
    .from(table)
    .where(eq(table.id, id))
    .then((rows) => rows[0] ?? null);

  if (!row) throw notFound(`${label} not found`);
  if ((row as unknown as { companyId: string }).companyId !== companyId) {
    throw unprocessable(`${label} does not belong to company`);
  }
}

function rangeConditions(companyId: string, range?: FinanceDateRange, environment?: OperatingEnvironment | null) {
  const conditions: ReturnType<typeof eq>[] = [eq(financeEvents.companyId, companyId)];
  const envCondition = environmentCondition(environment);
  if (envCondition) conditions.push(envCondition);
  if (range?.from) conditions.push(gte(financeEvents.occurredAt, range.from));
  if (range?.to) conditions.push(lte(financeEvents.occurredAt, range.to));
  return conditions;
}

export function financeService(db: Db) {
  const debitExpr = sql<number>`coalesce(sum(case when ${financeEvents.direction} = 'debit' then ${financeEvents.amountCents} else 0 end), 0)::int`;
  const creditExpr = sql<number>`coalesce(sum(case when ${financeEvents.direction} = 'credit' then ${financeEvents.amountCents} else 0 end), 0)::int`;
  const estimatedDebitExpr = sql<number>`coalesce(sum(case when ${financeEvents.direction} = 'debit' and ${financeEvents.estimated} = true then ${financeEvents.amountCents} else 0 end), 0)::int`;

  return {
    createEvent: async (companyId: string, data: Omit<typeof financeEvents.$inferInsert, "companyId">) => {
      if (data.agentId) await assertBelongsToCompany(db, agents, data.agentId, companyId, "Agent");
      if (data.issueId) await assertBelongsToCompany(db, issues, data.issueId, companyId, "Issue");
      if (data.projectId) await assertBelongsToCompany(db, projects, data.projectId, companyId, "Project");
      if (data.goalId) await assertBelongsToCompany(db, goals, data.goalId, companyId, "Goal");
      if (data.heartbeatRunId) await assertBelongsToCompany(db, heartbeatRuns, data.heartbeatRunId, companyId, "Heartbeat run");
      if (data.costEventId) await assertBelongsToCompany(db, costEvents, data.costEventId, companyId, "Cost event");

      const event = await db
        .insert(financeEvents)
        .values({
          ...data,
          companyId,
          operatingEnvironment: data.operatingEnvironment ?? null,
          currency: data.currency ?? "USD",
          direction: data.direction ?? "debit",
          estimated: data.estimated ?? false,
        })
        .returning()
        .then((rows) => rows[0]);

      return event;
    },

    summary: async (companyId: string, range?: FinanceDateRange, environment?: OperatingEnvironment | null) => {
      const conditions = rangeConditions(companyId, range, environment);
      const [row] = await db
        .select({
          debitCents: debitExpr,
          creditCents: creditExpr,
          estimatedDebitCents: estimatedDebitExpr,
          eventCount: sql<number>`count(*)::int`,
        })
        .from(financeEvents)
        .where(and(...conditions));

      return {
        companyId,
        operatingEnvironment: environment ?? null,
        debitCents: Number(row?.debitCents ?? 0),
        creditCents: Number(row?.creditCents ?? 0),
        netCents: Number(row?.debitCents ?? 0) - Number(row?.creditCents ?? 0),
        estimatedDebitCents: Number(row?.estimatedDebitCents ?? 0),
        eventCount: Number(row?.eventCount ?? 0),
      };
    },

    byBiller: async (companyId: string, range?: FinanceDateRange, environment?: OperatingEnvironment | null) => {
      const conditions = rangeConditions(companyId, range, environment);
      return db
        .select({
          biller: financeEvents.biller,
          operatingEnvironment: financeEvents.operatingEnvironment,
          debitCents: debitExpr,
          creditCents: creditExpr,
          estimatedDebitCents: estimatedDebitExpr,
          eventCount: sql<number>`count(*)::int`,
          kindCount: sql<number>`count(distinct ${financeEvents.eventKind})::int`,
          netCents: sql<number>`(${debitExpr} - ${creditExpr})::int`,
        })
        .from(financeEvents)
        .where(and(...conditions))
        .groupBy(financeEvents.biller, financeEvents.operatingEnvironment)
        .orderBy(desc(sql`(${debitExpr} - ${creditExpr})::int`), financeEvents.biller);
    },

    byKind: async (companyId: string, range?: FinanceDateRange, environment?: OperatingEnvironment | null) => {
      const conditions = rangeConditions(companyId, range, environment);
      return db
        .select({
          eventKind: financeEvents.eventKind,
          operatingEnvironment: financeEvents.operatingEnvironment,
          debitCents: debitExpr,
          creditCents: creditExpr,
          estimatedDebitCents: estimatedDebitExpr,
          eventCount: sql<number>`count(*)::int`,
          billerCount: sql<number>`count(distinct ${financeEvents.biller})::int`,
          netCents: sql<number>`(${debitExpr} - ${creditExpr})::int`,
        })
        .from(financeEvents)
        .where(and(...conditions))
        .groupBy(financeEvents.eventKind, financeEvents.operatingEnvironment)
        .orderBy(desc(sql`(${debitExpr} - ${creditExpr})::int`), financeEvents.eventKind);
    },

    list: async (
      companyId: string,
      range?: FinanceDateRange,
      limit: number = 100,
      environment?: OperatingEnvironment | null,
    ) => {
      const conditions = rangeConditions(companyId, range, environment);
      return db
        .select()
        .from(financeEvents)
        .where(and(...conditions))
        .orderBy(desc(financeEvents.occurredAt), desc(financeEvents.createdAt))
        .limit(limit);
    },

    getLedger: async (
      companyId: string,
      principalType: string,
      principalId: string,
      environment?: OperatingEnvironment | null,
    ) => {
      return db
        .select()
        .from(amxLedger)
        .where(and(
          eq(amxLedger.companyId, companyId),
          eq(amxLedger.principalType, principalType),
          eq(amxLedger.principalId, principalId),
          ...(ledgerEnvironmentCondition(environment) ? [ledgerEnvironmentCondition(environment)!] : [])
        ))
        .then(rows => rows[0] ?? null);
    },

    ensureLedger: async (
      companyId: string,
      principalType: string,
      principalId: string,
      environment?: OperatingEnvironment | null,
    ) => {
      const existing = await db
        .select()
        .from(amxLedger)
        .where(and(
          eq(amxLedger.companyId, companyId),
          eq(amxLedger.principalType, principalType),
          eq(amxLedger.principalId, principalId),
          ...(ledgerEnvironmentCondition(environment) ? [ledgerEnvironmentCondition(environment)!] : [])
        ))
        .then(rows => rows[0] ?? null);
      
      if (existing) return existing;

      return db.insert(amxLedger).values({
        companyId,
        principalType,
        principalId,
        operatingEnvironment: environment ?? null,
        tokenBalance: 0,
        creditBalance: 0,
      }).returning().then(rows => rows[0]);
    },

    transferTokens: async (
      from: { companyId: string, type: string, id: string, environment?: OperatingEnvironment | null },
      to: { companyId: string, type: string, id: string, environment?: OperatingEnvironment | null },
      amount: number,
      transactionType: string,
      metadata?: Record<string, unknown>
    ) => {
      return db.transaction(async (tx) => {
        const fromLedger = await tx.select().from(amxLedger).where(and(
          eq(amxLedger.companyId, from.companyId),
          eq(amxLedger.principalType, from.type),
          eq(amxLedger.principalId, from.id),
          ...(ledgerEnvironmentCondition(from.environment) ? [ledgerEnvironmentCondition(from.environment)!] : [])
        )).then(rows => rows[0]);

        if (!fromLedger || fromLedger.tokenBalance < amount) {
          throw unprocessable("Insufficient AMX Token balance");
        }

        // Deduct from sender
        await tx.update(amxLedger)
          .set({ tokenBalance: fromLedger.tokenBalance - amount, updatedAt: new Date() })
          .where(eq(amxLedger.id, fromLedger.id));

        // Ensure recipient ledger exists
        let toLedger = await tx.select().from(amxLedger).where(and(
          eq(amxLedger.companyId, to.companyId),
          eq(amxLedger.principalType, to.type),
          eq(amxLedger.principalId, to.id),
          ...(ledgerEnvironmentCondition(to.environment) ? [ledgerEnvironmentCondition(to.environment)!] : [])
        )).then(rows => rows[0]);

        if (!toLedger) {
          toLedger = await tx.insert(amxLedger).values({
            companyId: to.companyId,
            principalType: to.type,
            principalId: to.id,
            operatingEnvironment: to.environment ?? null,
            tokenBalance: 0,
            creditBalance: 0,
          }).returning().then(rows => rows[0]);
        }

        // Add to recipient
        await tx.update(amxLedger)
          .set({ tokenBalance: toLedger.tokenBalance + amount, updatedAt: new Date() })
          .where(eq(amxLedger.id, toLedger.id));

        // Log transaction
        const transaction = await tx.insert(amxTransactions).values({
          fromCompanyId: from.companyId,
          toCompanyId: to.companyId,
          fromPrincipalType: from.type,
          fromPrincipalId: from.id,
          toPrincipalType: to.type,
          toPrincipalId: to.id,
          amount,
          currency: "AMX",
          transactionType,
          status: "completed",
          metadata,
        }).returning().then(rows => rows[0]);

        // Chain Audit Record
        const chain = amxChainService(db);
        await chain.recordSecurityEvent(from.companyId, from.type, from.id, "LEDGER_TRANSFER", {
          to: to.id,
          amount,
          transactionId: transaction.id
        });

        return transaction;
      });
    },
  };
}
