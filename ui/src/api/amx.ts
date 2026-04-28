import { api } from "./client";
import type {
  EligibilitySummary,
  GuidanceProgressSummary,
  GuidanceSection,
  MarketplaceListing,
  MarketplaceProfile,
} from "./marketplace";
import type { AgentMemory } from "./agentMemories";

export interface ExchangeData {
  listings: MarketplaceListing[];
  stats: {
    availableEarners: number;
    projectsCompleted: number;
    averageRating: number;
  };
}

export interface WalletTransaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  description: string;
  date: string;
  currency?: string;
  status?: string;
}

export interface WalletData {
  balance: number;
  tokenBalance: number;
  creditBalance: number;
  currency: string;
  environment?: "simulation" | "live" | null;
  subledgers?: {
    simulation: { ledgerId: string; tokenBalance: number; creditBalance: number };
    live: { ledgerId: string; tokenBalance: number; creditBalance: number };
  };
  transactions: WalletTransaction[];
  financeSummary?: {
    debitCents: number;
    creditCents: number;
    netCents: number;
    eventCount: number;
  };
}

export interface ChainLog {
  id: string;
  action: string;
  principal: string;
  status: string;
  hash: string;
  timestamp: string;
}

export interface Certificate {
  id: string;
  title: string;
  issuedTo: string;
  date: string;
  footprint: string;
  issueId?: string;
  completionTimeMs?: number;
  finalCostTokens?: number;
}

export interface ChainData {
  logs: ChainLog[];
  certificates: Certificate[];
}

interface RawWalletTransaction {
  id: string;
  type: "credit" | "debit";
  amount: number;
  currency?: string;
  status?: string;
  fromPrincipal?: string;
  toPrincipal?: string;
  metadata?: Record<string, unknown> | null;
  date: string;
}

interface RawWalletData {
  ledgerId: string;
  tokenBalance: number;
  creditBalance: number;
  currency: string;
  environment?: "simulation" | "live" | null;
  subledgers?: WalletData["subledgers"];
  financeSummary?: WalletData["financeSummary"];
  transactions: RawWalletTransaction[];
}

interface RawCertificate {
  id: string;
  issueId?: string;
  issuedTo: string;
  footprint: string;
  completionTimeMs?: number;
  finalCostTokens?: number;
  date: string;
}

interface RawChainData {
  logs: ChainLog[];
  certificates: RawCertificate[];
}

function describeWalletTransaction(tx: RawWalletTransaction): string {
  const metadata = tx.metadata ?? {};
  const metadataDescription =
    (typeof metadata.description === "string" && metadata.description) ||
    (typeof metadata.note === "string" && metadata.note) ||
    (typeof metadata.reason === "string" && metadata.reason);

  if (metadataDescription) return metadataDescription;
  if (tx.type === "credit") {
    return `Ledger credit${tx.status ? ` · ${tx.status}` : ""}`;
  }
  if (tx.fromPrincipal || tx.toPrincipal) {
    return `Transfer ${tx.fromPrincipal ?? "external"} → ${tx.toPrincipal ?? "external"}`;
  }
  return `${tx.type === "debit" ? "Debit" : "Credit"}${tx.status ? ` · ${tx.status}` : ""}`;
}

function normalizeWalletData(data: RawWalletData): WalletData {
  return {
    balance: data.tokenBalance,
    tokenBalance: data.tokenBalance,
    creditBalance: data.creditBalance,
    currency: data.currency,
    environment: data.environment ?? null,
    subledgers: data.subledgers,
    financeSummary: data.financeSummary,
    transactions: data.transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      description: describeWalletTransaction(tx),
      date: tx.date,
      currency: tx.currency,
      status: tx.status,
    })),
  };
}

function normalizeChainData(data: RawChainData): ChainData {
  return {
    logs: data.logs.map((log) => ({
      ...log,
      hash: log.hash ?? "Pending signature",
    })),
    certificates: data.certificates.map((cert) => ({
      id: cert.id,
      title: cert.issueId ? `Work Product Certificate · ${cert.issueId}` : `AMX Certificate · ${cert.id}`,
      issuedTo: cert.issuedTo,
      date: cert.date,
      footprint: cert.footprint,
      issueId: cert.issueId,
      completionTimeMs: cert.completionTimeMs,
      finalCostTokens: cert.finalCostTokens,
    })),
  };
}

export interface WorkshopEnrollment {
  id: string;
  companyId: string;
  userId: string;
  workshopId: string;
  status: string;
  progress: number | null;
  score: number | null;
  completedAt: string | null;
  certificatesAwarded: string[] | null;
}

export interface Workshop {
  id: string;
  name: string;
  description: string;
  level: string;
  category: string;
  credits: number;
  creditsRequired: number;
  format: string;
  activeSimulationId: string | null;
  enrollment: WorkshopEnrollment | null;
}

export interface LmsData {
  workshops: Workshop[];
  userLevel: number;
  userCredits: number;
  userTokenBalance: number;
  stats: {
    certificates: number;
    simulationsCompleted: number;
    hoursTrained: number;
  };
  eligibility: EligibilitySummary;
  marketplaceProfile: MarketplaceProfile;
  guidanceSections: GuidanceSection[];
  guidanceProgress: GuidanceProgressSummary;
  requiredChecklistComplete: boolean;
  nextRecommendedStep: string | null;
}

export const amxApi = {
  getExchange: (companyId: string) =>
    api.get<ExchangeData>(`/companies/${companyId}/amx/exchange`),

  getWallet: async (companyId: string) =>
    normalizeWalletData(await api.get<RawWalletData>(`/companies/${companyId}/amx/wallet`)),

  getChain: async (companyId: string) =>
    normalizeChainData(await api.get<RawChainData>(`/companies/${companyId}/amx/chain`)),

  getLms: (companyId: string) =>
    api.get<LmsData>(`/companies/${companyId}/lms/dashboard`),

  enrollInWorkshop: (companyId: string, workshopId: string) =>
    api.post<WorkshopEnrollment>(`/companies/${companyId}/lms/enroll`, { workshopId }),

  launchSimulation: (companyId: string, workshopId: string) =>
    api.post<WorkshopEnrollment>(`/companies/${companyId}/lms/workshops/${workshopId}/launch-simulation`, {}),

  completeEnrollment: (companyId: string, enrollmentId: string, score: number = 100) =>
    api.post<WorkshopEnrollment>(`/companies/${companyId}/lms/enrollments/${enrollmentId}/complete`, { score }),
  completeGuidanceLesson: (companyId: string, lessonId: string) =>
    api.post(`/companies/${companyId}/lms/guidance/lessons/${lessonId}/complete`, { lessonId }),
  completeGuidanceChecklist: (companyId: string, checklistId: string) =>
    api.post(`/companies/${companyId}/lms/guidance/checklist/${checklistId}/complete`, { checklistId }),

  getMemories: (companyId: string) =>
    api.get<AgentMemory[]>(`/companies/${companyId}/amx/memories`),

  topUpWallet: (companyId: string, data: { tierId: string; amount: number }) =>
    api.post(`/companies/${companyId}/amx/wallet/credit`, {
      amount: data.amount,
      note: `${data.tierId} credit block`,
    }),

  submitRq: (companyId: string, data: unknown) =>
    api.post(`/companies/${companyId}/amx/rq-portal`, data),
};
