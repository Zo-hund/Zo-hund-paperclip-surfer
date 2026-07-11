import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { amxLedger, amxGlobalLedger, amxTransactions } from "@paperclipai/db";

/**
 * Credit wallet — the spend side of the credit economy.
 *
 * Until this service existed, every path in the platform only ever GREW
 * creditBalance (pack purchases, tier awards, LMS earn); nothing decremented
 * it. All spends must go through spendCredits so the debit, the ledger
 * transaction, and the insufficient-balance rejection stay consistent.
 *
 * Escrow model mirrors lms.ts marketplace bookings: a charge moves credits
 * from the buyer's ledger row to a system escrow principal (which has no
 * ledger row of its own — the transactions ARE the escrow record). A refund
 * re-credits the buyer from that principal.
 *
 * Two ledgers back a spend: the company-scoped amx_ledger row (tier awards,
 * earned credits) is drained first, then the platform-wide amx_global_ledger
 * row (purchased credits, spendable in any company) covers the remainder.
 */

export class InsufficientCreditsError extends Error {
  needed: number;
  balance: number;
  constructor(needed: number, balance: number) {
    super(`Insufficient credits: need ${needed}, have ${balance}`);
    this.name = "InsufficientCreditsError";
    this.needed = needed;
    this.balance = balance;
  }
}

export interface SpendInput {
  companyId: string;
  principalId: string;
  /** Credits to debit; must be a positive integer. */
  amount: number;
  /** System principal receiving the charge (e.g. "rq-factory-escrow"). */
  toPrincipalId: string;
  transactionType: string;
  metadata?: Record<string, unknown>;
}

/** Debits the buyer's creditBalance — company-scoped row first, then the
 * global (purchased-credits) row for any remainder — and records ONE
 * transaction for the total. Returns the transaction id. Throws
 * InsufficientCreditsError when the combined company+global balance (missing
 * rows treated as 0) can't cover the amount. */
export async function spendCredits(db: Db, input: SpendInput): Promise<string> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("spendCredits amount must be a positive integer");
  }

  const [ledger] = await db
    .select()
    .from(amxLedger)
    .where(
      and(
        eq(amxLedger.companyId, input.companyId),
        eq(amxLedger.principalType, "user"),
        eq(amxLedger.principalId, input.principalId),
      ),
    )
    .limit(1);

  const [globalLedger] = await db
    .select()
    .from(amxGlobalLedger)
    .where(
      and(
        eq(amxGlobalLedger.principalType, "user"),
        eq(amxGlobalLedger.principalId, input.principalId),
      ),
    )
    .limit(1);

  const companyBalance = ledger?.creditBalance ?? 0;
  const globalBalance = globalLedger?.creditBalance ?? 0;
  if (companyBalance + globalBalance < input.amount) {
    throw new InsufficientCreditsError(input.amount, companyBalance + globalBalance);
  }

  const companySpent = Math.min(companyBalance, input.amount);
  const globalSpent = input.amount - companySpent;

  if (companySpent > 0) {
    await db
      .update(amxLedger)
      .set({ creditBalance: companyBalance - companySpent, updatedAt: new Date() })
      .where(
        and(
          eq(amxLedger.companyId, input.companyId),
          eq(amxLedger.principalType, "user"),
          eq(amxLedger.principalId, input.principalId),
        ),
      );
  }

  if (globalSpent > 0) {
    await db
      .update(amxGlobalLedger)
      .set({ creditBalance: globalBalance - globalSpent, updatedAt: new Date() })
      .where(
        and(
          eq(amxGlobalLedger.principalType, "user"),
          eq(amxGlobalLedger.principalId, input.principalId),
        ),
      );
  }

  const [tx] = await db
    .insert(amxTransactions)
    .values({
      fromCompanyId: input.companyId,
      toCompanyId: input.companyId,
      fromPrincipalType: "user",
      fromPrincipalId: input.principalId,
      toPrincipalType: "system",
      toPrincipalId: input.toPrincipalId,
      amount: input.amount,
      currency: "CREDIT",
      transactionType: input.transactionType,
      status: "completed",
      metadata: { ...(input.metadata ?? {}), companySpent, globalSpent },
    })
    .returning({ id: amxTransactions.id });

  return tx!.id;
}

/** Reads the buyer's company-scoped and global credit balances (missing rows
 * treated as 0) without mutating anything. */
export async function getCombinedBalance(
  db: Db,
  params: { companyId: string; principalId: string },
): Promise<{ companyCredits: number; globalCredits: number; total: number }> {
  const [ledger] = await db
    .select()
    .from(amxLedger)
    .where(
      and(
        eq(amxLedger.companyId, params.companyId),
        eq(amxLedger.principalType, "user"),
        eq(amxLedger.principalId, params.principalId),
      ),
    )
    .limit(1);

  const [globalLedger] = await db
    .select()
    .from(amxGlobalLedger)
    .where(
      and(
        eq(amxGlobalLedger.principalType, "user"),
        eq(amxGlobalLedger.principalId, params.principalId),
      ),
    )
    .limit(1);

  const companyCredits = ledger?.creditBalance ?? 0;
  const globalCredits = globalLedger?.creditBalance ?? 0;
  return { companyCredits, globalCredits, total: companyCredits + globalCredits };
}

export interface RefundInput {
  companyId: string;
  principalId: string;
  amount: number;
  /** System principal the original charge went to. */
  fromPrincipalId: string;
  transactionType: string;
  metadata?: Record<string, unknown>;
}

/** Re-credits a buyer from a system escrow principal (reverses a spend).
 * Creates the ledger row if the buyer's was deleted in the meantime. */
export async function refundCredits(db: Db, input: RefundInput): Promise<string> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("refundCredits amount must be a positive integer");
  }

  const [ledger] = await db
    .select()
    .from(amxLedger)
    .where(
      and(
        eq(amxLedger.companyId, input.companyId),
        eq(amxLedger.principalType, "user"),
        eq(amxLedger.principalId, input.principalId),
      ),
    )
    .limit(1);

  if (ledger) {
    await db
      .update(amxLedger)
      .set({ creditBalance: ledger.creditBalance + input.amount, updatedAt: new Date() })
      .where(
        and(
          eq(amxLedger.companyId, input.companyId),
          eq(amxLedger.principalType, "user"),
          eq(amxLedger.principalId, input.principalId),
        ),
      );
  } else {
    await db.insert(amxLedger).values({
      companyId: input.companyId,
      principalType: "user",
      principalId: input.principalId,
      creditBalance: input.amount,
      tokenBalance: 0,
    });
  }

  const [tx] = await db
    .insert(amxTransactions)
    .values({
      fromCompanyId: input.companyId,
      toCompanyId: input.companyId,
      fromPrincipalType: "system",
      fromPrincipalId: input.fromPrincipalId,
      toPrincipalType: "user",
      toPrincipalId: input.principalId,
      amount: input.amount,
      currency: "CREDIT",
      transactionType: input.transactionType,
      status: "completed",
      metadata: input.metadata ?? {},
    })
    .returning({ id: amxTransactions.id });

  return tx!.id;
}

export interface AwardAgentTokensInput {
  companyId: string;
  /** The fulfilling agent — becomes principalId of the 'agent' ledger row. */
  agentId: string;
  /** Tokens to credit; must be a positive integer. */
  amount: number;
  transactionType: string;
  metadata?: Record<string, unknown>;
}

/** Credits an agent's company-scoped wallet with TOKENS (the earner/payout
 * currency) released from RQ escrow. Agent wallets are ordinary amx_ledger
 * rows with principalType 'agent' — created here on first earning. Records
 * an AMX transaction from the escrow principal to the agent and returns its
 * id. */
export async function awardAgentTokens(db: Db, input: AwardAgentTokensInput): Promise<string> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("awardAgentTokens amount must be a positive integer");
  }

  const [ledger] = await db
    .select()
    .from(amxLedger)
    .where(
      and(
        eq(amxLedger.companyId, input.companyId),
        eq(amxLedger.principalType, "agent"),
        eq(amxLedger.principalId, input.agentId),
      ),
    )
    .limit(1);

  if (ledger) {
    await db
      .update(amxLedger)
      .set({ tokenBalance: ledger.tokenBalance + input.amount, updatedAt: new Date() })
      .where(
        and(
          eq(amxLedger.companyId, input.companyId),
          eq(amxLedger.principalType, "agent"),
          eq(amxLedger.principalId, input.agentId),
        ),
      );
  } else {
    await db.insert(amxLedger).values({
      companyId: input.companyId,
      principalType: "agent",
      principalId: input.agentId,
      creditBalance: 0,
      tokenBalance: input.amount,
    });
  }

  const [tx] = await db
    .insert(amxTransactions)
    .values({
      fromCompanyId: input.companyId,
      toCompanyId: input.companyId,
      fromPrincipalType: "system",
      // Earnings are released from RQ escrow — same principal the original
      // charge was parked at (RQ_ESCROW_PRINCIPAL_ID).
      fromPrincipalId: "rq-factory-escrow",
      toPrincipalType: "agent",
      toPrincipalId: input.agentId,
      amount: input.amount,
      currency: "AMX",
      transactionType: input.transactionType,
      status: "completed",
      metadata: input.metadata ?? {},
    })
    .returning({ id: amxTransactions.id });

  return tx!.id;
}
