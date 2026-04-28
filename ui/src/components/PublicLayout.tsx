import React from "react";
import { Link, useLocation } from "@/lib/router";
import { Zap, Menu, X, Globe, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

// ── Membership tiers ──────────────────────────────────────────────────────────
export const MEMBER_TIERS = [
  {
    group: "Collectives",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    tiers: [
      { id: "skill-provider", label: "Skill Provider", icon: "⚡" },
      { id: "agent",          label: "AI Agent",        icon: "🤖" },
      { id: "human-agent",    label: "Human Agent",     icon: "🧑‍💼" },
    ],
  },
  {
    group: "Electives",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    tiers: [
      { id: "education",  label: "Education",   icon: "🎓" },
      { id: "business",   label: "Business",    icon: "💼" },
      { id: "enterprise", label: "Enterprise",  icon: "🏢" },
      { id: "sponsor",    label: "Sponsor",     icon: "🤝" },
    ],
  },
  {
    group: "Community",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    tiers: [
      { id: "learner",            label: "Learner",            icon: "📚" },
      { id: "earner",             label: "Earner",             icon: "💰" },
      { id: "parent",             label: "Parent",             icon: "👨‍👩‍👧" },
      { id: "community-partner",  label: "Community Partner",  icon: "🌍" },
      { id: "sponsored-partner",  label: "Sponsored Partner",  icon: "🌟" },
      { id: "volunteer",          label: "Volunteer",          icon: "🙌" },
      { id: "donor",              label: "Donor",              icon: "❤️" },
    ],
  },
];

// ── Tier access gates ─────────────────────────────────────────────────────────
export const canHire       = (tier: string) => ["skill-provider","agent","human-agent","business","enterprise"].includes(tier);
export const canRequest    = (tier: string) => ![""].includes(tier); // all members
export const canSponsor    = (tier: string) => ["sponsor","enterprise","community-partner","sponsored-partner","donor"].includes(tier);
export const isCollective  = (tier: string) => ["skill-provider","agent","human-agent"].includes(tier);

// ── Nav links ─────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Home",      href: "/home" },
  { label: "Agents",    href: "/home#agents" },
  { label: "Companies", href: "/home#companies" },
  { label: "Services",  href: "/request" },
  { label: "Pricing",   href: "/pricing" },
  { label: "Pass",      href: "/profile" },
];

// ── PublicNav ─────────────────────────────────────────────────────────────────
function PublicNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/30 backdrop-blur-xl bg-background/80">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/home" className="flex items-center gap-2.5 group">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/20 transition-colors">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div className="leading-none">
            <span className="text-[15px] font-black tracking-tight text-foreground">AMX</span>
            <span className="text-[10px] font-black tracking-widest text-muted-foreground uppercase block">Platform</span>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} to={l.href}
              className="px-3 py-2 rounded-lg text-[13px] font-bold text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-all">
              {l.label}
            </Link>
          ))}
        </div>

        {/* Auth CTAs */}
        <div className="hidden md:flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" className="h-9 px-4 font-black text-[12px] uppercase tracking-widest">Sign In</Button>
          </Link>
          <Link to="/register">
            <Button className="h-9 px-4 font-black text-[12px] uppercase tracking-widest gap-1.5 shadow-lg shadow-primary/20">
              Sign Up Free <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setOpen(!open)} className="md:hidden p-2 rounded-lg hover:bg-accent/10">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border/30 bg-background/95 backdrop-blur-xl px-4 py-4 space-y-1 animate-in slide-in-from-top-2 duration-200">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} to={l.href} onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-[13px] font-bold text-foreground hover:bg-accent/10">
              {l.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-2">
            <Link to="/auth" className="flex-1"><Button variant="outline" className="w-full h-10 font-black text-[11px] uppercase">Sign In</Button></Link>
            <Link to="/register" className="flex-1"><Button className="w-full h-10 font-black text-[11px] uppercase">Sign Up Free</Button></Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function PublicFooter() {
  return (
    <footer className="border-t border-border/30 bg-card/30 px-4 md:px-8 py-10 mt-20">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20"><Zap className="h-4 w-4 text-primary" /></div>
            <span className="text-[14px] font-black text-foreground">AMX Platform</span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">AI-first workforce infrastructure for agents, humans, and communities.</p>
        </div>
        {[
          { label: "Platform", links: ["Home", "Marketplace", "Services", "Pricing"] },
          { label: "Membership", links: ["Collectives", "Electives", "Community", "Join Free"] },
          { label: "Company",  links: ["About", "Contact", "Privacy", "Terms"] },
        ].map((col) => (
          <div key={col.label}>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">{col.label}</p>
            <div className="space-y-2">
              {col.links.map((l) => (
                <p key={l} className="text-[12px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors">{l}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="max-w-7xl mx-auto mt-8 pt-8 border-t border-border/30 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">© 2026 AMX Platform. Powered by AMX Chain.</p>
        <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Network
        </div>
      </div>
    </footer>
  );
}

// ── PublicLayout ──────────────────────────────────────────────────────────────
export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-page min-h-screen bg-background flex flex-col">
      <PublicNav />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

// ── MembershipGate ────────────────────────────────────────────────────────────
// Wraps any action requiring authentication/tier
export function MembershipGate({ children, requiredTiers, label = "This action" }: {
  children: React.ReactNode;
  requiredTiers?: string[];
  label?: string;
}) {
  // In dev / local_trusted mode there's no session — show gate UI
  const isAuthed = false; // TODO: wire to actual auth context

  if (!isAuthed) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-border/60 bg-card/40 text-center">
        <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
          <Globe className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-[13px] font-black text-foreground mb-1">{label} requires membership</p>
          <p className="text-[11px] text-muted-foreground">Sign in or join free to continue</p>
        </div>
        <div className="flex gap-2 w-full max-w-xs">
          <Link to="/auth" className="flex-1"><Button variant="outline" className="w-full h-10 font-black text-[11px] uppercase tracking-widest">Sign In</Button></Link>
          <Link to="/join" className="flex-1"><Button className="w-full h-10 font-black text-[11px] uppercase tracking-widest">Join Free</Button></Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
