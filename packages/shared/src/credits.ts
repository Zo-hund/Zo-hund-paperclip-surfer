/**
 * Canonical credit-economy constants.
 *
 * Single source of truth for credit pack sizes/prices and RQ Factory tier
 * pricing. Server routes (stripe.ts, amx.ts) and the UI must import from
 * here — these amounts were previously hardcoded in three separate files
 * and had already started to require manual synchronization.
 *
 * Currency model:
 * - CREDITS (amx_ledger.creditBalance) — the customer spend currency.
 *   Bought in packs (~1¢/credit retail, sliding to ~0.5¢ at volume) or
 *   granted by membership tiers. Spent on RQ Factory work.
 * - TOKENS (amx_ledger.tokenBalance) — the earner/payout currency
 *   (marketplace escrow payouts, tier bonuses).
 */

export const CREDIT_PACKAGES = [
  { tierName: "credits_starter",    credits: 1_000,   amountCents: 900,    label: "Starter Block" },
  { tierName: "credits_pro",        credits: 5_000,   amountCents: 3_900,  label: "Pro Block" },
  { tierName: "credits_enterprise", credits: 25_000,  amountCents: 14_900, label: "Enterprise Block" },
  { tierName: "credits_scale",      credits: 100_000, amountCents: 49_900, label: "Scale Block" },
] as const;

export type CreditPackageTier = (typeof CREDIT_PACKAGES)[number]["tierName"];

/** tierName → credits granted. Derived, never restate by hand. */
export const CREDIT_PACKAGE_AMOUNTS: Record<string, number> = Object.fromEntries(
  CREDIT_PACKAGES.map((p) => [p.tierName, p.credits]),
);

/**
 * RQ Factory tiers, priced in credits at the ~1¢/credit anchor so the
 * legacy fiat framing ($1k/$2k/$3k) maps 1:1 onto credit costs.
 * Simulation runs are free — only live production runs charge.
 */
export const RQ_TIERS = {
  digital_foundation:   { label: "Digital Foundation",   creditCost: 100_000 },
  hybrid_growth:        { label: "Hybrid Growth",        creditCost: 200_000 },
  metaverse_enterprise: { label: "Metaverse Enterprise", creditCost: 300_000 },
} as const;

export type RqTier = keyof typeof RQ_TIERS;

/** Legacy route slugs still sent by older clients — map to canonical tiers. */
export const RQ_TIER_ALIASES: Record<string, RqTier> = {
  starter: "digital_foundation",
  pro: "hybrid_growth",
  enterprise: "metaverse_enterprise",
};

/** Resolves a canonical or legacy tier slug; returns null when unknown. */
export function resolveRqTier(slug: string): RqTier | null {
  if (slug in RQ_TIERS) return slug as RqTier;
  return RQ_TIER_ALIASES[slug] ?? null;
}

/** System principal that holds charged-but-not-yet-released RQ credits. */
export const RQ_ESCROW_PRINCIPAL_ID = "rq-factory-escrow";

/**
 * Credits granted EVERY billing cycle for membership tiers (recurring
 * allowance, applied on invoice.paid renewals). Distinct from
 * TIER_CREDIT_AWARD in server stripeProvisioningService.ts, which is the
 * one-time signup bonus granted only on the transition into active.
 */
export const TIER_MONTHLY_ALLOWANCE: Record<string, number> = {
  // AMX Labs seat tiers
  solo: 2500,
  coop_2: 4000,
  coop_3: 7500,
  team_15: 30000,
  // Org tiers
  nonprofit_baseline: 1000,
  business_micro: 3000,
  // TAN progression tiers
  learner: 200,
  builder: 500,
  ambassador: 1000,
  earner: 2000,
};
