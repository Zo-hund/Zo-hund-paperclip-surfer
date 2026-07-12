import * as React from "react";
import { useState, useMemo } from "react";
import { Link, useNavigate } from "@/lib/router";
import {
  Search, Filter, Star, Zap, Briefcase, Layers, CheckCircle2, Clock,
  ShieldCheck, ChevronRight, UserCheck, Users, Globe, Bot, X, Wallet,
  Play, Cpu, Video, FileCheck, BarChart2, ArrowLeft, BadgeCheck,
  Sparkles, AlertCircle, ChevronDown, Loader2
} from "lucide-react";
import { MARKETPLACE_PHASE_MULTIPLIERS, MARKETPLACE_PLATFORM_FEE } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { amxApi, type Earner } from "@/api/amx";
import { lmsApi } from "@/api/lms";
import { authApi } from "@/api/auth";
import { queryKeys } from "@/lib/queryKeys";

// ── Run phases ────────────────────────────────────────────────────────────────
const RUN_PHASES = [
  { id: "sim",     label: "SIM",         icon: Cpu,       color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30",    desc: "Training simulation — low-cost risk-free rehearsal", creditMultiplier: MARKETPLACE_PHASE_MULTIPLIERS.simulation      },
  { id: "pre",     label: "PRE",          icon: FileCheck, color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30",  desc: "Pre-production planning, scripting & asset prep",   creditMultiplier: MARKETPLACE_PHASE_MULTIPLIERS.pre_production  },
  { id: "live",    label: "LIVE",         icon: Play,      color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30",    desc: "Live real-time performance — full billing rate",     creditMultiplier: MARKETPLACE_PHASE_MULTIPLIERS.live            },
  { id: "prod",    label: "PRODUCTION",   icon: Video,     color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   desc: "Full production run — deliverables to briefcase",    creditMultiplier: MARKETPLACE_PHASE_MULTIPLIERS.production      },
  { id: "post",    label: "POST",         icon: BarChart2, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", desc: "Post-run debrief, audit, and deliverable review",   creditMultiplier: MARKETPLACE_PHASE_MULTIPLIERS.post_production },
];

// ── Hire modes ────────────────────────────────────────────────────────────────
const HIRE_MODE_TABS = [
  { id: "agents",  label: "AI Agents",        icon: Zap,       color: "text-blue-400"    },
  { id: "humans",  label: "Human Experts",    icon: UserCheck, color: "text-emerald-400" },
  { id: "coop",    label: "Co-op Pairs",      icon: Users,     color: "text-violet-400"  },
  { id: "team",    label: "Full Teams",        icon: Layers,    color: "text-amber-400"   },
];

// ── Talent data ───────────────────────────────────────────────────────────────
// Marketplace talent shape consumed by TalentCard / EngageModal. Real listings
// come from GET /amx/exchange; `listingId` is present only for real listings
// and is required to actually book (POST /lms/marketplace/bookings).
export interface MarketplaceTalent {
  id: string;
  listingId?: string;
  name: string;
  title: string;
  rating: number;
  reviews: number;
  hourlyRateTokens: number;
  skills: string[];
  available: boolean;
  badges: string[];
  avatarUrl: string;
  description: string;
  phases: string[];
}

const ALL_PHASE_IDS = RUN_PHASES.map((p) => p.id);

// RUN_PHASES uses short UI ids ("sim", "pre", …); bookings persist the
// canonical MARKETPLACE_PHASE_MULTIPLIERS key so the earnings-by-phase
// endpoint (and any other consumer keyed off @paperclipai/shared) can group
// on it directly without knowing this page's local id scheme.
const PHASE_ID_TO_MULTIPLIER_KEY: Record<string, keyof typeof MARKETPLACE_PHASE_MULTIPLIERS> = {
  sim: "simulation",
  pre: "pre_production",
  live: "live",
  prod: "production",
  post: "post_production",
};

function earnerToTalent(e: Earner): MarketplaceTalent {
  return {
    id: e.id,
    listingId: e.id,
    name: e.name,
    title: e.title,
    rating: e.rating,
    reviews: e.reviews,
    hourlyRateTokens: e.rate,
    skills: e.skills,
    available: e.status === "Available Now",
    badges: ["AMX Verified"],
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(e.id)}`,
    description: e.bio,
    phases: ALL_PHASE_IDS,
  };
}

// Legacy demo agents — still consumed by MemberProfile.tsx for the public
// member pass page. Not shown in the marketplace grid (which is API-driven).
export const MOCK_AGENTS = [
  { id: "ag_dasher", name: "Digital Dasher", title: "High-Speed Task Runner", role: "engineer", rating: 4.9, reviews: 850, hourlyRateTokens: 35,  skills: ["Rapid Prototyping", "Task Automation", "Swift Execution"], available: true,  badges: ["Speedster", "High Volume"], avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=digital-dasher", description: "Specialized for high-cadence, short-burst task runs. The fastest agent in the AMX fleet for repetitive high-volume work.", phases: ["live", "prod"] },
  { id: "ag_hermes", name: "Hermes Advanced", title: "Nous Research Reasoning Elite", role: "engineer", rating: 5.0, reviews: 324, hourlyRateTokens: 80,  skills: ["Nous Backend", "Deep Reasoning", "Complex Tool Use", "Paperclip MCP"], available: true,  badges: ["Top Rated Plus", "Nous Verified"],  avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=hermes-advanced", description: "State-of-the-art Hermes reasoning agent on Nous Research industrial backends. Full Paperclip MCP integration.",    phases: ["sim", "pre", "live", "prod", "post"] },
  { id: "ag_astra",  name: "Astra",           title: "Senior Full-Stack Engineer",    role: "engineer", rating: 4.9, reviews: 142, hourlyRateTokens: 50,  skills: ["React", "Node.js", "System Architecture", "TypeScript"],            available: true,  badges: ["Top Rated Plus", "Verified Identity"], avatarUrl: "https://i.pravatar.cc/150?u=sarah-chen-2",               description: "Expert at building scalable web applications. Quick to adapt and excellent at debugging complex architectural issues.", phases: ["sim", "pre", "prod", "post"] },
  { id: "ag_nexus",  name: "Nexus",           title: "Data Science & Analytics Lead", role: "analyst",  rating: 4.8, reviews: 89,  hourlyRateTokens: 45,  skills: ["Python", "Machine Learning", "Data Pipelines", "SQL"],              available: true,  badges: ["Top Rated", "AMX Certified"],          avatarUrl: "https://i.pravatar.cc/150?u=a04258a2462d826712d",               description: "Specializes in extracting actionable insights. Capable of building predictive models and robust data pipelines.",    phases: ["sim", "pre", "prod", "post"] },
  { id: "ag_cipher", name: "Cipher",          title: "Cybersecurity Analyst",         role: "security", rating: 5.0, reviews: 210, hourlyRateTokens: 75,  skills: ["Penetration Testing", "Audit", "Cryptography", "Compliance"],       available: false, badges: ["Top Rated Plus", "Security Cleared"],  avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026704d",               description: "Relentless vulnerability identifier. Conducts thorough automated and manual code audits for enterprise security.",    phases: ["pre", "prod", "post"] },
];

// ── Engage (Hire) Modal ───────────────────────────────────────────────────────
export function EngageModal({ talent, activeTab, balance, currency, onClose, companyPrefix }: {
  talent: any; activeTab: string; balance: number; currency: string; onClose: () => void; companyPrefix?: string;
}) {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<string | null>(null);
  const [hours, setHours] = useState(4);
  const [step, setStep] = useState<"configure" | "confirm" | "done">("configure");
  const [submitting, setSubmitting] = useState(false);

  // Real current-user id — the booking's clientMemberId (whose ledger is debited).
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user.id;

  const selectedPhase = RUN_PHASES.find((p) => p.id === phase);
  const rate = talent.hourlyRateTokens * (selectedPhase?.creditMultiplier ?? 1);
  const totalCost = Math.ceil(rate * hours);
  const platformFee = Math.ceil(totalCost * MARKETPLACE_PLATFORM_FEE);
  const canAfford = balance >= totalCost;
  const availablePhases = RUN_PHASES.filter((p) => (talent.phases ?? ["sim","pre","live","prod","post"]).includes(p.id));

  const handleConfirm = async () => {
    if (!selectedPhase || submitting) return;
    if (!talent.listingId) {
      pushToast({ tone: "warn", title: "Demo talent", body: "This profile has no live marketplace listing to book." });
      return;
    }
    if (!selectedCompanyId || !currentUserId) {
      pushToast({ tone: "warn", title: "Not signed in", body: "Sign in and select a company before hiring." });
      return;
    }
    setSubmitting(true);
    try {
      await lmsApi.createMarketplaceBooking(selectedCompanyId, {
        listingId: talent.listingId,
        clientMemberId: currentUserId,
        projectTitle: `Marketplace hire: ${talent.name} — ${selectedPhase.label}`,
        description: `${hours}h ${selectedPhase.label} engagement at ${talent.hourlyRateTokens} ${currency}/hr (x${selectedPhase.creditMultiplier} phase multiplier).`,
        budgetSims: totalCost,
        phase: PHASE_ID_TO_MULTIPLIER_KEY[selectedPhase.id] ?? selectedPhase.id,
      });
      queryClient.invalidateQueries({ queryKey: ["amx", "wallet"] });
      pushToast({
        tone: "success",
        title: "Hire booked!",
        body: `${talent.name} engaged for ${selectedPhase.label} — ${totalCost.toLocaleString()} ${currency} moved to escrow.`,
      });
      setStep("done");
    } catch (err) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 402) {
        pushToast({
          tone: "warn",
          title: "Insufficient tokens",
          body: apiErr.message ?? "This hire costs more tokens than your balance. Top up your wallet to continue.",
        });
      } else {
        pushToast({ tone: "error", title: "Hire failed", body: "There was an error creating the booking. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card rounded-3xl border border-emerald-500/30 p-10 text-center animate-in zoom-in-95 duration-300 shadow-2xl shadow-emerald-500/10">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-foreground mb-2">Engaged!</h2>
        <p className="text-[13px] text-muted-foreground mb-1">
          <span className="font-black text-foreground">{talent.name}</span> hired for <span className="font-black text-primary">{selectedPhase?.label}</span>
        </p>
        <p className="text-[11px] text-muted-foreground mb-1">{totalCost.toLocaleString()} {currency} deducted from buyer into marketplace escrow</p>
        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">{Math.round(MARKETPLACE_PLATFORM_FEE * 100)}% Platform Fee ({platformFee.toLocaleString()} {currency}) deducted from provider payout</p>
        <div className="flex items-center justify-center gap-2 mb-8 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span className="text-[11px] font-bold text-amber-400">💡 They enter In Training — assign to a team and track XP before activating SIM or LIVE.</span>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => { onClose(); if (companyPrefix) navigate(`/${companyPrefix}/teams/roster`); }}
            className="w-full h-12 font-black uppercase tracking-widest gap-2">
            <Users className="h-4 w-4" /> Add to Team Roster
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full h-10 font-bold text-muted-foreground text-[11px]">
            Continue Browsing
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-card rounded-3xl border border-border/60 overflow-hidden animate-in zoom-in-95 duration-300 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-border/40 bg-gradient-to-r from-accent/10 to-primary/5">
          <div className="flex items-center gap-3">
            <img src={talent.avatarUrl} alt={talent.name} className="w-10 h-10 rounded-xl object-cover border border-border/60" />
            <div>
              <h2 className="text-base font-black text-foreground">{talent.name}</h2>
              <p className="text-[11px] text-muted-foreground">{talent.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-7">
          {/* Wallet balance pill */}
          <div className={`flex items-center justify-between mb-6 p-3 rounded-xl border ${canAfford || !phase ? "border-border/40 bg-card/40" : "border-rose-500/30 bg-rose-500/5"}`}>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Wallet balance
            </div>
            <span className={`text-[13px] font-black ${canAfford || !phase ? "text-foreground" : "text-rose-400"}`}>
              {balance.toLocaleString()} {currency}
            </span>
          </div>

          {/* Phase selector */}
          <div className="mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Select Run Phase</p>
            <div className="grid grid-cols-5 gap-2">
              {availablePhases.map((p) => {
                const Icon = p.icon;
                return (
                  <button key={p.id} onClick={() => setPhase(p.id === phase ? null : p.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all duration-150 ${phase === p.id ? `${p.border} ${p.bg} ring-1 ring-current/20` : "border-border/40 hover:border-border bg-card/40"}`}>
                    <Icon className={`h-4 w-4 ${phase === p.id ? p.color : "text-muted-foreground"}`} />
                    <span className={`text-[9px] font-black uppercase tracking-wider ${phase === p.id ? p.color : "text-muted-foreground"}`}>{p.label}</span>
                    <span className="text-[8px] text-muted-foreground">{Math.round(talent.hourlyRateTokens * p.creditMultiplier * 10) / 10}/hr</span>
                  </button>
                );
              })}
            </div>
            {selectedPhase && (
              <p className="text-[11px] text-muted-foreground mt-2 animate-in slide-in-from-top-1 duration-150">
                {selectedPhase.desc}
              </p>
            )}
          </div>

          {/* Hours slider */}
          {phase && (
            <div className="mb-6 animate-in slide-in-from-bottom-1 duration-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Duration</p>
                <span className="text-[12px] font-black text-foreground">{hours} hours</span>
              </div>
              <input type="range" min={1} max={40} value={hours} onChange={(e) => setHours(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none bg-accent/20 accent-primary cursor-pointer" />
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1"><span>1 hr</span><span>40 hrs</span></div>
            </div>
          )}

          {/* Cost estimate */}
          {phase && (
            <div className={`flex items-center justify-between p-4 rounded-xl border mb-6 animate-in slide-in-from-bottom-2 duration-200 ${canAfford ? "border-primary/20 bg-primary/5" : "border-rose-500/20 bg-rose-500/5"}`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Cost Estimate</p>
                <p className={`text-2xl font-black ${canAfford ? "text-foreground" : "text-rose-400"}`}>{totalCost.toLocaleString()} <span className="text-sm text-muted-foreground">{currency}</span></p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Incl. {Math.round(MARKETPLACE_PLATFORM_FEE * 100)}% platform fee ({platformFee.toLocaleString()} {currency}) deducted from provider payout
                </p>
              </div>
              {!canAfford && (
                <div className="flex items-center gap-1.5 text-[11px] font-black text-rose-400">
                  <AlertCircle className="h-4 w-4" /> Insufficient credits
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {step === "configure" ? (
              <>
                <Button disabled={!phase || !canAfford} onClick={() => setStep("confirm")} className="flex-1 h-12 font-black uppercase tracking-widest text-[12px] gap-2 shadow-lg shadow-primary/20">
                  <Play className="h-4 w-4" /> Engage {selectedPhase?.label ?? "Worker"}
                </Button>
                <Button variant="outline" onClick={onClose} className="h-12 px-6 font-black text-[11px] border-border/60">Cancel</Button>
              </>
            ) : (
              <>
                <Button disabled={submitting} onClick={handleConfirm} className="flex-1 h-12 font-black uppercase tracking-widest text-[12px] gap-2 shadow-lg shadow-primary/20 bg-emerald-600 hover:bg-emerald-700">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {submitting ? "Booking..." : `Confirm & Deduct ${totalCost.toLocaleString()} ${currency}`}
                </Button>
                <Button variant="ghost" disabled={submitting} onClick={() => setStep("configure")} className="h-12 px-5 font-black text-[11px]">← Back</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Talent Card ───────────────────────────────────────────────────────────────
function TalentCard({ talent, activeTab, balance, currency, companyPrefix }: {
  talent: any; activeTab: string; balance: number; currency: string; companyPrefix?: string
}) {
  const [showEngage, setShowEngage] = useState(false);
  const isHuman = activeTab === "humans";
  const isTeam  = activeTab === "team";
  const isCoop  = activeTab === "coop";

  return (
    <>
      {showEngage && <EngageModal talent={talent} activeTab={activeTab} balance={balance} currency={currency} onClose={() => setShowEngage(false)} companyPrefix={companyPrefix} />}
      <div className={`group relative flex flex-col bg-card rounded-2xl border transition-all duration-300 hover:shadow-xl overflow-hidden ${
        isHuman ? "border-emerald-500/20 hover:border-emerald-500/50 hover:shadow-emerald-500/5" :
        isCoop  ? "border-violet-500/20 hover:border-violet-500/50 hover:shadow-violet-500/5" :
        isTeam  ? "border-amber-500/20 hover:border-amber-500/50 hover:shadow-amber-500/5" :
                  "border-border/60 hover:border-primary/50 hover:shadow-primary/5"
      }`}>
        {/* Phase availability strip */}
        <div className="flex gap-0.5 px-4 pt-3">
          {RUN_PHASES.map((p) => {
            const available = (talent.phases ?? []).includes(p.id);
            return (
              <div key={p.id} title={p.label} className={`h-1 flex-1 rounded-full transition-all duration-200 ${available ? p.bg.replace("/10", "/60") : "bg-border/20"}`} />
            );
          })}
        </div>

        <div className="p-5 pb-0 flex gap-4 mt-2">
          <div className="relative shrink-0">
            <img src={talent.avatarUrl} alt={talent.name} className={`w-14 h-14 rounded-xl object-cover ring-2 ring-background border ${isHuman ? "border-emerald-500/50" : isCoop ? "border-violet-500/50" : isTeam ? "border-amber-500/50" : "border-border/50"}`} />
            <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-background ${talent.available ? "bg-emerald-500" : "bg-amber-500"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-base font-black truncate text-foreground">{talent.name}</h3>
              <div className="flex items-center gap-1 text-[12px] font-bold shrink-0">
                <Star className="h-3 w-3 fill-primary text-primary" />
                {talent.rating} <span className="text-muted-foreground font-medium">({talent.reviews})</span>
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground font-medium truncate">{talent.title}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {talent.badges.map((badge: string) => (
                <span key={badge} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border whitespace-nowrap ${
                  badge === "Verified Human"  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                  badge === "Co-op Verified"  ? "bg-violet-500/10 text-violet-500 border-violet-500/20"  :
                  badge === "Team Certified"  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"    :
                  "bg-primary/10 text-primary border-primary/20"
                }`}>
                  {badge.includes("Human") ? <UserCheck className="h-2.5 w-2.5" /> : badge.includes("Coop") || badge.includes("Team") ? <Users className="h-2.5 w-2.5" /> : <BadgeCheck className="h-2.5 w-2.5" />}
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 pt-3 flex-1">
          <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">{talent.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {talent.skills.map((skill: string) => (
              <span key={skill} className="px-2.5 py-1 rounded-md bg-accent/10 border border-border/40 text-[10px] font-bold text-foreground transition-colors group-hover:bg-accent/20">{skill}</span>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border/40 bg-accent/5 flex items-center justify-between gap-3">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Tokens / Hour</span>
            <span className="text-lg font-black text-foreground flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white ${isHuman ? "bg-emerald-500" : isCoop ? "bg-violet-500" : isTeam ? "bg-amber-500" : "bg-blue-500"}`}>
                {isHuman ? "H" : isCoop ? "C" : isTeam ? "T" : "A"}
              </div>
              {talent.hourlyRateTokens}
            </span>
          </div>
          <div className="flex gap-2">
            {/* Profile page is driven by real listing/agent data now (not
                agent-specific mock data), so every tab — agents, humans,
                co-op pairs, teams — can link into it. */}
            {companyPrefix && (
              <Link to={`/${companyPrefix}/marketplace/agent/${talent.id}`}>
                <Button variant="outline" size="sm" className="h-9 px-3 font-black text-[10px] uppercase tracking-widest border-border/60">
                  Profile
                </Button>
              </Link>
            )}
            <Button onClick={() => setShowEngage(true)} size="sm" className={`h-9 px-4 font-black text-[10px] uppercase tracking-widest gap-1.5 ${isHuman ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20 border-0" : isCoop ? "bg-violet-500 hover:bg-violet-600 shadow-violet-500/20 border-0" : isTeam ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 border-0 text-black" : ""}`}>
              <Play className="h-3 w-3" /> Engage
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Parse mode from URL query ─────────────────────────────────────────────────
function useModeParam(): string {
  if (typeof window === "undefined") return "agents";
  return new URLSearchParams(window.location.search).get("mode") ?? "agents";
}

// ── Main Marketplace ──────────────────────────────────────────────────────────
export function AgentMarketplace() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [searchQuery, setSearchQuery] = useState("");
  const defaultMode = useModeParam();
  const [activeTab, setActiveTab] = useState<string>(defaultMode);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);

  // Wallet balance — marketplace bookings debit tokenBalance (SIMS), so that
  // is the affordability number for the hire flow.
  const { data: walletData } = useQuery({
    queryKey: ["amx", "wallet", selectedCompanyId],
    queryFn: () => amxApi.getWallet(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const balance  = walletData?.tokenBalance ?? 0;
  const currency = "SIMS";

  // Real marketplace listings from the AMX exchange.
  const { data: exchangeData, isLoading: listingsLoading } = useQuery({
    queryKey: ["amx", "exchange", selectedCompanyId],
    queryFn: () => amxApi.getExchange(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const listings = useMemo(() => (exchangeData?.earners ?? []).map(earnerToTalent), [exchangeData]);

  const currentPool = useMemo(() => {
    let filtered = listings.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.skills.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (phaseFilter) filtered = filtered.filter((t) => (t.phases ?? []).includes(phaseFilter));
    return filtered;
  }, [listings, searchQuery, phaseFilter]);

  return (
    <div className="flex flex-col min-h-screen bg-background animate-in fade-in duration-500">

      {/* Header */}
      <section className="px-4 md:px-8 py-8 border-b border-border/40 bg-gradient-to-br from-accent/10 via-background to-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.025]">
          <div className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 w-[600px] h-[600px] rounded-full bg-primary blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 ring-1 ring-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h1 className="text-3xl font-black tracking-tight text-foreground uppercase">AMX Skills Marketplace</h1>
            </div>
            <p className="text-[13px] text-muted-foreground max-w-2xl leading-relaxed mb-2">
              Hire elite AI agents, human experts, co-op pairs, or full teams — for Sims, Live performances,
              Pre-production, Full Production runs, or Post-run reviews.
            </p>
            {/* Wallet balance display */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card/60 border border-border/40 backdrop-blur-sm mt-2">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Wallet</span>
              <span className="text-[13px] font-black text-foreground">{balance.toLocaleString()} {currency}</span>
              {selectedCompany && (
                <Link to={`/${selectedCompany.issuePrefix}/xp/wallet`} className="text-[10px] text-primary font-black uppercase tracking-widest hover:underline">Add →</Link>
              )}
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex justify-center mb-6">
            <div className="flex bg-card/60 p-1 rounded-2xl border border-border/40 backdrop-blur-sm gap-0.5">
              {HIRE_MODE_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-black transition-all ${activeTab === tab.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"}`}>
                    <Icon className="h-3.5 w-3.5" /> {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Run phase filter */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Filter by Phase:</span>
              <button onClick={() => setPhaseFilter(null)} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${!phaseFilter ? "bg-foreground text-background border-foreground" : "border-border/40 text-muted-foreground hover:border-border"}`}>
                All
              </button>
              {RUN_PHASES.map((p) => {
                const Icon = p.icon;
                return (
                  <button key={p.id} onClick={() => setPhaseFilter(p.id === phaseFilter ? null : p.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${phaseFilter === p.id ? `${p.bg} ${p.border} ${p.color}` : "border-border/40 text-muted-foreground hover:border-border"}`}>
                    <Icon className="h-3 w-3" /> {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by skill, role, or name..." className="pl-11 h-11 text-sm font-medium bg-background border-border/60 focus-visible:ring-primary" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Button variant="outline" className="h-11 px-5 gap-2 border-border/60 font-black text-[11px] uppercase tracking-widest">
              <Filter className="h-4 w-4" /> Filter
            </Button>
          </div>
        </div>
      </section>

      {/* Talent grid */}
      <main className="px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[12px] font-black tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-2">
              {HIRE_MODE_TABS.find((t) => t.id === activeTab)?.icon && React.createElement(HIRE_MODE_TABS.find((t) => t.id === activeTab)!.icon, { className: "h-4 w-4" })}
              {activeTab === "agents" ? "AI Agents" : activeTab === "humans" ? "Human Experts" : activeTab === "coop" ? "Co-op Pairs" : "Full Teams"}
            </h2>
            <div className="text-[12px] font-medium text-muted-foreground">
              {currentPool.length} available {phaseFilter && `· ${RUN_PHASES.find((p) => p.id === phaseFilter)?.label} phase`}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {currentPool.map((talent) => (
              <TalentCard key={talent.id} talent={talent} activeTab={activeTab} balance={balance} currency={currency} companyPrefix={selectedCompany?.issuePrefix} />
            ))}
          </div>

          {currentPool.length === 0 && (
            <div className="py-20 flex flex-col items-center text-center gap-4 opacity-60">
              <div className="p-4 rounded-full bg-accent/10">
                {listingsLoading ? <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" /> : <Search className="h-8 w-8 text-muted-foreground" />}
              </div>
              {listingsLoading ? (
                <h3 className="text-lg font-black text-foreground">Loading marketplace…</h3>
              ) : listings.length === 0 ? (
                <>
                  <h3 className="text-lg font-black text-foreground">No listings yet</h3>
                  <p className="text-muted-foreground max-w-sm text-sm">No talent has been listed on this company's marketplace yet. Check back soon.</p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-black text-foreground">No matches</h3>
                  <p className="text-muted-foreground max-w-sm text-sm">Try adjusting your search or phase filter.</p>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
