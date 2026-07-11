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
 * On-demand micro-service catalog — single deliverables priced in credits,
 * submittable as an RQ alongside the three big tiers. Persisted on
 * rq_submissions as tier `svc_<key>` (the tier column is free text).
 */
export const MICRO_SERVICES = {
  social_post_pack: {
    label: "Social Post Pack",
    description: "12 branded social posts per month",
    creditCost: 2_500,
    segment: "general",
  },
  seo_blog_article: {
    label: "SEO Blog Article",
    description: "1,000-word SEO-optimized article",
    creditCost: 1_500,
    segment: "general",
  },
  brand_voice_setup: {
    label: "Brand Voice + Context Setup",
    description: "Brand voice definition and context onboarding",
    creditCost: 7_500,
    segment: "general",
  },
  landing_page_chatbot: {
    label: "Landing Page + Chatbot",
    description: "Context-aware landing page with embedded chatbot",
    creditCost: 15_000,
    segment: "general",
  },
  print_design: {
    label: "Print Design Pack",
    description: "Business card, flyer, or banner design",
    creditCost: 2_000,
    segment: "general",
  },
  video_script_avatar: {
    label: "Video Script + AI Avatar",
    description: "Video script with AI avatar clip",
    creditCost: 5_000,
    segment: "general",
  },
  grant_writing_draft: {
    label: "Grant-Writing Draft",
    description: "Grant application draft for nonprofit programs",
    creditCost: 8_000,
    segment: "nonprofit",
  },
  donor_campaign_kit: {
    label: "Donor Campaign Kit",
    description: "Donor outreach campaign with assets",
    creditCost: 6_000,
    segment: "nonprofit",
  },
  product_model_3d: {
    label: "3D Product Model",
    description: "Metaverse-ready 3D product model",
    creditCost: 20_000,
    segment: "general",
  },
  digital_twin: {
    label: "Geospatial Digital Twin",
    description: "Geospatial digital twin of a site or venue",
    creditCost: 50_000,
    segment: "general",
  },
  jaz_meeting_session: {
    label: "JAZ Meeting-Agent Session",
    description: "Hosted meeting session with the JAZ voice agent",
    creditCost: 300,
    segment: "general",
  },
  pow_certificate: {
    label: "PoW Certificate Mint",
    description: "Blockchain-verified proof-of-work certificate",
    creditCost: 500,
    segment: "general",
  },
} as const satisfies Record<
  string,
  { label: string; description: string; creditCost: number; segment: "general" | "nonprofit" }
>;

export type MicroServiceKey = keyof typeof MICRO_SERVICES;

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

/**
 * Agent Marketplace run-phase billing multipliers, applied to a listing's
 * hourly rate (hourlyRateSims) when pricing a hire. Simulation and
 * post-production runs are discounted; live/production bill at full rate.
 */
export const MARKETPLACE_PHASE_MULTIPLIERS = {
  simulation: 0.3,
  pre_production: 0.6,
  production: 1.0,
  live: 1.0,
  post_production: 0.4,
} as const;

/**
 * Platform fee (fraction of the booking total) deducted from the provider
 * payout on marketplace hires — the buyer pays the full booking amount.
 */
export const MARKETPLACE_PLATFORM_FEE = 0.1;
