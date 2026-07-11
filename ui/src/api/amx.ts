import { api } from "./client";

export interface Earner {
  id: string;
  name: string;
  title: string;
  bio: string;
  skills: string[];
  rating: number;
  reviews: number;
  projects: number;
  badges: number;
  rate: number;
  location: string;
  status: string;
}

export interface ExchangeData {
  earners: Earner[];
  stats: {
    availableEarners: number;
    projectsCompleted: number;
    averageRating: number;
  };
}

export interface WalletTransaction {
  id: string;
  amount: number;
  currency: string;
  transactionType: string;
  fromPrincipalId: string;
  toPrincipalId: string;
  status: string;
  occurredAt: string;
  metadata: Record<string, unknown> | null;
}

export interface WalletBadge {
  id: string;
  name: string;
  category: string;
  iconUrl: string | null;
  awardedAt: string;
}

export interface WalletData {
  creditBalance: number;
  tokenBalance: number;
  engagementScore: number;
  badges: WalletBadge[];
  transactions: WalletTransaction[];
}

export interface ChainLog {
  id: string;
  action: string;
  principal: string;
  status: string;
  hash: string;
  timestamp: string;
}

export interface ChainData {
  logs: ChainLog[];
}

export interface AmxCertificate {
  id: string;
  companyId: string;
  issueId: string | null;
  taskId: string | null;
  responsiblePrincipalId: string;
  responsiblePrincipalName: string | null;
  commitHashes: string[];
  taskLogsSummary: string | null;
  completionTimeMs: number;
  finalCostTokens: number;
  projects: string[];
  resources: string[];
  reports: string[];
  certificateFootprint: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  issueIdentifier: string | null;
}

export interface VerifyCertificateResult {
  valid: boolean;
  error?: string;
  cert?: AmxCertificate;
}

export interface Workshop {
  id: string;
  companyId: string;
  name: string;
  description: string;
  category: string;
  level: string;
  format: string;
  creditsRequired: number;
  creditsAwarded: number;
  status: string;
  createdAt: string;
}

export interface LmsData {
  workshops: Workshop[];
  userLevel: number;
  userCredits: number;
  tokenBalance: number;
  progressionStage: string;
  stats: {
    certificates: number;
    simulationsCompleted: number;
    hoursTrained: number;
  };
}

export interface RqCatalogTier {
  key: string;
  label: string;
  creditCost: number;
}

export interface RqCatalogMicroService {
  key: string;
  label: string;
  description: string;
  creditCost: number;
  segment: "general" | "nonprofit";
}

export interface RqCatalog {
  tiers: RqCatalogTier[];
  microServices: RqCatalogMicroService[];
}

export const amxApi = {
  getExchange: (companyId: string) =>
    api.get<ExchangeData>(`/companies/${companyId}/amx/exchange`),

  getRqCatalog: (companyId: string) =>
    api.get<RqCatalog>(`/companies/${companyId}/amx/rq-catalog`),

  getWallet: (companyId: string) =>
    api.get<WalletData>(`/companies/${companyId}/amx/wallet`),

  getChain: (companyId: string) =>
    api.get<ChainData>(`/companies/${companyId}/amx/chain`),

  getCertificates: (companyId: string) =>
    api.get<AmxCertificate[]>(`/companies/${companyId}/amx/certificates`),

  verifyCertificate: (footprint: string) =>
    api.get<VerifyCertificateResult>(`/certificates/verify/${encodeURIComponent(footprint)}`),

  getLms: (companyId: string) =>
    api.get<LmsData>(`/companies/${companyId}/lms/dashboard`),

  submitRq: (companyId: string, data: any) =>
    api.post(`/companies/${companyId}/amx/rq-portal`, data),

  buyCredits: (companyId: string, packageTier: string, principalId: string) =>
    api.post<{ checkoutUrl: string }>(`/companies/${companyId}/amx/buy-credits`, { packageTier, principalId }),
};

export function certificatePdfUrl(companyId: string, certId: string): string {
  return `/api/companies/${encodeURIComponent(companyId)}/amx/certificates/${encodeURIComponent(certId)}/pdf`;
}
