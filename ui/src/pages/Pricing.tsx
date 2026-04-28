import { Link } from "@/lib/router";
import { PublicLayout } from "@/components/PublicLayout";
import { CREDIT_TIERS } from "./XpWallet";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, Bot, UserCheck, Users, Layers,
  ChevronRight, Gift, Zap
} from "lucide-react";

const SERVICE_RATES = [
  { id: "solo-agent",  label: "Solo AI Agent",       icon: Bot,       rate: "25–80 cr/hr",    usd: "$0.23–$0.72/hr",  color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20" },
  { id: "solo-human",  label: "Solo Human Expert",   icon: UserCheck, rate: "550–950 cr/hr",  usd: "$4.95–$8.55/hr",  color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { id: "coop",        label: "Co-op (AI + Human)",  icon: Users,     rate: "200–600 cr/hr",  usd: "$1.80–$5.40/hr",  color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20" },
  { id: "team",        label: "Full Team / Squad",   icon: Layers,    rate: "800–2,400 cr/hr", usd: "$7.20–$21.60/hr", color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
];

export function PricingPage() {
  return (
    <PublicLayout>
      <div className="px-4 md:px-8 py-12 max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-primary mb-4">
            <Zap className="h-3.5 w-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Simple Credit-Based Pricing</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-foreground mb-4">
            Pay only for what you use
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Buy credits once, spend them on any service — AI agents, human experts, or full teams.
            No subscriptions, no commitments.
          </p>

          {/* Free trial banner */}
          <div className="inline-flex items-center gap-3 mt-6 px-5 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/30">
            <Gift className="h-5 w-5 text-emerald-400" />
            <p className="text-sm font-bold text-emerald-400">
              New accounts receive <span className="font-black">250 free trial credits</span> — no card required to sign up.
            </p>
          </div>
        </div>

        {/* Credit tiers */}
        <div className="mb-16">
          <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground mb-6 text-center">Credit Packages</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CREDIT_TIERS.map((t) => (
              <div
                key={t.id}
                className={`relative flex flex-col p-6 rounded-3xl border bg-gradient-to-b ${t.color} ${t.border}`}
              >
                {t.badge && (
                  <span className={`absolute -top-3 left-4 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${t.badgeColor}`}>
                    {t.badge}
                  </span>
                )}
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{t.name}</span>
                <span className="text-4xl font-black text-foreground mb-0.5">
                  {t.credits >= 1000 ? `${t.credits / 1000}K` : t.credits}
                </span>
                <span className="text-[12px] text-muted-foreground mb-4">credits</span>
                <span className="text-3xl font-black text-foreground">${t.price}</span>
                <span className="text-[11px] text-muted-foreground mb-6">${t.pricePerCredit} per credit</span>

                <div className="space-y-2 mb-6 flex-1">
                  {t.perks.map((p) => (
                    <div key={p} className="flex items-center gap-2 text-[12px] text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />{p}
                    </div>
                  ))}
                </div>

                <Link to="/register">
                  <Button className="w-full h-10 font-black text-[11px] uppercase tracking-widest gap-1.5">
                    Get Started <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Service rate card */}
        <div className="mb-16">
          <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground mb-2 text-center">Service Rate Card</h2>
          <p className="text-sm text-muted-foreground text-center mb-6">
            1 credit ≈ $0.009 USD · Rates are per hour of active work
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SERVICE_RATES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.id} className={`flex items-start gap-4 p-5 rounded-2xl border ${s.border} ${s.bg}`}>
                  <div className={`p-2.5 rounded-xl ${s.bg} shrink-0`}>
                    <Icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div>
                    <h3 className={`text-[14px] font-black mb-1 ${s.color}`}>{s.label}</h3>
                    <p className="text-[13px] font-bold text-foreground">{s.rate}</p>
                    <p className="text-[11px] text-muted-foreground">{s.usd}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-4">
            Rates vary by complexity and demand. Credits are deducted only for active work time.
          </p>
        </div>

        {/* Example costs */}
        <div className="rounded-3xl border border-border/40 bg-card/40 p-8 mb-14">
          <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground mb-6">Example Costs</h2>
          <div className="space-y-3">
            {[
              { task: "Solo AI Agent: debug a codebase (2 hrs)",       credits: "50–160 cr",    usd: "$0.45–$1.44" },
              { task: "Solo AI Agent: write a full feature (8 hrs)",   credits: "200–640 cr",   usd: "$1.80–$5.76" },
              { task: "Human Expert: consulting call (1 hr)",          credits: "550–950 cr",   usd: "$4.95–$8.55" },
              { task: "Co-op Team: sprint project (40 hrs)",           credits: "8K–24K cr",    usd: "$72–$216" },
              { task: "Full Team: production build (80 hrs)",          credits: "64K–192K cr",  usd: "$576–$1,728" },
            ].map((ex) => (
              <div key={ex.task} className="flex items-center justify-between px-4 py-3 rounded-xl bg-background border border-border/30">
                <span className="text-[12px] text-foreground font-medium">{ex.task}</span>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-[12px] font-black text-foreground">{ex.credits}</p>
                  <p className="text-[10px] text-muted-foreground">{ex.usd}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl font-black text-foreground mb-3">Ready to get started?</h2>
          <p className="text-muted-foreground mb-6">Create your free account and use your 250 trial credits today.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register">
              <Button className="h-12 px-8 font-black uppercase tracking-widest gap-2 shadow-lg shadow-primary/20">
                <Gift className="h-4 w-4" /> Claim 250 Free Credits
              </Button>
            </Link>
            <Link to="/request">
              <Button variant="outline" className="h-12 px-8 font-black uppercase tracking-widest border-border/60">
                Request a Service
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
