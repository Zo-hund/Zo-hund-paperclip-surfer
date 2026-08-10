export type X402ServiceCategory = "ai" | "data" | "code" | "design" | "xr" | "event" | "partner";
export type X402AgentRole = "payment" | "economy" | "discovery" | "wallet" | "metering" | "revenue" | "compliance" | "treasury";
export type X402FlowStatus = "quoted" | "authorized" | "blocked" | "simulated_paid" | "requires_connection";

export interface X402Service {
  id: string;
  name: string;
  category: X402ServiceCategory;
  endpoint: string;
  provider: string;
  description: string;
  unit: string;
  priceCents: number;
  memberPriceCents: number;
  requiresHumanApprovalAboveCents: number;
  eligibleAssets: string[];
}

export interface X402Agent {
  id: string;
  name: string;
  role: X402AgentRole;
  purpose: string;
  toolbelt: string[];
}

export interface X402BudgetPolicy {
  agentId: string;
  dailyLimitCents: number;
  remainingCents: number;
  allowAutopayBelowCents: number;
  humanApprovalRequired: boolean;
}

export interface X402RevenueSplit {
  serviceProviderPct: number;
  platformPct: number;
  airHubPct: number;
  partnerCreatorPct: number;
}

export interface X402Quote {
  serviceId: string;
  agentId: string;
  identityId: string;
  amountCents: number;
  currency: "USD";
  unit: string;
  memberDiscountCents: number;
  paymentRequired: boolean;
  approvalRequired: boolean;
  status: X402FlowStatus;
  payTo: string;
  split: Record<keyof X402RevenueSplit, number>;
  reason: string;
}

export const x402Agents: X402Agent[] = [
  { id: "amx-payment-agent", name: "AMX Payment Agent", role: "payment", purpose: "Executes x402 quote, authorize, pay, verify, settle, and reconcile flows.", toolbelt: ["x402 discovery", "payment authorization", "receipt verification", "retry request"] },
  { id: "amx-economy-agent", name: "AMX Economy Agent", role: "economy", purpose: "Prices services, applies membership benefits, and calculates partner revenue logic.", toolbelt: ["pricing policy", "membership discount", "contract split", "earning ledger"] },
  { id: "amx-service-discovery-agent", name: "AMX Service Discovery Agent", role: "discovery", purpose: "Finds AMX and partner APIs an agent can consume.", toolbelt: ["service registry", "capability matching", "provider health", "scope check"] },
  { id: "amx-wallet-agent", name: "AMX Wallet Agent", role: "wallet", purpose: "Controls budgets, wallet permissions, and human approvals.", toolbelt: ["spend limits", "wallet policy", "operator approval", "session grant"] },
  { id: "amx-metering-agent", name: "AMX Metering Agent", role: "metering", purpose: "Tracks API calls, compute, tokens, storage, video minutes, and usage events.", toolbelt: ["usage counter", "rate card", "meter event", "quota alert"] },
  { id: "amx-revenue-agent", name: "AMX Revenue Agent", role: "revenue", purpose: "Allocates revenue to service providers, AMX, AIR-HUBS, partners, and creators.", toolbelt: ["split ledger", "partner payout", "revenue report", "settlement batch"] },
  { id: "amx-compliance-agent", name: "AMX Compliance Agent", role: "compliance", purpose: "Applies policy, jurisdiction, audit, risk, and escalation rules.", toolbelt: ["policy check", "audit trail", "risk hold", "operator escalation"] },
  { id: "amx-treasury-agent", name: "AMX Treasury Agent", role: "treasury", purpose: "Manages platform-level settlement visibility under human controls.", toolbelt: ["treasury report", "reserve policy", "batch settlement", "human sign-off"] },
];

export const x402ServiceCatalog: X402Service[] = [
  { id: "amx-code-review", name: "Code Review", category: "code", endpoint: "/api/v1/code-analysis", provider: "AMX LABS", description: "Review project code and return risks, tests, and next engineering actions.", unit: "analysis", priceCents: 25, memberPriceCents: 10, requiresHumanApprovalAboveCents: 500, eligibleAssets: ["AMX Builder", "AMX Operator"] },
  { id: "amx-generate-ar-model", name: "Generate AR Model", category: "xr", endpoint: "/api/v1/xr/model", provider: "AMX AIR HUBS", description: "Create or prepare a WebXR-ready GLB asset for a mission, venue, or pod.", unit: "asset", priceCents: 50, memberPriceCents: 25, requiresHumanApprovalAboveCents: 500, eligibleAssets: ["AMX Builder", "AMX Partner"] },
  { id: "amx-market-analysis", name: "Market Analysis", category: "data", endpoint: "/api/v1/market-analysis", provider: "AMX LABS", description: "Run a market simulation with partner context, opportunity scoring, and proof outputs.", unit: "report", priceCents: 100, memberPriceCents: 50, requiresHumanApprovalAboveCents: 500, eligibleAssets: ["AMX Partner", "AMX Operator"] },
  { id: "amx-show-stinger", name: "Show Stinger", category: "event", endpoint: "/api/v1/stage/stinger", provider: "AMX XR Stage", description: "Generate a short event transition stinger for pod-to-stage runtime.", unit: "clip", priceCents: 75, memberPriceCents: 40, requiresHumanApprovalAboveCents: 300, eligibleAssets: ["AMX Producer", "AMX Operator"] },
  { id: "partner-training-module", name: "Partner Training Module", category: "partner", endpoint: "/api/v1/partners/training-module", provider: "H3AT / Partner API", description: "Build a workshop module, printable, agent guide, and proof checklist for an organization.", unit: "module", priceCents: 200, memberPriceCents: 125, requiresHumanApprovalAboveCents: 200, eligibleAssets: ["AMX Partner", "AMX Operator"] },
  { id: "ai-vision-caption", name: "Vision Caption Pass", category: "ai", endpoint: "/api/v1/vision/caption", provider: "AMX Agent Runtime", description: "Caption a live camera frame for operator guidance, accessibility, and agent context.", unit: "100 frames", priceCents: 5, memberPriceCents: 2, requiresHumanApprovalAboveCents: 100, eligibleAssets: ["AMX Member", "AMX Operator"] },
];

export const defaultX402Split: X402RevenueSplit = {
  serviceProviderPct: 60,
  platformPct: 20,
  airHubPct: 10,
  partnerCreatorPct: 10,
};

export const defaultX402Policy: X402BudgetPolicy = {
  agentId: "amx-payment-agent",
  dailyLimitCents: 2500,
  remainingCents: 1900,
  allowAutopayBelowCents: 100,
  humanApprovalRequired: true,
};

export function cents(value: number) {
  return (value / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function quoteX402Service(input: {
  serviceId: string;
  agentId?: string;
  identityId?: string;
  memberAsset?: string;
  x402Connected?: boolean;
  policy?: X402BudgetPolicy;
  split?: X402RevenueSplit;
}): X402Quote {
  const service = x402ServiceCatalog.find((item) => item.id === input.serviceId) || x402ServiceCatalog[0];
  const policy = input.policy || defaultX402Policy;
  const split = input.split || defaultX402Split;
  const memberEligible = Boolean(input.memberAsset && service.eligibleAssets.includes(input.memberAsset));
  const amountCents = memberEligible ? service.memberPriceCents : service.priceCents;
  const approvalRequired = amountCents >= service.requiresHumanApprovalAboveCents || amountCents > policy.allowAutopayBelowCents || policy.humanApprovalRequired && amountCents > policy.allowAutopayBelowCents;
  const budgetBlocked = amountCents > policy.remainingCents || amountCents > policy.dailyLimitCents;
  const paymentRequired = amountCents > 0;
  const status: X402FlowStatus = budgetBlocked ? "blocked" : !paymentRequired ? "authorized" : !input.x402Connected ? "requires_connection" : approvalRequired ? "authorized" : "simulated_paid";
  const splitCents = {
    serviceProviderPct: Math.round(amountCents * split.serviceProviderPct / 100),
    platformPct: Math.round(amountCents * split.platformPct / 100),
    airHubPct: Math.round(amountCents * split.airHubPct / 100),
    partnerCreatorPct: Math.max(0, amountCents - Math.round(amountCents * split.serviceProviderPct / 100) - Math.round(amountCents * split.platformPct / 100) - Math.round(amountCents * split.airHubPct / 100)),
  };
  return {
    serviceId: service.id,
    agentId: input.agentId || policy.agentId,
    identityId: input.identityId || "AMX-MEMBER",
    amountCents,
    currency: "USD",
    unit: service.unit,
    memberDiscountCents: Math.max(0, service.priceCents - amountCents),
    paymentRequired,
    approvalRequired,
    status,
    payTo: `${service.provider} / ${service.endpoint}`,
    split: splitCents,
    reason: budgetBlocked ? "Budget policy blocks this request." : !input.x402Connected ? "x402 payment rail is not connected yet." : approvalRequired ? "Human approval is required before live settlement." : "Autopay simulation can proceed.",
  };
}

export function buildX402HttpExample(quote: X402Quote) {
  if (quote.status === "blocked") return "HTTP 403 Policy Hold";
  if (!quote.paymentRequired) return "HTTP 200 Included by membership";
  return `HTTP 402 Payment Required -> pay ${cents(quote.amountCents)} -> retry ${quote.serviceId} -> deliver result`;
}
