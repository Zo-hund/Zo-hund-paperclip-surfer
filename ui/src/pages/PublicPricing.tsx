/**
 * PublicPricing
 *
 * Public, session-independent storefront pricing page for one company
 * (route: hub/:companyId/pricing). Modeled on GuestMeetingJoin.tsx: data
 * comes from a dedicated unauthenticated API (publicCatalog.ts), no
 * dependency on CompanyContext/CloudAccessGate. Tier content (name, image,
 * marketing features) is whatever the company published to its Stripe
 * products, so this page works for any tenant without code changes.
 *
 * Subscribing redirects the visitor to Stripe Checkout; Stripe collects
 * their email and payment, then sends them back here with
 * ?checkout=success|canceled.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import { publicCatalogApi, type PublicCatalog, type PublicCatalogTier } from "../api/publicCatalog";
import { Button } from "@/components/ui/button";

function formatPrice(amount: number, currency: string): string {
  const dollars = amount / 100;
  const formatted = Number.isInteger(dollars) ? dollars.toLocaleString() : dollars.toFixed(2);
  return `${currency.toLowerCase() === "usd" ? "$" : `${currency.toUpperCase()} `}${formatted}`;
}

function intervalLabel(interval: string): string {
  switch (interval) {
    case "month": return "/mo";
    case "year": return "/yr";
    case "week": return "/wk";
    default: return "";
  }
}

/** Brand-colored logo tile: company logo image when set, monogram fallback. */
function CompanyMark({ catalog }: { catalog: PublicCatalog }) {
  const brand = catalog.brandColor ?? undefined;
  if (catalog.logoUrl) {
    return (
      <img
        src={catalog.logoUrl}
        alt={catalog.companyName}
        className="h-14 w-14 rounded-xl border border-border bg-background object-contain p-1.5"
        style={brand ? { borderColor: brand } : undefined}
      />
    );
  }
  const initial = catalog.companyName.trim().charAt(0).toUpperCase();
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted text-2xl font-bold"
      style={brand ? { borderColor: brand, color: brand } : undefined}
    >
      {initial}
    </div>
  );
}

function TierCard({
  tier,
  brandColor,
  onSubscribe,
  subscribing,
}: {
  tier: PublicCatalogTier;
  brandColor: string | null;
  onSubscribe: () => void;
  subscribing: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {tier.imageUrl && (
        <img src={tier.imageUrl} alt={tier.name} className="aspect-square w-full object-cover" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold">{tier.name}</h2>
          {tier.description && <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>}
        </div>
        <div className="text-3xl font-bold">
          {formatPrice(tier.amount, tier.currency)}
          <span className="text-sm font-normal text-muted-foreground">{intervalLabel(tier.interval)}</span>
        </div>
        {tier.features.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-sm">
            {tier.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  style={brandColor ? { color: brandColor } : undefined}
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto pt-2">
          <Button
            className="w-full"
            disabled={subscribing}
            onClick={onSubscribe}
            style={brandColor ? { backgroundColor: brandColor } : undefined}
          >
            {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PublicPricing() {
  const params = useParams();
  const companyId = (params.companyId ?? "").trim();
  const [searchParams] = useSearchParams();
  const checkoutOutcome = searchParams.get("checkout");
  const [pendingTier, setPendingTier] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["public-catalog", companyId],
    queryFn: () => publicCatalogApi.catalog(companyId),
    enabled: companyId.length > 0,
    retry: false,
  });

  const checkoutMutation = useMutation({
    mutationFn: (tierName: string) => publicCatalogApi.checkout(companyId, tierName),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onSettled: () => setPendingTier(null),
  });

  if (catalogQuery.isLoading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">Loading plans…</div>;
  }

  if (catalogQuery.error || !catalogQuery.data) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Page not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This pricing page doesn't exist or is no longer available.
          </p>
        </div>
      </div>
    );
  }

  const catalog = catalogQuery.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {checkoutOutcome === "success" && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
          <span>
            You're subscribed! A receipt was sent to your email — {catalog.companyName} will be in touch with next
            steps.
          </span>
        </div>
      )}
      {checkoutOutcome === "canceled" && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <XCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span>Checkout canceled — no charge was made.</span>
        </div>
      )}

      <header className="mb-8 flex items-center gap-4">
        <CompanyMark catalog={catalog} />
        <div>
          <h1 className="text-2xl font-bold">{catalog.companyName}</h1>
          <p className="text-sm text-muted-foreground">Choose the membership that fits how you work.</p>
        </div>
      </header>

      {catalog.tiers.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No plans are available yet — check back soon.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.tiers.map((tier) => (
            <TierCard
              key={tier.tier}
              tier={tier}
              brandColor={catalog.brandColor}
              subscribing={pendingTier === tier.tier}
              onSubscribe={() => {
                setPendingTier(tier.tier);
                checkoutMutation.mutate(tier.tier);
              }}
            />
          ))}
        </div>
      )}

      {checkoutMutation.error && (
        <p className="mt-4 text-sm text-destructive">{(checkoutMutation.error as Error).message}</p>
      )}
    </div>
  );
}
