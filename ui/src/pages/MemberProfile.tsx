import React, { useState, useEffect, useMemo } from "react";
import {
  Zap, ShieldCheck, Globe, Sparkles, Share2, Download,
  CheckCircle2, CreditCard, Award, Crown, User, ArrowLeft, RefreshCw,
  Plus, Play, ShoppingBag, Terminal, Cpu, ArrowUpRight, BadgeCheck,
  TrendingUp, Info, AlertCircle, ShoppingCart, Bot, ChevronRight
} from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { PublicLayout } from "@/components/PublicLayout";
import { companiesApi } from "@/api/companies";

// Renders a QR as a data-URL <img> so it shows reliably inside the 3D-flipped
// card back (a canvas drawn via ref can come up blank under backface-hidden).
function PassQr({ payload, size = 96 }: { payload: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload || "amx://pass", {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => { /* QR is a nice-to-have */ });
    return () => { cancelled = true; };
  }, [payload, size]);
  return src
    ? <img src={src} width={size} height={size} alt="Membership QR" className="block rounded" />
    : <div style={{ width: size, height: size }} className="bg-white rounded" />;
}
import { BuyCreditsModal } from "./XpWallet";
import { EngageModal, MOCK_AGENTS } from "./AgentMarketplace";
import { MOCK_MARKET_ITEMS, MarketplaceItem } from "@/lib/marketplace_data";
import { calculatePlatformFee, calculateSellerPayout, formatCurrency } from "@/lib/financials";
import { amxApi, type MemberPortfolioItem } from "@/api/amx";
import { approvalsApi } from "@/api/approvals";
import { useToast } from "@/context/ToastContext";
import { PromoteToMarketControl } from "@/components/PromoteToMarketControl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Pass Types ──────────────────────────────────────────────────────────────
type MembershipTier = "Collective" | "Elective" | "Community Partner" | "Expert";

interface MemberPassData {
  id: string;
  name: string;
  tier: MembershipTier;
  issuedAt: string;
  expiresAt: string;
  xp: number;
  tokens: number;
  status: "Active" | "Pending" | "Verified";
  color: string;
  secondary: string;
  icon: React.ReactNode;
  qrPayload: string;
}

const DEFAULT_MEMBER: MemberPassData = {
  id: "AMX-PASS-0000-AMX",
  name: "AMX Member",
  tier: "Community Partner",
  issuedAt: "—",
  expiresAt: "LIFETIME",
  xp: 0,
  tokens: 0,
  status: "Verified",
  color: "from-primary via-violet-500 to-primary",
  secondary: "text-violet-400",
  icon: <Crown className="h-4 w-4" />,
  qrPayload: "amx://pass",
};

const TIER_BY_ROLE: Record<string, MembershipTier> = {
  owner: "Expert",
  admin: "Collective",
  member: "Community Partner",
  client: "Community Partner",
};

// ── MemberPassCard Component ──────────────────────────────────────────────────
function MemberPassCard({ data }: { data: MemberPassData }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="relative w-full max-w-[380px] aspect-[1.586/1] perspective-1000 group mx-auto mb-10 translate-y-20 scale-110">
      {/* Front of Pass */}
      <div 
        onClick={() => setFlipped(!flipped)}
        className={`relative w-full h-full transition-all duration-700 preserve-3d cursor-pointer active:scale-95 ${flipped ? "rotate-y-180" : ""}`}
      >
        {/* Front Surface */}
        <div className="absolute inset-0 backface-hidden rounded-3xl overflow-hidden border border-white/20 shadow-2xl">
          <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-3xl" />
          <div className={`absolute inset-0 bg-gradient-to-br ${data.color} opacity-10`} />
          <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)] animate-pulse" />

          <div className="relative h-full p-6 flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div className="leading-none">
                  <span className="text-[12px] font-black tracking-tight text-white block">AMX PLATFORM</span>
                  <span className="text-[8px] font-black tracking-[0.3em] text-muted-foreground uppercase">Network Node</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                  {data.status}
                </div>
                <span className="text-[7px] text-muted-foreground font-black mt-1">NO. {data.id}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Access Tier</div>
              <h2 className="text-2xl font-black text-white tracking-tight leading-none mb-4">{data.tier}</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Member Name</div>
                  <div className="text-[14px] font-bold text-white uppercase">{data.name}</div>
                </div>
                <div>
                  <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Tokens (SIMS)</div>
                  <div className="text-[14px] font-bold text-primary flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-primary" /> {data.tokens.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-end justify-between pt-4 border-t border-white/5">
              <div className="flex gap-4">
                <div>
                  <div className="text-[7px] font-black text-muted-foreground uppercase tracking-widest">Issued</div>
                  <div className="text-[10px] font-bold text-white">{data.issuedAt}</div>
                </div>
                <div>
                  <div className="text-[7px] font-black text-muted-foreground uppercase tracking-widest">Performance</div>
                  <div className="text-[10px] font-bold text-white">{data.xp.toLocaleString()} XP</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] h-5 px-2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black tracking-widest">
                <ShieldCheck className="h-3 w-3" /> VERIFIED
              </div>
            </div>
          </div>

          <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-[200%] group-hover:translate-x-[200%] transition-transform duration-1000 ease-in-out" />
        </div>

        {/* Back of Pass */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#0a0a0a]">
          <div className="absolute inset-0 opacity-[0.05] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="h-full p-6 flex flex-col justify-between items-center text-center">
            <div className="w-full flex justify-between items-center opacity-40">
                <div className="h-2 w-16 bg-white/20 rounded-full" />
                <div className="h-2 w-8 bg-white/20 rounded-full" />
            </div>
            <div className="p-4 bg-white rounded-2xl shadow-inner group/qr relative">
                <PassQr payload={data.qrPayload} size={96} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/qr:opacity-100 transition-opacity bg-black/80 rounded-2xl backdrop-blur-sm">
                   <span className="text-white text-[10px] font-black uppercase tracking-widest">Scan to Sync</span>
                </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-white px-4 uppercase">Chain Identity Verified</p>
              <p className="text-[8px] text-muted-foreground mt-2 leading-tight px-6">This pass authorizes smart contract execution and credit transfers on the AMX Chain. 10% Platform fee applies to all provider payouts.</p>
            </div>
            <div className="text-[10px] font-black text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
               ZKODE NETWORKS x AMX
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MarketplaceItemCard ───────────────────────────────────────────────────────
function MarketItemCard({ item, onBuy }: { item: MarketplaceItem; onBuy: (item: MarketplaceItem) => void }) {
  const Icon = item.icon;
  const platformFee = calculatePlatformFee(item.price);
  const sellerPayout = calculateSellerPayout(item.price);

  return (
    <div className="min-w-[240px] md:min-w-[280px] p-4 rounded-2xl border border-border/60 bg-card hover:border-primary/40 transition-all group shrink-0">
       <div className="flex items-start justify-between mb-4">
          <div className="p-2 rounded-xl bg-accent/20 border border-border/40 group-hover:bg-primary/10 group-hover:border-primary/20 transition-all">
             <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          </div>
          <div className="text-right">
             <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground mb-1">Contract Value</p>
             <p className="text-[14px] font-black text-white">{formatCurrency(item.price)}</p>
          </div>
       </div>

       <div className="mb-4">
          <h4 className="text-[13px] font-bold text-white mb-1">{item.name}</h4>
          <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{item.description}</p>
       </div>

       <div className="p-3 rounded-xl bg-white/5 border border-white/5 mb-4 group/fee relative overflow-hidden">
          <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
             <span>Platform Fee (10%)</span>
             <span className="text-rose-400">-{formatCurrency(platformFee)}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-emerald-400">
             <span>Provider Payout</span>
             <span>{formatCurrency(sellerPayout)}</span>
          </div>
          <div className="absolute top-1 right-1 opacity-0 group-hover/fee:opacity-100 transition-opacity">
             <Info className="h-3 w-3 text-muted-foreground" />
          </div>
       </div>

       <Button onClick={() => onBuy(item)} className="w-full h-10 font-black uppercase tracking-widest text-[10px] gap-2 shadow-lg shadow-primary/10">
          <ShoppingCart className="h-3.5 w-3.5" /> Purchase Skill
       </Button>
    </div>
  );
}

// ── MemberProfile Main ────────────────────────────────────────────────────────
export function MemberProfile() {
  const [member, setMember] = useState(DEFAULT_MEMBER);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  // Drives the real xp/tokens fetch below — set once the credential lookup
  // resolves (the URL-param fast path has no companyId to work with).
  const [walletCompanyId, setWalletCompanyId] = useState<string | null>(null);
  // Drives the portfolio fetch below — the signed-in user's own member id,
  // resolved from the credential lookup (no memberId in the URL-param fast
  // path, same limitation as walletCompanyId above).
  const [memberUserId, setMemberUserId] = useState<string | null>(null);

  // Fast path: credential from URL params (passed from invite accept).
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const qCredId = searchParams.get("credId");
  const qTier = searchParams.get("tier");
  const qIssued = searchParams.get("issued");

  React.useEffect(() => {
    if (!qCredId) return;
    setMember(prev => ({
      ...prev,
      id: qCredId,
      tier: TIER_BY_ROLE[qTier ?? "member"] ?? "Community Partner",
      issuedAt: qIssued ? new Date(qIssued).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase() : prev.issuedAt,
      status: "Verified",
      // No companyId in this URL-param fast path, so xp/tokens can't be
      // fetched here — leave whatever's already in state (the real-wallet
      // effect below fills them in once the credential lookup resolves).
      qrPayload: `${window.location.origin}/verify/pass/${qCredId}`,
    }));
  }, [qCredId, qTier, qIssued]);

  // Source of truth: fetch the signed-in user's real credential.
  React.useEffect(() => {
    let cancelled = false;
    companiesApi.getMyCredential()
      .then((data) => {
        if (cancelled || !data?.credentialId) return;
        const cd = (data.credentialData ?? {}) as Record<string, unknown>;
        const issuedRaw = (cd.issuedAt as string) ?? data.createdAt ?? null;
        setMember(prev => ({
          ...prev,
          id: data.credentialId!,
          name: data.userName ?? data.userEmail ?? prev.name,
          tier: TIER_BY_ROLE[data.role ?? "member"] ?? "Community Partner",
          issuedAt: issuedRaw
            ? new Date(issuedRaw).toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()
            : prev.issuedAt,
          status: data.status === "active" ? "Verified" : "Pending",
          // xp/tokens come from the real wallet fetch below, keyed off this
          // credential's companyId — not hardcoded here.
          qrPayload: `${window.location.origin}/verify/pass/${data.credentialId}`,
        }));
        if (data.companyId) setWalletCompanyId(data.companyId);
        if (data.userId) setMemberUserId(data.userId);
      })
      .catch(() => { /* not signed in / no membership — keep current */ });
    return () => { cancelled = true; };
  }, []);

  // Portfolio — auto-derived from this member's completed marketplace
  // bookings (either side of the engagement).
  const portfolioQuery = useQuery({
    queryKey: ["member-profile", "portfolio", walletCompanyId, memberUserId],
    queryFn: () => amxApi.getMemberPortfolio(walletCompanyId!, memberUserId!),
    enabled: !!walletCompanyId && !!memberUserId,
  });
  const portfolioItems: MemberPortfolioItem[] = portfolioQuery.data?.items ?? [];

  // Pending promote_to_live approvals for this company — used to decide
  // whether a promotion-eligible portfolio item shows "Promote to Market"
  // or "Pending Board Approval" (see the matching logic in
  // AgentResumeProfile.tsx, the other page that surfaces this control).
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const pendingApprovalsQuery = useQuery({
    queryKey: ["member-profile", "approvals", "pending", walletCompanyId],
    queryFn: () => approvalsApi.list(walletCompanyId!, "pending"),
    enabled: !!walletCompanyId,
  });
  const pendingPromotionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const approval of pendingApprovalsQuery.data ?? []) {
      if (approval.type !== "promote_to_live") continue;
      const payload = (approval.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.entityType === "string" && typeof payload.entityId === "string") {
        keys.add(`${payload.entityType}:${payload.entityId}`);
      }
    }
    return keys;
  }, [pendingApprovalsQuery.data]);

  const promoteMutation = useMutation({
    mutationFn: (item: { entityType: "rq_submission" | "marketplace_booking"; entityId: string }) => {
      if (!walletCompanyId) throw new Error("No company selected");
      return approvalsApi.create(walletCompanyId, {
        type: "promote_to_live",
        payload: { entityType: item.entityType, entityId: item.entityId },
      });
    },
    onSuccess: () => {
      pushToast({ title: "Promotion requested", body: "Sent to the board for approval.", tone: "success" });
      if (walletCompanyId) {
        queryClient.invalidateQueries({ queryKey: ["member-profile", "approvals", "pending", walletCompanyId] });
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to request promotion";
      pushToast({ title: "Promotion request failed", body: message, tone: "error" });
    },
  });

  // Real xp/tokens — this page only ever shows the signed-in user's own
  // profile, so the actor-scoped /amx/wallet route (no memberId param) is
  // the correct source; engagementScore doubles as "xp" here.
  React.useEffect(() => {
    if (!walletCompanyId) return;
    let cancelled = false;
    amxApi.getWallet(walletCompanyId)
      .then((data) => {
        if (cancelled) return;
        setMember(prev => ({ ...prev, xp: data.engagementScore, tokens: data.tokenBalance }));
      })
      .catch(() => { /* wallet not provisioned yet — keep current */ });
    return () => { cancelled = true; };
  }, [walletCompanyId]);
  const [showEngageModal, setShowEngageModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);

  const dashAgent = MOCK_AGENTS.find(a => a.id === "ag_dasher");

  const handleQuickRentDasher = () => {
    setSelectedAgent(dashAgent);
    setShowEngageModal(true);
  };

  return (
    <PublicLayout>
      <div className="relative min-h-[90vh] py-12 px-4 md:px-8">
        {/* Modals */}
        {showCreditsModal && <BuyCreditsModal onClose={() => setShowCreditsModal(false)} />}
        {showEngageModal && selectedAgent && (
           <EngageModal 
              talent={selectedAgent} 
              activeTab="agents" 
              balance={member.tokens} 
              currency="SIMS" 
              onClose={() => setShowEngageModal(false)} 
           />
        )}

        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12 pt-10">
            <div className="w-full lg:w-1/2 flex flex-col items-center">
               <MemberPassCard data={member} />
               <p className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.4em] mt-24 flex items-center gap-2">
                 <RefreshCw className="h-3 w-3 animate-spin-slow" /> Click to Flip Pass
               </p>
            </div>

            <div className="w-full lg:w-1/2 space-y-8 animate-in slide-in-from-right-10 duration-700">
               <div>
                  <h1 className="text-4xl font-black tracking-tighter text-white mb-2">Member Central</h1>
                  <p className="text-muted-foreground leading-relaxed">Your AMX Digital Pass is currently active. Hire specialists, buy core skills, and manage your token balance directly from this hub.</p>
               </div>

               <div className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={() => setShowCreditsModal(true)} className="h-14 flex-1 font-black uppercase tracking-widest gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90">
                     <Plus className="h-5 w-5" /> Add Credits
                  </Button>
                  <Link to="/home#agents" className="flex-1">
                     <Button variant="outline" className="h-14 w-full font-black uppercase tracking-widest gap-2 border-border/60 hover:bg-accent/5">
                        <User className="h-5 w-5" /> Hire Specialist
                     </Button>
                  </Link>
               </div>

               {/* Getting Started — new member onboarding */}
               <div className="p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
                 <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
                   <Sparkles className="h-4 w-4" /> Getting started
                 </h3>
                 <div className="grid gap-2">
                   <Link to="/onboarding" className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-border/30 hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                     <div className="p-2 rounded-lg bg-primary/10"><Terminal className="h-4 w-4 text-primary" /></div>
                     <div className="flex-1">
                       <p className="text-sm font-bold text-white">Create your company</p>
                       <p className="text-[11px] text-muted-foreground">Set up your organization and deploy your first AI agent</p>
                     </div>
                     <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                   </Link>
                   <Link to="/request" className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-border/30 hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                     <div className="p-2 rounded-lg bg-violet-500/10"><ArrowUpRight className="h-4 w-4 text-violet-400" /></div>
                     <div className="flex-1">
                       <p className="text-sm font-bold text-white">Request a service</p>
                       <p className="text-[11px] text-muted-foreground">Submit a work order for agent-powered delivery</p>
                     </div>
                     <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                   </Link>
                   <Link to="/portal/AMXA" className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-border/30 hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                     <div className="p-2 rounded-lg bg-blue-500/10"><Cpu className="h-4 w-4 text-blue-400" /></div>
                     <div className="flex-1">
                       <p className="text-sm font-bold text-white">Browse OPPRRC portal</p>
                       <p className="text-[11px] text-muted-foreground">View deliverables, video reviews, and agent work</p>
                     </div>
                     <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                   </Link>
                   <Link to="/home#companies" className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-border/30 hover:border-primary/40 hover:bg-primary/5 transition-colors group">
                     <div className="p-2 rounded-lg bg-amber-500/10"><TrendingUp className="h-4 w-4 text-amber-400" /></div>
                     <div className="flex-1">
                       <p className="text-sm font-bold text-white">Explore companies & agents</p>
                       <p className="text-[11px] text-muted-foreground">Discover available AI teams and hire specialists</p>
                     </div>
                     <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                   </Link>
                 </div>
               </div>

               {/* Agent Digital Dasher Quick Rent */}
               {dashAgent && (
                  <div className="p-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent relative overflow-hidden group">
                     <div className="absolute -right-4 -top-4 opacity-[0.05] group-hover:scale-110 transition-transform duration-500"><Bot className="h-32 w-32" /></div>
                     <div className="flex items-start justify-between mb-4">
                        <div className="flex gap-4">
                           <div className="p-3 rounded-2xl bg-primary/20 border border-primary/30"><Zap className="h-6 w-6 text-primary" /></div>
                           <div>
                              <h3 className="text-lg font-black text-white">{dashAgent.name}</h3>
                              <p className="text-[11px] font-black text-primary uppercase tracking-widest">Active & Ready · 24/7 Dash Run</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Standard Rate</p>
                           <p className="text-xl font-black text-white">{dashAgent.hourlyRateTokens} <span className="text-[10px] text-muted-foreground">CR/HR</span></p>
                        </div>
                     </div>
                     <p className="text-[12px] text-muted-foreground mb-5 leading-relaxed max-w-sm">The fleet's fastest agent for high-cadence task automation. Perfect for repetitive runs and rapid prototyping.</p>
                     
                     <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 mb-4">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                           <Info className="h-3.5 w-3.5 text-primary" /> Seller Pays 10% Fee
                        </div>
                        <p className="text-[10px] font-black text-emerald-400">NET Payout: {dashAgent.hourlyRateTokens - calculatePlatformFee(dashAgent.hourlyRateTokens)} cr/hr</p>
                     </div>

                     <Button onClick={handleQuickRentDasher} className="w-full h-12 font-black uppercase tracking-widest gap-2">
                        <Play className="h-4 w-4" /> Rent Digital Dasher now
                     </Button>
                  </div>
               )}
               {/* Running Nodes / Active Dashes */}
               <div className="space-y-4">
                  <div className="flex items-center justify-between pt-4">
                     <h3 className="text-[12px] font-black text-muted-foreground uppercase tracking-[0.2em]">Running Nodes</h3>
                     <div className="h-px flex-1 bg-white/5 mx-4" />
                     <span className="text-[10px] font-black text-primary px-2 py-0.5 rounded border border-primary/30 bg-primary/5">1 ACTIVE</span>
                  </div>
                  
                  <div className="p-4 rounded-2xl border border-white/5 bg-white/5 flex items-center justify-between group hover:border-primary/20 transition-all cursor-pointer">
                     <div className="flex items-center gap-4">
                        <div className="relative">
                           <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                              <Zap className="h-4 w-4 text-primary" />
                           </div>
                           <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[#0a0a0a] animate-pulse" />
                        </div>
                        <div>
                           <div className="text-[13px] font-bold text-white uppercase">Digital Dasher #704</div>
                           <div className="text-[10px] text-muted-foreground">Running Node · SIM-02 · <span className="text-primary tracking-widest font-black">3 ACTIVE TASKS</span></div>
                        </div>
                     </div>
                     <Link to="/roster">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary">
                           <ChevronRight className="h-4 w-4" />
                        </Button>
                     </Link>
                  </div>
               </div>

               {/* Dash Requests / Orders */}
               <div className="space-y-4">
                  <div className="flex items-center justify-between pt-4">
                     <h3 className="text-[12px] font-black text-muted-foreground uppercase tracking-[0.2em]">Dash Requests</h3>
                     <div className="h-px flex-1 bg-white/5 mx-4" />
                     <Link to="/inbox">
                        <button className="text-[10px] font-black text-white/40 hover:text-primary uppercase tracking-widest transition-colors">View All Orders</button>
                     </Link>
                  </div>

                  <div className="space-y-2 opacity-80">
                     {[
                        { id: "DSH-992", task: "Python Optimization", status: "In Progress", color: "text-amber-400" },
                        { id: "DSH-884", task: "Database Indexing", status: "Completed", color: "text-emerald-400" }
                     ].map((req) => (
                        <div key={req.id} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-black/20 text-[11px]">
                           <div className="flex items-center gap-3">
                              <span className="font-mono text-muted-foreground">{req.id}</span>
                              <span className="font-bold text-white">{req.task}</span>
                           </div>
                           <span className={`font-black uppercase tracking-widest ${req.color}`}>{req.status}</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          </div>

          {/* Member Marketplace Feed */}
          <div className="mt-20 space-y-6">
             <div className="flex items-center justify-between">
                <div>
                   <h2 className="text-2xl font-black tracking-tighter text-white">Member Marketplace</h2>
                   <p className="text-[12px] text-muted-foreground uppercase tracking-[0.2em] mt-1">Exclusive Skills & Merch from the Network</p>
                </div>
                <div className="flex gap-2">
                   <div className="p-2 rounded-lg bg-card border border-border/60"><ArrowLeft className="h-4 w-4 opacity-40" /></div>
                   <div className="p-2 rounded-lg bg-card border border-border/60"><ChevronRight className="h-4 w-4" /></div>
                </div>
             </div>

             <div className="flex gap-5 overflow-x-auto pb-6 scrollbar-hide">
                {MOCK_MARKET_ITEMS.map((item) => (
                   <MarketItemCard 
                      key={item.id} 
                      item={item} 
                      onBuy={(it) => alert(`Contract Initiated: ${it.name}\nProcessing 10% AMX Platform Fee...`)} 
                    />
                ))}
             </div>
          </div>

          {/* Portfolio — completed marketplace engagements, either side */}
          <div className="mt-20 space-y-6">
             <div>
                <h2 className="text-2xl font-black tracking-tighter text-white">Portfolio</h2>
                <p className="text-[12px] text-muted-foreground uppercase tracking-[0.2em] mt-1">Completed Marketplace Engagements</p>
             </div>

             {portfolioItems.length > 0 ? (
                <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/40 overflow-hidden">
                   {portfolioItems.map((item) => (
                      <div key={item.bookingId} className="flex items-center justify-between px-5 py-4 text-sm gap-4">
                         <div className="min-w-0">
                            <p className="font-bold text-white truncate">{item.projectTitle}</p>
                            <p className="text-[11px] text-muted-foreground">
                               {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : "—"} ·{" "}
                               <span className="uppercase tracking-widest font-black">{item.role}</span>
                            </p>
                         </div>
                         <div className="flex items-center gap-3 shrink-0">
                            {item.eligibleForPromotion && (
                               <PromoteToMarketControl
                                  isPending={pendingPromotionKeys.has(`${item.entityType}:${item.entityId}`)}
                                  isRequesting={promoteMutation.isPending && promoteMutation.variables?.entityId === item.entityId}
                                  onPromote={() => promoteMutation.mutate({ entityType: item.entityType, entityId: item.entityId })}
                               />
                            )}
                            <span className="font-black text-white">{item.budgetSims.toLocaleString()} SIMS</span>
                         </div>
                      </div>
                   ))}
                </div>
             ) : (
                <div className="p-6 rounded-2xl border border-border/60 bg-card text-sm text-muted-foreground">
                   No completed engagements on record yet.
                </div>
             )}
          </div>

          <div className="mt-20 text-center">
             <p className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.4em] mb-4">Secured by AMX Smart Contracts</p>
             <Link to="/home">
                <Button variant="ghost" className="text-muted-foreground hover:text-white px-8 h-12 gap-2 font-black uppercase tracking-widest group">
                   <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to Network
                </Button>
             </Link>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </PublicLayout>
  );
}
