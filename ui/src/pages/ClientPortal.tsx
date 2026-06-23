import React, { useState, useMemo } from "react";
import { useParams, Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import {
  Search, User, ExternalLink, Loader2, Briefcase,
  CheckCircle2, XCircle, AlertTriangle, ChevronRight, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PublicLayout, MembershipGate } from "@/components/PublicLayout";
import { companiesApi } from "@/api/companies";
import { ContentPreview } from "@/components/ContentPreview";
import { LiveKitReviewButton } from "@/components/LiveKitReviewButton";
import { typeConfig, OPPRRC_FOLDERS, folderForType, type OpprcFolder } from "@/lib/opprrc";

function ReviewBadge({ state }: { state: string }) {
  const cfg =
    state === "approved"           ? { icon: CheckCircle2,  label: "Approved",   cls: "text-emerald-500 bg-emerald-500/10" } :
    state === "changes_requested"  ? { icon: XCircle,       label: "Revise",     cls: "text-red-500 bg-red-500/10" } :
    state === "needs_board_review" ? { icon: AlertTriangle, label: "In review",  cls: "text-amber-500 bg-amber-500/10" } :
    null;
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.cls}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

export function ClientPortal() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<OpprcFolder>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal", companySlug, search],
    queryFn: () => companiesApi.getPublicPortal(companySlug!, { search: search || undefined }),
    enabled: !!companySlug,
    refetchInterval: 30_000,
  });

  const company = data?.company;
  const deliverables = data?.deliverables ?? [];

  const filtered = useMemo(() => {
    if (!activeFolder) return deliverables;
    const folderDef = OPPRRC_FOLDERS.find((f) => f.folder === activeFolder);
    if (!folderDef || folderDef.types.length === 0) return deliverables;
    return deliverables.filter((d: any) => (folderDef.types as readonly string[]).includes(d.type?.toLowerCase()));
  }, [deliverables, activeFolder]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { "": deliverables.length };
    for (const f of OPPRRC_FOLDERS) {
      if (f.folder) counts[f.folder] = deliverables.filter((d: any) => folderForType(d.type) === f.folder).length;
    }
    return counts;
  }, [deliverables]);

  const selected = selectedId ? deliverables.find((d: any) => d.id === selectedId) : null;

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    );
  }

  if (error || !company) {
    return (
      <PublicLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Briefcase className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Portal not found. Check the company slug.</p>
        </div>
      </PublicLayout>
    );
  }

  const brandColor = company.brandColor || "#3b82f6";

  return (
    <PublicLayout>
      <div style={{ "--portal-brand": brandColor } as React.CSSProperties}>
        {/* ── Branded Header ── */}
        <div className="border-b border-border/40 bg-background/80 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="flex items-center gap-4">
              {company.logoUrl && (
                <img src={company.logoUrl} alt={company.name} className="h-14 w-14 rounded-xl border border-border/40 object-contain bg-background p-1" />
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
                <p className="text-sm text-muted-foreground mt-1">{company.description || "OPPRRC Client Portal"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
              <span style={{ color: brandColor }} className="font-semibold">{deliverables.length} deliverables</span>
              <span>·</span>
              <span>{deliverables.filter((d: any) => d.reviewState === "approved").length} approved</span>
              <span>·</span>
              <span>{deliverables.filter((d: any) => d.reviewState === "needs_board_review").length} in review</span>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-6">
          <MembershipGate requiredTiers={["business", "enterprise", "education", "sponsor"]} label="Deliverable portal access">
            {/* ── Search + Filters ── */}
            <div className="flex items-center gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search deliverables..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Link to={`/request?company=${companySlug}`}>
                <Button size="sm" className="gap-1 h-9" style={{ background: brandColor }}>
                  <Plus className="h-3.5 w-3.5" /> Request work order
                </Button>
              </Link>
            </div>

            {/* ── OPPRRC Folder Tabs ── */}
            <div className="flex flex-wrap gap-1.5 mb-6">
              {OPPRRC_FOLDERS.map((f) => {
                const isActive = activeFolder === f.folder;
                const count = folderCounts[f.folder] ?? 0;
                return (
                  <button
                    key={f.folder || "all"}
                    onClick={() => setActiveFolder(f.folder as OpprcFolder)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    <span>{f.icon}</span>
                    <span>{f.label}</span>
                    <span className="opacity-60">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* ── Deliverable Grid ── */}
            <div className="grid gap-3">
              {filtered.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No deliverables in this category yet.
                </div>
              )}
              {filtered.map((dl: any) => {
                const tc = typeConfig(dl.type);
                const Icon = tc.icon;
                const isOpen = selectedId === dl.id;
                return (
                  <div key={dl.id} className="border border-border/40 rounded-xl bg-card/50 hover:bg-card/80 transition-colors">
                    <button
                      onClick={() => setSelectedId(isOpen ? null : dl.id)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3"
                    >
                      <div className={`shrink-0 p-2 rounded-lg ${tc.bg}`}>
                        <Icon className={`h-4 w-4 ${tc.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{dl.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.color} font-medium`}>{tc.label}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">
                            {dl.agentId ? (
                              <Link to={`/p/agent/${dl.agentId}`} className="hover:text-primary" onClick={(e) => e.stopPropagation()}>
                                {dl.agentName ?? "Agent"}
                              </Link>
                            ) : "Board"}
                          </span>
                          <ReviewBadge state={dl.reviewState} />
                          {dl.issueIdentifier && (
                            <span className="text-[10px] text-muted-foreground/60">{dl.issueIdentifier}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground/40 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
                        <ContentPreview dl={dl} />
                        <div className="flex items-center justify-between">
                          <LiveKitReviewButton slug={companySlug!} deliverableId={dl.id} deliverableTitle={dl.title} />
                          {dl.url && (
                            <a href={dl.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="h-3 w-3" /> Open asset
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </MembershipGate>
        </div>
      </div>
    </PublicLayout>
  );
}
