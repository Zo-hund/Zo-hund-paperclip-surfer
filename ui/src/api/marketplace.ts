import { api } from "./client";

export type MarketplaceRoleIntent = "none" | "member" | "partner";
export type MarketplacePartnerStatus = "none" | "pending" | "active" | "rejected";
export type MarketplaceEligibilityStatus = "ineligible" | "eligible";
export type MarketplaceListingType = "agent" | "coop" | "team";
export type MarketplaceListingStatus = "draft" | "active" | "paused";

export interface EligibilitySummary {
  completedEnrollments: number;
  activeSimulations: number;
  totalCertificates: number;
  totalHoursTrained: number;
  requiredCompleted: boolean;
  eligibleForPartner: boolean;
}

export interface GuidanceLesson {
  id: string;
  title: string;
  body: string;
  required: boolean;
  completed?: boolean;
}

export interface GuidanceChecklistItem {
  id: string;
  label: string;
  required: boolean;
  completed?: boolean;
}

export interface GuidanceSection {
  id: string;
  title: string;
  audience: string;
  description: string;
  actionPath: string;
  lessons: GuidanceLesson[];
  checklist: GuidanceChecklistItem[];
}

export interface GuidanceProgressSummary {
  completedLessonIds: string[];
  completedChecklistIds: string[];
  totalLessons: number;
  totalChecklistItems: number;
  completedLessons: number;
  completedChecklistItems: number;
  requiredLessonIds: string[];
  requiredChecklistIds: string[];
  requiredChecklistComplete: boolean;
  progressPercent: number;
  nextRecommendedStep: string | null;
}

export interface MarketplaceProfile {
  userId: string;
  displayName: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  roleIntent: MarketplaceRoleIntent;
  partnerStatus: MarketplacePartnerStatus;
  eligibilityStatus: MarketplaceEligibilityStatus;
  reviewReason: string | null;
  applicationSubmittedAt: string | null;
  reviewedAt: string | null;
  lmsCredits: number;
  amxTokenBalance: number;
  skills: string[];
  badges: string[];
  payoutWallet: string | null;
  availability: string | null;
  supportedRunPhases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceViewer {
  userId: string;
  isInstanceAdmin: boolean;
  source: string;
}

export interface MarketplaceProfileResponse {
  profile: MarketplaceProfile;
  eligibility: EligibilitySummary;
  guidance: GuidanceProgressSummary;
  viewer: MarketplaceViewer;
}

export interface PartnerReviewStatus {
  partnerStatus: MarketplacePartnerStatus;
  reviewReason: string | null;
  applicationSubmittedAt: string | null;
  reviewedAt: string | null;
  eligibility: EligibilitySummary;
  guidance: GuidanceProgressSummary;
}

export interface MarketplaceListing {
  id: string;
  companyId: string;
  providerUserId: string;
  listingType: MarketplaceListingType;
  status: MarketplaceListingStatus;
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
  isPromoted: boolean;
  promotedUntil: string | null;
  sponsorTag: string | null;
  createdAt: string;
  updatedAt: string;
  provider: {
    userId: string;
    displayName: string;
    headline: string | null;
    bio: string | null;
    location: string | null;
    availability: string | null;
    payoutWallet: string | null;
    badges: string[];
  };
}

export interface PartnerApplicationReview {
  profile: MarketplaceProfile;
  displayName: string;
  eligibility: EligibilitySummary;
  guidance?: GuidanceProgressSummary;
}

export interface PurchaseResult {
  ok: true;
  listingId: string;
  totalCostTokens: number;
  platformFeeTokens: number;
  providerPayoutTokens: number;
  buyerBalance: number;
  providerBalance: number;
}

export type MicroserviceTaskType =
  | "image_generate"
  | "image_edit"
  | "video"
  | "audio"
  | "webhook"
  | "browser_task"
  | "custom";

export interface MicroserviceBookingInput {
  listingId: string;
  hours: number;
  runPhase: string;
  taskType: MicroserviceTaskType;
  title: string;
  instructions: string;
  targetUrl?: string | null;
  assignedAgentId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientCompany?: string | null;
}

export interface MicroserviceBookingResult {
  ok: true;
  purchase: {
    listingId: string;
    totalCostTokens: number;
    platformFeeTokens: number;
    providerPayoutTokens: number;
    buyerBalance: number;
    providerBalance: number;
    transactionId: string;
  };
  issue: {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
    assigneeAgentId: string | null;
  };
  listing: MarketplaceListing;
  microserviceReady: {
    listing: { ready: boolean; missingSkills: string[] };
    assignedAgent: null | { id: string; name: string | null; ready: boolean; missingSkills: string[] };
  };
}

export const marketplaceApi = {
  getMyProfile: () => api.get<MarketplaceProfileResponse>("/marketplace/me/profile"),
  getMyEligibility: () => api.get<{ profile: MarketplaceProfile; eligibility: EligibilitySummary; guidance: GuidanceProgressSummary }>("/marketplace/me/eligibility"),
  getPartnerReview: () => api.get<PartnerReviewStatus>("/marketplace/me/partner-review"),
  updateProfile: (
    input: Partial<
      Pick<
        MarketplaceProfile,
        | "displayName"
        | "headline"
        | "bio"
        | "location"
        | "roleIntent"
        | "payoutWallet"
        | "availability"
        | "skills"
        | "badges"
        | "supportedRunPhases"
      >
    >,
  ) => api.patch<{ profile: MarketplaceProfile; eligibility: EligibilitySummary; guidance: GuidanceProgressSummary }>("/marketplace/me/profile", input),
  submitPartnerApplication: () =>
    api.post<{ profile: MarketplaceProfile; eligibility: EligibilitySummary; guidance: GuidanceProgressSummary }>("/marketplace/me/partner-application", {}),
  topUpBalance: (balanceType: "lms" | "tokens", amount: number) =>
    api.post<{ profile: MarketplaceProfile }>("/marketplace/me/top-up", { balanceType, amount }),
  listPartnerApplications: () =>
    api.get<PartnerApplicationReview[]>("/marketplace/admin/partner-applications"),
  reviewPartnerApplication: (userId: string, input: { decision: "approve" | "reject"; reviewReason?: string }) =>
    api.post<{ profile: MarketplaceProfile; eligibility: EligibilitySummary; guidance: GuidanceProgressSummary }>(
      `/marketplace/admin/partner-applications/${userId}/review`,
      input,
    ),
  listListings: (companyId: string) =>
    api.get<MarketplaceListing[]>(`/companies/${companyId}/amx/partner-listings`),
  createListing: (
    companyId: string,
    input: {
      listingType: MarketplaceListingType;
      name: string;
      title: string;
      description: string;
      skills?: string[];
      badges?: string[];
      hourlyRateTokens: number;
      availability?: string | null;
      supportedRunPhases?: string[];
      payoutWallet?: string | null;
      location?: string | null;
    },
  ) => api.post<MarketplaceListing>(`/companies/${companyId}/amx/partner-listings`, input),
  updateListing: (
    companyId: string,
    listingId: string,
    input: Partial<{
      listingType: MarketplaceListingType;
      status: MarketplaceListingStatus;
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
      isPromoted: boolean;
      promotedUntil: string | null;
      sponsorTag: string | null;
    }>,
  ) => api.patch<MarketplaceListing>(`/companies/${companyId}/amx/partner-listings/${listingId}`, input),
  getPublicListings: () =>
    api.get<{ listings: MarketplaceListing[]; visibleAgents: Array<{ id: string; name: string; title: string | null; role: string | null; companyId: string; metadata: Record<string, unknown> | null; createdAt: string }> }>("/marketplace/public-listings"),
  purchaseListing: (companyId: string, listingId: string, input: { hours: number; runPhase: string }) =>
    api.post<PurchaseResult>(`/companies/${companyId}/amx/partner-listings/${listingId}/purchase`, input),
  bookMicroservice: (companyId: string, input: MicroserviceBookingInput) =>
    api.post<MicroserviceBookingResult>(`/companies/${companyId}/amx/microservice-bookings`, input),
};
