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
  type: "credit" | "debit";
  amount: number;
  description: string;
  date: string;
}

export interface WalletData {
  balance: number;
  currency: string;
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

export interface Certificate {
  id: string;
  title: string;
  issuedTo: string;
  date: string;
  footprint: string;
}

export interface ChainData {
  logs: ChainLog[];
  certificates: Certificate[];
}

export interface Workshop {
  id: string;
  name: string;
  description: string;
  level: string;
  category: string;
  credits: number;
}

export interface LmsData {
  workshops: Workshop[];
  userLevel: number;
  userCredits: number;
  stats: {
    certificates: number;
    simulationsCompleted: number;
    hoursTrained: number;
  };
}

export const amxApi = {
  getExchange: (companyId: string) => 
    api.get<ExchangeData>(`/companies/${companyId}/amx/exchange`),
  
  getWallet: (companyId: string) => 
    api.get<WalletData>(`/companies/${companyId}/amx/wallet`),
  
  getChain: (companyId: string) => 
    api.get<ChainData>(`/companies/${companyId}/amx/chain`),
  
  getLms: (companyId: string) => 
    api.get<LmsData>(`/companies/${companyId}/lms/dashboard`),
  
  submitRq: (companyId: string, data: any) => 
    api.post(`/companies/${companyId}/amx/rq-portal`, data),
};
