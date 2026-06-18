import React, { useState, useEffect } from "react";
import {
  Wallet, Zap, ArrowDownLeft, ShieldCheck, Sparkles, Download,
  Coins, History, Loader2, Plus, CreditCard, TrendingUp,
  Users, UserCheck, Bot, Package, ChevronRight, CheckCircle2,
  Clock, X, BadgeCheck, Flame, ArrowRight, Layers, ArrowUpRight,
  Star, Trophy, Gift, Award, Target, Leaf,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { amxApi } from "@/api/amx";
import { authApi } from "@/api/auth";
import { useCompany } from "@/context/CompanyContext";
import { useNavigate, useSearchParams } from "@/lib/router";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

// ── Credit tier packages ──────────────────────────────────────────────────────
export const CREDIT_TIERS = [
  { id: "credits_starter",    name: "Starter",    credits: 1000,  price: 9,   pricePerCredit: "0.009",  badge: null,           badgeColor: "",                              color: "from-blue-500/20 to-blue-600/5",    border: "border-blue-500/20 hover:border-blue-500/50",   perks: ["Solo agent hiring", "Basic tasks", "Standard support"] },
  { id: "credits_pro",        name: "Pro",         credits: 5000,  price: 39,  pricePerCredit: "0.0078", badge: "Most Popular",  badgeColor: "bg-primary text-primary-foreground",            color: "from-primary/20 to-primary/5",      border: "border-primary/30 hover:border-primary/60",     perks: ["Co-op team hiring", "Priority queue", "Analytics", "24h support"] },
  { id: "credits_enterprise", name: "Enterprise",  credits: 25000, price: 149, pricePerCredit: "0.006",  badge: "Best Value",    badgeColor: "bg-violet-500 text-white",                      color: "from-violet-500/20 to-violet-600/5", border: "border-violet-500/20 hover:border-violet-500/50", perks: ["Full team hiring", "Dedicated rep", "Custom SLA", "Priority onboarding"] },
  { id: "credits_scale",      name: "Scale Ops",   credits: 100000,price: 499, pricePerCredit: "0.005",  badge: "Enterprise",    badgeColor: "bg-amber-500 text-black",                       color: "from-amber-500/20 to-amber-600/5",  border: "border-amber-500/20 hover:border-amber-500/50", perks: ["Unlimited team size", "API access", "White-label", "Concierge"] },
];

// ── Hire modes ────────────────────────────────────────────────────────────────
const HIRE_MODES = [
  { id: "solo-agent",  label: "Solo AI Agent",       icon: Bot,       color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    costRange: "25–80 cr/hr",      marketplaceTab: "agents" },
  { id: "solo-human",  label: "Solo Human Expert",   icon: UserCheck, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", costRange: "550–950 cr/hr",    marketplaceTab: "humans" },
  { id: "coop",        label: "Co-op (AI + Human)",  icon: Users,     color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20",  costRange: "200–600 cr/hr",    marketplaceTab: "coop"   },
  { id: "team",        label: "Full Team / Group",   icon: Layers,    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   costRange: "800–2,400 cr/hr",  marketplaceTab: "team"   },
];

const LEVEL_THRESHOLDS = [0, 500, 1000, 1500, 2500];

function computeLevel(points: number) {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= (LEVEL_THRESHOLDS[i] ?? 0)) { level = i + 1; break; }
  }
  return level;
}

function nextLevelThreshold(points: number): number | null {
  for (const t of LEVEL_THRESHOLDS) {
    if (points < t) return t;
  }
  return null;
}

// ── Buy Credits Modal (Stripe redirect) ───────────────────────────────────────
export function BuyCreditsModal({
  onClose,
  companyId,
  principalId,
}: { onClose: () => void; companyId?: string; principalId?: string }) {
  const [selected, setSelected] = useState("credits_pro");
  const [loading, setLoading] = useState(false);
  const { pushToast } = useToast();
  const tier = CREDIT_TIERS.find((t) => t.id === selected)!;

  const handleCheckout = async () => {
    if (!companyId || !principalId) {
      pushToast({ tone: "warn", title: "Sign in to buy credits" });
      return;
    }
    setLoading(true);
    try {
      const result = await amxApi.buyCredits(companyId, selected, principalId);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        pushToast({ tone: "warn", title: "No checkout URL returned" });
        setLoading(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start checkout";
      pushToast({ tone: "warn", title: msg });
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-card rounded-3xl border border-border/60 overflow-hidden animate-in zoom-in-95 duration-300 shadow-2xl">
        <div className="flex items-center justify-between px-8 py-5 border-b border-border/40 bg-gradient-to-r from-accent/10 to-primary/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><CreditCard className="h-5 w-5 text-primary" /></div>
            <div><h2 className="text-base font-black text-foreground uppercase tracking-tight">Buy SIMS Credits</h2><p className="text-[11px] text-muted-foreground">Powered by Stripe · Secure checkout</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
            {CREDIT_TIERS.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={`relative flex flex-col p-4 rounded-2xl border bg-gradient-to-b ${t.color} ${t.border} transition-all duration-200 text-left ${selected === t.id ? "ring-2 ring-primary/60 shadow-lg shadow-primary/10" : ""}`}>
                {t.badge && <span className={`absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${t.badgeColor}`}>{t.badge}</span>}
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">{t.name}</span>
                <span className="text-2xl font-black text-foreground">{t.credits >= 1000 ? `${t.credits / 1000}K` : t.credits}</span>
                <span className="text-[10px] text-muted-foreground mb-2">credits</span>
                <span className="text-lg font-black text-foreground">${t.price}</span>
                <span className="text-[9px] text-muted-foreground">${t.pricePerCredit}/cr</span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-border/40 bg-card/40 p-5 mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">{tier.name} includes</p>
            <div className="grid grid-cols-2 gap-2">
              {tier.perks.map((p) => (
                <div key={p} className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />{p}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-6">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> AMX Chain secured · Stripe-grade encryption · Redirect to secure checkout
          </div>
          <div className="flex gap-3">
            <Button onClick={handleCheckout} disabled={loading} className="flex-1 h-12 font-black uppercase tracking-widest text-[12px] gap-2 shadow-lg shadow-primary/20">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {loading ? "Redirecting…" : `Continue — $${tier.price} for ${tier.credits.toLocaleString()} credits`}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={loading} className="h-12 px-6 font-black uppercase tracking-widest text-[11px] border-border/60">Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hire Mode Panel ────────────────────────────────────────────────────────────
function HireModePanel({ balance, currency, companyPrefix }: { balance: number; currency: string; companyPrefix?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleBrowse = () => {
    if (!selected || !companyPrefix) return;
    const mode = HIRE_MODES.find((m) => m.id === selected);
    navigate(`/${companyPrefix}/marketplace?mode=${mode?.marketplaceTab ?? "agents"}`);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border/40 bg-gradient-to-r from-accent/10 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-[12px] font-black uppercase tracking-widest">Hire Workforce</h3>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground border border-border/30 rounded px-2 py-0.5 bg-card/50">
          {balance.toLocaleString()} {currency}
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {HIRE_MODES.map((mode) => {
          const Icon = mode.icon;
          const isSelected = selected === mode.id;
          return (
            <button key={mode.id} onClick={() => setSelected(isSelected ? null : mode.id)}
              className={`relative text-left flex flex-col gap-2.5 p-4 rounded-xl border transition-all duration-200 ${isSelected ? `${mode.border} ${mode.bg} ring-1 ring-current/20` : "border-border/40 hover:border-border bg-card/40 hover:bg-accent/5"}`}>
              <div className="flex items-start justify-between">
                <div className={`p-2 rounded-lg ${mode.bg}`}><Icon className={`h-4 w-4 ${mode.color}`} /></div>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              </div>
              <p className={`text-[11px] font-black uppercase tracking-wide ${isSelected ? mode.color : "text-foreground"}`}>{mode.label}</p>
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <span className="text-[9px] font-bold text-muted-foreground uppercase">Rate</span>
                <span className={`text-[10px] font-black ${isSelected ? mode.color : "text-foreground"}`}>{mode.costRange}</span>
              </div>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="px-4 pb-4 animate-in slide-in-from-bottom-1 duration-150">
          <Button onClick={handleBrowse} className="w-full h-11 font-black uppercase tracking-widest text-[11px] gap-2">
            Browse {HIRE_MODES.find((m) => m.id === selected)?.label} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Tab: SIMS Credits ─────────────────────────────────────────────────────────
function SimsCreditsTab({
  data,
  onBuyCredits,
  companyPrefix,
}: { data: any; onBuyCredits: () => void; companyPrefix?: string }) {
  const creditTxs = (data?.transactions ?? []).filter((tx: any) => tx.currency === "CREDIT");
  const totalEarned = creditTxs.filter((tx: any) => tx.toPrincipalId !== "marketplace-escrow" && tx.toPrincipalId !== "stripe-checkout").reduce((s: number, tx: any) => s + tx.amount, 0);
  const totalRedeemed = creditTxs.filter((tx: any) => tx.fromPrincipalId !== "system" && tx.fromPrincipalId !== "stripe-subscription" && tx.fromPrincipalId !== "stripe-checkout").reduce((s: number, tx: any) => s + tx.amount, 0);

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="relative p-7 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 overflow-hidden group hover:border-primary/40 transition-all duration-500 shadow-lg shadow-primary/5">
        <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none"><Zap className="w-40 h-40" /></div>
        <span className="text-[9px] font-black uppercase tracking-widest text-primary/80 border border-primary/20 bg-primary/10 rounded-full px-3 py-1 inline-block mb-4">Learning Currency</span>
        <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1">SIMS Credit Balance</p>
        <div className="text-5xl font-black text-foreground flex items-baseline gap-2 mb-5">
          {(data?.creditBalance ?? 0).toLocaleString()} <span className="text-xl text-primary">CREDITS</span>
        </div>
        <div className="flex gap-2">
          <Button onClick={onBuyCredits} className="h-10 px-5 font-black text-[11px] uppercase tracking-widest gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Buy Credits
          </Button>
          <Button variant="outline" className="h-10 px-4 font-black text-[11px] uppercase tracking-widest border-border/60">Portfolio</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Earned", value: totalEarned.toLocaleString(), color: "text-emerald-500", icon: TrendingUp },
          { label: "Total Redeemed", value: totalRedeemed.toLocaleString(), color: "text-rose-400", icon: ArrowUpRight },
          { label: "Packages Bought", value: String(creditTxs.filter((tx: any) => tx.transactionType === "credit_purchase").length), color: "text-blue-400", icon: Package },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-2xl border border-border/60 bg-card">
            <s.icon className={`h-4 w-4 ${s.color} mb-2`} />
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Credit packages */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
            <Package className="h-4 w-4" /> Credit Packages
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CREDIT_TIERS.map((t) => (
            <button key={t.id} onClick={onBuyCredits}
              className={`relative group text-left flex flex-col p-4 rounded-2xl border bg-gradient-to-b ${t.color} ${t.border} transition-all duration-200 hover:shadow-lg hover:shadow-primary/5`}>
              {t.badge && <span className={`absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${t.badgeColor}`}>{t.badge}</span>}
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">{t.name}</span>
              <span className="text-xl font-black text-foreground">{t.credits >= 1000 ? `${t.credits / 1000}K` : t.credits} <span className="text-[10px] text-muted-foreground font-medium">credits</span></span>
              <span className="text-base font-black text-foreground mt-1">${t.price}</span>
              <span className="text-[9px] text-muted-foreground">${t.pricePerCredit}/cr</span>
              <div className="mt-3 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary group-hover:translate-x-0.5 transition-transform">
                Buy <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Transaction ledger */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[12px] font-black uppercase tracking-widest">Credit Ledger</h3>
        </div>
        {creditTxs.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center opacity-50 gap-3">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-bold text-muted-foreground">No credit transactions yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {creditTxs.map((tx: any) => {
              const isIncoming = tx.toPrincipalId !== "marketplace-escrow";
              return (
                <div key={tx.id} className="flex items-center justify-between px-5 py-4 hover:bg-accent/5 transition-colors gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isIncoming ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                      {isIncoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-black text-foreground truncate capitalize">{tx.transactionType.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(tx.occurredAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className={`text-[14px] font-black ${isIncoming ? "text-emerald-500" : "text-foreground/80"}`}>
                    {isIncoming ? "+" : "-"}{tx.amount.toLocaleString()} CR
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hire panel + Security */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HireModePanel balance={data?.creditBalance ?? 0} currency="CREDITS" companyPrefix={companyPrefix} />
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-card border border-border/60">
            <div className="flex items-center gap-2 mb-3 text-primary"><ShieldCheck className="h-4 w-4" /><h4 className="text-[11px] font-black uppercase tracking-widest">Security</h4></div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">All ledger entries signed on AMX Chain. No raw keys stored. Biometric auth active.</p>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500"><Sparkles className="h-3.5 w-3.5" /> AMX Chain Verified</div>
          </div>
          <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-3 text-primary"><Coins className="h-4 w-4" /><h4 className="text-[11px] font-black uppercase tracking-widest">Staking</h4></div>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">Stake credits to earn reputation, lower platform fees, and unlock enterprise hire rates.</p>
            <Button className="w-full h-10 font-black uppercase tracking-widest text-[11px]">Start Staking</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Earner Tokens ────────────────────────────────────────────────────────
function EarnerTokensTab({ data }: { data: any }) {
  const tokenTxs = (data?.transactions ?? []).filter((tx: any) => tx.currency === "AMX");
  const totalEarned = tokenTxs.filter((tx: any) => tx.toPrincipalId !== "marketplace-escrow").reduce((s: number, tx: any) => s + tx.amount, 0);
  const totalPaidOut = tokenTxs.filter((tx: any) => tx.fromPrincipalId !== "system" && tx.fromPrincipalId !== "marketplace-escrow").reduce((s: number, tx: any) => s + tx.amount, 0);
  const activeBookings = tokenTxs.filter((tx: any) => tx.transactionType === "marketplace_booking" && tx.toPrincipalId === "marketplace-escrow").length;

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="relative p-7 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-600/5 overflow-hidden group hover:border-amber-500/40 transition-all duration-500 shadow-lg shadow-amber-500/5">
        <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none"><Coins className="w-40 h-40" /></div>
        <span className="text-[9px] font-black uppercase tracking-widest text-amber-500/80 border border-amber-500/20 bg-amber-500/10 rounded-full px-3 py-1 inline-block mb-4">Production Currency</span>
        <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1">Earner Token Balance</p>
        <div className="text-5xl font-black text-foreground flex items-baseline gap-2 mb-5">
          {(data?.tokenBalance ?? 0).toLocaleString()} <span className="text-xl text-amber-500">SIMS</span>
        </div>
        <p className="text-[12px] text-muted-foreground">Earn by completing marketplace bookings · Deploy skills to grow your token stack</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Earned", value: totalEarned.toLocaleString(), color: "text-emerald-500", icon: TrendingUp },
          { label: "Total Paid Out", value: totalPaidOut.toLocaleString(), color: "text-rose-400", icon: ArrowUpRight },
          { label: "Active Bookings", value: String(activeBookings), color: "text-amber-400", icon: Clock },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-2xl border border-border/60 bg-card">
            <s.icon className={`h-4 w-4 ${s.color} mb-2`} />
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Earning paths */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <Target className="h-4 w-4 text-amber-400" />
          <h3 className="text-[12px] font-black uppercase tracking-widest">How to Earn Tokens</h3>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Complete marketplace booking", reward: "+budget SIMS", icon: CheckCircle2, color: "text-emerald-400" },
            { label: "Deploy skills in active projects", reward: "+variable", icon: Zap, color: "text-amber-400" },
            { label: "Mentor & coach learners", reward: "+5 credits", icon: Users, color: "text-violet-400" },
            { label: "Log community activity (30 min)", reward: "+2 credits", icon: Leaf, color: "text-blue-400" },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl border border-border/40 bg-card/60">
              <item.icon className={`h-4 w-4 mt-0.5 ${item.color} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-foreground">{item.label}</p>
                <p className={`text-[10px] font-black uppercase tracking-widest ${item.color}`}>{item.reward}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction ledger */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[12px] font-black uppercase tracking-widest">Token Ledger</h3>
        </div>
        {tokenTxs.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center opacity-50 gap-3">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-bold text-muted-foreground">No token transactions yet · complete a booking to earn</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {tokenTxs.map((tx: any) => {
              const isIncoming = tx.toPrincipalId !== "marketplace-escrow";
              return (
                <div key={tx.id} className="flex items-center justify-between px-5 py-4 hover:bg-accent/5 transition-colors gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isIncoming ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                      {isIncoming ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-black text-foreground truncate capitalize">{tx.transactionType.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(tx.occurredAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className={`text-[14px] font-black ${isIncoming ? "text-emerald-500" : "text-foreground/80"}`}>
                    {isIncoming ? "+" : "-"}{tx.amount.toLocaleString()} SIMS
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: AIR HUB Points ───────────────────────────────────────────────────────
function AirHubPointsTab({ data }: { data: any }) {
  const engagementScore: number = data?.engagementScore ?? 0;
  const points = engagementScore * 25;
  const level = computeLevel(points);
  const nextThreshold = nextLevelThreshold(points);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const progressPct = nextThreshold
    ? Math.round(((points - currentThreshold) / (nextThreshold - currentThreshold)) * 100)
    : 100;

  const badges: any[] = data?.badges ?? [];
  const allTxs: any[] = data?.transactions ?? [];

  const BADGE_TIER_MAP: Record<string, { color: string; label: string }> = {
    achievement: { color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Gold" },
    completion:  { color: "text-slate-300 bg-slate-500/10 border-slate-500/20", label: "Silver" },
    community:   { color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Bronze" },
    leadership:  { color: "text-violet-400 bg-violet-500/10 border-violet-500/20", label: "Platinum" },
    workforce:   { color: "text-blue-400 bg-blue-500/10 border-blue-500/20", label: "Diamond" },
  };

  const BADGE_ICONS: Record<string, React.ElementType> = {
    achievement: Trophy,
    completion:  Star,
    community:   Users,
    leadership:  Award,
    workforce:   BadgeCheck,
  };

  return (
    <div className="space-y-6">
      {/* Level card */}
      <div className="relative p-7 rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-amber-600/5 overflow-hidden shadow-lg shadow-orange-500/5">
        <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none"><Trophy className="w-40 h-40" /></div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-400/80 border border-orange-500/20 bg-orange-500/10 rounded-full px-3 py-1 inline-block mb-3">AIR HUB Points</span>
            <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1">Your Points</p>
            <div className="text-5xl font-black text-foreground flex items-baseline gap-2 mb-1">
              {points.toLocaleString()} <span className="text-xl text-orange-400">PTS</span>
            </div>
            <p className="text-[12px] text-muted-foreground">Engagement score {engagementScore} × 25</p>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 mb-2">
              <span className="text-2xl font-black text-orange-400">L{level}</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Level {level}</p>
          </div>
        </div>

        {/* Progress bar */}
        {nextThreshold && (
          <div className="mb-2">
            <div className="flex justify-between text-[10px] font-black text-muted-foreground mb-1.5">
              <span>{points.toLocaleString()} pts</span>
              <span>Level {level + 1} at {nextThreshold.toLocaleString()} pts</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-orange-500/10 border border-orange-500/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{progressPct}% to Level {level + 1}</p>
          </div>
        )}
        {!nextThreshold && (
          <div className="flex items-center gap-2 text-[12px] font-black text-orange-400">
            <Flame className="h-4 w-4" /> Max Level Reached · Pathfinder Leader
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Earned", value: `${points.toLocaleString()} pts`, color: "text-orange-400", icon: TrendingUp },
          { label: "Redeemed", value: "0 pts", color: "text-muted-foreground", icon: Gift },
          { label: "Awards Earned", value: String(badges.length), color: "text-amber-400", icon: Trophy },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-2xl border border-border/60 bg-card">
            <s.icon className={`h-4 w-4 ${s.color} mb-2`} />
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Awards Collection */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h3 className="text-[12px] font-black uppercase tracking-widest">Awards Collection</h3>
          <span className="ml-auto text-[10px] font-black text-muted-foreground border border-border/30 rounded px-2 py-0.5">{badges.length} awards</span>
        </div>
        {badges.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center opacity-50 gap-3">
            <Trophy className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-bold text-muted-foreground">No awards yet · Complete workshops and milestones to earn badges</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {badges.map((badge: any) => {
              const tierInfo = BADGE_TIER_MAP[badge.category] ?? BADGE_TIER_MAP["achievement"]!;
              const Icon = BADGE_ICONS[badge.category] ?? Trophy;
              return (
                <div key={badge.id} className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${tierInfo.color} text-center`}>
                  <div className={`p-3 rounded-xl ${tierInfo.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-[11px] font-black text-foreground leading-tight">{badge.name}</p>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${tierInfo.color.split(" ")[0]}`}>{tierInfo.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rewards History */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[12px] font-black uppercase tracking-widest">Rewards History</h3>
        </div>
        {allTxs.length === 0 ? (
          <div className="py-16 flex flex-col items-center text-center opacity-50 gap-3">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-bold text-muted-foreground">No activity yet · earn credits and tokens to see history here</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {allTxs.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-4 hover:bg-accent/5 transition-colors gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-orange-500/10 text-orange-400">
                    <Gift className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-black text-foreground truncate capitalize">{tx.transactionType.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(tx.occurredAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <span className="text-[11px] font-black text-orange-400 border border-orange-500/20 bg-orange-500/10 rounded-full px-2.5 py-1">
                  +{tx.amount} {tx.currency}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Redeem Points */}
      <div className="p-6 rounded-2xl border border-orange-500/20 bg-orange-500/5 text-center">
        <Trophy className="h-8 w-8 text-orange-400 mx-auto mb-3" />
        <h3 className="text-[14px] font-black text-foreground mb-1">Redeem Your Points</h3>
        <p className="text-[12px] text-muted-foreground mb-4 max-w-sm mx-auto">Exchange AIR HUB Points for exclusive rewards, discounts, and community perks.</p>
        <Button className="h-11 px-8 font-black uppercase tracking-widest text-[11px] gap-2 bg-orange-500 hover:bg-orange-600 text-white">
          <Gift className="h-4 w-4" /> Redeem Points
        </Button>
      </div>
    </div>
  );
}

// ── Main XpWallet ─────────────────────────────────────────────────────────────
export function XpWallet() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [showBuyModal, setShowBuyModal] = useState(false);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const principalId = session?.user?.id ?? session?.session?.userId ?? "";
  const [activeTab, setActiveTab] = useState<"credits" | "tokens" | "points">("credits");
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  // Detect Stripe payment success redirect
  useEffect(() => {
    if (searchParams.get("payment") === "success") {
      pushToast({ title: "Payment successful! Credits added to your wallet." });
      queryClient.invalidateQueries({ queryKey: ["amx", "wallet", selectedCompanyId] });
      setSearchParams({});
    }
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["amx", "wallet", selectedCompanyId],
    queryFn: () => amxApi.getWallet(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (isLoading) return (
    <div className="flex h-[400px] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
    </div>
  );

  if (error) return (
    <div className="flex h-[400px] flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground font-bold">Failed to load wallet</p>
      <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
    </div>
  );

  const TABS = [
    { id: "credits" as const, label: "SIMS Credits", sublabel: `${(data?.creditBalance ?? 0).toLocaleString()} CR`, color: "text-primary border-primary", activeGrad: "from-primary/10 to-primary/5" },
    { id: "tokens" as const,  label: "Earner Tokens", sublabel: `${(data?.tokenBalance ?? 0).toLocaleString()} SIMS`, color: "text-amber-500 border-amber-500", activeGrad: "from-amber-500/10 to-amber-600/5" },
    { id: "points" as const,  label: "AIR HUB Points", sublabel: `${((data?.engagementScore ?? 0) * 25).toLocaleString()} PTS`, color: "text-orange-400 border-orange-500", activeGrad: "from-orange-500/10 to-amber-600/5" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {showBuyModal && selectedCompanyId && (
        <BuyCreditsModal
          onClose={() => setShowBuyModal(false)}
          companyId={selectedCompanyId}
          principalId={principalId}
        />
      )}

      {/* Header */}
      <section className="px-4 md:px-8 py-8 border-b border-border/40 bg-gradient-to-br from-accent/10 via-background to-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-lg shadow-primary/10">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">AMX Wallet</h1>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Credits · Tokens · Points</p>
                </div>
              </div>
              <p className="text-[13px] text-muted-foreground max-w-lg leading-relaxed">
                Manage your SIMS Credits for learning, Earner Tokens for the marketplace, and AIR HUB Points for rewards.
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Button onClick={() => setShowBuyModal(true)} className="h-11 px-5 gap-2 font-black text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20">
                <Plus className="h-3.5 w-3.5" /> Buy Credits
              </Button>
              <Button variant="outline" className="h-11 px-4 gap-2 font-black text-[11px] uppercase tracking-widest border-border/60">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 p-1 rounded-2xl bg-card border border-border/60 w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center gap-0.5 px-6 py-3 rounded-xl transition-all duration-200 ${
                  activeTab === tab.id
                    ? `bg-gradient-to-b ${tab.activeGrad} border ${tab.color.split(" ")[1] ?? "border-primary"} border-opacity-30 shadow-sm`
                    : "hover:bg-accent/20"
                }`}
              >
                <span className={`text-[11px] font-black uppercase tracking-widest ${activeTab === tab.id ? tab.color.split(" ")[0] : "text-muted-foreground"}`}>
                  {tab.label}
                </span>
                <span className={`text-[10px] font-bold ${activeTab === tab.id ? tab.color.split(" ")[0] : "text-muted-foreground/60"}`}>
                  {tab.sublabel}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          {activeTab === "credits" && (
            <SimsCreditsTab
              data={data}
              onBuyCredits={() => setShowBuyModal(true)}
              companyPrefix={selectedCompany?.issuePrefix}
            />
          )}
          {activeTab === "tokens" && <EarnerTokensTab data={data} />}
          {activeTab === "points" && <AirHubPointsTab data={data} />}
        </div>
      </main>
    </div>
  );
}
