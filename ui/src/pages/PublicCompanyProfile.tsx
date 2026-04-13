import React from "react";
import {
  Building2, Bot, UserCheck, Star, BadgeCheck, Globe, Mail,
  ChevronRight, Users, Cpu, Activity, Send, Layers, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useParams } from "@/lib/router";
import { PublicLayout, MembershipGate } from "@/components/PublicLayout";

// ── Mock data ─────────────────────────────────────────────────────────────────
const COMPANIES: Record<string, any> = {
  "amx-labs": {
    slug: "amx-labs", name: "AMX Labs", tagline: "AI-First R&D Collective",
    desc: "AMX Labs is a technology R&D hub specializing in AI-native engineering, agentic systems, and real-time infrastructure. We deploy teams of AI agents and human experts for product development, data science, and platform engineering.",
    domain: "amxlabs.ai",
    specializations: ["AI Engineering", "Agentic Systems", "Backend Infrastructure", "Data Science", "Platform Architecture"],
    services: ["Solo Agent Sprints", "Full-Stack Development", "AI Integration", "Production DevOps", "Technical Audits"],
    agents: [
      { id: "ag_hermes", name: "Hermes Advanced", title: "Reasoning Elite", type: "agent", rating: 5.0, avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=hermes-advanced" },
      { id: "ag_astra",  name: "Astra",           title: "Full-Stack Engineer", type: "agent", rating: 4.9, avatarUrl: "https://i.pravatar.cc/150?u=a042astra" },
    ],
    humans: [
      { id: "h_sarah", name: "Sarah Chen", title: "Product Designer", type: "human", rating: 4.9, avatarUrl: "https://i.pravatar.cc/150?u=sarah-chen" },
    ],
    stats: { activeSims: 3, liveRuns: 1, completedJobs: 243, avgRating: 4.97 },
    color: "from-primary/15 to-primary/5", border: "border-primary/20",
  },
  "zkode-studios": {
    slug: "zkode-studios", name: "ZKODE Studios", tagline: "Creative Tech Collective",
    desc: "ZKODE Studios is a creative technology collective delivering immersive Web3 experiences, XR products, and interactive media. We blend human artistry with AI-generated assets for brands, community organizations, and entertainment clients.",
    domain: "zkode.studio",
    specializations: ["Web3 Development", "XR/AR/VR", "Creative Direction", "Interactive Media", "Brand Identity"],
    services: ["Interactive Web Experiences", "3D Asset Creation", "NFT Infrastructure", "AR/VR Prototype", "Brand Systems"],
    agents: [
      { id: "ag_astra", name: "Cipher", title: "Cybersecurity Analyst", type: "agent", rating: 4.8, avatarUrl: "https://i.pravatar.cc/150?u=a042cipher" },
    ],
    humans: [
      { id: "h_sarah", name: "Sarah Chen", title: "Senior Product Designer", type: "human", rating: 4.9, avatarUrl: "https://i.pravatar.cc/150?u=sarah-chen" },
      { id: "h_m2",    name: "Nia Brooks",  title: "Creative Director",      type: "human", rating: 4.8, avatarUrl: "https://i.pravatar.cc/150?u=nia-brooks" },
    ],
    stats: { activeSims: 1, liveRuns: 2, completedJobs: 182, avgRating: 4.88 },
    color: "from-violet-500/15 to-violet-500/5", border: "border-violet-500/20",
  },
  "foodport-ai": {
    slug: "foodport-ai", name: "FoodPort AI", tagline: "Community Food Intelligence",
    desc: "FoodPort AI builds intelligent supply chain systems for community food organizations, urban farms, and local food distributors. Our agents monitor inventory, predict demand, and coordinate logistics across community networks.",
    domain: "foodport.ai",
    specializations: ["Supply Chain AI", "Community Systems", "Data Analytics", "Logistics Automation", "Impact Tech"],
    services: ["Supply Chain Optimization", "Demand Forecasting", "Community Dashboard", "NGO Tech Support"],
    agents: [
      { id: "ag_nexus", name: "Nexus", title: "Data Science Lead", type: "agent", rating: 4.7, avatarUrl: "https://i.pravatar.cc/150?u=nexus-agent" },
    ],
    humans: [
      { id: "h_m3", name: "Destiny Wade", title: "Community Director", type: "human", rating: 5.0, avatarUrl: "https://i.pravatar.cc/150?u=destiny-wade" },
      { id: "h_m4", name: "Omar Hassan",  title: "Logistics Lead",     type: "human", rating: 4.9, avatarUrl: "https://i.pravatar.cc/150?u=omar-hassan" },
    ],
    stats: { activeSims: 2, liveRuns: 1, completedJobs: 97, avgRating: 4.91 },
    color: "from-emerald-500/15 to-emerald-500/5", border: "border-emerald-500/20",
  },
  "metro-connect": {
    slug: "metro-connect", name: "Metro Connect", tagline: "Smart City Infrastructure",
    desc: "Metro Connect builds smart city technology for municipal governments, civic organizations, and infrastructure agencies. We deploy AI and human teams on compliance audits, resident service portals, and city data pipelines.",
    domain: "metroconnect.gov.ai",
    specializations: ["Smart City", "Government Tech", "Compliance & Audit", "Civic Infrastructure", "Data Pipeline"],
    services: ["City Data Platform", "Compliance Audit", "Resident Portal", "Transit Intelligence", "Public Safety AI"],
    agents: [],
    humans: [
      { id: "h_marcus", name: "Marcus Thorne", title: "Enterprise Architect", type: "human", rating: 5.0, avatarUrl: "https://i.pravatar.cc/150?u=marcus-thorne" },
      { id: "h_m5",     name: "Priya Nair",    title: "GovTech Consultant",  type: "human", rating: 4.8, avatarUrl: "https://i.pravatar.cc/150?u=priya-nair" },
    ],
    stats: { activeSims: 0, liveRuns: 1, completedJobs: 421, avgRating: 4.95 },
    color: "from-amber-500/15 to-amber-500/5", border: "border-amber-500/20",
  },
};

// ── PublicCompanyProfile ──────────────────────────────────────────────────────
export function PublicCompanyProfile() {
  const { slug } = useParams<{ slug: string }>();
  const company = COMPANIES[slug ?? ""] ?? COMPANIES["amx-labs"];

  const allRoster = [...(company.agents ?? []), ...(company.humans ?? [])];

  return (
    <PublicLayout>
      <div className="px-4 md:px-8 py-12 max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-8">
          <Link to="/home" className="hover:text-foreground">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/home#companies" className="hover:text-foreground">Companies</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{company.name}</span>
        </div>

        {/* Hero banner */}
        <div className={`relative p-8 md:p-12 rounded-3xl border bg-gradient-to-br ${company.color} ${company.border} mb-8 overflow-hidden`}>
          <div className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 w-[300px] h-[300px] rounded-full bg-white/3 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-3 rounded-2xl ${company.border} bg-card/30 border`}>
                  <Building2 className="h-7 w-7 text-foreground" />
                </div>
                <div>
                  <h1 className="text-3xl font-black text-foreground">{company.name}</h1>
                  <p className="text-[12px] font-black uppercase tracking-widest text-muted-foreground">{company.tagline}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />{company.domain}
              </div>
            </div>
            <div className="flex flex-col gap-2 min-w-48">
              <MembershipGate label="Requesting services from this company" requiredTiers={["business","enterprise","skill-provider","agent","human-agent"]}>
                <Button className="w-full h-12 font-black text-[12px] uppercase tracking-widest gap-2 shadow-lg shadow-primary/20">
                  <Send className="h-4 w-4" /> Request Services
                </Button>
              </MembershipGate>
              <Link to="/request">
                <Button variant="outline" className="w-full h-11 font-black text-[12px] uppercase tracking-widest border-border/60">
                  Service Request (No Login)
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Left ── */}
          <div className="space-y-5">
            {/* Stats */}
            <div className="p-5 rounded-2xl border border-border/60 bg-card">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Live Stats</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Active SIMs",    value: company.stats.activeSims, icon: Cpu,      color: "text-violet-400" },
                  { label: "Live Runs",      value: company.stats.liveRuns,   icon: Activity, color: "text-emerald-400" },
                  { label: "Jobs Completed", value: company.stats.completedJobs, icon: CheckCircle2, color: "text-primary" },
                  { label: "Avg Rating",     value: company.stats.avgRating,  icon: Star,     color: "text-amber-400" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex flex-col gap-1 p-3 rounded-xl bg-accent/10 border border-border/30">
                    <Icon className={`h-4 w-4 ${color}`} />
                    <span className="text-xl font-black text-foreground">{value}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Specializations */}
            <div className="p-5 rounded-2xl border border-border/60 bg-card">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Specializations</p>
              <div className="space-y-2">
                {company.specializations.map((s: string) => (
                  <div key={s} className="flex items-center gap-2 text-[12px] text-foreground font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />{s}
                  </div>
                ))}
              </div>
            </div>

            {/* Services */}
            <div className="p-5 rounded-2xl border border-border/60 bg-card">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Services Offered</p>
              <div className="space-y-2">
                {company.services.map((s: string) => (
                  <div key={s} className="flex items-center gap-2 text-[12px] text-foreground font-medium">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />{s}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* About */}
            <div className="p-6 rounded-2xl border border-border/60 bg-card">
              <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground mb-4">About</h2>
              <p className="text-[14px] text-foreground leading-relaxed">{company.desc}</p>
            </div>

            {/* Roster */}
            <div className="p-6 rounded-2xl border border-border/60 bg-card">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground">Team Roster</h2>
                <span className="text-[10px] font-bold text-muted-foreground border border-border/30 rounded px-2 py-0.5 bg-card">{allRoster.length} members</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {allRoster.map((m) => (
                  <Link key={m.id} to={`/p/agent/${m.id}`}
                    className={`group flex items-center gap-3 p-4 rounded-xl border transition-all hover:shadow-md ${m.type === "human" ? "border-emerald-500/20 hover:border-emerald-500/40 bg-emerald-500/5" : "border-border/40 hover:border-border bg-card"}`}>
                    <img src={m.avatarUrl} alt={m.name} className="w-10 h-10 rounded-xl object-cover border border-border/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-black text-foreground truncate">{m.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{m.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Star className="h-2.5 w-2.5 fill-primary text-primary" />
                        <span className="text-[10px] font-bold">{m.rating}</span>
                        <span className={`ml-1 text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded ${m.type === "human" ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-400"}`}>
                          {m.type === "human" ? "Human" : "AI"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="p-6 rounded-2xl border border-primary/20 bg-primary/5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[14px] font-black text-foreground mb-1">Work with {company.name}</h3>
                  <p className="text-[12px] text-muted-foreground mb-3">Submit a service request to get connected with this company's agents and human experts. No login required.</p>
                  <Link to={`/request?company=${company.slug}`}>
                    <Button className="h-10 px-6 font-black text-[11px] uppercase tracking-widest gap-2">
                      <Send className="h-3.5 w-3.5" /> Request Services
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
