/**
 * PublicCatalogDirectory
 *
 * Public, session-independent cross-company product/service catalog:
 * aggregates active Stripe subscription tiers and public marketplace
 * listings from every company that has opted in to the public directory.
 * Modeled on PublicPricing.tsx / PublicCompanyDirectory.tsx.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { directoryApi, type PublicCatalogItem, type PublicCatalogItemKind } from "../api/directory";

const KIND_LABELS: Record<PublicCatalogItemKind, string> = {
  subscription_tier: "Membership",
  marketplace_listing: "Service",
};

function CatalogCard({ item }: { item: PublicCatalogItem }) {
  return (
    <Link
      to={`/hub/${item.companyId}/pricing`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition hover:border-foreground/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {item.companyPrefix}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {KIND_LABELS[item.kind]}
        </span>
      </div>
      <div>
        <h2 className="text-base font-semibold">{item.name}</h2>
        <p className="text-xs text-muted-foreground">{item.companyName}</p>
      </div>
      {item.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
      )}
      <span className="mt-auto text-lg font-bold">{item.priceLabel}</span>
    </Link>
  );
}

export function PublicCatalogDirectory() {
  const [kindFilter, setKindFilter] = useState<PublicCatalogItemKind | "all">("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  const catalogQuery = useQuery({
    queryKey: ["public-directory-catalog", kindFilter],
    queryFn: () =>
      directoryApi.getPublicCatalog(kindFilter === "all" ? undefined : { kind: kindFilter }),
    retry: false,
  });

  const items = catalogQuery.data?.items ?? [];

  const companyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) seen.set(item.companyId, item.companyName);
    return Array.from(seen.entries());
  }, [items]);

  const visibleItems = useMemo(
    () => (companyFilter === "all" ? items : items.filter((item) => item.companyId === companyFilter)),
    [items, companyFilter],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6 flex items-center gap-3">
        <ShoppingBag className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Product &amp; Service Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Browse memberships and services across every public company.
          </p>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as PublicCatalogItemKind | "all")}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
        >
          <option value="all">All kinds</option>
          <option value="subscription_tier">Memberships</option>
          <option value="marketplace_listing">Services</option>
        </select>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
        >
          <option value="all">All companies</option>
          {companyOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {catalogQuery.isLoading && (
        <div className="text-sm text-muted-foreground">Loading catalog…</div>
      )}

      {catalogQuery.error && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-destructive">
          Could not load the catalog — try again later.
        </div>
      )}

      {catalogQuery.data && visibleItems.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing matches this filter yet — check back soon.
        </div>
      )}

      {visibleItems.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
            <CatalogCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
