import * as React from "react";
import { useState, useMemo } from "react";
import { Link, useNavigate } from "@/lib/router";
import {
  Search, Filter, Star, Zap, Briefcase, Layers, CheckCircle2, Clock,
  ShieldCheck, ChevronRight, UserCheck, Users, Globe, Bot, X, Wallet,
  Play, Cpu, Video, FileCheck, BarChart2, ArrowLeft, BadgeCheck,
  Sparkles, AlertCircle, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/context/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { amxApi } from "@/api/amx";
import { marketplaceApi } from "@/api/marketplace";
import type { MarketplaceListing } from "@/api/marketplace";
import { MarketplaceMicroserviceBooking, isMicroserviceListing } from "@/components/MarketplaceMicroserviceBooking";
import { AIR_HUB_EMAILS } from "@/lib/air-hubs-lanes";

// ── Run phases ────────────────────────────────────────────────────────────────
const RUN_PHASES = [
  { id: "sim",     label: "SIM",         icon: Cpu,       color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30",    desc: "Training simulation — low-cost risk-free rehearsal", creditMultiplier: 0.3  },
  { id: "pre",     label: "PRE",          icon: FileCheck, color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30",  desc: "Pre-production planning, scripting & asset prep",   creditMultiplier: 0.6  },
  { id: "live",    label: "LIVE",         icon: Play,      color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30",    desc: "Live real-time performance — full billing rate",     creditMultiplier: 1.0  },
  { id: "prod",    label: "PRODUCTION",   icon: Video,     color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   desc: "Full production run — deliverables to briefcase",    creditMultiplier: 1.0  },
  { id: "post",    label: "POST",         icon: BarChart2, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", desc: "Post-run debrief, audit, and deliverable review",   creditMultiplier: 0.4  },
];

// ── Hire modes ────────────────────────────────────────────────────────────────
const HIRE_MODE_TABS = [
  { id: "agents",  label: "AI Agents",        icon: Zap,       color: "text-blue-400"    },
  { id: "humans",  label: "Human Experts",    icon: UserCheck, color: "text-emerald-400" },
  { id: "coop",    label: "Co-op Pairs",      icon: Users,     color: "text-violet-400"  },
  { id: "team",    label: "Full Teams",        icon: Layers,    color: "text-amber-400"   },
];

// ── Talent data ───────────────────────────────────────────────────────────────
const MOCK_HUMANS = [
  { id: "h_1", name: "Sarah Chen",    title: "Senior Product Designer",    role: "designer",  rating: 4.9, reviews: 128, hourlyRateTokens: 650, skills: ["Figma", "UI/UX", "Product Strategy", "User Research"],         available: true,  badges: ["Verified Human", "Expert Lead"],        avatarUrl: "https://i.pravatar.cc/150?u=sarah-chen",    description: "8+ years multi-disciplinary designer. Expert at guiding AI agents through complex spatial and visual iterations.", phases: ["sim", "pre", "live", "prod", "post"] },
  { id: "h_2", name: "Marcus Thorne", title: "Enterprise Solutions Architect", role: "architect",rating: 5.0, reviews: 245, hourlyRateTokens: 950, skills: ["System Design", "Audit", "Compliance", "TeamsFx"],          available: true,  badges: ["Verified Human", "Security Cleared"],   avatarUrl: "https://i.pravatar.cc/150?u=marcus-thorne", description: "Specializes in high-stakes human-agent hybrid architectures, RLS security and corporate compliance.",           phases: ["pre", "live", "prod", "post"] },
  { id: "h_3", name: "Elena Rodriguez",title: "Content & Cultural Lead",   role: "content",   rating: 4.8, reviews: 92,  hourlyRateTokens: 550, skills: ["Localization", "Branding", "Storytelling", "AR Copy"],         available: false, badges: ["Verified Human", "Multilingual"],        avatarUrl: "https://i.pravatar.cc/150?u=elena-rod",     description: "Expert in cultural nuances and localization. Bridges raw AI output with premium human-centric brand experiences.", phases: ["pre", "prod", "post"] },
];

export const MOCK_AGENTS = [
  { id: "ag_dasher", name: "Digital Dasher", title: "High-Speed Task Runner", role: "engineer", rating: 4.9, reviews: 850, hourlyRateTokens: 35,  skills: ["Rapid Prototyping", "Task Automation", "Swift Execution"], available: true,  badges: ["Speedster", "High Volume"], avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=digital-dasher", description: "Specialized for high-cadence, short-burst task runs. The fastest agent in the AMX fleet for repetitive high-volume work.", phases: ["live", "prod"] },
  { id: "ag_hermes", name: "Hermes Advanced", title: "Nous Research Reasoning Elite", role: "engineer", rating: 5.0, reviews: 324, hourlyRateTokens: 80,  skills: ["Nous Backend", "Deep Reasoning", "Complex Tool Use", "Paperclip MCP"], available: true,  badges: ["Top Rated Plus", "Nous Verified"],  avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=hermes-advanced", description: "State-of-the-art Hermes reasoning agent on Nous Research industrial backends. Full Paperclip MCP integration.",    phases: ["sim", "pre", "live", "prod", "post"] },
  { id: "ag_astra",  name: "Astra",           title: "Senior Full-Stack Engineer",    role: "engineer", rating: 4.9, reviews: 142, hourlyRateTokens: 50,  skills: ["React", "Node.js", "System Architecture", "TypeScript"],            available: true,  badges: ["Top Rated Plus", "Verified Identity"], avatarUrl: "https://i.pravatar.cc/150?u=sarah-chen-2",               description: "Expert at building scalable web applications. Quick to adapt and excellent at debugging complex architectural issues.", phases: ["sim", "pre", "prod", "post"] },
  { id: "ag_nexus",  name: "Nexus",           title: "Data Science & Analytics Lead", role: "analyst",  rating: 4.8, reviews: 89,  hourlyRateTokens: 45,  skills: ["Python", "Machine Learning", "Data Pipelines", "SQL"],              available: true,  badges: ["Top Rated", "AMX Certified"],          avatarUrl: "https://i.pravatar.cc/150?u=a04258a2462d826712d",               description: "Specializes in extracting actionable insights. Capable of building predictive models and robust data pipelines.",    phases: ["sim", "pre", "prod", "post"] },
  { id: "ag_cipher", name: "Cipher",          title: "Cybersecurity Analyst",         role: "security", rating: 5.0, reviews: 210, hourlyRateTokens: 75,  skills: ["Penetration Testing", "Audit", "Cryptography", "Compliance"],       available: false, badges: ["Top Rated Plus", "Security Cleared"],  avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026704d",               description: "Relentless vulnerability identifier. Conducts thorough automated and manual code audits for enterprise security.",    phases: ["pre", "prod", "post"] },
];

const MOCK_COOP = [
  { id: "c_1", name: "Astra + Sarah Chen", title: "Full-Stack + Design Co-op", role: "coop", rating: 4.95, reviews: 67, hourlyRateTokens: 480, skills: ["UI/UX", "React", "Figma", "TypeScript", "User Research"], available: true, badges: ["Co-op Verified", "AMX Certified"], avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=coop-1", description: "Proven AI+Human pair. Astra handles engineering, Sarah drives UX. Seamless iteration on UI-intensive projects.", phases: ["pre", "live", "prod", "post"] },
  { id: "c_2", name: "Nexus + Marcus Thorne", title: "Data + Architecture Co-op", role: "coop", rating: 4.9, reviews: 38, hourlyRateTokens: 700, skills: ["Data Pipelines", "System Design", "Audit", "SQL", "Compliance"], available: true, badges: ["Co-op Verified", "Security Cleared"], avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=coop-2", description: "High-trust data architecture pair. Nexus models, Marcus audits. Ideal for compliance-heavy production runs.", phases: ["pre", "prod", "post"] },
];

const MOCK_TEAMS = [
  { id: "t_1", name: "AMX Alpha Squad", title: "Full-Stack Product Team (5-agent)", role: "team", rating: 4.95, reviews: 24, hourlyRateTokens: 1200, skills: ["PM", "Engineering", "Design", "QA", "DevOps"], available: true, badges: ["Team Certified", "AMX Elite"], avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=team-alpha", description: "A complete 5-agent squad covering PM, full-stack engineering, design, QA, and DevOps. For large-scale production runs with full briefcase integration.", phases: ["sim", "pre", "live", "prod", "post"] },
  { id: "t_2", name: "AMX Launch Crew", title: "Marketing + Content Team (3-member)", role: "team", rating: 4.8, reviews: 19, hourlyRateTokens: 900, skills: ["Content Strategy", "Branding", "Analytics", "Social Media", "Copywriting"], available: true, badges: ["Team Certified", "Creative Verified"], avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=team-launch", description: "3-member marketing team specializing in launch campaigns. Covers brand, copy, analytics reporting, and deliverable packaging.", phases: ["pre", "live", "prod", "post"] },
];

// ── Engage (Hire) Modal ───────────────────────────────────────────────────────
export function EngageModal({ talent, activeTab, balance, currency, onClose, companyPrefix }: {
  talent: any; activeTab: string; balance: number; currency: string; onClose: () => void; companyPrefix?: string;
}) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<string | null>(null);
  const [hours, setHours] = useState(4);
  const [step, setStep] = useState<"configure" | "confirm" | "done">("configure");

  const selectedPhase = RUN_PHASES.find((p) => p.id === phase);
  const rate = talent.hourlyRateTokens * (selectedPhase?.creditMultiplier ?? 1);
  const totalCost = Math.round(rate * hours);
  const canAfford = balance >= totalCost;
  const availablePhases = RUN_PHASES.filter((p) => (talent.phases ?? ["sim","pre","live","prod","post"]).includes(p.id));

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
        <p className="text-[11px] text-muted-foreground mb-1">{totalCost.toLocaleString()} {currency} deducted from buyer</p>
        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">10% Platform Fee deducted from provider payout</p>
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
                <Button onClick={() => setStep("done")} className="flex-1 h-12 font-black uppercase tracking-widest text-[12px] gap-2 shadow-lg shadow-primary/20 bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Confirm & Deduct {totalCost.toLocaleString()} {currency}
                </Button>
                <Button variant="ghost" onClick={() => setStep("configure")} className="h-12 px-5 font-black text-[11px]">← Back</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Talent Card ───────────────────────────────────────────────────────────────
function TalentCard({ talent, activeTab, balance, currency, companyPrefix, onBookListing }: {
  talent: any; activeTab: string; balance: number; currency: string; companyPrefix?: string; onBookListing?: (listing: MarketplaceListing) => void;
}) {
  const [showEngage, setShowEngage] = useState(false);
  const isHuman = activeTab === "humans";
  const isTeam  = activeTab === "team";
  const isCoop  = activeTab === "coop";

  return (
    <>
      {showEngage && <EngageModal talent={talent} activeTab={activeTab} balance={balance} currency={currency} onClose={() => setShowEngage(false)} companyPrefix={companyPrefix} />}
      <div className={`group relative flex flex-col bg-card rounded-2xl border transition-all duration-300 hover:shadow-xl overflow-hidden ${
        talent.isPromoted ? "border-amber-500/40 hover:border-amber-500/70 hover:shadow-amber-500/10" :
        isHuman ? "border-emerald-500/20 hover:border-emerald-500/50 hover:shadow-emerald-500/5" :
        isCoop  ? "border-violet-500/20 hover:border-violet-500/50 hover:shadow-violet-500/5" :
        isTeam  ? "border-amber-500/20 hover:border-amber-500/50 hover:shadow-amber-500/5" :
                  "border-border/60 hover:border-primary/50 hover:shadow-primary/5"
      }`}>
        {/* Promoted sponsor strip */}
        {talent.isPromoted && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/30">
            <Sparkles className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 truncate">
              {talent.sponsorTag ?? "Promoted"}
            </span>
          </div>
        )}
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
            {activeTab === "agents" && companyPrefix && (
              <Link to={`/${companyPrefix}/marketplace/agent/${talent.id}`}>
                <Button variant="outline" size="sm" className="h-9 px-3 font-black text-[10px] uppercase tracking-widest border-border/60">
                  Profile
                </Button>
              </Link>
            )}
            <Button
              onClick={() => {
                if (talent.marketplaceListing && isMicroserviceListing(talent.marketplaceListing)) {
                  onBookListing?.(talent.marketplaceListing);
                  return;
                }
                setShowEngage(true);
              }}
              size="sm"
              className={`h-9 px-4 font-black text-[10px] uppercase tracking-widest gap-1.5 ${isHuman ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20 border-0" : isCoop ? "bg-violet-500 hover:bg-violet-600 shadow-violet-500/20 border-0" : isTeam ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 border-0 text-black" : ""}`}
            >
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
  const [bookingListing, setBookingListing] = useState<MarketplaceListing | null>(null);

  // Wallet balance
  const { data: walletData } = useQuery({
    queryKey: ["amx", "wallet", selectedCompanyId],
    queryFn: () => amxApi.getWallet(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const balance  = walletData?.tokenBalance ?? walletData?.balance ?? 0;
  const currency = walletData?.currency ?? "AMX";

  const { data: exchangeData } = useQuery({
    queryKey: ["amx", "exchange", selectedCompanyId],
    queryFn: () => amxApi.getExchange(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: profileData } = useQuery({
    queryKey: ["marketplace", "me"],
    queryFn: () => marketplaceApi.getMyProfile(),
  });

  const { data: publicListingsData } = useQuery({
    queryKey: ["marketplace", "public-listings"],
    queryFn: () => marketplaceApi.getPublicListings(),
    staleTime: 60_000,
  });

  const marketplaceTalent = useMemo(() => {
    // Real listings from exchange API
    const fromExchange = (exchangeData?.listings ?? []).map((listing) => {
      const tab =
        listing.listingType === "agent" ? "agents" :
        listing.listingType === "coop" ? "coop" :
        "team";
      return {
        id: listing.id,
        name: listing.name,
        title: listing.title,
        role: listing.listingType,
        rating: 5,
        reviews: 1,
        hourlyRateTokens: listing.hourlyRateTokens,
        skills: listing.skills,
        available: listing.status === "active",
        badges: listing.badges,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(listing.name)}`,
        description: listing.description,
        phases: listing.supportedRunPhases.map((phase) =>
          phase === "simulation" || phase === "learn" ? "sim" :
          phase === "pit-stop" ? "post" :
          phase === "content-production" ? "prod" :
          phase === "live" ? "live" :
          phase,
        ),
        marketplaceListing: listing,
        marketplaceTab: tab,
        isPromoted: listing.isPromoted,
        sponsorTag: listing.sponsorTag,
      };
    });

    // Public listings from the public endpoint (active + marketplaceVisible agents)
    const fromPublic = (publicListingsData?.listings ?? [])
      .filter((l) => !fromExchange.some((e) => e.id === l.id)) // dedupe
      .map((listing) => ({
        id: listing.id,
        name: listing.name,
        title: listing.title,
        role: listing.listingType,
        rating: 5,
        reviews: 0,
        hourlyRateTokens: listing.hourlyRateTokens,
        skills: listing.skills,
        available: listing.availability !== "unavailable",
        badges: listing.badges,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(listing.name)}`,
        description: listing.description ?? "",
        phases: listing.supportedRunPhases.map((phase) =>
          phase === "simulation" || phase === "learn" ? "sim" :
          phase === "pit-stop" ? "post" :
          phase === "content-production" ? "prod" :
          phase === "live" ? "live" :
          phase,
        ),
        marketplaceListing: listing,
        marketplaceTab: listing.listingType === "agent" ? "agents" : listing.listingType === "coop" ? "coop" : "team",
        isPromoted: listing.isPromoted,
        sponsorTag: listing.sponsorTag,
      }));

    // Visible agents (from metadata.marketplaceVisible=true)
    const fromVisibleAgents = (publicListingsData?.visibleAgents ?? [])
      .filter((a) => !fromExchange.some((e) => e.id === a.id) && !fromPublic.some((p) => p.id === a.id))
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        title: agent.title ?? agent.role ?? "AI Agent",
        role: "agent",
        rating: 5,
        reviews: 0,
        hourlyRateTokens: Number((agent.metadata?.hourlyRateTokens as number | null) ?? 50),
        skills: (agent.metadata?.skills as string[] | null) ?? [],
        available: true,
        badges: (agent.metadata?.badges as string[] | null) ?? ["AMX Agent"],
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${agent.id}`,
        description: (agent.metadata?.bio as string | null) ?? `${agent.name} is available for hire in the AMX Marketplace.`,
        phases: ["sim", "pre", "live", "prod", "post"],
        marketplaceListing: null,
        marketplaceTab: "agents",
        isPromoted: false,
        sponsorTag: null,
      }));

    return [...fromExchange, ...fromPublic, ...fromVisibleAgents];
  }, [exchangeData?.listings, publicListingsData]);

  const microserviceListings = useMemo(
    () => (exchangeData?.listings ?? []).filter(isMicroserviceListing),
    [exchangeData?.listings],
  );

  const currentPool = useMemo(() => {
    const mockPool = activeTab === "agents" ? MOCK_AGENTS : activeTab === "humans" ? MOCK_HUMANS : activeTab === "coop" ? MOCK_COOP : MOCK_TEAMS;
    const realPool = marketplaceTalent.filter((talent) => talent.marketplaceTab === activeTab);
    // Promoted agents first, then real, then mocks
    const promotedPool = realPool.filter((t) => (t as any).isPromoted);
    const regularPool = realPool.filter((t) => !(t as any).isPromoted);
    const pool = [...promotedPool, ...regularPool, ...mockPool];
    let filtered = pool.filter((t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.skills.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase())) ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (phaseFilter) filtered = filtered.filter((t) => (t.phases ?? []).includes(phaseFilter));
    return filtered;
  }, [activeTab, marketplaceTalent, searchQuery, phaseFilter]);

  return (
    <div className="flex flex-col min-h-screen bg-background animate-in fade-in duration-500">
      <MarketplaceMicroserviceBooking
        listing={bookingListing}
        open={!!bookingListing}
        onClose={() => setBookingListing(null)}
      />

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
              Electives hire from Collectives across AI agents, human experts, co-op pairs, and full teams
              for Sims, Live performances, Pre-production, Full Production runs, or Post-run reviews.
            </p>
            <div className="grid gap-3 md:grid-cols-3 w-full max-w-4xl mt-4">
              <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-left text-[12px] leading-relaxed text-muted-foreground">
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-foreground">Collectives</div>
                Skills providers and microservice teams publish offers here. Contact lane: {AIR_HUB_EMAILS.collectives}.
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-left text-[12px] leading-relaxed text-muted-foreground">
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-foreground">Electives</div>
                Employers, universities, and institutional buyers hire and sponsor through {AIR_HUB_EMAILS.electives}.
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-left text-[12px] leading-relaxed text-muted-foreground">
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-foreground">Community</div>
                Members and partner network stay connected through {AIR_HUB_EMAILS.community}.
              </div>
            </div>
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

        {profileData && !profileData.guidance.requiredChecklistComplete && (
          <div className="mx-auto mb-6 max-w-4xl rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
            TECH AT NITE onboarding is not complete yet. {profileData.guidance.nextRecommendedStep} Complete the LMS guidance before
            moving into Collective selling and advanced marketplace workflows.
          </div>
        )}

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
          {microserviceListings.length > 0 && (
            <section className="mb-8 rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-primary">
                    <Sparkles className="h-4 w-4" />
                    Official Microservices
                  </div>
                  <h2 className="text-lg font-black text-foreground">
                    {microserviceListings[0].title}
                  </h2>
                  <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
                    {microserviceListings[0].description} Booking flows through {AIR_HUB_EMAILS.booking}, sales through {AIR_HUB_EMAILS.sales}, and agent operations through {AIR_HUB_EMAILS.agents}.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {microserviceListings[0].skills.map((skill) => (
                      <span key={skill} className="rounded-md border border-border/50 bg-background px-2 py-1 text-[10px] font-bold text-foreground">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {microserviceListings[0].supportedRunPhases.map((phase) => (
                      <span key={phase} className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        {phase}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-border/50 bg-card p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Microservice rate
                  </div>
                  <div className="text-2xl font-black text-foreground">
                    {microserviceListings[0].hourlyRateTokens} AMX
                    <span className="ml-1 text-xs text-muted-foreground">/hr</span>
                  </div>
                  <Button
                    className="h-10 gap-2 text-[11px] font-black uppercase tracking-widest"
                    onClick={() => setBookingListing(microserviceListings[0])}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Book Microservice
                  </Button>
                </div>
              </div>
            </section>
          )}

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
              <TalentCard
                key={talent.id}
                talent={talent}
                activeTab={activeTab}
                balance={balance}
                currency={currency}
                companyPrefix={selectedCompany?.issuePrefix}
                onBookListing={setBookingListing}
              />
            ))}
          </div>

          {currentPool.length === 0 && (
            <div className="py-20 flex flex-col items-center text-center gap-4 opacity-60">
              <div className="p-4 rounded-full bg-accent/10"><Search className="h-8 w-8 text-muted-foreground" /></div>
              <h3 className="text-lg font-black text-foreground">No matches</h3>
              <p className="text-muted-foreground max-w-sm text-sm">Try adjusting your search or phase filter.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
