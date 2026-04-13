import React, { useState } from "react";
import {
  Wallet, Zap, Send, ArrowDownLeft, ShieldCheck, Sparkles, Download,
  Coins, History, Loader2, Plus, CreditCard, TrendingUp, Users,
  UserCheck, Bot, Package, ChevronRight, CheckCircle2, Clock, X,
  BadgeCheck, Flame, ArrowRight, Layers, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { amxApi } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";
import { useNavigate } from "@/lib/router";

// ── Credit tier packages ──────────────────────────────────────────────────────
export const CREDIT_TIERS = [
  { id: "starter",    name: "Starter",    credits: 1000,  price: 9,   pricePerCredit: "0.009",  badge: null,           badgeColor: "",                              color: "from-blue-500/20 to-blue-600/5",    border: "border-blue-500/20 hover:border-blue-500/50",   perks: ["Solo agent hiring", "Basic tasks", "Standard support"] },
  { id: "pro",        name: "Pro",         credits: 5000,  price: 39,  pricePerCredit: "0.0078", badge: "Most Popular",  badgeColor: "bg-primary text-primary-foreground",            color: "from-primary/20 to-primary/5",      border: "border-primary/30 hover:border-primary/60",     perks: ["Co-op team hiring", "Priority queue", "Analytics", "24h support"] },
  { id: "enterprise", name: "Enterprise",  credits: 25000, price: 149, pricePerCredit: "0.006",  badge: "Best Value",    badgeColor: "bg-violet-500 text-white",                      color: "from-violet-500/20 to-violet-600/5", border: "border-violet-500/20 hover:border-violet-500/50", perks: ["Full team hiring", "Dedicated rep", "Custom SLA", "Priority onboarding"] },
  { id: "scale",      name: "Scale Ops",   credits: 100000,price: 499, pricePerCredit: "0.005",  badge: "Enterprise",    badgeColor: "bg-amber-500 text-black",                       color: "from-amber-500/20 to-amber-600/5",  border: "border-amber-500/20 hover:border-amber-500/50", perks: ["Unlimited team size", "API access", "White-label", "Concierge"] },
];

// ── Hire modes (synced with Marketplace) ─────────────────────────────────────
const HIRE_MODES = [
  { id: "solo-agent",  label: "Solo AI Agent",       icon: Bot,       color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    costRange: "25–80 cr/hr",      marketplaceTab: "agents" },
  { id: "solo-human",  label: "Solo Human Expert",   icon: UserCheck, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", costRange: "550–950 cr/hr",    marketplaceTab: "humans" },
  { id: "coop",        label: "Co-op (AI + Human)",  icon: Users,     color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20",  costRange: "200–600 cr/hr",    marketplaceTab: "coop"   },
  { id: "team",        label: "Full Team / Group",   icon: Layers,    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   costRange: "800–2,400 cr/hr",  marketplaceTab: "team"   },
];

// ── Buy Credits Modal ─────────────────────────────────────────────────────────
export function BuyCreditsModal({ onClose, currency }: { onClose: () => void; currency: string }) {
  const [selected, setSelected] = useState("pro");
  const [step, setStep] = useState<"pick" | "checkout" | "success">("pick");
  const tier = CREDIT_TIERS.find((t) => t.id === selected)!;

  if (step === "success") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card rounded-3xl border border-emerald-500/30 p-10 text-center animate-in zoom-in-95 duration-300 shadow-2xl shadow-emerald-500/10">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-foreground mb-2">Credits Added!</h2>
        <p className="text-muted-foreground mb-1"><span className="text-3xl font-black text-emerald-400">{tier.credits.toLocaleString()}</span></p>
        <p className="text-sm text-muted-foreground mb-8">{currency} balance updated · Ready to hire</p>
        <Button onClick={onClose} className="w-full h-12 font-black uppercase tracking-widest gap-2">Start Hiring <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-card rounded-3xl border border-border/60 overflow-hidden animate-in zoom-in-95 duration-300 shadow-2xl">
        <div className="flex items-center justify-between px-8 py-5 border-b border-border/40 bg-gradient-to-r from-accent/10 to-primary/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><CreditCard className="h-5 w-5 text-primary" /></div>
            <div><h2 className="text-base font-black text-foreground uppercase tracking-tight">Buy Credits</h2><p className="text-[11px] text-muted-foreground">Power your AI & human workforce</p></div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"><X className="h-5 w-5" /></button>
        </div>

        {step === "pick" ? (
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
            <div className="flex gap-3">
              <Button onClick={() => setStep("checkout")} className="flex-1 h-12 font-black uppercase tracking-widest text-[12px] gap-2 shadow-lg shadow-primary/20">
                <CreditCard className="h-4 w-4" /> Continue — ${tier.price} for {tier.credits.toLocaleString()} credits
              </Button>
              <Button variant="outline" onClick={onClose} className="h-12 px-6 font-black uppercase tracking-widest text-[11px] border-border/60">Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="p-8">
            <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-center justify-between">
              <div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order · {tier.name}</p><p className="text-lg font-black text-foreground">{tier.credits.toLocaleString()} credits</p></div>
              <span className="text-2xl font-black text-primary">${tier.price}</span>
            </div>
            <div className="space-y-3 mb-6">
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input placeholder="Card number" className="w-full h-12 pl-10 pr-4 rounded-xl border border-border/60 bg-card text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="MM / YY" className="h-12 px-4 rounded-xl border border-border/60 bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
                <input placeholder="CVC" className="h-12 px-4 rounded-xl border border-border/60 bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-6">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> AMX Chain secured · Stripe-grade encryption
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setStep("success")} className="flex-1 h-12 font-black uppercase tracking-widest text-[12px] gap-2 shadow-lg shadow-primary/20">
                <Zap className="h-4 w-4" /> Pay ${tier.price} Now
              </Button>
              <Button variant="ghost" onClick={() => setStep("pick")} className="h-12 px-6 font-black text-[11px]">← Back</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hire Mode Panel (wires to Marketplace) ────────────────────────────────────
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
              <div>
                <p className={`text-[11px] font-black uppercase tracking-wide ${isSelected ? mode.color : "text-foreground"}`}>{mode.label}</p>
              </div>
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

// ── Main XpWallet ─────────────────────────────────────────────────────────────
export function XpWallet() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [showBuyModal, setShowBuyModal] = useState(false);

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

  const transactions = data?.transactions ?? [];
  const balance = data?.balance ?? 0;
  const currency = data?.currency ?? "SIMS";

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {showBuyModal && <BuyCreditsModal onClose={() => setShowBuyModal(false)} currency={currency} />}

      {/* Header */}
      <section className="px-4 md:px-8 py-8 border-b border-border/40 bg-gradient-to-br from-accent/10 via-background to-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-lg shadow-primary/10">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">AMX Wallet</h1>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Credits · Sims · Live Runs · Hires</p>
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground max-w-lg leading-relaxed">
              Buy credits to run Sims, source Live performances, Pre-production, Production,
              and Post-run reviews — with AI agents, human experts, or full squads.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button onClick={() => setShowBuyModal(true)} className="h-11 px-5 gap-2 font-black text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20">
              <Plus className="h-3.5 w-3.5" /> Buy Credits
            </Button>
            <Button variant="outline" className="h-11 px-4 gap-2 font-black text-[11px] uppercase tracking-widest border-border/60">
              <Send className="h-3.5 w-3.5" /> Transfer
            </Button>
            <Button variant="ghost" className="h-11 px-4 gap-2 font-black text-[11px] uppercase tracking-widest">
              <Download className="h-3.5 w-3.5" /> Withdraw
            </Button>
          </div>
        </div>
      </section>

      <main className="px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Balance + Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Main balance card */}
            <div className="lg:col-span-2 relative p-7 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 overflow-hidden group hover:border-primary/40 transition-all duration-500 shadow-lg shadow-primary/5">
              <div className="absolute top-0 right-0 p-6 opacity-[0.05] group-hover:scale-110 transition-transform duration-700 pointer-events-none"><Zap className="w-40 h-40" /></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-primary/80 border border-primary/20 bg-primary/10 rounded-full px-3 py-1 inline-block mb-4">Production Currency</span>
              <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1">Active Balance</p>
              <div className="text-5xl font-black text-foreground flex items-baseline gap-2 mb-1">
                {balance.toLocaleString()} <span className="text-xl text-primary">{currency}</span>
              </div>
              <div className="text-[12px] text-emerald-500 font-bold flex items-center gap-1 mb-5">
                <TrendingUp className="h-3.5 w-3.5" /> Funded · Ready to Deploy
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowBuyModal(true)} className="flex-1 h-10 font-black text-[11px] uppercase tracking-widest gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Credits
                </Button>
                <Button variant="outline" className="flex-1 h-10 font-black text-[11px] uppercase tracking-widest border-border/60">Portfolio</Button>
              </div>
            </div>

            {/* Sims active */}
            <div className="relative p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 group hover:border-blue-500/40 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:scale-110 transition-transform pointer-events-none"><Bot className="w-24 h-24" /></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-3 block">Active Sims</span>
              <div className="text-3xl font-black text-foreground mb-1">3</div>
              <div className="text-[11px] text-muted-foreground font-medium mb-3">agents running</div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-blue-400">
                <Clock className="h-3.5 w-3.5" /> 24 hr avg · live
              </div>
            </div>

            {/* Live team */}
            <div className="relative p-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 group hover:border-violet-500/40 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:scale-110 transition-transform pointer-events-none"><Users className="w-24 h-24" /></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-violet-400 mb-3 block">Live Teams</span>
              <div className="text-3xl font-black text-foreground mb-1">1</div>
              <div className="text-[11px] text-muted-foreground font-medium mb-3">co-op / group</div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-violet-400">
                <Flame className="h-3.5 w-3.5" /> 2 deliverables/wk
              </div>
            </div>
          </div>

          {/* Run Phase Progress Bar */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40 bg-gradient-to-r from-accent/10 to-transparent flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="text-[12px] font-black uppercase tracking-widest">Active Run Phases</h3>
            </div>
            <div className="p-6 grid grid-cols-5 gap-2">
              {[
                { label: "SIM", desc: "Simulation test", active: false, done: true,  color: "emerald" },
                { label: "PRE",  desc: "Pre-production",  active: false, done: true,  color: "emerald" },
                { label: "PROD", desc: "Live production",  active: true,  done: false, color: "primary" },
                { label: "POST", desc: "Post review",      active: false, done: false, color: "muted"   },
                { label: "DEBRIEF", desc: "Final report",  active: false, done: false, color: "muted"   },
              ].map((phase, i, arr) => (
                <div key={phase.label} className="flex flex-col items-center gap-2 relative">
                  {i < arr.length - 1 && (
                    <div className={`absolute top-4 left-[60%] w-full h-0.5 ${phase.done ? "bg-emerald-500/60" : phase.active ? "bg-primary/30" : "bg-border/40"}`} />
                  )}
                  <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 text-[9px] font-black transition-all duration-300 ${
                    phase.done   ? "bg-emerald-500/20 border-emerald-500 text-emerald-500" :
                    phase.active ? "bg-primary/20 border-primary text-primary animate-pulse shadow-lg shadow-primary/20" :
                                   "bg-card border-border/40 text-muted-foreground"
                  }`}>
                    {phase.done ? "✓" : i + 1}
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-wider text-center ${phase.active ? "text-primary" : phase.done ? "text-emerald-500" : "text-muted-foreground"}`}>{phase.label}</p>
                  <p className="text-[9px] text-muted-foreground text-center leading-tight">{phase.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Credit packages */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
                <Package className="h-4 w-4" /> Credit Packages
              </h2>
              <button className="text-[11px] text-primary font-black uppercase tracking-widest hover:underline flex items-center gap-1">
                Compare all <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CREDIT_TIERS.map((t) => (
                <button key={t.id} onClick={() => setShowBuyModal(true)}
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

          {/* Ledger + Hire + Security */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Ledger */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-black tracking-[0.25em] uppercase text-muted-foreground flex items-center gap-2">
                  <History className="h-4 w-4" /> Recent Ledger
                </h3>
                <Button variant="ghost" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10">Export CSV</Button>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                {transactions.length === 0 ? (
                  <div className="py-16 flex flex-col items-center text-center opacity-50 gap-3">
                    <History className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-bold text-muted-foreground">No transactions yet</p>
                    <p className="text-xs text-muted-foreground">Buy credits or hire a worker to see activity here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {transactions.map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between px-5 py-4 hover:bg-accent/5 transition-colors gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tx.type === "debit" ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                            {tx.type === "debit" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-black text-foreground truncate">{tx.description}</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(tx.date).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex flex-col items-end">
                            <div className={`text-[14px] font-black ${tx.type === "debit" ? "text-foreground/80" : "text-emerald-500"}`}>
                              {tx.type === "debit" ? "-" : "+"}{tx.amount.toLocaleString()} {currency}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                              <BadgeCheck className="h-3 w-3" /> Verified
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="text-muted-foreground/30 hover:text-foreground hidden md:flex h-8 w-8">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Hire + Security + Staking */}
            <div className="space-y-4">
              <HireModePanel balance={balance} currency={currency} companyPrefix={selectedCompany?.issuePrefix} />

              <div className="p-5 rounded-2xl bg-card border border-border/60">
                <div className="flex items-center gap-2 mb-3 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                  <h4 className="text-[11px] font-black uppercase tracking-widest">Security</h4>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">All ledger entries signed on AMX Chain. No raw keys stored. Biometric auth active.</p>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                  <Sparkles className="h-3.5 w-3.5" /> AMX Chain Verified
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 mb-3 text-primary">
                  <Coins className="h-4 w-4" />
                  <h4 className="text-[11px] font-black uppercase tracking-widest">Staking</h4>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">Stake credits to earn reputation, lower platform fees, and unlock enterprise hire rates.</p>
                <Button className="w-full h-10 font-black uppercase tracking-widest text-[11px]">Start Staking</Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
