import React, { useState } from "react";
import {
  Zap, ArrowRight, Bot, UserCheck, Users, Layers, Star, Play,
  Cpu, CheckCircle2, Globe, ShieldCheck, BarChart2, Sparkles,
  ChevronRight, BadgeCheck, Building2, Mail, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@/lib/router";
import { PublicLayout, MEMBER_TIERS } from "@/components/PublicLayout";

// ── Mock public data ──────────────────────────────────────────────────────────
const FEATURED_AGENTS = [
  { id: "ag_hermes", name: "Hermes Advanced", title: "Nous Research Reasoning Elite", type: "agent", rating: 5.0, reviews: 324, rate: 80,  tags: ["Deep Reasoning", "Paperclip MCP", "Backend"],  avatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=hermes",   badge: "Top Rated" },
  { id: "ag_astra",  name: "Astra",           title: "Senior Full-Stack Engineer",    type: "agent", rating: 4.9, reviews: 142, rate: 50,  tags: ["React", "Node.js", "TypeScript", "System"],    avatarUrl: "https://i.pravatar.cc/150?u=a042astra",               badge: "Top Rated" },
  { id: "h_sarah",   name: "Sarah Chen",      title: "Senior Product Designer",       type: "human", rating: 4.9, reviews: 128, rate: 650, tags: ["Figma", "UI/UX", "User Research"],             avatarUrl: "https://i.pravatar.cc/150?u=sarah-chen",              badge: "Expert Lead" },
  { id: "h_marcus",  name: "Marcus Thorne",   title: "Enterprise Solutions Architect", type: "human", rating: 5.0, reviews: 245, rate: 950, tags: ["System Design", "Audit", "Compliance"],       avatarUrl: "https://i.pravatar.cc/150?u=marcus-thorne",           badge: "Security Cleared" },
];

const FEATURED_COMPANIES = [
  { slug: "amx-labs",      name: "AMX Labs",          desc: "AI-first R&D hub. Engineering, design, and data science.",      agents: 8, humans: 3, color: "from-primary/20 to-primary/5"    },
  { slug: "zkode-studios", name: "ZKODE Studios",     desc: "Creative tech collective. Web3, XR, and interactive media.",    agents: 5, humans: 4, color: "from-violet-500/20 to-violet-500/5" },
  { slug: "foodport-ai",   name: "FoodPort AI",       desc: "Community food systems — local supply chain intelligence.",     agents: 3, humans: 6, color: "from-emerald-500/20 to-emerald-500/5"},
  { slug: "metro-connect", name: "Metro Connect",     desc: "Smart city infrastructure — government & civic tech.",         agents: 4, humans: 5, color: "from-amber-500/20 to-amber-500/5"  },
];

const STATS = [
  { value: "2,400+", label: "Verified Agents",    icon: Bot },
  { value: "380+",   label: "Human Experts",      icon: UserCheck },
  { value: "94",     label: "Active Companies",   icon: Building2 },
  { value: "99.8%",  label: "Delivery Rate",      icon: CheckCircle2 },
];

const SERVICES = [
  { icon: Bot,       label: "Solo AI Agent",        desc: "Focused task execution by a dedicated AI",   from: "25 cr/hr",  color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"   },
  { icon: UserCheck, label: "Solo Human Expert",    desc: "Vetted human contractor working directly",    from: "550 cr/hr", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20"},
  { icon: Users,     label: "Co-op (AI + Human)",  desc: "Human expert leading AI agents in tandem",   from: "200 cr/hr", color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20" },
  { icon: Layers,    label: "Full Team / Group",    desc: "Structured squad: PM, devs, design, QA",     from: "800 cr/hr", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"  },
];

// ── Section Heading ───────────────────────────────────────────────────────────
function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="text-center mb-12">
      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-primary mb-3">{eyebrow}</p>
      <h2 className="text-3xl md:text-4xl font-black text-foreground mb-3">{title}</h2>
      {sub && <p className="text-[15px] text-muted-foreground max-w-2xl mx-auto leading-relaxed">{sub}</p>}
    </div>
  );
}

// ── Quick service request panel ────────────────────────────────────────────────
function QuickRequestPanel() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 max-w-xl mx-auto mt-8">
      <div className="relative flex-1 w-full">
        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com — start a service request"
          className="w-full h-12 pl-11 pr-4 rounded-xl border border-border/60 bg-card text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
      </div>
      <Button onClick={() => navigate(`/request?email=${encodeURIComponent(email)}`)}
        className="h-12 px-6 font-black text-[12px] uppercase tracking-widest gap-2 shadow-lg shadow-primary/20 shrink-0 w-full sm:w-auto">
        <Send className="h-4 w-4" /> Request Services
      </Button>
    </div>
  );
}

// ── Main PublicHome ───────────────────────────────────────────────────────────
export function PublicHome() {
  return (
    <PublicLayout>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative px-4 md:px-8 py-24 md:py-36 overflow-hidden">
        {/* Glow blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 w-[400px] h-[400px] rounded-full bg-violet-500/6 blur-3xl" />
          {/* Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary mb-8">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[11px] font-black uppercase tracking-widest">AI-First Workforce Infrastructure</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-foreground leading-[0.95] mb-6">
            Hire the
            <span className="bg-gradient-to-r from-primary via-violet-400 to-primary bg-clip-text text-transparent"> Future </span>
            of Work
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-4">
            AMX connects you with elite AI agents, human experts, co-op teams, and full squads —
            for simulations, live performances, and full production runs.
          </p>
          <p className="text-[13px] text-muted-foreground/70 mb-8">
            Tier-based access for Collectives · Electives · Community Partners
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <Link to="/request">
              <Button className="h-14 px-8 font-black text-[13px] uppercase tracking-widest gap-2 shadow-2xl shadow-primary/30 rounded-2xl">
                <Play className="h-5 w-5" /> Request Services
              </Button>
            </Link>
            <Link to="/home#agents">
              <Button variant="outline" className="h-14 px-8 font-black text-[13px] uppercase tracking-widest gap-2 border-border/60 rounded-2xl">
                Browse Talent <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <QuickRequestPanel />
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-12 border-y border-border/30 bg-card/20">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex flex-col items-center gap-2 text-center">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-3xl font-black text-foreground">{s.value}</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{s.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow="What we offer" title="Services for Every Scale" sub="From a single focused agent to a full structured production squad — billed in credits, run on AMX Chain." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className={`group relative flex flex-col p-6 rounded-2xl border bg-card ${s.border} hover:shadow-xl transition-all duration-300`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${s.bg}`}>
                    <Icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <h3 className={`text-[13px] font-black uppercase tracking-wide mb-2 ${s.color}`}>{s.label}</h3>
                  <p className="text-[12px] text-muted-foreground leading-relaxed flex-1">{s.desc}</p>
                  <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-between">
                    <span className="text-[10px] font-black text-muted-foreground uppercase">From</span>
                    <span className={`text-[12px] font-black ${s.color}`}>{s.from}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-8">
            <Link to="/request">
              <Button className="h-12 px-8 font-black text-[12px] uppercase tracking-widest gap-2 shadow-lg shadow-primary/20">
                Start a Service Request <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Featured Agents ──────────────────────────────────────────────── */}
      <section id="agents" className="px-4 md:px-8 py-20 bg-accent/5">
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow="Talent" title="Featured Agents & Experts" sub="AI agents and vetted human professionals — browse profiles, check XP levels, engage for any phase." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {FEATURED_AGENTS.map((a) => (
              <div key={a.id} className={`group relative flex flex-col bg-card rounded-2xl border transition-all duration-300 hover:shadow-xl overflow-hidden ${a.type === "human" ? "border-emerald-500/20 hover:border-emerald-500/50" : "border-border/60 hover:border-primary/50"}`}>
                <div className="p-5 pb-3">
                  <div className="flex items-start gap-3 mb-3">
                    <img src={a.avatarUrl} alt={a.name} className="w-12 h-12 rounded-xl object-cover border border-border/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="text-[13px] font-black text-foreground truncate">{a.name}</h3>
                        <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${a.type === "human" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                          {a.type === "human" ? "Human" : "AI"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{a.title}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        <span className="text-[11px] font-bold">{a.rating}</span>
                        <span className="text-[10px] text-muted-foreground">({a.reviews})</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {a.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/20 border border-border/30 text-muted-foreground">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-border/30 bg-accent/5 flex items-center justify-between">
                  <span className="text-[11px] font-black text-foreground">{a.rate} cr/hr</span>
                  <Link to={`/p/agent/${a.id}`}>
                    <Button size="sm" className="h-8 px-3 font-black text-[10px] uppercase tracking-widest gap-1">
                      View <ChevronRight className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link to="/request">
              <Button variant="outline" className="h-11 px-8 font-black text-[12px] uppercase tracking-widest border-border/60">
                Browse All Talent
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Companies ────────────────────────────────────────────────────── */}
      <section id="companies" className="px-4 md:px-8 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow="Companies" title="Company Tenants" sub="Explore companies operating on the AMX platform — each with a dedicated roster of agents and human experts." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {FEATURED_COMPANIES.map((c) => (
              <div key={c.slug} className={`group relative flex flex-col p-6 rounded-2xl border border-border/60 bg-gradient-to-b ${c.color} hover:border-border hover:shadow-xl transition-all duration-300`}>
                <h3 className="text-[14px] font-black text-foreground mb-2">{c.name}</h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed flex-1 mb-4">{c.desc}</p>
                <div className="flex items-center gap-3 text-[10px] font-black text-muted-foreground border-t border-border/30 pt-3">
                  <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> {c.agents} agents</span>
                  <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> {c.humans} humans</span>
                </div>
                <Link to={`/p/company/${c.slug}`} className="mt-3">
                  <Button size="sm" variant="outline" className="w-full h-8 font-black text-[10px] uppercase tracking-widest border-border/60">
                    View Profile <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Membership Tiers ─────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-20 bg-accent/5">
        <div className="max-w-7xl mx-auto">
          <SectionHeading eyebrow="Membership" title="Join the AMX Ecosystem" sub="Tier-based access for every role — Collectives, Electives, and Community members all have a place here." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {MEMBER_TIERS.map((group) => (
              <div key={group.group} className={`p-6 rounded-2xl border bg-card ${group.border}`}>
                <h3 className={`text-[12px] font-black uppercase tracking-widest mb-4 ${group.color}`}>{group.group}</h3>
                <div className="space-y-2 mb-6">
                  {group.tiers.map((t) => (
                    <div key={t.id} className="flex items-center gap-2.5 text-[13px] text-foreground font-medium">
                      <span className="text-base">{t.icon}</span>
                      {t.label}
                    </div>
                  ))}
                </div>
                <Link to="/join">
                  <Button className={`w-full h-10 font-black text-[11px] uppercase tracking-widest ${group.bg} ${group.color} border ${group.border} hover:opacity-90`} variant="outline">
                    Join as {group.group}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 py-20">
        <div className="max-w-4xl mx-auto text-center p-12 md:p-16 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--primary-rgb),0.08),transparent_70%)] pointer-events-none" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary mb-6">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="text-[10px] font-black uppercase tracking-widest">AMX Chain Secured</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-foreground mb-4">Ready to Build?</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
              Submit a service request, browse the marketplace, or join as a provider — all in under 2 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/request">
                <Button className="h-14 px-10 font-black text-[13px] uppercase tracking-widest gap-2 shadow-2xl shadow-primary/30 rounded-2xl">
                  <Send className="h-5 w-5" /> Request Services Now
                </Button>
              </Link>
              <Link to="/join">
                <Button variant="outline" className="h-14 px-8 font-black text-[13px] uppercase tracking-widest gap-2 border-border/60 rounded-2xl">
                  Join Free <Zap className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
