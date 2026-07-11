import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { amxLedger, amxTransactions } from "@paperclipai/db";

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

/** Debits the buyer's creditBalance and records the transaction. Returns the
 * transaction id. Throws InsufficientCreditsError when the balance (or a
 * missing ledger row, treated as 0) can't cover the amount. */
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

  const balance = ledger?.creditBalance ?? 0;
  if (!ledger || balance < input.amount) {
    throw new InsufficientCreditsError(input.amount, balance);
  }

  await db
    .update(amxLedger)
    .set({ creditBalance: balance - input.amount, updatedAt: new Date() })
    .where(
      and(
        eq(amxLedger.companyId, input.companyId),
        eq(amxLedger.principalType, "user"),
        eq(amxLedger.principalId, input.principalId),
      ),
    );

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
      metadata: input.metadata ?? {},
    })
    .returning({ id: amxTransactions.id });

  return tx!.id;
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
