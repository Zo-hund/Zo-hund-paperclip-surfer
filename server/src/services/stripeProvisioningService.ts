import type { Db } from "@paperclipai/db";
import { stripeSubscriptions, lmsMemberProfiles, stripePrices } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";

// Maps each tier name to the memberTypes[] it grants (additive — each tier includes lower tiers)
export const TIER_MEMBER_TYPES: Record<string, string[]> = {
  learner:    ["learner"],
  builder:    ["builder", "learner"],
  ambassador: ["ambassador", "builder", "learner"],
  earner:     ["earner", "ambassador", "builder", "learner"],
  parent:     ["parent"],
  community:  ["community"],
  volunteer:  ["volunteer"],
  sponsor:    ["sponsor"],
  donor:      ["donor"],
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
}

export async function cancelMember(db: Db, stripeSubscriptionId: string): Promise<void> {
  await db
    .update(stripeSubscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(stripeSubscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

export async function getPriceForTier(db: Db, companyId: string, tierName: string) {
  const rows = await db
    .select()
    .from(stripePrices)
    .where(and(eq(stripePrices.companyId, companyId), eq(stripePrices.tierName, tierName), eq(stripePrices.isActive, 1)))
    .limit(1);
  return rows[0] ?? null;
}
