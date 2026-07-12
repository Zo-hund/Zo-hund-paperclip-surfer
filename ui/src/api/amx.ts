import { api } from "./client";

export interface Earner {
  id: string;
  /** Underlying agent/user id behind this listing — use to fetch its wallet. */
  memberId: string;
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

/** Shape returned by the agent- and member-wallet routes — no engagement
 * score or badges, those are actor-scoped concepts from /amx/wallet. */
export interface PrincipalWalletData {
  creditBalance: number;
  tokenBalance: number;
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

export interface ChainDirectoryEvent {
  id: string;
  action: string;
  principalType: string;
  principalId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ChainDirectoryData {
  events: ChainDirectoryEvent[];
  total: number;
}

export interface ChainDirectoryFilters {
  action?: string;
  principalId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

/** Instance-wide event — same shape as ChainDirectoryEvent plus the company
 * it belongs to, since a cross-company list is unreadable without it. */
export interface InstanceChainDirectoryEvent extends ChainDirectoryEvent {
  companyId: string | null;
  companyName: string | null;
  companyPrefix: string | null;
}

export interface InstanceChainDirectoryData {
  events: InstanceChainDirectoryEvent[];
  total: number;
}

export interface InstanceChainDirectoryFilters extends ChainDirectoryFilters {
  companyId?: string;
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

/** One completed engagement from GET .../members/:memberId/portfolio —
 * auto-derived from completed lmsMarketplaceBookings, not hand-authored. */
export interface MemberPortfolioItem {
  bookingId: string;
  projectTitle: string;
  description: string | null;
  phase: string | null;
  budgetSims: number;
  completedAt: string | null;
  role: "provider" | "client";
}

export interface MemberPortfolioData {
  items: MemberPortfolioItem[];
}

/** One certified RQ Factory run from GET .../agents/:agentId/portfolio. */
export interface AgentPortfolioItem {
  submissionId: string;
  tier: string;
  creditCost: number;
  completedAt: string;
}

export interface AgentPortfolioData {
  items: AgentPortfolioItem[];
}

export const amxApi = {
  getExchange: (companyId: string) =>
    api.get<ExchangeData>(`/companies/${companyId}/amx/exchange`),

  getRqCatalog: (companyId: string) =>
    api.get<RqCatalog>(`/companies/${companyId}/amx/rq-catalog`),

  getWallet: (companyId: string) =>
    api.get<WalletData>(`/companies/${companyId}/amx/wallet`),

  getAgentWallet: (companyId: string, agentId: string) =>
    api.get<PrincipalWalletData>(`/companies/${companyId}/amx/agents/${encodeURIComponent(agentId)}/wallet`),

  getMemberWallet: (companyId: string, memberId: string) =>
    api.get<PrincipalWalletData>(`/companies/${companyId}/amx/members/${encodeURIComponent(memberId)}/wallet`),

  getMemberPortfolio: (companyId: string, memberId: string) =>
    api.get<MemberPortfolioData>(`/companies/${companyId}/amx/members/${encodeURIComponent(memberId)}/portfolio`),

  getAgentPortfolio: (companyId: string, agentId: string) =>
    api.get<AgentPortfolioData>(`/companies/${companyId}/amx/agents/${encodeURIComponent(agentId)}/portfolio`),

  getChain: (companyId: string) =>
    api.get<ChainData>(`/companies/${companyId}/amx/chain`),

  getChainDirectory: (companyId: string, filters: ChainDirectoryFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.action) params.set("action", filters.action);
    if (filters.principalId) params.set("principalId", filters.principalId);
    if (filters.since) params.set("since", filters.since);
    if (filters.until) params.set("until", filters.until);
    if (filters.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();
    return api.get<ChainDirectoryData>(`/companies/${companyId}/amx/chain/directory${qs ? `?${qs}` : ""}`);
  },

  getInstanceChainDirectory: (filters: InstanceChainDirectoryFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.action) params.set("action", filters.action);
    if (filters.principalId) params.set("principalId", filters.principalId);
    if (filters.since) params.set("since", filters.since);
    if (filters.until) params.set("until", filters.until);
    if (filters.limit) params.set("limit", String(filters.limit));
    if (filters.companyId) params.set("companyId", filters.companyId);
    const qs = params.toString();
    return api.get<InstanceChainDirectoryData>(`/instance/amx/chain/directory${qs ? `?${qs}` : ""}`);
  },

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
