import type { Db } from "@paperclipai/db";
import { stripeSubscriptions, lmsMemberProfiles, stripePrices, amxLedger, amxTransactions, companyMemberships } from "@paperclipai/db";
import { eq, and, inArray, count, sql } from "drizzle-orm";
import { TIER_MONTHLY_ALLOWANCE, SEAT_TIER_NAME } from "@paperclipai/shared";
import { amxChainService } from "./amxChainService.js";

// Maps each tier name to the memberTypes[] it grants (additive — each tier includes lower tiers)
export const TIER_MEMBER_TYPES: Record<string, string[]> = {
  learner:            ["learner"],
  builder:            ["builder", "learner"],
  ambassador:         ["ambassador", "builder", "learner"],
  earner:             ["earner", "ambassador", "builder", "learner"],
  parent:             ["parent"],
  community:          ["community"],
  volunteer:          ["volunteer"],
  sponsor:            ["sponsor"],
  donor:              ["donor"],
  // Weekly + drop-in
  dropin_pass:        ["learner"],
  member_weekly:      ["learner"],
  access_hub:         ["builder", "learner"],
  // Partner
  partner_free:       ["partner"],
  partner_pro:        ["partner"],
  // Org
  nonprofit_baseline: ["learner", "community"],
  business_micro:     ["learner"],
};

// Credits and tokens granted when a subscription becomes active
export const TIER_CREDIT_AWARD: Record<string, { credits: number; tokens: number }> = {
  learner:            { credits: 200,  tokens: 0 },
  builder:            { credits: 500,  tokens: 50 },
  ambassador:         { credits: 1000, tokens: 150 },
  earner:             { credits: 2000, tokens: 500 },
  parent:             { credits: 100,  tokens: 0 },
  community:          { credits: 50,   tokens: 0 },
  volunteer:          { credits: 0,    tokens: 0 },
  sponsor:            { credits: 5000, tokens: 0 },
  donor:              { credits: 2500, tokens: 0 },
  // Weekly + drop-in
  dropin_pass:        { credits: 50,   tokens: 0 },
  member_weekly:      { credits: 100,  tokens: 0 },
  access_hub:         { credits: 300,  tokens: 25 },
  // Partner
  partner_free:       { credits: 0,    tokens: 0 },
  partner_pro:        { credits: 500,  tokens: 50 },
  // Org
  nonprofit_baseline: { credits: 100,  tokens: 0 },
  business_micro:     { credits: 300,  tokens: 0 },
};

// Maps tier name to the minimum progressionStage it unlocks
export const TIER_PROGRESSION_STAGE: Record<string, string> = {
  builder:    "builder",
  ambassador: "ambassador",
  earner:     "earner",
};

const PROGRESSION_STAGE_ORDER = ["explorer", "builder", "ambassador", "earner", "leader"];

export interface ProvisionInput {
  companyId: string;
  userId: string;
  tierName: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodEnd?: Date;
  /** Stripe subscription item quantity. Defaults to 1 (matching the column
   * default) when omitted — every non-seat subscription kind ignores this. */
  quantity?: number;
}

export async function provisionMember(db: Db, input: ProvisionInput): Promise<void> {
  const memberTypes = TIER_MEMBER_TYPES[input.tierName] ?? [input.tierName];
  const progressionStage = TIER_PROGRESSION_STAGE[input.tierName];

  // Upsert stripe subscription record. Capture the PRIOR status so credits are
  // awarded only on the transition INTO an active state — not on every
  // subscription.updated (renewals, plan/payment edits) or webhook redelivery,
  // which would otherwise re-grant the full tier award each time.
  const existing = await db
    .select({ id: stripeSubscriptions.id, status: stripeSubscriptions.status })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.stripeSubscriptionId, input.stripeSubscriptionId))
    .limit(1);

  const priorStatus = existing[0]?.status ?? null;
  const wasActive = priorStatus === "active" || priorStatus === "trialing";

  if (existing.length > 0) {
    await db
      .update(stripeSubscriptions)
      .set({
        status: input.status,
        stripePriceId: input.stripePriceId,
        tierName: input.tierName,
        quantity: input.quantity ?? 1,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        updatedAt: new Date(),
      })
      .where(eq(stripeSubscriptions.stripeSubscriptionId, input.stripeSubscriptionId));
  } else {
    await db.insert(stripeSubscriptions).values({
      companyId: input.companyId,
      userId: input.userId,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripePriceId: input.stripePriceId,
      tierName: input.tierName,
      status: input.status,
      quantity: input.quantity ?? 1,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
    });
  }

  if (input.status !== "active" && input.status !== "trialing") return;

  // Upsert lmsMemberProfile — merge memberTypes and optionally advance progressionStage
  const profileRows = await db
    .select()
    .from(lmsMemberProfiles)
    .where(and(eq(lmsMemberProfiles.companyId, input.companyId), eq(lmsMemberProfiles.userId, input.userId)))
    .limit(1);

  if (profileRows.length === 0) {
    await db.insert(lmsMemberProfiles).values({
      companyId: input.companyId,
      userId: input.userId,
      memberTypes,
      progressionStage: progressionStage ?? "explorer",
    });
  } else {
    const profile = profileRows[0]!;
    const existingTypes = (profile.memberTypes as string[]) ?? [];
    const mergedTypes = Array.from(new Set([...existingTypes, ...memberTypes]));

    const currentIdx = PROGRESSION_STAGE_ORDER.indexOf(profile.progressionStage);
    const newIdx = progressionStage ? PROGRESSION_STAGE_ORDER.indexOf(progressionStage) : -1;
    const advancedStage = newIdx > currentIdx ? progressionStage : profile.progressionStage;

    await db
      .update(lmsMemberProfiles)
      .set({ memberTypes: mergedTypes, progressionStage: advancedStage, updatedAt: new Date() })
      .where(eq(lmsMemberProfiles.id, profile.id));
  }

  // Award credits/tokens for the active subscription tier — ONCE, on the
  // transition into active. If the subscription was already active/trialing,
  // this is a renewal/update/redelivery and must not re-grant.
  const award = TIER_CREDIT_AWARD[input.tierName];
  if (!wasActive && award && (award.credits > 0 || award.tokens > 0)) {
    await db.insert(amxTransactions).values({
      fromCompanyId: input.companyId,
      toCompanyId: input.companyId,
      fromPrincipalType: "system",
      fromPrincipalId: "stripe-subscription",
      toPrincipalType: "user",
      toPrincipalId: input.userId,
      amount: award.credits + award.tokens,
      currency: "CREDIT",
      transactionType: "subscription_award",
      status: "completed",
      metadata: { tierName: input.tierName, credits: award.credits, tokens: award.tokens },
    });

    const [existingLedger] = await db.select().from(amxLedger)
      .where(and(eq(amxLedger.companyId, input.companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, input.userId)));

    if (existingLedger) {
      await db.update(amxLedger)
        .set({
          creditBalance: existingLedger.creditBalance + award.credits,
          tokenBalance: existingLedger.tokenBalance + award.tokens,
          updatedAt: new Date(),
        })
        .where(and(eq(amxLedger.companyId, input.companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, input.userId)));
    } else {
      await db.insert(amxLedger).values({
        companyId: input.companyId,
        principalType: "user",
        principalId: input.userId,
        creditBalance: award.credits,
        tokenBalance: award.tokens,
      });
    }
  }
}

export interface MonthlyAllowanceInput {
  companyId: string;
  userId: string;
  tierName: string;
  invoiceId: string;
}

/**
 * Grants the tier's recurring credit allowance for one billing cycle.
 * Called from the invoice.paid webhook on subscription_cycle renewals —
 * month 1 is covered by the one-time TIER_CREDIT_AWARD in provisionMember.
 * Event-level idempotency is handled upstream by stripeProcessedEvents.
 */
export async function awardMonthlyAllowance(
  db: Db,
  input: MonthlyAllowanceInput,
): Promise<{ awarded: number }> {
  const allowance = TIER_MONTHLY_ALLOWANCE[input.tierName];
  if (!allowance || allowance <= 0) return { awarded: 0 };

  const [tx] = await db.insert(amxTransactions).values({
    fromCompanyId: input.companyId,
    toCompanyId: input.companyId,
    fromPrincipalType: "system",
    fromPrincipalId: "stripe-subscription",
    toPrincipalType: "user",
    toPrincipalId: input.userId,
    amount: allowance,
    currency: "CREDIT",
    transactionType: "monthly_allowance",
    status: "completed",
    metadata: { tierName: input.tierName, invoiceId: input.invoiceId },
  }).returning({ id: amxTransactions.id });

  const [existingLedger] = await db.select().from(amxLedger)
    .where(and(eq(amxLedger.companyId, input.companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, input.userId)));

  if (existingLedger) {
    await db.update(amxLedger)
      .set({
        creditBalance: existingLedger.creditBalance + allowance,
        updatedAt: new Date(),
      })
      .where(and(eq(amxLedger.companyId, input.companyId), eq(amxLedger.principalType, "user"), eq(amxLedger.principalId, input.userId)));
  } else {
    await db.insert(amxLedger).values({
      companyId: input.companyId,
      principalType: "user",
      principalId: input.userId,
      creditBalance: allowance,
      tokenBalance: 0,
    });
  }

  // Chain-of-custody record — best-effort, must never block the allowance grant.
  try {
    await amxChainService(db).recordSecurityEvent(input.companyId, "user", input.userId, "MONTHLY_ALLOWANCE", {
      transactionId: tx!.id,
      amount: allowance,
      invoiceId: input.invoiceId,
    });
  } catch (err) {
    console.warn("[stripeProvisioningService] failed to record MONTHLY_ALLOWANCE chain event", err);
  }

  return { awarded: allowance };
}

export async function cancelMember(db: Db, stripeSubscriptionId: string): Promise<void> {
  // Resolve the subscription record so we can cascade to the member profile
  const [sub] = await db
    .select({ companyId: stripeSubscriptions.companyId, userId: stripeSubscriptions.userId })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  await db
    .update(stripeSubscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(stripeSubscriptions.stripeSubscriptionId, stripeSubscriptionId));

  if (!sub) return;

  // Tiers are additive and a member can hold several subscriptions at once
  // (e.g. builder + parent), so canceling one plan must not revoke what the
  // others still grant. Recompute entitlements from the REMAINING
  // active/trialing subscriptions rather than wiping the profile.
  const remaining = await db
    .select({ tierName: stripeSubscriptions.tierName })
    .from(stripeSubscriptions)
    .where(
      and(
        eq(stripeSubscriptions.companyId, sub.companyId),
        eq(stripeSubscriptions.userId, sub.userId),
        inArray(stripeSubscriptions.status, ["active", "trialing"]),
      ),
    );

  const memberTypes = Array.from(
    new Set(remaining.flatMap((r) => TIER_MEMBER_TYPES[r.tierName] ?? [r.tierName])),
  );
  const progressionStage = remaining.reduce((best, r) => {
    const stage = TIER_PROGRESSION_STAGE[r.tierName];
    if (!stage) return best;
    return PROGRESSION_STAGE_ORDER.indexOf(stage) > PROGRESSION_STAGE_ORDER.indexOf(best) ? stage : best;
  }, "explorer");

  await db
    .update(lmsMemberProfiles)
    .set({ memberTypes, progressionStage, updatedAt: new Date() })
    .where(
      and(
        eq(lmsMemberProfiles.companyId, sub.companyId),
        eq(lmsMemberProfiles.userId, sub.userId),
      ),
    );
}

/**
 * Total purchased team seats for a company — the sum of `quantity` across
 * every stripeSubscriptions row with tierName = SEAT_TIER_NAME whose status
 * is active or trialing. A company can hold at most one seat subscription in
 * practice (checkout upserts by stripeSubscriptionId), but this sums across
 * all matching rows defensively rather than assuming exactly one.
 */
export async function getPurchasedSeats(db: Db, companyId: string): Promise<number> {
  const rows = await db
    .select({ quantity: stripeSubscriptions.quantity })
    .from(stripeSubscriptions)
    .where(
      and(
        eq(stripeSubscriptions.companyId, companyId),
        eq(stripeSubscriptions.tierName, SEAT_TIER_NAME),
        inArray(stripeSubscriptions.status, ["active", "trialing"]),
      ),
    );
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

/**
 * Number of active human team members currently consuming a seat — every
 * active `company_memberships` row with principalType="user" EXCEPT the
 * company owner, who is free and doesn't count against the seat cap.
 */
export async function getUsedSeats(db: Db, companyId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.status, "active"),
        // membershipRole is nullable — use IS DISTINCT FROM so a null role
        // (never explicitly set to "owner") still counts as a used seat
        // instead of being silently dropped by NULL's three-valued <> logic.
        sql`${companyMemberships.membershipRole} is distinct from 'owner'`,
      ),
    );
  return row?.value ?? 0;
}

export async function getPriceForTier(db: Db, companyId: string, tierName: string) {
  const rows = await db
    .select()
    .from(stripePrices)
    .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.tierName, tierName), eq(stripePrices.isActive, 1)))
    .limit(1);
  return rows[0] ?? null;
}
