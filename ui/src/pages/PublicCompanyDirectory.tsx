/**
 * PublicCompanyDirectory
 *
 * Public, session-independent directory of every company that has opted in
 * to public visibility (companies.isPublic = true). Modeled on
 * PublicPricing.tsx: data comes from a dedicated unauthenticated API
 * (directory.ts), no dependency on CompanyContext/CloudAccessGate.
 */
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { directoryApi, type PublicDirectoryCompany } from "../api/directory";

function CompanyMark({ company }: { company: PublicDirectoryCompany }) {
  const brand = company.brandColor ?? undefined;
  if (company.logoUrl) {
    return (
      <img
        src={company.logoUrl}
        alt={company.name}
        className="h-12 w-12 rounded-xl border border-border bg-background object-contain p-1.5"
        style={brand ? { borderColor: brand } : undefined}
      />
    );
  }
  const initial = company.name.trim().charAt(0).toUpperCase();
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-xl font-bold"
      style={brand ? { borderColor: brand, color: brand } : undefined}
    >
      {initial}
    </div>
  );
}

function CompanyCard({ company }: { company: PublicDirectoryCompany }) {
  return (
    <Link
      to={`/hub/${company.id}/pricing`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition hover:border-foreground/30"
    >
      <div className="flex items-center gap-3">
        <CompanyMark company={company} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{company.name}</h2>
          {company.tagline && (
            <p className="truncate text-sm text-muted-foreground">{company.tagline}</p>
          )}
        </div>
      </div>
      {company.description && (
        <p className="line-clamp-3 text-sm text-muted-foreground">{company.description}</p>
      )}
      <span
        className="mt-auto text-sm font-medium"
        style={company.brandColor ? { color: company.brandColor } : undefined}
      >
        View plans →
      </span>
    </Link>
  );
}

export function PublicCompanyDirectory() {
  const companiesQuery = useQuery({
    queryKey: ["public-directory-companies"],
    queryFn: () => directoryApi.getPublicCompanies(),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-center gap-3">
        <Building2 className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Company Directory</h1>
          <p className="text-sm text-muted-foreground">Browse public companies and their storefronts.</p>
        </div>
      </header>

      {companiesQuery.isLoading && (
        <div className="text-sm text-muted-foreground">Loading companies…</div>
      )}

      {companiesQuery.error && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-destructive">
          Could not load the directory — try again later.
        </div>
      )}

      {companiesQuery.data && companiesQuery.data.companies.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No public companies yet — check back soon.
        </div>
      )}

      {companiesQuery.data && companiesQuery.data.companies.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {companiesQuery.data.companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}
