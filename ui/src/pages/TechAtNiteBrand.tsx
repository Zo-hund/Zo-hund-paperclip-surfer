import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap, Zap, Users, Star, Heart, Shield, Trophy,
  CheckCircle2, XCircle, Loader2, RefreshCw, Building2,
  DollarSign, Gift, Rocket, Crown, Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";
import { useToast } from "@/context/ToastContext";

// ── Types ────────────────────────────────────────────────────────────────────

interface TenantStatus {
  companyId: string;
  issuePrefix: string;
  created: boolean;
  catalogSeeded?: boolean;
  catalogError?: string;
}

interface StripePrice {
  tier: string;
  priceId: string;
  amount: number;
  interval: string;
  memberTypes: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const TIERS = [
  { name: "explorer",   label: "Explorer",   price: 0,     interval: "free",  icon: Globe2,       color: "text-slate-400",   badge: "Free",    desc: "Community access, AI Newsletter, Events, Discord, XR Community" },
  { name: "learner",    label: "Learner",    price: 19,    interval: "month", icon: GraduationCap,color: "text-blue-400",    badge: "Popular", desc: "AI Labs, XR Workshops, Challenges, Certificates, Portfolio" },
  { name: "builder",    label: "Builder",    price: 39,    interval: "month", icon: Zap,           color: "text-violet-400",  badge: null,      desc: "Projects, Hackathons, Innovation Labs, Portfolio Reviews, Mentorship" },
  { name: "ambassador", label: "Ambassador", price: 69,    interval: "month", icon: Users,         color: "text-emerald-400", badge: null,      desc: "Leadership, Recruitment, Community Outreach, Workshop Support, Recognition" },
  { name: "earner",     label: "Earner",     price: 99,    interval: "month", icon: Trophy,        color: "text-amber-400",   badge: null,      desc: "Paid Projects, Marketplace Access, Client Opportunities, Revenue Sharing" },
  { name: "parent",     label: "Parent",     price: 15,    interval: "month", icon: Heart,         color: "text-pink-400",    badge: null,      desc: "Family Dashboard, Progress Reports, Notifications, Parent Workshops" },
  { name: "community",  label: "Community",  price: 5,     interval: "month", icon: Globe2,        color: "text-cyan-400",    badge: null,      desc: "Innovation Challenges, Volunteer Network, Events, Digital Credentials" },
  { name: "volunteer",  label: "Volunteer",  price: 0,     interval: "month", icon: Gift,          color: "text-green-400",   badge: "Free",    desc: "Training, Scheduling, Service Hours, Certificates, Recognition" },
  { name: "sponsor",    label: "Sponsor",    price: 500,   interval: "year",  icon: Crown,         color: "text-yellow-400",  badge: "Annual",  desc: "Brand Placement, Impact Reports, Scholarships, Talent Pipeline, Executive Dashboard" },
  { name: "donor",      label: "Donor",      price: 250,   interval: "year",  icon: Star,          color: "text-orange-400",  badge: "Annual",  desc: "Community Investment, Scholarship Fund, Equipment Fund, Recognition Wall" },
];

// ── Component ────────────────────────────────────────────────────────────────

export function TechAtNiteBrand() {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [provisionDone, setProvisionDone] = useState<TenantStatus | null>(null);

  // Check if TAN company already exists by trying to list its prices
  const pricesQuery = useQuery<{ prices: StripePrice[] }>({
    queryKey: ["tan-prices"],
    queryFn: async () => {
      // We don't know the TAN companyId yet — try provision-tenant without seedStripe first
      // to get the ID, then fetch prices. For now just return empty until provisioned.
      return { prices: [] };
    },
    enabled: false,
  });

  const provisionMut = useMutation({
    mutationFn: (seedStripe: boolean) =>
      api.post<TenantStatus>("/stripe/provision-tenant", {
        name: "TECH AT NITE",
        issuePrefix: "TAN",
        description: "TECH AT NITE — Global LMS provider engine powering the Learn → Know → Do → Become lifecycle",
        seedStripe,
      }),
    onSuccess: (data) => {
      setProvisionDone(data);
      qc.invalidateQueries({ queryKey: ["tan-prices"] });
      pushToast({
        tone: "info",
        title: data.created
          ? "TECH AT NITE company created" + (data.catalogSeeded ? " + Stripe catalog seeded" : "")
          : "TECH AT NITE already exists",
      });
    },
    onError: (e: Error) => pushToast({ tone: "warn", title: e.message }),
  });

  const seedCatalogMut = useMutation({
    mutationFn: (companyId: string) =>
      api.post(`/companies/${companyId}/stripe/seed-catalog`, {}),
    onSuccess: () => {
      pushToast({ tone: "info", title: "Stripe 9-tier catalog seeded" });
      qc.invalidateQueries({ queryKey: ["tan-prices"] });
    },
    onError: (e: Error) => pushToast({ tone: "warn", title: e.message }),
  });

  return (
    <div className="space-y-8 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-orange-500/10">
              <GraduationCap className="h-6 w-6 text-orange-400" />
            </div>
            <h1 className="text-2xl font-black tracking-tight">TECH AT NITE</h1>
            <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-widest border border-orange-500/20">Brand Portal</span>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Global LMS provider engine powering the <span className="text-foreground font-medium">Learn → Know → Do → Become</span> lifecycle across all AMX AIR HUB locations.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["tan-prices"] })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Company Setup */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tenant Setup</h2>
        </div>

        {provisionDone ? (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">{provisionDone.created ? "Company created" : "Already provisioned"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Company ID: <code className="font-mono text-xs bg-muted/30 px-1 rounded">{provisionDone.companyId}</code>
                {" · "}Prefix: <code className="font-mono text-xs bg-muted/30 px-1 rounded">{provisionDone.issuePrefix}</code>
              </p>
              {provisionDone.catalogSeeded && (
                <p className="text-[11px] text-emerald-400 mt-1">9-tier Stripe catalog seeded</p>
              )}
              {provisionDone.catalogError && (
                <p className="text-[11px] text-amber-400 mt-1">Stripe unavailable — catalog not seeded ({provisionDone.catalogError})</p>
              )}
              {!provisionDone.catalogSeeded && !provisionDone.catalogError && provisionDone.created && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => seedCatalogMut.mutate(provisionDone.companyId)}
                  disabled={seedCatalogMut.isPending}
                >
                  {seedCatalogMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                  Seed Stripe Catalog Now
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Provision the TECH AT NITE company row (prefix <code className="font-mono text-xs">TAN</code>) in the database. Safe to re-run — idempotent.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => provisionMut.mutate(false)}
                disabled={provisionMut.isPending}
                variant="outline"
              >
                {provisionMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                Create Company Only
              </Button>
              <Button
                size="sm"
                onClick={() => provisionMut.mutate(true)}
                disabled={provisionMut.isPending}
              >
                {provisionMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                Create + Seed Stripe Catalog
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 9-Tier Product Catalog */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">9-Tier Product Catalog</h2>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/30">
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tier</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">Description</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Price</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Billing</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => {
                const Icon = tier.icon;
                return (
                  <tr key={tier.name} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Icon className={`h-4 w-4 shrink-0 ${tier.color}`} />
                        <div>
                          <span className="font-semibold capitalize">{tier.label}</span>
                          {tier.badge && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider">
                              {tier.badge}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground hidden md:table-cell max-w-xs">{tier.desc}</td>
                    <td className="px-4 py-3 text-right font-black tabular-nums">
                      {tier.price === 0 ? <span className="text-emerald-400">Free</span> : `$${tier.price}`}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground capitalize hidden sm:table-cell">{tier.interval}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sponsor Executive Dashboard */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Crown className="h-4 w-4 text-amber-400" />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-amber-400">Sponsor Executive Dashboard</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Annual Sponsorships", value: "$500", sub: "per sponsor / year", icon: DollarSign },
            { label: "Sponsor Benefits", value: "6 perks", sub: "Brand, Talent, Reports…", icon: Shield },
            { label: "Sponsorship Tiers", value: "4 levels", sub: "Bronze → Platinum", icon: Crown },
          ].map(({ label, value, sub, icon: Icon }) => (
            <div key={label} className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-amber-400" />
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/70">{label}</p>
              </div>
              <p className="text-xl font-black text-amber-300">{value}</p>
              <p className="text-[11px] text-amber-400/60 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {["Bronze", "Silver", "Gold", "Platinum"].map((tier, i) => (
            <div
              key={tier}
              className="rounded-lg border border-border bg-card/50 p-3 text-center"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{tier}</p>
              <p className="text-lg font-black mt-1 text-foreground">${[1000, 2500, 5000, 10000][i]!.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">annual commitment</p>
            </div>
          ))}
        </div>
      </div>

      {/* Donor Recognition Wall */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Star className="h-4 w-4 text-orange-400" />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-orange-400">Donor Recognition Wall</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Donors at <span className="font-semibold text-orange-300">$250/year</span> receive community investment recognition, scholarship fund contributions, equipment fund access, and a permanent listing on the recognition wall.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Scholarship Fund", icon: GraduationCap, desc: "Directly funds learner access for underserved communities" },
            { label: "Equipment Fund",   icon: Zap,           desc: "XR headsets, computing gear, and lab equipment" },
            { label: "Community Impact", icon: Heart,         desc: "Local programs, mentoring sessions, and events" },
          ].map(({ label, icon: Icon, desc }) => (
            <div key={label} className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-4">
              <Icon className="h-4 w-4 text-orange-400 mb-2" />
              <p className="text-xs font-black text-orange-300">{label}</p>
              <p className="text-[11px] text-orange-400/60 mt-1">{desc}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-dashed border-orange-500/30 p-4 text-center">
          <p className="text-xs text-muted-foreground">Donor names will appear here once members with the <code className="font-mono text-orange-400">donor</code> tier subscribe via Stripe.</p>
        </div>
      </div>

      {/* AI Fleet */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">AI Agent Fleet</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { code: "TAZ", domain: "Program Operations",    color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
            { code: "JAZ", domain: "Education",             color: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
            { code: "RAZ", domain: "Business & Workforce",  color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
            { code: "NAZ", domain: "Creative & Media",      color: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
            { code: "GAZ", domain: "Governance",            color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
            { code: "OPS", domain: "Infrastructure",        color: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
          ].map(({ code, domain, color }) => (
            <div key={code} className={`rounded-lg border p-3 ${color}`}>
              <p className="text-sm font-black">{code}</p>
              <p className="text-[10px] mt-0.5 opacity-70">{domain}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
