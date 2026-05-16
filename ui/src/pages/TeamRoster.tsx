import React, { useState, useCallback, useMemo } from "react";
import {
  Users, Zap, Bot, UserCheck, ShieldCheck, Play, Cpu, Video,
  CheckCircle2, Lock, TrendingUp, Star, Plus, ChevronRight, X,
  Sparkles, ArrowRight, Layers, Medal, Activity, Heart, Trophy,
  AlertTriangle, Target, Clock, Flame, BarChart2, Globe,
  Mail, Copy, Check, ExternalLink, Loader2, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import { accessApi } from "@/api/access";

// ── XP level thresholds ───────────────────────────────────────────────────────

export const XP_LEVELS = [
  { level: 1, label: "Cadet",     minXp: 0,    color: "text-slate-400",   bg: "bg-slate-400/10",   border: "border-slate-400/30",   simUnlock: false, liveUnlock: false },
  { level: 2, label: "Operative", minXp: 200,  color: "text-blue-400",    bg: "bg-blue-400/10",    border: "border-blue-400/30",    simUnlock: true,  liveUnlock: false },
  { level: 3, label: "Analyst",   minXp: 500,  color: "text-violet-400",  bg: "bg-violet-400/10",  border: "border-violet-400/30",  simUnlock: true,  liveUnlock: false },
  { level: 4, label: "Specialist",minXp: 900,  color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/30",   simUnlock: true,  liveUnlock: false },
  { level: 5, label: "Expert",    minXp: 1400, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30", simUnlock: true,  liveUnlock: true  },
  { level: 6, label: "Elite",     minXp: 2100, color: "text-rose-400",    bg: "bg-rose-400/10",    border: "border-rose-400/30",    simUnlock: true,  liveUnlock: true  },
  { level: 7, label: "Master",    minXp: 3000, color: "text-primary",     bg: "bg-primary/10",     border: "border-primary/30",     simUnlock: true,  liveUnlock: true  },
];

export const MIN_SIM_LEVEL  = 2;  // Operative
export const MIN_LIVE_LEVEL = 5;  // Expert

// ── Roster member types ───────────────────────────────────────────────────────

export type ActivationStatus = "in_training" | "sim_ready" | "sim_active" | "live_ready" | "live_active" | "paused";
export type MemberType = "agent" | "human";

export interface RosterMember {
  id: string;
  name: string;
  title: string;
  type: MemberType;
  origin: "internal" | "network";
  avatarUrl: string;
  xp: number;
  health: number;       // 0–100
  status: ActivationStatus;
  teamId: string | null;
  hiredAt: string;
  phase: string | null; // last active phase
  simRuns: number;
  badges: string[];
  marketplaceVisible?: boolean;
}

// ── Default demo roster ───────────────────────────────────────────────────────

const DEFAULT_ROSTER: RosterMember[] = [
  { id: "r1", name: "Hermes Advanced", title: "Nous Research Reasoning Elite", type: "agent", origin: "internal", avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=hermes-advanced", xp: 1650, health: 94, status: "live_ready",  teamId: "alpha", hiredAt: "2026-04-01", phase: "prod",  simRuns: 12, badges: ["Top Rated Plus", "Nous Verified"] },
  { id: "r2", name: "Astra",           title: "Senior Full-Stack Engineer",    type: "agent", origin: "internal", avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026024d",              xp: 820,  health: 78, status: "sim_ready",  teamId: "alpha", hiredAt: "2026-04-02", phase: "sim",   simRuns: 4,  badges: ["Top Rated Plus"] },
  { id: "r3", name: "Sarah Chen",      title: "Senior Product Designer",       type: "human", origin: "internal", avatarUrl: "https://i.pravatar.cc/150?u=sarah-chen",                       xp: 2400, health: 99, status: "live_active", teamId: "alpha", hiredAt: "2026-03-28", phase: "live",  simRuns: 23, badges: ["Verified Human", "Expert Lead"] },
  { id: "r4", name: "Nexus",           title: "Data Science & Analytics Lead", type: "agent", origin: "internal", avatarUrl: "https://i.pravatar.cc/150?u=a04258a2462d826712d",              xp: 120,  health: 55, status: "in_training", teamId: null,    hiredAt: "2026-04-05", phase: null,    simRuns: 0,  badges: ["AMX Certified"] },
  { id: "r5", name: "Marcus Thorne",   title: "Enterprise Solutions Architect", type: "human", origin: "internal", avatarUrl: "https://i.pravatar.cc/150?u=marcus-thorne",                   xp: 3200, health: 91, status: "live_active", teamId: "beta",  hiredAt: "2026-03-20", phase: "prod",  simRuns: 31, badges: ["Verified Human", "Security Cleared"] },
  { id: "r6", name: "Cipher",          title: "Cybersecurity Analyst",         type: "agent", origin: "internal", avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026704d",              xp: 390,  health: 62, status: "sim_active",  teamId: "beta",  hiredAt: "2026-04-03", phase: "sim",   simRuns: 2,  badges: ["Security Cleared"] },
  { id: "r7", name: "Digital Dasher",  title: "High-Speed Task Runner",       type: "agent", origin: "network",  avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=digital-dasher", xp: 450,  health: 100, status: "live_active", teamId: null,    hiredAt: "2026-04-06", phase: "live",  simRuns: 15, badges: ["Network Node", "Rapid"] },
];

const DEFAULT_TEAMS = [
  { id: "alpha", name: "Alpha Squad",   color: "from-blue-500/20 to-violet-500/10",  border: "border-blue-500/20",    accent: "text-blue-400"   },
  { id: "beta",  name: "Beta Crew",    color: "from-emerald-500/20 to-teal-500/10", border: "border-emerald-500/20", accent: "text-emerald-400" },
  { id: "gamma", name: "Gamma Strike", color: "from-amber-500/20 to-rose-500/10",   border: "border-amber-500/20",   accent: "text-amber-400"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLevelForXp(xp: number) {
  let found = XP_LEVELS[0];
  for (const l of XP_LEVELS) { if (xp >= l.minXp) found = l; }
  return found;
}

function getNextLevel(xp: number) {
  const cur = getLevelForXp(xp);
  return XP_LEVELS.find((l) => l.level === cur.level + 1) ?? null;
}

function xpProgressPct(xp: number): number {
  const cur   = getLevelForXp(xp);
  const next  = getNextLevel(xp);
  if (!next) return 100;
  const range = next.minXp - cur.minXp;
  return Math.round(((xp - cur.minXp) / range) * 100);
}

const STATUS_CONFIG: Record<ActivationStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  in_training: { label: "In Training",  color: "text-slate-400",   bg: "bg-slate-400/10",   border: "border-slate-400/20",   dot: "bg-slate-400" },
  sim_ready:   { label: "SIM Ready",    color: "text-blue-400",    bg: "bg-blue-400/10",    border: "border-blue-400/20",    dot: "bg-blue-400" },
  sim_active:  { label: "SIM Active",   color: "text-violet-400",  bg: "bg-violet-400/10",  border: "border-violet-400/20",  dot: "bg-violet-400 animate-pulse" },
  live_ready:  { label: "LIVE Ready",   color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   dot: "bg-amber-400" },
  live_active: { label: "LIVE",         color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", dot: "bg-emerald-400 animate-pulse" },
  paused:      { label: "Paused",       color: "text-muted-foreground", bg: "bg-muted/10",  border: "border-border/20",      dot: "bg-muted-foreground" },
};

// ── Health ring SVG ───────────────────────────────────────────────────────────

function HealthRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} stroke="currentColor" strokeWidth={4} fill="none" className="text-border/30" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={4} fill="none"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

// ── XP + Level Bar ────────────────────────────────────────────────────────────

function XpBar({ xp }: { xp: number }) {
  const level = getLevelForXp(xp);
  const next  = getNextLevel(xp);
  const pct   = xpProgressPct(xp);
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[9px] font-black uppercase tracking-widest ${level.color}`}>{level.label}</span>
        <span className="text-[9px] font-mono text-muted-foreground">{xp.toLocaleString()} XP{next ? ` / ${next.minXp.toLocaleString()}` : " · MAX"}</span>
      </div>
      <div className={`relative w-full h-1.5 rounded-full ${level.bg.replace("/10", "/20")} overflow-hidden`}>
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${
            level.color.replace("text-", "bg-")
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Threshold markers */}
      <div className="relative w-full mt-0.5 h-2">
        <div className="absolute text-[8px] font-black text-blue-400/60 uppercase" style={{ left: `${(200 / 3000) * 100}%` }}>SIM</div>
        <div className="absolute text-[8px] font-black text-emerald-400/60 uppercase" style={{ left: `${(1400 / 3000) * 100}%` }}>LIVE</div>
      </div>
    </div>
  );
}

// ── Assign Team Modal ─────────────────────────────────────────────────────────

function AssignTeamModal({ member, teams, onAssign, onClose }: {
  member: RosterMember; teams: typeof DEFAULT_TEAMS;
  onAssign: (memberId: string, teamId: string | null) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl border border-border/60 overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <h3 className="text-[13px] font-black uppercase tracking-widest">Assign to Team</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-2">
          <button onClick={() => { onAssign(member.id, null); onClose(); }}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${!member.teamId ? "border-primary/40 bg-primary/5" : "border-border/40 hover:border-border bg-card/40"}`}>
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center"><X className="h-4 w-4 text-muted-foreground" /></div>
            <span className="text-[12px] font-black text-muted-foreground">Unassigned</span>
          </button>
          {teams.map((team) => (
            <button key={team.id} onClick={() => { onAssign(member.id, team.id); onClose(); }}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all bg-gradient-to-r ${team.color} ${member.teamId === team.id ? `${team.border} ring-1 ring-current/20` : "border-border/40 hover:border-border"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-card/40`}><Users className={`h-4 w-4 ${team.accent}`} /></div>
              <span className={`text-[12px] font-black ${team.accent}`}>{team.name}</span>
              {member.teamId === team.id && <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />}
            </button>
          ))}
          <button onClick={() => {}} className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border/40 hover:border-primary/40 text-left transition-all">
            <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center"><Plus className="h-4 w-4 text-primary" /></div>
            <span className="text-[12px] font-black text-primary">Create New Team</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Roster Member Card ────────────────────────────────────────────────────────

function MemberCard({ member, teams, onUpdate }: {
  member: RosterMember;
  teams: typeof DEFAULT_TEAMS;
  onUpdate: (id: string, patch: Partial<RosterMember>) => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const level     = getLevelForXp(member.xp);
  const statusCfg = STATUS_CONFIG[member.status];
  const assignedTeam = teams.find((t) => t.id === member.teamId);
  const canSim  = level.level >= MIN_SIM_LEVEL && member.health >= 30;
  const canLive = level.level >= MIN_LIVE_LEVEL && member.health >= 70;

  const handleActivate = (mode: "sim" | "live") => {
    if (mode === "sim"  && canSim)  onUpdate(member.id, { status: "sim_active",  phase: "sim"  });
    if (mode === "live" && canLive) onUpdate(member.id, { status: "live_active", phase: "live" });
  };

  return (
    <>
      {showAssign && <AssignTeamModal member={member} teams={teams} onAssign={(id, teamId) => onUpdate(id, { teamId })} onClose={() => setShowAssign(false)} />}

      <div className={`group relative flex flex-col bg-card rounded-2xl border transition-all duration-300 hover:shadow-xl overflow-hidden ${
        member.status === "live_active" ? "border-emerald-500/30 hover:border-emerald-500/50 shadow-emerald-500/5" :
        member.status === "sim_active"  ? "border-violet-500/30 hover:border-violet-500/50  shadow-violet-500/5"  :
        "border-border/60 hover:border-border"
      }`}>

        {/* Status stripe */}
        <div className={`h-0.5 w-full ${statusCfg.bg.replace("/10", "/50")}`} />

        {/* LIVE / SIM active glow */}
        {(member.status === "live_active" || member.status === "sim_active") && (
          <div className={`absolute -inset-px rounded-2xl pointer-events-none ${member.status === "live_active" ? "shadow-[0_0_20px_rgba(34,197,94,0.08)]" : "shadow-[0_0_20px_rgba(167,139,250,0.08)]"}`} />
        )}

        <div className="p-5">
          {/* Top row: avatar + name + status */}
          <div className="flex items-start gap-3 mb-4">
            <div className="relative shrink-0">
              <img src={member.avatarUrl} alt={member.name} className="w-12 h-12 rounded-xl object-cover border border-border/60" />
              <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-background ${statusCfg.dot}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-black text-foreground truncate">{member.name}</h3>
                  <p className="text-[10px] text-muted-foreground font-medium truncate">{member.title}</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>
                  {statusCfg.label}
                </span>
              </div>
              {/* Type badge */}
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${member.type === "human" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                  {member.type === "human" ? <UserCheck className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5" />}
                  {member.type === "human" ? "Human" : "AI Agent"}
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${member.origin === "network" ? "bg-primary/20 text-primary border-primary/30" : "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                  <Globe className="h-2.5 w-2.5" />
                  {member.origin === "network" ? "Network Dasher" : "Internal"}
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${level.bg} ${level.color} ${level.border}`}>
                  <Medal className="h-2.5 w-2.5" /> Lv{level.level} {level.label}
                </span>
              </div>
            </div>
          </div>

          {/* XP + Health row */}
          <div className="flex items-center gap-3 mb-4">
            <XpBar xp={member.xp} />
            <div className="shrink-0 relative flex items-center justify-center">
              <HealthRing pct={member.health} size={44} />
              <span className="absolute text-[9px] font-black text-foreground rotate-90">{member.health}%</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border/30">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
              <Activity className="h-3 w-3" /> {member.simRuns} sims
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
              <Clock className="h-3 w-3" /> {new Date(member.hiredAt).toLocaleDateString()}
            </div>
            {member.phase && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground ml-auto">
                <Flame className="h-3 w-3 text-rose-400" /> {member.phase.toUpperCase()}
              </div>
            )}
          </div>

          {/* Team assignment */}
          <button onClick={() => setShowAssign(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all mb-3 text-left group/team">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {assignedTeam ? (
                <span className={`text-[11px] font-black ${assignedTeam.accent}`}>{assignedTeam.name}</span>
              ) : (
                <span className="text-[11px] font-bold text-muted-foreground">Assign to Team</span>
              )}
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover/team:text-primary transition-colors" />
          </button>

          {/* Activation buttons */}
          <div className="flex gap-2">
            {/* SIM activation */}
            <div className="flex-1 relative group/sim">
              <Button
                onClick={() => handleActivate("sim")}
                disabled={!canSim || member.status === "sim_active" || member.status === "live_active"}
                size="sm"
                className={`w-full h-9 font-black text-[10px] uppercase tracking-widest gap-1.5 transition-all ${
                  member.status === "sim_active" ? "bg-violet-500 hover:bg-violet-600 border-0 shadow-lg shadow-violet-500/20" :
                  canSim ? "bg-blue-500/20 hover:bg-blue-500 text-blue-400 hover:text-white border border-blue-500/30 hover:border-blue-500" :
                  "opacity-40"
                }`}
                variant={canSim ? "default" : "outline"}
              >
                {member.status === "sim_active" ? <><Cpu className="h-3 w-3 animate-pulse" /> SIM Live</> : <><Cpu className="h-3 w-3" /> Run SIM</>}
              </Button>
              {!canSim && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-48 px-2 py-1 rounded-lg bg-background border border-border text-[9px] font-bold text-muted-foreground opacity-0 group-hover/sim:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                  <Lock className="h-2.5 w-2.5 inline mr-1" />
                  Requires Lv{MIN_SIM_LEVEL}+ (Operative) & health ≥30%
                </div>
              )}
            </div>

            {/* LIVE activation */}
            <div className="flex-1 relative group/live">
              <Button
                onClick={() => handleActivate("live")}
                disabled={!canLive || member.status === "live_active"}
                size="sm"
                className={`w-full h-9 font-black text-[10px] uppercase tracking-widest gap-1.5 transition-all ${
                  member.status === "live_active" ? "bg-emerald-500 hover:bg-emerald-600 border-0 shadow-lg shadow-emerald-500/20" :
                  canLive ? "bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/30 hover:border-emerald-500" :
                  "opacity-40"
                }`}
                variant={canLive ? "default" : "outline"}
              >
                {member.status === "live_active" ? <><Play className="h-3 w-3 animate-pulse" /> LIVE</> : <><Play className="h-3 w-3" /> Go LIVE</>}
              </Button>
              {!canLive && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-52 px-2 py-1 rounded-lg bg-background border border-border text-[9px] font-bold text-muted-foreground opacity-0 group-hover/live:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                  <Lock className="h-2.5 w-2.5 inline mr-1" />
                  Requires Lv{MIN_LIVE_LEVEL}+ (Expert) & health ≥70%
                </div>
              )}
            </div>
          </div>

          {/* Ship to Market toggle — agents only */}
          {member.type === "agent" && (
            <button
              onClick={() => onUpdate(member.id, { marketplaceVisible: !member.marketplaceVisible })}
              className={`mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-all text-left ${
                member.marketplaceVisible
                  ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
                  : "border-border/40 hover:border-amber-500/30 hover:bg-amber-500/5"
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className={`h-3.5 w-3.5 ${member.marketplaceVisible ? "text-amber-400" : "text-muted-foreground"}`} />
                <span className={`text-[11px] font-black ${member.marketplaceVisible ? "text-amber-400" : "text-muted-foreground"}`}>
                  {member.marketplaceVisible ? "Listed in Market" : "Ship to Market"}
                </span>
              </div>
              {member.marketplaceVisible
                ? <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                : <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              }
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Team Column ───────────────────────────────────────────────────────────────

function TeamColumn({ team, members, onUpdate }: {
  team: typeof DEFAULT_TEAMS[0] | null;
  members: RosterMember[];
  onUpdate: (id: string, patch: Partial<RosterMember>) => void;
}) {
  const label    = team?.name ?? "Unassigned";
  const accent   = team?.accent ?? "text-muted-foreground";
  const border   = team?.border ?? "border-border/30";
  const gradient = team?.color  ?? "from-card to-card";
  const liveCount = members.filter((m) => m.status === "live_active").length;
  const simCount  = members.filter((m) => m.status === "sim_active").length;

  return (
    <div className={`rounded-2xl border bg-gradient-to-b ${gradient} ${border} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className={`h-4 w-4 ${accent}`} />
          <h3 className={`text-[12px] font-black uppercase tracking-widest ${accent}`}>{label}</h3>
          <span className="text-[10px] font-bold text-muted-foreground border border-border/30 rounded px-1.5 bg-card/40">{members.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {liveCount > 0 && <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{liveCount} LIVE</span>}
          {simCount  > 0 && <span className="flex items-center gap-1 text-[9px] font-black text-violet-400"><div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />{simCount} SIM</span>}
        </div>
      </div>
      <div className="p-3 space-y-3">
        {members.length === 0 ? (
          <div className="py-8 flex flex-col items-center text-center opacity-40 gap-2">
            <Users className="h-6 w-6 text-muted-foreground" />
            <p className="text-[11px] font-bold text-muted-foreground">No members yet</p>
          </div>
        ) : (
          members.map((m) => <MemberCard key={m.id} member={m} teams={DEFAULT_TEAMS} onUpdate={onUpdate} />)
        )}
      </div>
    </div>
  );
}

// ── Invite Human Modal ────────────────────────────────────────────────────────

function InviteHumanModal({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(companyId, {
        allowedJoinTypes: "human",
        targetEnvironment: "live",
        inviteeEmail: email.trim() || undefined,
      }),
    onSuccess: (data) => setInviteUrl(data.inviteUrl),
  });

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card rounded-2xl border border-border/60 overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h3 className="text-[13px] font-black uppercase tracking-widest">Invite Human</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
        </div>

        {!inviteUrl ? (
          <div className="p-6 space-y-4">
            <p className="text-[12px] text-muted-foreground">
              Generate an invite link for a human team member. They'll join as a verified human on the roster.
            </p>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 block">
                Email (optional — sends invite email if provided)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-background border border-border/60 rounded-xl px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 transition-colors"
              />
            </div>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
              className="w-full h-10 font-black text-[11px] uppercase tracking-widest gap-2"
            >
              {inviteMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
              ) : (
                <><Mail className="h-3.5 w-3.5" /> Generate Invite Link</>
              )}
            </Button>
            {inviteMutation.isError && (
              <p className="text-[11px] text-rose-400 text-center">Failed to create invite. Try again.</p>
            )}
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <p className="text-[12px] font-bold text-emerald-400">Invite link ready!</p>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 block">
                Invite URL
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 min-w-0 bg-background/50 border border-border/40 rounded-xl px-3 py-2.5 text-[11px] text-muted-foreground font-mono truncate"
                />
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-2.5 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                </button>
                <a href={inviteUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 p-2.5 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Share this link with your team member. It expires in 7 days.
            </p>
            <Button variant="outline" onClick={onClose} className="w-full h-9 font-black text-[11px] uppercase tracking-widest">
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main TeamRoster page ──────────────────────────────────────────────────────

export function TeamRoster() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<RosterMember>>>({});
  const [view, setView] = useState<"board" | "list">("board");
  const [filterStatus, setFilterStatus] = useState<ActivationStatus | "all">("all");
  const [showInvite, setShowInvite] = useState(false);

  // ── Real data queries ──────────────────────────────────────────────────────
  const { data: agentList = [] } = useQuery({
    queryKey: ["agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 15_000,
  });

  const { data: memberList = [] } = useQuery({
    queryKey: ["members", selectedCompanyId],
    queryFn: () => accessApi.listMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
    // 403 if board lacks users:manage_permissions — silently fall back to empty
    retry: false,
  });

  // ── Build roster from real data ────────────────────────────────────────────
  const roster = useMemo<RosterMember[]>(() => {
    const fromAgents: RosterMember[] = agentList.map((a) => ({
      id: a.id,
      name: a.name,
      title: a.title ?? a.role,
      type: "agent" as MemberType,
      origin: "internal" as const,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${a.id}`,
      xp:     Number((a.metadata?.xp    as number | undefined) ?? 0),
      health: Number((a.metadata?.health as number | undefined) ?? 100),
      status: ((a.metadata?.rosterStatus as ActivationStatus | undefined) ?? "in_training"),
      teamId: (a.metadata?.teamId as string | undefined) ?? null,
      hiredAt: new Date(a.createdAt).toISOString().slice(0, 10),
      phase:   (a.metadata?.phase as string | undefined) ?? null,
      simRuns: Number((a.metadata?.simRuns as number | undefined) ?? 0),
      badges:  [],
      marketplaceVisible: !!(a.metadata?.marketplaceVisible as boolean | undefined),
    }));

    const fromHumans: RosterMember[] = memberList
      .filter((m) => m.principalType === "user" && m.status === "active")
      .map((m) => ({
        id: m.id,
        name: `Human ${m.principalId.slice(-6).toUpperCase()}`,
        title: m.membershipRole ?? "Team Member",
        type: "human" as MemberType,
        origin: "internal" as const,
        avatarUrl: `https://api.dicebear.com/7.x/personas/svg?seed=${m.principalId}`,
        xp: 0, health: 100,
        status: "live_active" as ActivationStatus,
        teamId: null,
        hiredAt: m.createdAt,
        phase: "live",
        simRuns: 0,
        badges: ["Verified Human"],
      }));

    return [...fromAgents, ...fromHumans];
  }, [agentList, memberList]);

  // ── Persist team/status changes ────────────────────────────────────────────
  const patchAgent = useMutation({
    mutationFn: ({ agentId, patch }: { agentId: string; patch: Partial<RosterMember> }) => {
      const agent = agentList.find((a) => a.id === agentId);
      if (!agent) throw new Error("Agent not found");
      const newMeta: Record<string, unknown> = {
        ...(agent.metadata ?? {}),
        ...(patch.teamId             !== undefined ? { teamId: patch.teamId }                       : {}),
        ...(patch.status             !== undefined ? { rosterStatus: patch.status }                 : {}),
        ...(patch.health             !== undefined ? { health: patch.health }                       : {}),
        ...(patch.phase              !== undefined ? { phase: patch.phase }                         : {}),
        ...(patch.simRuns            !== undefined ? { simRuns: patch.simRuns }                     : {}),
        ...(patch.marketplaceVisible !== undefined ? { marketplaceVisible: patch.marketplaceVisible } : {}),
      };
      return agentsApi.update(agentId, { metadata: newMeta }, selectedCompanyId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents", selectedCompanyId] });
      queryClient.invalidateQueries({ queryKey: ["marketplace", "public-listings"] });
    },
  });

  const updateMember = useCallback((id: string, patch: Partial<RosterMember>) => {
    setLocalOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    if (agentList.some((a) => a.id === id)) {
      patchAgent.mutate({ agentId: id, patch });
    }
  }, [agentList, patchAgent]);

  // Merge real data with optimistic local overrides
  const mergedRoster = roster.map((m) => ({ ...m, ...localOverrides[m.id] }));
  const displayed = filterStatus === "all" ? mergedRoster : mergedRoster.filter((m) => m.status === filterStatus);

  const liveCount     = mergedRoster.filter((m) => m.status === "live_active").length;
  const simCount      = mergedRoster.filter((m) => m.status === "sim_active").length;
  const readyCount    = mergedRoster.filter((m) => m.status === "live_ready" || m.status === "sim_ready").length;
  const trainingCount = mergedRoster.filter((m) => m.status === "in_training").length;

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">

      {/* Invite Human modal */}
      {showInvite && selectedCompanyId && (
        <InviteHumanModal companyId={selectedCompanyId} onClose={() => setShowInvite(false)} />
      )}

      {/* Header */}
      <section className="px-4 md:px-8 py-7 border-b border-border/40 bg-gradient-to-br from-accent/10 via-background to-primary/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-lg shadow-primary/10">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">Team Roster</h1>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Training · SIM · LIVE Activation</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowInvite(true)}
                className="h-10 px-4 gap-2 font-black text-[11px] uppercase tracking-widest border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
              >
                <UserPlus className="h-3.5 w-3.5" /> Invite Human
              </Button>
              {selectedCompany && (
                <Link to={`/${selectedCompany.issuePrefix}/marketplace`}>
                  <Button className="h-10 px-4 gap-2 font-black text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20">
                    <Plus className="h-3.5 w-3.5" /> Hire Agent
                  </Button>
                </Link>
              )}
              <div className="flex bg-card/60 p-1 rounded-xl border border-border/40">
                <button onClick={() => setView("board")} className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${view === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Board</button>
                <button onClick={() => setView("list")}  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${view === "list"  ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>List</button>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "LIVE Active",  value: liveCount,     color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", icon: Play },
              { label: "SIM Running",  value: simCount,      color: "text-violet-400",  bg: "bg-violet-400/10",  border: "border-violet-400/20",  icon: Cpu },
              { label: "Ready",        value: readyCount,    color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   icon: Target },
              { label: "In Training",  value: trainingCount, color: "text-slate-400",   bg: "bg-slate-400/10",   border: "border-slate-400/20",   icon: Trophy },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.bg} ${s.border}`}>
                  <Icon className={`h-4 w-4 ${s.color}`} />
                  <div>
                    <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{s.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* XP Gate Legend */}
      <div className="px-4 md:px-8 py-4 border-b border-border/20 bg-accent/5">
        <div className="max-w-7xl mx-auto flex items-center gap-4 flex-wrap">
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Activation Gates:</span>
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3 text-blue-400" />
            <span className="text-[10px] font-black text-blue-400">SIM</span>
            <span className="text-[10px] text-muted-foreground">= Lv2 Operative + Health ≥30%</span>
          </div>
          <span className="text-muted-foreground/30 text-[10px]">·</span>
          <div className="flex items-center gap-1.5">
            <Play className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-black text-emerald-400">LIVE</span>
            <span className="text-[10px] text-muted-foreground">= Lv5 Expert + Health ≥70%</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {(["all", "live_active", "sim_active", "in_training"] as const).map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${filterStatus === s ? "bg-foreground text-background border-foreground" : "border-border/40 text-muted-foreground hover:border-border"}`}>
                {s === "all" ? "All" : STATUS_CONFIG[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Board view */}
      <main className="px-4 md:px-8 py-6 flex-1">
        <div className="max-w-7xl mx-auto">
          {view === "board" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
              {/* Unassigned Internal column */}
              <TeamColumn
                team={null}
                members={displayed.filter((m) => !m.teamId && m.origin === "internal")}
                onUpdate={updateMember}
              />
              {/* Network Dashers column */}
              <div className="rounded-2xl border bg-gradient-to-b from-primary/10 to-transparent border-primary/30 overflow-hidden">
                <div className="px-4 py-3 border-b border-primary/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <h3 className="text-[12px] font-black uppercase tracking-widest text-primary">Network Dashers</h3>
                    <span className="text-[10px] font-bold text-primary border border-primary/30 rounded px-1.5 bg-primary/10">
                      {displayed.filter((m) => m.origin === "network").length}
                    </span>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {displayed.filter((m) => m.origin === "network").map((m) => (
                    <MemberCard key={m.id} member={m} teams={DEFAULT_TEAMS} onUpdate={updateMember} />
                  ))}
                  {displayed.filter((m) => m.origin === "network").length === 0 && (
                    <div className="py-8 flex flex-col items-center text-center opacity-40 gap-2">
                      <Zap className="h-6 w-6 text-muted-foreground" />
                      <p className="text-[11px] font-bold text-muted-foreground">No active dashes</p>
                    </div>
                  )}
                </div>
              </div>
              {DEFAULT_TEAMS.map((team) => (
                <TeamColumn
                  key={team.id}
                  team={team}
                  members={displayed.filter((m) => m.teamId === team.id)}
                  onUpdate={updateMember}
                />
              ))}
            </div>
          ) : (
            /* List view */
            <div className="space-y-3">
              {displayed.map((member) => {
                const level = getLevelForXp(member.xp);
                const statusCfg = STATUS_CONFIG[member.status];
                const team = DEFAULT_TEAMS.find((t) => t.id === member.teamId);
                const canSim  = level.level >= MIN_SIM_LEVEL && member.health >= 30;
                const canLive = level.level >= MIN_LIVE_LEVEL && member.health >= 70;
                return (
                  <div key={member.id} className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-border/60 bg-card hover:border-border transition-all">
                    <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-xl object-cover border border-border/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-black text-foreground">{member.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${level.bg} ${level.color} border ${level.border}`}>Lv{level.level}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{member.title}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      <XpBar xp={member.xp} />
                    </div>
                    <div className="shrink-0 relative flex items-center justify-center">
                      <HealthRing pct={member.health} size={36} />
                      <span className="absolute text-[8px] font-black text-foreground rotate-90">{member.health}%</span>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}>{statusCfg.label}</span>
                    {team && <span className={`shrink-0 text-[10px] font-black ${team.accent}`}>{team.name}</span>}
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" disabled={!canSim || member.status === "sim_active" || member.status === "live_active"}
                        onClick={() => updateMember(member.id, { status: "sim_active", phase: "sim" })}
                        className="h-8 px-3 font-black text-[9px] uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white disabled:opacity-30">
                        <Cpu className="h-3 w-3 mr-1" /> SIM
                      </Button>
                      <Button size="sm" disabled={!canLive || member.status === "live_active"}
                        onClick={() => updateMember(member.id, { status: "live_active", phase: "live" })}
                        className="h-8 px-3 font-black text-[9px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white disabled:opacity-30">
                        <Play className="h-3 w-3 mr-1" /> LIVE
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
