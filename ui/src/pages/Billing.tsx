import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CreditCard, Coins, TrendingUp, ArrowUpRight, Loader2, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { stripeApi, type StripePrice } from "../api/stripe";
import { authApi } from "../api/auth";
import { lmsApi } from "../api/lms";
import { useNavigate } from "@/lib/router";

const TIER_DISPLAY: Record<string, { label: string; color: string }> = {
  explorer:         { label: "Explorer (Free)",     color: "text-muted-foreground" },
  learner:          { label: "Learner",             color: "text-blue-400" },
  builder:          { label: "Builder",             color: "text-purple-400" },
  ambassador:       { label: "Ambassador",          color: "text-amber-400" },
  earner:           { label: "Earner",              color: "text-green-400" },
  parent:           { label: "Parent",              color: "text-cyan-400" },
  community:        { label: "Community",           color: "text-rose-400" },
  volunteer:        { label: "Volunteer",           color: "text-muted-foreground" },
  sponsor:          { label: "Sponsor",             color: "text-amber-500" },
  donor:            { label: "Donor",               color: "text-amber-400" },
  partner_free:     { label: "Partner Free",        color: "text-blue-400" },
  partner_pro:      { label: "Partner Pro",         color: "text-purple-400" },
  nonprofit_baseline:{ label: "Non-Profit Baseline", color: "text-green-400" },
  business_micro:   { label: "Business Micro",      color: "text-cyan-400" },
  dropin_pass:      { label: "Drop-In Pass",        color: "text-orange-400" },
  member_weekly:    { label: "Weekly Member",       color: "text-blue-400" },
  access_hub:       { label: "Access Hub",          color: "text-amber-400" },
};

function fmtAmount(amount: number, interval: string): string {
  if (amount === 0) return "Free";
  const dollars = (amount / 100).toFixed(2);
  if (interval === "one_time") return `$${dollars}`;
  if (interval === "week") return `$${dollars}/wk`;
  if (interval === "year") return `$${dollars}/yr`;
  return `$${dollars}/mo`;
}

export function Billing() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  useEffect(() => {
    setBreadcrumbs([{ label: "Billing" }]);
  }, [setBreadcrumbs]);

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: queryKeys.lms.dashboard(selectedCompanyId!),
    queryFn: () => lmsApi.getDashboard(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: pricesData, isLoading: pricesLoading } = useQuery({
    queryKey: queryKeys.stripe.prices(selectedCompanyId!),
    queryFn: () => stripeApi.getPrices(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => authApi.getSession(),
  });

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
    },
  });

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Select a company.</div>;
  }

  const isLoading = dashLoading || pricesLoading;
  const creditBalance = dashboard?.userCredits ?? 0;
  const tokenBalance = dashboard?.tokenBalance ?? 0;
  const currentStage = dashboard?.progressionStage ?? "explorer";
  const prices = pricesData?.prices ?? [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Billing & Credits
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Plan, credits, and subscription management</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading billing info…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-black/60 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Plan</div>
              <div className={`text-xl font-bold ${TIER_DISPLAY[currentStage]?.color ?? "text-foreground"}`}>
                {TIER_DISPLAY[currentStage]?.label ?? currentStage}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 text-[11px] gap-1 px-0 text-primary"
                onClick={() => navigate("/pricing")}
              >
                Upgrade <ArrowUpRight className="h-3 w-3" />
              </Button>
            </div>
            <div className="bg-black/60 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                <Coins className="h-3 w-3" /> Credits
              </div>
              <div className="text-xl font-bold">{creditBalance.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">SIMS credits</div>
            </div>
            <div className="bg-black/60 border border-white/10 rounded-xl p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Tokens
              </div>
              <div className="text-xl font-bold">{tokenBalance.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">AMX tokens</div>
            </div>
          </div>

          {prices.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Available Plans</h2>
              <div className="flex flex-col gap-2">
                {prices
                  .filter(p => p.amount > 0)
                  .sort((a, b) => a.amount - b.amount)
                  .map(price => (
                    <PriceRow
                      key={price.tier}
                      price={price}
                      currentStage={currentStage}
                      loading={checkoutMutation.isPending && checkoutMutation.variables === price.tier}
                      onUpgrade={() => checkoutMutation.mutate(price.tier)}
                    />
                  ))}
              </div>
            </div>
          )}

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <div className="font-semibold text-sm mb-1">Manage Subscription</div>
            <p className="text-xs text-muted-foreground mb-3">
              Upgrade, downgrade, or change your plan. Changes take effect immediately for free tiers.
            </p>
            <Button size="sm" onClick={() => navigate("/pricing")} className="gap-1.5">
              <TrendingUp className="h-4 w-4" /> View All Plans
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PriceRow({ price, currentStage, loading, onUpgrade }: { price: StripePrice; currentStage: string; loading: boolean; onUpgrade: () => void }) {
  const isCurrent = price.tier === currentStage;
  const display = TIER_DISPLAY[price.tier];
  return (
    <div className={`flex items-center gap-4 rounded-xl border p-3 transition-all
      ${isCurrent ? "border-primary/40 bg-primary/5" : "border-white/8 bg-black/40 hover:border-white/15"}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-sm ${display?.color ?? "text-foreground"}`}>
            {display?.label ?? price.tier}
          </span>
          {isCurrent && (
            <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> Current
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {price.memberTypes.join(", ")}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-bold text-sm">{fmtAmount(price.amount, price.interval)}</div>
      </div>
      {!isCurrent && (
        <Button size="sm" variant="outline" className="shrink-0 h-7 text-[11px] gap-1" disabled={loading} onClick={onUpgrade}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upgrade"}
        </Button>
      )}
    </div>
  );
}
