import React, { useState, useMemo } from "react";
import {
  Briefcase, Search, ExternalLink, User, Activity, BarChart3,
  Clock, CheckCircle2, XCircle, AlertTriangle, FileText, Code2,
  Image, Music, Palette, BadgeCheck, ShieldCheck, ChevronRight,
  Loader2, Eye, ThumbsUp, ThumbsDown, RotateCcw, X, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { companiesApi } from "@/api/companies";
import { useCompany } from "@/context/CompanyContext";

// ── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  text:     { icon: FileText, label: "Text",   color: "text-blue-400",   bg: "bg-blue-400/10" },
  code:     { icon: Code2,    label: "Code",   color: "text-emerald-400", bg: "bg-emerald-400/10" },
  image:    { icon: Image,    label: "Image",  color: "text-violet-400", bg: "bg-violet-400/10" },
  audio:    { icon: Music,    label: "Audio",  color: "text-amber-400",  bg: "bg-amber-400/10" },
  visual:   { icon: Palette,  label: "Visual", color: "text-pink-400",   bg: "bg-pink-400/10" },
  branch:   { icon: Code2,    label: "Branch", color: "text-cyan-400",   bg: "bg-cyan-400/10" },
  pr:       { icon: Code2,    label: "PR",     color: "text-orange-400", bg: "bg-orange-400/10" },
};

function typeConfig(type: string) {
  return TYPE_CONFIG[type?.toLowerCase()] ?? { icon: Briefcase, label: type || "Asset", color: "text-muted-foreground", bg: "bg-muted/20" };
}

// ── Review state badge ────────────────────────────────────────────────────────

function ReviewBadge({ state }: { state: string }) {
  const cfg =
    state === "approved"  ? { icon: CheckCircle2, label: "Approved",  cls: "text-emerald-500 bg-emerald-500/10" } :
    state === "rejected"  ? { icon: XCircle,      label: "Flagged",   cls: "text-red-500 bg-red-500/10" } :
    state === "pending"   ? { icon: AlertTriangle, label: "In Review", cls: "text-amber-500 bg-amber-500/10" } :
                            { icon: Eye,           label: "Unreviewed", cls: "text-muted-foreground bg-muted/20" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${cfg.cls}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

// ── Content preview (inside popup) ───────────────────────────────────────────

function ContentPreview({ dl }: { dl: any }) {
  const type = dl.type?.toLowerCase();

  if (type === "image" && dl.url) {
    return <img src={dl.url} alt={dl.title} className="w-full rounded-lg border border-border/40 max-h-80 object-contain" />;
  }
  if (type === "code" && dl.summary) {
    return (
      <pre className="bg-muted/30 rounded-lg border border-border/40 p-4 text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-80">
        {dl.summary}
      </pre>
    );
  }
  if (dl.summary) {
    return (
      <div className="prose prose-sm prose-invert max-w-none bg-muted/20 rounded-lg border border-border/40 p-4 max-h-80 overflow-y-auto">
        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{dl.summary}</p>
      </div>
    );
  }
  if (dl.url) {
    return (
      <a href={dl.url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-primary hover:underline">
        <ExternalLink className="h-4 w-4" />{dl.url}
      </a>
    );
  }
  return <p className="text-sm text-muted-foreground italic">No content preview available — asset may be attached externally.</p>;
}

// ── Review popup dialog ────────────────────────────────────────────────────────

function DeliverableDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: dl, isLoading } = useQuery({
    queryKey: ["deliverable-detail", id],
    queryFn: () => companiesApi.getDeliverableDetail(id),
    enabled: !!id,
  });

  const reviewMutation = useMutation({
    mutationFn: (data: { reviewState?: string; healthStatus?: string }) =>
      companiesApi.reviewDeliverable(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverable-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
    },
  });

  const cfg = dl ? typeConfig(dl.type) : typeConfig("");
  const TypeIcon = cfg.icon;

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border/60 bg-background shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        )}

        {dl && (
          <>
            {/* Header */}
            <div className="flex items-start gap-4 p-6 border-b border-border/40">
              <div className={`p-2.5 rounded-xl shrink-0 ${cfg.bg}`}>
                <TypeIcon className={`h-5 w-5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-muted-foreground text-[10px]">·</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{dl.issueIdentifier}</span>
                  {dl.isPrimary && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">PRIMARY</span>
                  )}
                </div>
                <h2 className="text-lg font-black text-foreground leading-tight">{dl.title}</h2>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{dl.issueTitle}</p>
              </div>
              <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Meta row */}
            <div className="grid grid-cols-3 gap-px bg-border/30 border-b border-border/40">
              {[
                { label: "Agent", value: dl.agentName ?? "Unassigned", icon: User },
                { label: "Project", value: dl.projectName ?? "—", icon: Tag },
                { label: "Status", value: dl.issueStatus ?? "—", icon: Activity },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex flex-col gap-0.5 px-4 py-3 bg-background">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <Icon className="h-3 w-3" />{label}
                  </span>
                  <span className="text-sm font-semibold text-foreground truncate">{value}</span>
                </div>
              ))}
            </div>

            {/* Content preview */}
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Asset Preview</span>
                {dl.url && (
                  <a href={dl.url} target="_blank" rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />Open
                  </a>
                )}
              </div>
              <ContentPreview dl={dl} />
            </div>

            {/* Chain + Audit */}
            {(dl.certificateFootprint || dl.auditStatus) && (
              <div className="px-6 pb-4 flex items-center gap-3 flex-wrap">
                {dl.certificateFootprint && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-lg">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    <span className="font-mono truncate max-w-[180px]">{dl.certificateFootprint}</span>
                  </div>
                )}
                {dl.auditStatus && (
                  <div className="flex items-center gap-1.5 text-xs text-violet-400 bg-violet-400/10 px-3 py-1.5 rounded-lg">
                    <ShieldCheck className="h-3.5 w-3.5" />Audit: {dl.auditStatus}
                  </div>
                )}
              </div>
            )}

            {/* Board actions */}
            <div className="flex items-center gap-2 px-6 py-4 border-t border-border/40 bg-accent/5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-2">Board Review</span>
              <ReviewBadge state={dl.reviewState} />
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="outline"
                  className="gap-1.5 text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
                  disabled={reviewMutation.isPending || dl.reviewState === "approved"}
                  onClick={() => reviewMutation.mutate({ reviewState: "approved", healthStatus: "healthy" })}>
                  <ThumbsUp className="h-3.5 w-3.5" />Approve
                </Button>
                <Button size="sm" variant="outline"
                  className="gap-1.5 text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
                  disabled={reviewMutation.isPending}
                  onClick={() => reviewMutation.mutate({ reviewState: "pending" })}>
                  <RotateCcw className="h-3.5 w-3.5" />Revise
                </Button>
                <Button size="sm" variant="outline"
                  className="gap-1.5 text-red-400 border-red-400/30 hover:bg-red-400/10"
                  disabled={reviewMutation.isPending || dl.reviewState === "rejected"}
                  onClick={() => reviewMutation.mutate({ reviewState: "rejected", healthStatus: "unhealthy" })}>
                  <ThumbsDown className="h-3.5 w-3.5" />Flag
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Deliverable card ─────────────────────────────────────────────────────────

function DeliverableCard({ dl, onClick }: { dl: any; onClick: () => void }) {
  const cfg = typeConfig(dl.type);
  const TypeIcon = cfg.icon;

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col bg-card/60 backdrop-blur-xl rounded-2xl border border-border/60 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 overflow-hidden cursor-pointer"
    >
      {/* Top color strip by type */}
      <div className={`h-0.5 w-full ${cfg.bg.replace("/10", "/40")}`} />

      <div className="p-5">
        {/* Row 1: type + date + review */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
            <TypeIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
          </div>
          <span className={`text-[10px] font-black uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
          {dl.isPrimary && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase tracking-widest">Primary</span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(dl.updatedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-foreground mb-1 group-hover:text-primary transition-colors leading-tight line-clamp-2">
          {dl.title}
        </h3>

        {/* Issue ref */}
        <p className="text-[11px] text-muted-foreground truncate mb-3">
          <span className="font-mono text-muted-foreground/60 mr-1">{dl.issueIdentifier}</span>
          {dl.issueTitle}
        </p>

        {/* Summary preview */}
        {dl.summary && (
          <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mb-3 leading-relaxed">{dl.summary}</p>
        )}

        {/* Footer row */}
        <div className="flex items-center gap-2 pt-3 border-t border-border/30">
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground truncate flex-1">{dl.agentName ?? "Unassigned"}</span>
          <ReviewBadge state={dl.reviewState} />
          {dl.certificateFootprint && (
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" title="AMX Certified" />
          )}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "text",   label: "Text" },
  { value: "code",   label: "Code" },
  { value: "image",  label: "Image" },
  { value: "audio",  label: "Audio" },
  { value: "visual", label: "Visual" },
];

export function DeliverablesBriefcase({ global = false }: { global?: boolean }) {
  const { selectedCompanyId } = useCompany();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const companyId = global ? undefined : selectedCompanyId ?? undefined;

  const { data: deliverables = [], isLoading } = useQuery({
    queryKey: ["deliverables", global ? "global" : companyId, search, typeFilter],
    queryFn: () =>
      global
        ? companiesApi.listBoardDeliverables({ search: search || undefined, type: typeFilter || undefined })
        : companiesApi.listCompanyDeliverables(companyId!, { search: search || undefined, type: typeFilter || undefined }),
    enabled: global || !!companyId,
    refetchInterval: 20_000,
  });

  const { data: metrics } = useQuery({
    queryKey: ["metrics", companyId],
    queryFn: () => companiesApi.getCompanyMetrics(companyId!),
    enabled: !global && !!companyId,
  });

  // Client-side filter for instant response while server catches up
  const filtered = useMemo(() => {
    let list = deliverables as any[];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.title?.toLowerCase().includes(q) ||
          d.issueTitle?.toLowerCase().includes(q) ||
          d.agentName?.toLowerCase().includes(q) ||
          d.issueIdentifier?.toLowerCase().includes(q),
      );
    }
    if (typeFilter) list = list.filter((d) => d.type?.toLowerCase() === typeFilter);
    return list;
  }, [deliverables, search, typeFilter]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
      {/* Metrics bar */}
      {!global && metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-2xl border border-border/40 bg-accent/5">
          {[
            { label: "Total Assets",   value: metrics.total,                          icon: Briefcase,    color: "text-foreground" },
            { label: "Throughput/mo",  value: metrics.throughput,                     icon: BarChart3,    color: "text-amber-400" },
            { label: "Avg Health",     value: `${Math.round(metrics.avgHealth * 100)}%`, icon: CheckCircle2, color: "text-emerald-400" },
            { label: "Approved",       value: metrics.statusCounts?.active ?? 0,      icon: ShieldCheck,  color: "text-primary" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                <Icon className={`h-3 w-3 ${color}`} />{label}
              </div>
              <div className={`text-2xl font-black ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + type filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Quick-find by title, agent, issue ID..."
            className="pl-10 h-11 rounded-xl bg-card border-border/60 focus:border-primary"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border/40 bg-card shrink-0">
          {TYPE_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${
                typeFilter === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {isLoading ? "Loading..." : `${filtered.length} deliverable${filtered.length !== 1 ? "s" : ""}`}
          {(search || typeFilter) && " (filtered)"}
        </span>
        {(search || typeFilter) && (
          <button onClick={() => { setSearch(""); setTypeFilter(""); }} className="text-xs text-primary hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center opacity-50">
          <div className="p-5 rounded-full bg-accent/10 mb-4">
            <Briefcase className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-black text-foreground">Briefcase is Empty</h3>
          <p className="text-muted-foreground max-w-sm mt-2 text-sm">
            {search || typeFilter ? "No deliverables match your filters." : "No deliverables yet — agents will populate this as they complete work."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((dl: any) => (
            <DeliverableCard key={dl.id} dl={dl} onClick={() => setSelectedId(dl.id)} />
          ))}
        </div>
      )}

      {/* Review popup */}
      {selectedId && <DeliverableDialog id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
