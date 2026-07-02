import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  GraduationCap, ArrowRight, CheckCircle2, Building2,
  Zap, Award, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { stripeApi } from "../api/stripe";
import { authApi } from "../api/auth";
import { useNavigate } from "@/lib/router";

type Tab = "learn" | "partner" | "org";

interface PlanCard {
  tier: string;
  label: string;
  amount: number;
  interval: string;
  description: string;
  features: string[];
  highlight?: boolean;
}

const LEARN_PLANS: PlanCard[] = [
  {
    tier: "dropin_pass",
    label: "Drop-In",
    amount: 2500,
    interval: "one_time",
    description: "Single-session access pass",
    features: ["1 live session", "Resource access", "Session recording"],
  },
  {
    tier: "member_weekly",
    label: "Weekly Member",
    amount: 2500,
    interval: "week",
    description: "Week-to-week membership",
    features: ["All live sessions", "Module library", "Community access", "Weekly cert stamp"],
    highlight: true,
  },
  {
    tier: "access_hub",
    label: "Access Hub",
    amount: 10000,
    interval: "week",
    description: "Premium weekly hub access",
    features: ["Everything in Weekly", "Agent copilot (JAZ)", "Priority support", "OPPRRC proof tracking", "XRT trainer block"],
  },
  {
    tier: "learner",
    label: "Learner",
    amount: 1900,
    interval: "month",
    description: "Core workshops & modules",
    features: ["Core workshops", "Module library", "200 SIMS credits", "Progress tracking"],
  },
  {
    tier: "builder",
    label: "Builder",
    amount: 3900,
    interval: "month",
    description: "Builder track — project labs",
    features: ["All Learner perks", "Project labs", "500 SIMS credits", "Builder badge path"],
    highlight: true,
  },
  {
    tier: "ambassador",
    label: "Ambassador",
    amount: 6900,
    interval: "month",
    description: "Community leadership",
    features: ["All Builder perks", "Community tools", "1000 SIMS credits", "Ambassador certification"],
  },
  {
    tier: "earner",
    label: "Earner",
    amount: 9900,
    interval: "month",
    description: "Marketplace + gig tools",
    features: ["All Ambassador perks", "Marketplace access", "2000 SIMS credits", "Revenue share"],
  },
];

const PARTNER_PLANS: PlanCard[] = [
  {
    tier: "partner_free",
    label: "Partner Free",
    amount: 0,
    interval: "month",
    description: "Skill Provider entry",
    features: ["Marketplace listing", "Revenue share (85%)", "Basic analytics", "Community access"],
  },
  {
    tier: "partner_pro",
    label: "Partner Pro",
    amount: 4900,
    interval: "month",
    description: "Premium skill provider",
    features: ["Featured listing", "Revenue share (92%)", "Full analytics", "JAZ agent copilot", "OPPRRC proof bundle"],
    highlight: true,
  },
];

const ORG_PLANS: PlanCard[] = [
  {
    tier: "community",
    label: "Community",
    amount: 500,
    interval: "month",
    description: "Community member access",
    features: ["Community portal", "Event calendar", "50 SIMS credits"],
  },
  {
    tier: "nonprofit_baseline",
    label: "Non-Profit Baseline",
    amount: 900,
    interval: "month",
    description: "Mission-driven organizations",
    features: ["LMS access", "Grant reporting", "100 SIMS credits", "OPPRRC vault"],
    highlight: true,
  },
  {
    tier: "business_micro",
    label: "Business Micro",
    amount: 2900,
    interval: "month",
    description: "Micro-business PD",
    features: ["Team training hub", "Business tools", "500 SIMS credits", "Revenue tracking"],
  },
  {
    tier: "sponsor",
    label: "Sponsor",
    amount: 50000,
    interval: "year",
    description: "Annual sponsorship",
    features: ["Full org access", "Named sponsorship", "5000 SIMS credits", "Board briefings"],
  },
];

const RUNWAY_STAGES = ["Explorer", "Learner", "Builder", "Ambassador", "Earner", "Leader"];

function fmtAmount(amount: number, interval: string): string {
  if (amount === 0) return "Free";
  const dollars = (amount / 100).toFixed(0);
  if (interval === "one_time") return `$${dollars}`;
  if (interval === "week") return `$${dollars}/wk`;
  if (interval === "year") return `$${dollars}/yr`;
  return `$${dollars}/mo`;
}

export function TanPricingPage() {
  const [tab, setTab] = useState<Tab>("learn");
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();

  const { data: pricesData, isLoading } = useQuery({
    queryKey: queryKeys.stripe.prices(selectedCompanyId ?? ""),
    queryFn: () => stripeApi.getPrices(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => authApi.getSession(),
  });

  const prices = pricesData?.prices ?? [];

  const checkoutMutation = useMutation({
    mutationFn: (tierName: string) =>
      stripeApi.createCheckout(selectedCompanyId!, {
        tierName,
        userId: session?.session.userId ?? "",
        successUrl: `${window.location.origin}/billing?success=1`,
        cancelUrl: window.location.href,
      }),
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
      else if (data.provisioned) navigate("/billing");
    },
  });

  function getPriceId(tier: string): string | undefined {
    return prices.find(p => p.tier === tier)?.priceId;
  }

  function handleSubscribe(tier: string) {
    if (!selectedCompanyId) { navigate("/billing"); return; }
    checkoutMutation.mutate(tier);
  }

  const plansByTab: Record<Tab, PlanCard[]> = {
    learn: LEARN_PLANS,
    partner: PARTNER_PLANS,
    org: ORG_PLANS,
  };

  return (
    <div className="flex flex-col gap-8 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <GraduationCap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black tracking-tight">TECH AT NITE</h1>
        </div>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Learn · Simulate · Earn Proof · Grow. Choose your runway.
        </p>
      </div>

      {/* Runway strip */}
      <div className="bg-black/60 border border-white/10 rounded-xl p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center mb-3">
          Your Runway — TAN Progression Path
        </div>
        <div className="flex items-center justify-between">
          {RUNWAY_STAGES.map((stage, i) => (
            <div key={stage} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                  ${i === 0 ? "bg-primary/20 text-primary border border-primary/40" : "bg-white/5 text-muted-foreground border border-white/10"}`}>
                  {i + 1}
                </div>
                <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">{stage}</span>
              </div>
              {i < RUNWAY_STAGES.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground/40 mx-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/8 w-fit mx-auto">
        {([["learn", "Learn Mode", GraduationCap], ["partner", "Partner Earn Mode", Zap], ["org", "Organizations", Building2]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Plans grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading pricing…
        </div>
      ) : (
        <div className={`grid gap-4 ${plansByTab[tab].length <= 2 ? "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto w-full" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
          {plansByTab[tab].map(plan => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              hasPriceId={!!getPriceId(plan.tier)}
              loading={checkoutMutation.isPending && checkoutMutation.variables === plan.tier}
              onSubscribe={() => handleSubscribe(plan.tier)}
            />
          ))}
        </div>
      )}

      {/* Reward Hub section */}
      <div className="bg-gradient-to-br from-amber-500/5 to-primary/5 border border-amber-500/15 rounded-xl p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Award className="h-5 w-5 text-amber-400" />
          <h2 className="font-bold text-lg">Reward Hub</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Earn OPPRRC Rewards, Certificates of Proof, SIMS Credits, and AMX Tokens as you progress through your runway.
        </p>
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {[
            { label: "OPPRRC Rewards", icon: "🏆" },
            { label: "Cert of Proof", icon: "📜" },
            { label: "SIMS Credits", icon: "💰" },
            { label: "AMX Tokens", icon: "⚡" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5 text-sm font-medium">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, hasPriceId, loading, onSubscribe }: { plan: PlanCard; hasPriceId: boolean; loading: boolean; onSubscribe: () => void }) {
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-4 relative transition-all
      ${plan.highlight
        ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/5"
        : "border-white/10 bg-black/40 hover:border-white/20"}`}>
      {plan.highlight && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-widest">
            Popular
          </span>
        </div>
      )}
      <div>
        <div className="font-bold text-lg">{plan.label}</div>
        <div className="text-2xl font-black mt-1">{fmtAmount(plan.amount, plan.interval)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{plan.description}</div>
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {plan.features.map(f => (
          <div key={f} className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
            <span>{f}</span>
          </div>
        ))}
      </div>
      <Button
        onClick={onSubscribe}
        disabled={loading || (!hasPriceId && plan.amount > 0)}
        size="sm"
        className={`w-full gap-1.5 ${plan.highlight ? "" : "variant-outline"}`}
        variant={plan.highlight ? "default" : "outline"}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
        {plan.amount === 0 ? "Get Started Free" : loading ? "Redirecting…" : "Subscribe"}
      </Button>
    </div>
  );
}
