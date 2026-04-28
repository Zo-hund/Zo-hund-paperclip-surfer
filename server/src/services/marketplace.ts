import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  authUsers,
  lmsEnrollments,
  lmsWorkshops,
  marketplaceListings,
  marketplaceProfiles,
} from "@paperclipai/db";
import { badRequest, notFound, unprocessable } from "../errors.js";
import {
  buildGuidanceProgress,
  ensureGuidanceChecklistId,
  ensureGuidanceLessonId,
  getGuidanceSections,
} from "./lmsGuidance.js";

const DEFAULT_LMS_CREDITS = 500;
const DEFAULT_AMX_TOKENS = 750;
const LISTING_TYPES = ["agent", "coop", "team"] as const;
const AMX_MICROSERVICES_PROVIDER_USER_ID = "amx-microservices-provider";
const AMX_MICROSERVICES_PROVIDER_LISTING_NAME = "amx-microservices-provider";
const AMX_MICROSERVICES_PROVIDER_PROFILE = {
  displayName: "AMX Skills Agents Provider",
  headline: "Microservice skill agents for AMX media and automation workflows",
  bio: "Official AMX provider team for microservice-backed skills including image generation, video workflows, audio/TTS, and on-demand webhook callbacks.",
  roleIntent: "partner",
  partnerStatus: "active",
  eligibilityStatus: "eligible",
  availability: "available",
  skills: [
    "image",
    "video",
    "audio",
    "webhook",
    "OpenAI image routing",
    "callback intake",
  ],
  badges: ["Official AMX Provider", "Microservices", "Skills Marketplace"],
  supportedRunPhases: ["learn", "pit-stop", "simulation", "live", "content-production"],
};
const AMX_MICROSERVICES_PROVIDER_LISTING = {
  listingType: "team" as const,
  status: "active",
  name: AMX_MICROSERVICES_PROVIDER_LISTING_NAME,
  title: "AMX Microservices Skills Agents Provider",
  description:
    "Official provider team for microservice-backed skills including image generation, video workflows, audio/TTS, and on-demand webhook callbacks.",
  skills: [
    "image-microservice-router",
    "video-microservice-router",
    "audio-microservice-router",
    "ondemand-webhook-intake",
    "gpt-image-1.5",
    "chatgpt-image-latest",
  ],
  badges: ["Official AMX", "Skills Provider", "Microservices", "Media Routing"],
  hourlyRateTokens: 100,
  availability: "available",
  supportedRunPhases: ["learn", "pit-stop", "simulation", "live", "content-production"],
  payoutWallet: null,
  location: "AMX Skills Marketplace",
};

export type ListingType = (typeof LISTING_TYPES)[number];

export interface EligibilitySummary {
  completedEnrollments: number;
  activeSimulations: number;
  totalCertificates: number;
  totalHoursTrained: number;
  requiredCompleted: boolean;
  eligibleForPartner: boolean;
}

export interface MarketplaceReadinessSummary {
  eligibility: EligibilitySummary;
  guidance: ReturnType<typeof buildGuidanceProgress>;
}

export function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export function marketplaceService(db: Db) {
  async function ensureAmxMicroservicesProviderListing(companyId: string) {
    const now = new Date();
    const existingProfile = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, AMX_MICROSERVICES_PROVIDER_USER_ID))
      .then((rows) => rows[0] ?? null);

    if (existingProfile) {
      await db
        .update(marketplaceProfiles)
        .set({
          ...AMX_MICROSERVICES_PROVIDER_PROFILE,
          updatedAt: now,
        })
        .where(eq(marketplaceProfiles.userId, AMX_MICROSERVICES_PROVIDER_USER_ID));
    } else {
      await db.insert(marketplaceProfiles).values({
        userId: AMX_MICROSERVICES_PROVIDER_USER_ID,
        ...AMX_MICROSERVICES_PROVIDER_PROFILE,
        lmsCredits: DEFAULT_LMS_CREDITS,
        amxTokenBalance: 0,
        updatedAt: now,
      });
    }

    const existingListing = await db
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.companyId, companyId),
          eq(marketplaceListings.providerUserId, AMX_MICROSERVICES_PROVIDER_USER_ID),
          eq(marketplaceListings.name, AMX_MICROSERVICES_PROVIDER_LISTING_NAME),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (existingListing) {
      await db
        .update(marketplaceListings)
        .set({
          ...AMX_MICROSERVICES_PROVIDER_LISTING,
          updatedAt: now,
        })
        .where(eq(marketplaceListings.id, existingListing.id));
      return;
    }

    await db.insert(marketplaceListings).values({
      companyId,
      providerUserId: AMX_MICROSERVICES_PROVIDER_USER_ID,
      ...AMX_MICROSERVICES_PROVIDER_LISTING,
      updatedAt: now,
    });
  }

  async function ensureProfile(userId: string, seed?: { displayName?: string | null }) {
    const existing = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, userId))
      .then((rows) => rows[0] ?? null);

    if (existing) return existing;

    return db
      .insert(marketplaceProfiles)
      .values({
        userId,
        displayName: seed?.displayName ?? null,
        lmsCredits: DEFAULT_LMS_CREDITS,
        amxTokenBalance: DEFAULT_AMX_TOKENS,
        skills: [],
        badges: [],
        supportedRunPhases: [],
        guidanceCompletedLessons: [],
        guidanceCompletedChecklist: [],
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async function updateProfile(
    userId: string,
    input: {
      displayName?: string | null;
      headline?: string | null;
      bio?: string | null;
      location?: string | null;
      roleIntent?: string;
      payoutWallet?: string | null;
      availability?: string | null;
      skills?: string[];
      badges?: string[];
      supportedRunPhases?: string[];
    },
  ) {
    await ensureProfile(userId);
    return db
      .update(marketplaceProfiles)
      .set({
        displayName: input.displayName ?? undefined,
        headline: input.headline ?? undefined,
        bio: input.bio ?? undefined,
        location: input.location ?? undefined,
        roleIntent: input.roleIntent ?? undefined,
        payoutWallet: input.payoutWallet ?? undefined,
        availability: input.availability ?? undefined,
        skills: input.skills ?? undefined,
        badges: input.badges ?? undefined,
        supportedRunPhases: input.supportedRunPhases ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, userId))
      .returning()
      .then((rows) => rows[0]);
  }

  async function getAuthUserName(userId: string) {
    const user = await db
      .select({ name: authUsers.name, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);

    return user?.name || user?.email || null;
  }

  async function summarizeEligibility(userId: string, companyId?: string) {
    const enrollments = await db
      .select({
        status: lmsEnrollments.status,
        score: lmsEnrollments.score,
        certificatesAwarded: lmsEnrollments.certificatesAwarded,
        creditsAwarded: lmsWorkshops.creditsAwarded,
        category: lmsWorkshops.name,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsWorkshops, eq(lmsEnrollments.workshopId, lmsWorkshops.id))
      .where(
        companyId
          ? and(eq(lmsEnrollments.userId, userId), eq(lmsEnrollments.companyId, companyId))
          : eq(lmsEnrollments.userId, userId),
      );

    const completedEnrollments = enrollments.filter((row) =>
      row.status === "completed" || row.status === "certified",
    ).length;
    const activeSimulations = enrollments.filter((row) => row.status === "active_simulation").length;
    const totalCertificates = enrollments.reduce((sum, row) => {
      const certificates = Array.isArray(row.certificatesAwarded) ? row.certificatesAwarded.length : 0;
      return sum + certificates;
    }, 0);

    return {
      completedEnrollments,
      activeSimulations,
      totalCertificates,
      totalHoursTrained: completedEnrollments * 4 + activeSimulations * 2,
      requiredCompleted: completedEnrollments >= 1,
      eligibleForPartner: completedEnrollments >= 1,
    } satisfies EligibilitySummary;
  }

  async function syncEligibility(userId: string) {
    const summary = await summarizeEligibility(userId);
    await ensureProfile(userId);
    const eligibilityStatus = summary.eligibleForPartner ? "eligible" : "ineligible";
    const profile = await db
      .update(marketplaceProfiles)
      .set({ eligibilityStatus, updatedAt: new Date() })
      .where(eq(marketplaceProfiles.userId, userId))
      .returning()
      .then((rows) => rows[0]);

    return { profile, summary };
  }

  async function summarizeReadiness(userId: string, companyId?: string): Promise<MarketplaceReadinessSummary> {
    const profile = await ensureProfile(userId, { displayName: await getAuthUserName(userId) });
    return {
      eligibility: await summarizeEligibility(userId, companyId),
      guidance: buildGuidanceProgress({
        completedLessonIds: profile.guidanceCompletedLessons,
        completedChecklistIds: profile.guidanceCompletedChecklist,
      }),
    };
  }

  async function completeGuidanceLesson(userId: string, lessonId: string) {
    ensureGuidanceLessonId(lessonId);
    const profile = await ensureProfile(userId, { displayName: await getAuthUserName(userId) });
    const next = Array.from(new Set([...(profile.guidanceCompletedLessons ?? []), lessonId])).sort();
    return db
      .update(marketplaceProfiles)
      .set({
        guidanceCompletedLessons: next,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, userId))
      .returning()
      .then((rows) => rows[0]);
  }

  async function completeGuidanceChecklistItem(userId: string, checklistId: string) {
    ensureGuidanceChecklistId(checklistId);
    const profile = await ensureProfile(userId, { displayName: await getAuthUserName(userId) });
    const next = Array.from(new Set([...(profile.guidanceCompletedChecklist ?? []), checklistId])).sort();
    return db
      .update(marketplaceProfiles)
      .set({
        guidanceCompletedChecklist: next,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, userId))
      .returning()
      .then((rows) => rows[0]);
  }

  async function submitPartnerApplication(userId: string) {
    const { profile } = await syncEligibility(userId);
    const readiness = await summarizeReadiness(userId);
    if (!readiness.guidance.requiredChecklistComplete) {
      throw unprocessable("Complete the required TECH AT NITE onboarding guidance before applying.");
    }
    if (!readiness.eligibility.eligibleForPartner) {
      throw unprocessable("Complete at least one TECH AT NITE workshop or simulation before applying.");
    }
    if (profile.partnerStatus === "pending") {
      throw badRequest("Partner application already pending review.");
    }
    if (profile.partnerStatus === "active") {
      throw badRequest("Partner profile is already active.");
    }

    return db
      .update(marketplaceProfiles)
      .set({
        roleIntent: "partner",
        partnerStatus: "pending",
        applicationSubmittedAt: new Date(),
        reviewReason: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, userId))
      .returning()
      .then((rows) => rows[0]);
  }

  async function reviewPartnerApplication(
    userId: string,
    input: { decision: "approve" | "reject"; reviewReason?: string | null },
  ) {
    await ensureProfile(userId);
    const nextStatus = input.decision === "approve" ? "active" : "rejected";
    return db
      .update(marketplaceProfiles)
      .set({
        partnerStatus: nextStatus,
        roleIntent: input.decision === "approve" ? "partner" : "member",
        reviewedAt: new Date(),
        reviewReason: input.reviewReason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, userId))
      .returning()
      .then((rows) => rows[0]);
  }

  async function listPendingApplications() {
    const rows = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.partnerStatus, "pending"))
      .orderBy(desc(marketplaceProfiles.applicationSubmittedAt), desc(marketplaceProfiles.updatedAt));

    return Promise.all(
      rows.map(async (row) => ({
        profile: row,
        displayName: row.displayName ?? (await getAuthUserName(row.userId)) ?? row.userId,
        eligibility: await summarizeEligibility(row.userId),
        guidance: buildGuidanceProgress({
          completedLessonIds: row.guidanceCompletedLessons,
          completedChecklistIds: row.guidanceCompletedChecklist,
        }),
      })),
    );
  }

  async function listListings(companyId: string, userId?: string | null) {
    await ensureAmxMicroservicesProviderListing(companyId);

    const rows = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.companyId, companyId))
      .orderBy(desc(marketplaceListings.updatedAt));

    const visible = rows.filter(
      (row) => row.status === "active" || row.providerUserId === userId,
    );
    const providerIds = Array.from(new Set(visible.map((row) => row.providerUserId)));
    const profileRows = providerIds.length
      ? await db
          .select()
          .from(marketplaceProfiles)
          .where(inArray(marketplaceProfiles.userId, providerIds))
      : [];
    const profileMap = new Map(profileRows.map((row) => [row.userId, row]));

    return Promise.all(
      visible.map(async (row) => {
        const profile = profileMap.get(row.providerUserId) ?? (await ensureProfile(row.providerUserId));
        const displayName = profile.displayName ?? (await getAuthUserName(row.providerUserId)) ?? row.providerUserId;
        return {
          ...row,
          provider: {
            userId: row.providerUserId,
            displayName,
            headline: profile.headline,
            bio: profile.bio,
            location: row.location ?? profile.location,
            availability: row.availability,
            payoutWallet: row.payoutWallet ?? profile.payoutWallet,
            badges: sanitizeStringArray(row.badges).length > 0 ? sanitizeStringArray(row.badges) : sanitizeStringArray(profile.badges),
          },
        };
      }),
    );
  }

  async function ensurePartnerActive(userId: string) {
    const profile = await ensureProfile(userId);
    if (profile.partnerStatus !== "active") {
      throw forbiddenPartner();
    }
    return profile;
  }

  function forbiddenPartner() {
    return unprocessable("Only approved partners can manage marketplace listings.");
  }

  async function createListing(
    companyId: string,
    userId: string,
    input: {
      listingType: ListingType;
      name: string;
      title: string;
      description: string;
      skills: string[];
      badges: string[];
      hourlyRateTokens: number;
      availability?: string | null;
      supportedRunPhases?: string[];
      payoutWallet?: string | null;
      location?: string | null;
    },
  ) {
    await ensurePartnerActive(userId);
    if (!LISTING_TYPES.includes(input.listingType)) {
      throw badRequest("Listing type must be agent, coop, or team.");
    }

    return db
      .insert(marketplaceListings)
      .values({
        companyId,
        providerUserId: userId,
        listingType: input.listingType,
        status: "active",
        name: input.name,
        title: input.title,
        description: input.description,
        skills: input.skills,
        badges: input.badges,
        hourlyRateTokens: input.hourlyRateTokens,
        availability: input.availability ?? "available",
        supportedRunPhases: input.supportedRunPhases ?? [],
        payoutWallet: input.payoutWallet ?? null,
        location: input.location ?? null,
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async function updateListing(
    companyId: string,
    listingId: string,
    userId: string,
    input: Partial<{
      status: string;
      name: string;
      title: string;
      description: string;
      skills: string[];
      badges: string[];
      hourlyRateTokens: number;
      availability: string | null;
      supportedRunPhases: string[];
      payoutWallet: string | null;
      location: string | null;
    }>,
  ) {
    await ensurePartnerActive(userId);
    const listing = await db
      .select()
      .from(marketplaceListings)
      .where(and(eq(marketplaceListings.id, listingId), eq(marketplaceListings.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!listing) throw notFound("Marketplace listing not found");
    if (listing.providerUserId !== userId) {
      throw badRequest("You can only update your own marketplace listings.");
    }

    return db
      .update(marketplaceListings)
      .set({
        status: input.status ?? undefined,
        name: input.name ?? undefined,
        title: input.title ?? undefined,
        description: input.description ?? undefined,
        skills: input.skills ?? undefined,
        badges: input.badges ?? undefined,
        hourlyRateTokens: input.hourlyRateTokens ?? undefined,
        availability: input.availability ?? undefined,
        supportedRunPhases: input.supportedRunPhases ?? undefined,
        payoutWallet: input.payoutWallet ?? undefined,
        location: input.location ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListings.id, listingId))
      .returning()
      .then((rows) => rows[0]);
  }

  async function topUpBalance(userId: string, balanceType: "lms" | "tokens", amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest("Top-up amount must be positive.");
    }

    const profile = await ensureProfile(userId);
    return db
      .update(marketplaceProfiles)
      .set({
        lmsCredits: balanceType === "lms" ? profile.lmsCredits + amount : profile.lmsCredits,
        amxTokenBalance:
          balanceType === "tokens" ? profile.amxTokenBalance + amount : profile.amxTokenBalance,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, userId))
      .returning()
      .then((rows) => rows[0]);
  }

  return {
    createListing,
    ensureAmxMicroservicesProviderListing,
    ensureProfile,
    getAuthUserName,
    getGuidanceSections,
    listListings,
    listPendingApplications,
    reviewPartnerApplication,
    sanitizeStringArray,
    summarizeReadiness,
    submitPartnerApplication,
    summarizeEligibility,
    syncEligibility,
    completeGuidanceLesson,
    completeGuidanceChecklistItem,
    topUpBalance,
    updateListing,
    updateProfile,
  };
}
