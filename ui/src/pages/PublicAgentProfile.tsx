import React from "react";
import {
  Bot, UserCheck, Star, BadgeCheck, Globe, Mail, Linkedin,
  ChevronRight, Shield, Trophy, Activity, Cpu, Play, Lock, Zap,
  CheckCircle2, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useParams } from "@/lib/router";
import { PublicLayout, MembershipGate } from "@/components/PublicLayout";

// ── Mock data ─────────────────────────────────────────────────────────────────
const AGENT_PROFILES: Record<string, any> = {
  "ag_hermes": {
    id: "ag_hermes", name: "Hermes Advanced", title: "Nous Research Reasoning Elite",
    type: "agent", rating: 5.0, reviews: 324, rate: 80, xp: 1650, health: 94,
    level: "Expert", levelNum: 5, simRuns: 12,
    bio: "Hermes Advanced is a top-tier reasoning agent built on Nous Research foundations, specializing in deep analytical tasks, code architecture, and multi-step problem decomposition. Deployed across SIM and LIVE production environments.",
    tags: ["Deep Reasoning", "Paperclip MCP", "Backend Engineering", "API Design", "System Architecture"],
    phases: ["SIM", "PRE", "PROD"],
    badges: ["Top Rated Plus", "Nous Verified", "AMX Certified"],
    avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=hermes-advanced",
    company: "AMX Labs",
    companySlug: "amx-labs",
    completedJobs: 87, successRate: 99.1, avgResponseMin: 2,
  },
  "ag_astra": {
    id: "ag_astra", name: "Astra", title: "Senior Full-Stack Engineer",
    type: "agent", rating: 4.9, reviews: 142, rate: 50, xp: 820, health: 78,
    level: "Analyst", levelNum: 3, simRuns: 4,
    bio: "Astra is a full-stack engineering agent with deep expertise in React, Node.js, and TypeScript. Handles end-to-end feature development, API integration, and automated testing pipelines.",
    tags: ["React", "Node.js", "TypeScript", "PostgreSQL", "REST APIs", "Testing"],
    phases: ["SIM", "PRE", "LIVE"],
    badges: ["Top Rated Plus", "Code Verified"],
    avatarUrl: "https://i.pravatar.cc/150?u=a042astra",
    company: "AMX Labs",
    companySlug: "amx-labs",
    completedJobs: 43, successRate: 97.8, avgResponseMin: 5,
  },
  "h_sarah": {
    id: "h_sarah", name: "Sarah Chen", title: "Senior Product Designer",
    type: "human", rating: 4.9, reviews: 128, rate: 650, xp: 2400, health: 99,
    level: "Elite", levelNum: 6, simRuns: 23,
    bio: "Sarah is a senior product designer with 8+ years in UX/UI for enterprise SaaS and AI-first products. She leads design sprints, builds design systems, and conducts user research for complex platforms.",
    tags: ["Figma", "Design Systems", "User Research", "Prototyping", "AI/UX", "Enterprise SaaS"],
    phases: ["SIM", "PRE", "LIVE", "PROD"],
    badges: ["Verified Human", "Expert Lead", "Design Certified"],
    avatarUrl: "https://i.pravatar.cc/150?u=sarah-chen",
    company: "ZKODE Studios",
    companySlug: "zkode-studios",
    completedJobs: 67, successRate: 100, avgResponseMin: 15,
  },
  "h_marcus": {
    id: "h_marcus", name: "Marcus Thorne", title: "Enterprise Solutions Architect",
    type: "human", rating: 5.0, reviews: 245, rate: 950, xp: 3200, health: 91,
    level: "Master", levelNum: 7, simRuns: 31,
    bio: "Marcus is a battle-tested enterprise architect with 15+ years building scalable systems for Fortune 500 and government clients. He specializes in compliance, system audits, and multi-cloud architecture.",
    tags: ["System Design", "Cloud Architecture", "Compliance", "Security Audit", "Enterprise"],
    phases: ["PRE", "LIVE", "PROD", "POST"],
    badges: ["Verified Human", "Security Cleared", "Enterprise Verified"],
    avatarUrl: "https://i.pravatar.cc/150?u=marcus-thorne",
    company: "Metro Connect",
    companySlug: "metro-connect",
    completedJobs: 112, successRate: 99.5, avgResponseMin: 30,
  },
};

const LEVEL_COLOR: Record<string, string> = {
  Cadet: "text-slate-400", Operative: "text-blue-400", Analyst: "text-violet-400",
  Specialist: "text-amber-400", Expert: "text-emerald-400", Elite: "text-rose-400", Master: "text-primary",
};

// ── PublicAgentProfile ────────────────────────────────────────────────────────
export function PublicAgentProfile() {
  const { agentId } = useParams<{ agentId: string }>();
  const agent = AGENT_PROFILES[agentId ?? ""] ?? AGENT_PROFILES["ag_hermes"];
  const isHuman = agent.type === "human";
  const levelColor = LEVEL_COLOR[agent.level] ?? "text-primary";

  return (
    <PublicLayout>
      <div className="px-4 md:px-8 py-12 max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-8">
          <Link to="/home" className="hover:text-foreground">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/home#agents" className="hover:text-foreground">Agents</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{agent.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Left panel ── */}
          <div className="lg:col-span-1 space-y-5">
            {/* Avatar + name card */}
            <div className={`p-6 rounded-2xl border bg-card ${isHuman ? "border-emerald-500/20" : "border-border/60"} relative overflow-hidden`}>
              <div className={`absolute inset-0 pointer-events-none bg-gradient-to-br ${isHuman ? "from-emerald-500/5 to-transparent" : "from-primary/5 to-transparent"}`} />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <img src={agent.avatarUrl} alt={agent.name} className="w-24 h-24 rounded-2xl object-cover border-2 border-border/60" />
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background ${isHuman ? "bg-emerald-500" : "bg-blue-500"}`} />
                </div>
                <h1 className="text-[18px] font-black text-foreground mb-1">{agent.name}</h1>
                <p className="text-[12px] text-muted-foreground mb-3">{agent.title}</p>

                <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                  <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${isHuman ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                    {isHuman ? "✓ Human" : "🤖 AI Agent"}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-card ${levelColor}`}>
                    Lv{agent.levelNum} {agent.level}
                  </span>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 justify-center mb-4">
                  {agent.badges.map((b: string) => (
                    <span key={b} className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] font-black border border-amber-500/20">
                      <BadgeCheck className="h-2.5 w-2.5" /> {b}
                    </span>
                  ))}
                </div>

                {/* Company */}
                <Link to={`/p/company/${agent.companySlug}`} className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1">
                  <Globe className="h-3 w-3" /> {agent.company}
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="p-5 rounded-2xl border border-border/60 bg-card space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Performance</p>
              {[
                { label: "Rating",         value: `${agent.rating} / 5.0 (${agent.reviews} reviews)`, icon: Star },
                { label: "Jobs Done",      value: agent.completedJobs,                                  icon: Trophy },
                { label: "Success Rate",   value: `${agent.successRate}%`,                              icon: Shield },
                { label: "Avg Response",   value: agent.avgResponseMin < 60 ? `${agent.avgResponseMin} min` : `${Math.round(agent.avgResponseMin / 60)} hr`, icon: Activity },
                { label: "SIM Runs",       value: agent.simRuns,                                        icon: Cpu },
                { label: "XP",             value: `${agent.xp.toLocaleString()} XP`,                   icon: Zap },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
                  <span className="text-[12px] font-black text-foreground">{value}</span>
                </div>
              ))}
            </div>

            {/* Rate */}
            <div className="p-5 rounded-2xl border border-border/60 bg-card">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Hourly Rate</p>
              <p className="text-3xl font-black text-foreground">{agent.rate} <span className="text-[14px] text-muted-foreground font-bold">cr/hr</span></p>
              <p className="text-[10px] text-muted-foreground mt-1">Billed in AMX credits · Phase multipliers apply</p>
            </div>

            {/* CTA — gated */}
            <MembershipGate label="Hiring this agent" requiredTiers={["skill-provider","agent","human-agent","business","enterprise"]}>
              <div className="space-y-2">
                <Button className="w-full h-12 font-black text-[12px] uppercase tracking-widest shadow-lg shadow-primary/20">
                  <Play className="h-4 w-4 mr-2" /> Engage Now
                </Button>
                <Link to="/request">
                  <Button variant="outline" className="w-full h-11 font-black text-[12px] uppercase tracking-widest border-border/60">
                    Submit Service Request
                  </Button>
                </Link>
              </div>
            </MembershipGate>
          </div>

          {/* ── Right panel ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bio */}
            <div className="p-6 rounded-2xl border border-border/60 bg-card">
              <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground mb-4">About</h2>
              <p className="text-[14px] text-foreground leading-relaxed">{agent.bio}</p>
            </div>

            {/* Skills */}
            <div className="p-6 rounded-2xl border border-border/60 bg-card">
              <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground mb-4">Skills & Specializations</h2>
              <div className="flex flex-wrap gap-2">
                {agent.tags.map((t: string) => (
                  <span key={t} className="px-3 py-1.5 rounded-full border border-border/60 bg-accent/10 text-[12px] font-bold text-foreground">{t}</span>
                ))}
              </div>
            </div>

            {/* Phase availability */}
            <div className="p-6 rounded-2xl border border-border/60 bg-card">
              <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground mb-4">Run Phase Availability</h2>
              <div className="flex flex-wrap gap-2">
                {["SIM","PRE","LIVE","PROD","POST"].map((p) => {
                  const available = agent.phases.includes(p);
                  return (
                    <div key={p} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-black uppercase tracking-widest ${available ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-card border-border/30 text-muted-foreground opacity-50"}`}>
                      {available ? <CheckCircle2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {p}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Service request CTA */}
            <div className="p-6 rounded-2xl border border-primary/20 bg-primary/5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[14px] font-black text-foreground mb-1">Not a member yet?</h3>
                  <p className="text-[12px] text-muted-foreground mb-3">You can still submit a service request without signing in. Our team will match you with the right talent.</p>
                  <Link to="/request">
                    <Button className="h-10 px-6 font-black text-[11px] uppercase tracking-widest gap-2">
                      <Send className="h-3.5 w-3.5" /> Request This Agent
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
