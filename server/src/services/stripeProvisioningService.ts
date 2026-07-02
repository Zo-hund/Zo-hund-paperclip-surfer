import type { Db } from "@paperclipai/db";
import { stripeSubscriptions, lmsMemberProfiles, stripePrices, amxLedger, amxTransactions } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";

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

export interface ProvisionInput {
  companyId: string;
  userId: string;
  tierName: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodEnd?: Date;
}

export async function provisionMember(db: Db, input: ProvisionInput): Promise<void> {
  const memberTypes = TIER_MEMBER_TYPES[input.tierName] ?? [input.tierName];
  const progressionStage = TIER_PROGRESSION_STAGE[input.tierName];

  // Upsert stripe subscription record
  const existing = await db
    .select({ id: stripeSubscriptions.id })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.stripeSubscriptionId, input.stripeSubscriptionId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(stripeSubscriptions)
      .set({
        status: input.status,
        stripePriceId: input.stripePriceId,
        tierName: input.tierName,
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

    const stageOrder = ["explorer", "builder", "ambassador", "earner", "leader"];
    const currentIdx = stageOrder.indexOf(profile.progressionStage);
    const newIdx = progressionStage ? stageOrder.indexOf(progressionStage) : -1;
    const advancedStage = newIdx > currentIdx ? progressionStage : profile.progressionStage;

    await db
      .update(lmsMemberProfiles)
      .set({ memberTypes: mergedTypes, progressionStage: advancedStage, updatedAt: new Date() })
      .where(eq(lmsMemberProfiles.id, profile.id));
  }

  // Award credits/tokens for the active subscription tier
  const award = TIER_CREDIT_AWARD[input.tierName];
  if (award && (award.credits > 0 || award.tokens > 0)) {
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

  if (sub) {
    // Revoke all granted member types and reset progression stage to explorer
    await db
      .update(lmsMemberProfiles)
      .set({ memberTypes: [], progressionStage: "explorer", updatedAt: new Date() })
      .where(
        and(
          eq(lmsMemberProfiles.companyId, sub.companyId),
          eq(lmsMemberProfiles.userId, sub.userId),
        ),
      );
  }
}

export async function getPriceForTier(db: Db, companyId: string, tierName: string) {
  const rows = await db
    .select()
    .from(stripePrices)
    .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.tierName, tierName), eq(stripePrices.isActive, 1)))
    .limit(1);
  return rows[0] ?? null;
}
