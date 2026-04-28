import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Briefcase, Search, ExternalLink, User, Activity, BarChart3,
  Clock, CheckCircle2, XCircle, AlertTriangle, FileText, Code2,
  Image, Music, Palette, BadgeCheck, ShieldCheck, ChevronRight,
  Loader2, Eye, ThumbsUp, ThumbsDown, RotateCcw, X, Tag, Zap,
  GitPullRequest, GitBranch, GitCommit, Globe, PackageOpen,
  Download, FolderOpen,
} from "lucide-react";
import { getDriveFolderUrl } from "../lib/opprrc-drive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { companiesApi } from "@/api/companies";
import { useCompany } from "@/context/CompanyContext";

// ── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  // API canonical types
  document:        { icon: FileText,       label: "Document",  color: "text-blue-400",    bg: "bg-blue-400/10" },
  artifact:        { icon: PackageOpen,    label: "Artifact",  color: "text-pink-400",    bg: "bg-pink-400/10" },
  pull_request:    { icon: GitPullRequest, label: "PR",        color: "text-orange-400",  bg: "bg-orange-400/10" },
  branch:          { icon: GitBranch,      label: "Branch",    color: "text-cyan-400",    bg: "bg-cyan-400/10" },
  commit:          { icon: GitCommit,      label: "Commit",    color: "text-violet-400",  bg: "bg-violet-400/10" },
  preview_url:     { icon: Globe,          label: "Preview",   color: "text-emerald-400", bg: "bg-emerald-400/10" },
  runtime_service: { icon: Zap,            label: "Service",   color: "text-amber-400",   bg: "bg-amber-400/10" },
  // Legacy / custom agent types
  text:   { icon: FileText, label: "Text",   color: "text-blue-400",    bg: "bg-blue-400/10" },
  code:   { icon: Code2,    label: "Code",   color: "text-emerald-400", bg: "bg-emerald-400/10" },
  image:  { icon: Image,    label: "Image",  color: "text-violet-400",  bg: "bg-violet-400/10" },
  audio:  { icon: Music,    label: "Audio",  color: "text-amber-400",   bg: "bg-amber-400/10" },
  visual: { icon: Palette,  label: "Visual", color: "text-pink-400",    bg: "bg-pink-400/10" },
  pr:     { icon: GitPullRequest, label: "PR", color: "text-orange-400", bg: "bg-orange-400/10" },
};

function typeConfig(type: string) {
  return TYPE_CONFIG[type?.toLowerCase()] ?? {
    icon: Briefcase, label: type || "Asset",
    color: "text-muted-foreground", bg: "bg-muted/20",
  };
}

// ── Review state badge ────────────────────────────────────────────────────────

function ReviewBadge({ state }: { state: string }) {
  const cfg =
    state === "approved"           ? { icon: CheckCircle2,  label: "Approved",   cls: "text-emerald-500 bg-emerald-500/10" } :
    state === "changes_requested"  ? { icon: XCircle,       label: "Revise",     cls: "text-red-500 bg-red-500/10" }         :
    state === "needs_board_review" ? { icon: AlertTriangle, label: "In Review",  cls: "text-amber-500 bg-amber-500/10" }     :
    // legacy values
    state === "rejected"           ? { icon: XCircle,       label: "Flagged",    cls: "text-red-500 bg-red-500/10" }         :
    state === "pending"            ? { icon: AlertTriangle, label: "In Review",  cls: "text-amber-500 bg-amber-500/10" }     :
                                     { icon: Eye,           label: "Unreviewed", cls: "text-muted-foreground bg-muted/20" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${cfg.cls}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

// ── Done pill ─────────────────────────────────────────────────────────────────

function DonePill({ state }: { state: string }) {
  if (state === "approved") {
    return (
      <span className="done-pill-enter inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
        <CheckCircle2 className="h-3 w-3" />Done
      </span>
    );
  }
  if (state === "needs_board_review" || state === "pending") {
    return (
      <span className="done-pill-enter inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500 text-white shadow-lg shadow-amber-500/30">
        <Zap className="h-3 w-3" />In Review
      </span>
    );
  }
  return null;
}

// ── Live ticker banner ────────────────────────────────────────────────────────

function LiveTickerBanner({ items }: { items: any[] }) {
  if (!items.length) return null;

  // Double the list for seamless looping
  const doubled = [...items, ...items];

  const reviewedCount = items.filter(d => d.reviewState === "approved" || d.reviewState === "needs_board_review" || d.reviewState === "pending").length;
  const allDone = reviewedCount > 0 && reviewedCount === items.length;

  return (
    <div className="relative flex items-center overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm h-10">
      {/* Left badge */}
      <div className="shrink-0 flex items-center gap-2 px-4 h-full border-r border-border/40 bg-card/60 z-10">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 whitespace-nowrap">Live Feed</span>
      </div>

      {/* Scrolling track */}
      <div className="flex-1 overflow-hidden relative">
        <div className="briefcase-ticker flex items-center gap-0 whitespace-nowrap">
          {doubled.map((dl, i) => {
            const cfg = typeConfig(dl.type);
            const TypeIcon = cfg.icon;
            const isApproved = dl.reviewState === "approved";
            const isReview   = dl.reviewState === "needs_board_review" || dl.reviewState === "pending";
            return (
              <span
                key={`${dl.id}-${i}`}
                className="inline-flex items-center gap-2 px-4 shrink-0"
              >
                <TypeIcon className={`h-3 w-3 ${cfg.color} shrink-0`} />
                <span className="text-[11px] font-semibold text-foreground/80 max-w-[200px] truncate">{dl.title}</span>
                <span className="text-[10px] text-muted-foreground/60">·</span>
                <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">{dl.agentName ?? "Agent"}</span>
                {isApproved && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                    <CheckCircle2 className="h-2.5 w-2.5" />Done
                  </span>
                )}
                {isReview && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                    <Zap className="h-2.5 w-2.5" />In Review
                  </span>
                )}
                <span className="text-border/30 pl-4">|</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Fade masks */}
      <div className="absolute left-[120px] top-0 bottom-0 w-8 bg-gradient-to-r from-card/80 to-transparent pointer-events-none z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-card/80 to-transparent pointer-events-none z-10" />

      {/* All-done badge (right side) */}
      {allDone && (
        <div className="shrink-0 flex items-center gap-2 px-4 h-full border-l border-border/40 bg-emerald-500/10 z-10">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 whitespace-nowrap">All Reviewed</span>
        </div>
      )}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border/60 bg-background shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200"
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
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-black text-foreground leading-tight">{dl.title}</h2>
                  {(dl.reviewState === "approved" || dl.reviewState === "pending") && (
                    <DonePill state={dl.reviewState} />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{dl.issueTitle}</p>
              </div>
              <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Meta row */}
            <div className="grid grid-cols-3 gap-px bg-border/30 border-b border-border/40">
              {[
                { label: "Agent",   value: dl.agentName ?? "Unassigned", icon: User },
                { label: "Project", value: dl.projectName ?? "—",        icon: Tag },
                { label: "Status",  value: dl.issueStatus ?? "—",        icon: Activity },
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
            <div className="flex items-center flex-wrap gap-2 px-6 py-4 border-t border-border/40 bg-accent/5">
              {/* Download */}
              {(dl.url || dl.summary) && (
                <Button size="sm" variant="outline"
                  className="gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                  onClick={() => downloadDeliverable(dl)}>
                  <Download className="h-3.5 w-3.5" />Download
                </Button>
              )}
              {/* Open Drive folder */}
              <Button size="sm" variant="outline" asChild
                className="gap-1.5 text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10">
                <a href={getDriveFolderUrl(getOpprcInfo(dl.type).folder)} target="_blank" rel="noopener noreferrer">
                  <FolderOpen className="h-3.5 w-3.5" />OPPRRC Drive
                </a>
              </Button>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-auto">Board Review</span>
              <ReviewBadge state={dl.reviewState} />
              <div className="flex items-center gap-2">
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

// ── Folder path ticker (per-card) ────────────────────────────────────────────

/** Maps deliverable type to OPPRRC folder + file extension. */
function getOpprcInfo(type: string): { folder: string; folderNum: string; ext: string; color: string } {
  const t = (type ?? "").toLowerCase();
  if (["document", "text"].includes(t))
    return { folder: "01-TEXT",            folderNum: "01", ext: "md",   color: "text-blue-400/80" };
  if (["image", "artifact", "visual"].includes(t))
    return { folder: "02-IMAGE",           folderNum: "02", ext: "png",  color: "text-violet-400/80" };
  if (["video", "preview_url"].includes(t))
    return { folder: "03-VIDEO",           folderNum: "03", ext: "mp4",  color: "text-pink-400/80" };
  if (["code", "pull_request", "branch", "commit"].includes(t))
    return { folder: "04-CODE",            folderNum: "04", ext: "ts",   color: "text-emerald-400/80" };
  if (["runtime_service", "audit"].includes(t))
    return { folder: "05-SKILLS",          folderNum: "05", ext: "md",   color: "text-amber-400/80" };
  return   { folder: "MASTERS-BRIEFCASE", folderNum: "MB", ext: "md",   color: "text-cyan-400/80" };
}

/** Slugifies a title into a filename-safe string. */
function slugifyTitle(title: string): string {
  return (title ?? "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Download a deliverable — opens URL in new tab or creates a blob download from summary text. */
function downloadDeliverable(dl: any) {
  if (dl.url && dl.url.startsWith("http")) {
    window.open(dl.url, "_blank", "noopener");
    return;
  }
  if (dl.summary) {
    const ext = dl.type === "code" ? "ts" : "md";
    const slug = (dl.issueIdentifier ?? "amx") + "_" + slugifyTitle(dl.title);
    const blob = new Blob([dl.summary], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function FolderPathTicker({ dl }: { dl: any }) {
  const { folder, ext, color } = getOpprcInfo(dl.type);
  const slug = dl.issueIdentifier
    ? `${dl.issueIdentifier.toLowerCase()}_${slugifyTitle(dl.title)}`
    : slugifyTitle(dl.title);
  const filename = `${slug}.${ext}`;
  const fullPath = `AMX-AIR-HUBS-OPPRRC / ${folder} / ${filename}`;

  // Repeat to fill the scroll strip
  const display = `${fullPath}   ·   ${fullPath}   ·   ${fullPath}`;

  return (
    <a
      href={getDriveFolderUrl(folder)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="folder-path-ticker-wrap relative overflow-hidden bg-black/20 border-b border-border/20 h-5 flex items-center hover:bg-emerald-500/10 transition-colors"
      title={`Open ${fullPath} in Google Drive`}
    >
      {/* Left fade */}
      <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-black/30 to-transparent z-10 pointer-events-none" />
      {/* Scrolling path */}
      <div className="folder-path-ticker flex items-center px-3">
        <span className={`text-[9px] font-mono font-semibold ${color} select-none`}>
          {display}
        </span>
      </div>
      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black/30 to-transparent z-10 pointer-events-none" />
    </a>
  );
}

// ── Deliverable card ─────────────────────────────────────────────────────────

function DeliverableCard({ dl, onClick, index }: { dl: any; onClick: () => void; index: number }) {
  const cfg = typeConfig(dl.type);
  const TypeIcon = cfg.icon;

  return (
    <div
      onClick={onClick}
      className="briefcase-card-enter group relative flex flex-col rounded-2xl border border-border/60 bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-lg cursor-pointer"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className={`h-1 w-full ${cfg.bg.replace("/10", "/40")}`} />

      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={`rounded-lg p-1.5 ${cfg.bg}`}>
              <TypeIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest ${cfg.color}`}>{cfg.label}</span>
            {dl.isPrimary && (
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                Primary
              </span>
            )}
          </div>
          <ReviewBadge state={dl.reviewState} />
        </div>

        <h3 className="text-base font-black leading-tight text-foreground transition-colors group-hover:text-primary">
          {dl.title}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          <span className="font-mono">{dl.issueIdentifier}</span>
          {dl.issueTitle ? ` · ${dl.issueTitle}` : ""}
        </p>

        {dl.summary && (
          <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
            {dl.summary}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border/40 bg-accent/5 p-3 text-[11px]">
          <div>
            <div className="font-black uppercase tracking-widest text-muted-foreground">Agent</div>
            <div className="mt-1 truncate text-foreground">{dl.agentName ?? "Unassigned"}</div>
          </div>
          <div>
            <div className="font-black uppercase tracking-widest text-muted-foreground">Updated</div>
            <div className="mt-1 text-foreground">{new Date(dl.updatedAt).toLocaleDateString()}</div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/30 pt-4">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
              <TypeIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
            </div>
            <span>{folderForType(dl.type).toUpperCase()}</span>
          </div>

          <div className="flex items-center gap-2">
            {(dl.url || dl.summary) && (
              <button
                onClick={(e) => { e.stopPropagation(); downloadDeliverable(dl); }}
                className="flex min-h-[34px] items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary transition-colors hover:bg-primary/10"
                title="Download artifact"
              >
                <Download className="h-3 w-3" />
                Download
              </button>
            )}
            <a
              href={getDriveFolderUrl(getOpprcInfo(dl.type).folder)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex min-h-[34px] items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 transition-colors hover:bg-emerald-500/10"
              title="Open OPPRRC folder in Google Drive"
            >
              <FolderOpen className="h-3 w-3" />
              Drive
            </a>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── OPPRRC Folder Convention ─────────────────────────────────────────────────

/** Maps OPPRRC folder slugs to deliverable types, display labels, and colors. */
const OPPRRC_FOLDERS = [
  { folder: "",         label: "All",           types: [],                             icon: "📦", color: "text-foreground" },
  { folder: "text",    label: "01 · TEXT",      types: ["document", "text"],            icon: "📄", color: "text-blue-400" },
  { folder: "image",   label: "02 · IMAGE",     types: ["image", "artifact", "visual"], icon: "🖼️", color: "text-violet-400" },
  { folder: "video",   label: "03 · VIDEO",     types: ["video", "preview_url"],        icon: "🎬", color: "text-pink-400" },
  { folder: "code",    label: "04 · CODE",      types: ["code", "pull_request", "branch", "commit"], icon: "💻", color: "text-emerald-400" },
  { folder: "skills",  label: "05 · SKILLS",    types: ["runtime_service", "audit"],    icon: "🤖", color: "text-amber-400" },
  { folder: "briefcase", label: "BRIEFCASE",    types: [],                             icon: "🗂️", color: "text-cyan-400" },
] as const;

type OpprcFolder = (typeof OPPRRC_FOLDERS)[number]["folder"];

function folderForType(type: string): OpprcFolder {
  const t = (type ?? "").toLowerCase();
  for (const f of OPPRRC_FOLDERS) {
    if (f.folder === "") continue;
    if ((f.types as unknown as string[]).includes(t)) return f.folder;
  }
  return "briefcase";
}

// ── Main component ────────────────────────────────────────────────────────────

export function DeliverablesBriefcase({ global = false }: { global?: boolean }) {
  const { selectedCompanyId } = useCompany();
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter]  = useState("");
  const [folderView, setFolderView]  = useState(false);
  const [activeFolder, setActiveFolder] = useState<OpprcFolder>("");
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
    if (!folderView && typeFilter) {
      list = list.filter((d) => d.type?.toLowerCase() === typeFilter);
    }
    if (folderView && activeFolder) {
      const cfg = OPPRRC_FOLDERS.find((f) => f.folder === activeFolder);
      if (cfg && cfg.types.length > 0) {
        list = list.filter((d) => (cfg.types as unknown as string[]).includes(d.type?.toLowerCase()));
      } else if (activeFolder === "briefcase") {
        // Show anything not in TEXT/IMAGE/VIDEO/CODE/SKILLS
        const knownTypes = OPPRRC_FOLDERS.flatMap((f) => [...f.types] as string[]);
        list = list.filter((d) => !knownTypes.includes(d.type?.toLowerCase()));
      }
    }
    return list;
  }, [deliverables, search, typeFilter, folderView, activeFolder]);

  // Group by OPPRRC folder for folder view
  const groupedByFolder = useMemo(() => {
    if (!folderView) return null;
    const groups: Record<string, { cfg: typeof OPPRRC_FOLDERS[number]; items: any[] }> = {};
    for (const f of OPPRRC_FOLDERS) {
      if (f.folder === "") continue;
      groups[f.folder] = { cfg: f, items: [] };
    }
    for (const item of deliverables as any[]) {
      const fk = folderForType(item.type);
      if (groups[fk]) groups[fk].items.push(item);
    }
    return groups;
  }, [deliverables, folderView]);

  const allItems = deliverables as any[];
  const needsReview = filtered.filter((item) => item.reviewState === "needs_board_review" || item.reviewState === "pending");
  const recentDeliverables = filtered.filter((item) => !needsReview.some((reviewItem) => reviewItem.id === item.id));

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-5 duration-500">
      {/* Metrics bar */}
      {!global && metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-2xl border border-border/40 bg-accent/5">
          {[
            { label: "Total Assets",  value: metrics.total,                             icon: Briefcase,    color: "text-foreground" },
            { label: "Throughput/mo", value: metrics.throughput,                         icon: BarChart3,    color: "text-amber-400" },
            { label: "Avg Health",    value: `${Math.round(metrics.avgHealth * 100)}%`,  icon: CheckCircle2, color: "text-emerald-400" },
            { label: "Approved",      value: metrics.statusCounts?.approved ?? 0,        icon: ShieldCheck,  color: "text-primary" },
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

      {/* Live ticker — shows when there are items */}
      {!isLoading && allItems.length > 0 && (
        <LiveTickerBanner items={allItems} />
      )}

      {/* OPPRRC Folder View Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setFolderView(false); setActiveFolder(""); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${
            !folderView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          }`}
        >
          <Briefcase className="h-3 w-3" /> All Assets
        </button>
        <button
          onClick={() => { setFolderView(true); setActiveFolder(""); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${
            folderView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          }`}
        >
          <PackageOpen className="h-3 w-3" /> OPPRRC Folders
        </button>
        {!folderView && (
          <span className="text-[10px] text-muted-foreground/50 border border-border/30 rounded px-2 py-1 font-mono">v1.0 global standard</span>
        )}
      </div>

      {/* OPPRRC Folder Tabs (when folder view is active) */}
      {folderView && (
        <div className="flex flex-wrap gap-2">
          {OPPRRC_FOLDERS.map((f) => {
            const count = f.folder === ""
              ? allItems.length
              : allItems.filter((d: any) => folderForType(d.type) === f.folder).length;
            return (
              <button
                key={f.folder}
                onClick={() => setActiveFolder(f.folder)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all ${
                  activeFolder === f.folder
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/40 bg-card text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
                {count > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                    activeFolder === f.folder ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Search + type filters (flat view only) */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={folderView ? "Search within folder..." : "Quick-find by title, agent, issue ID..."}
            className="pl-10 h-11 rounded-xl bg-card border-border/60 focus:border-primary"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Count row */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {isLoading ? "Loading..." : `${filtered.length} deliverable${filtered.length !== 1 ? "s" : ""}`}
          {(search || typeFilter) && " (filtered)"}
        </span>
        {(search || typeFilter) && (
          <button
            onClick={() => { setSearch(""); setTypeFilter(""); }}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Grid — folder grouped view */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
        </div>
      ) : folderView && !activeFolder && groupedByFolder ? (
        // Show all folders with their contents
        <div className="flex flex-col gap-8">
          {OPPRRC_FOLDERS.filter((f) => f.folder !== "").map((f) => {
            const items = groupedByFolder[f.folder]?.items ?? [];
            if (items.length === 0) return null;
            return (
              <div key={f.folder}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{f.icon}</span>
                  <h3 className={`text-xs font-black uppercase tracking-widest ${f.color}`}>{f.label}</h3>
                  <span className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full font-mono">{items.length} file{items.length !== 1 ? "s" : ""}</span>
                  <div className="flex-1 h-px bg-border/30 ml-2" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.map((dl: any, i: number) => (
                    <DeliverableCard key={dl.id} dl={dl} index={i} onClick={() => setSelectedId(dl.id)} />
                  ))}
                </div>
              </div>
            );
          })}
          {allItems.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center opacity-50">
              <div className="p-5 rounded-full bg-accent/10 mb-4"><Briefcase className="h-10 w-10 text-muted-foreground" /></div>
              <h3 className="text-lg font-black text-foreground">Briefcase is Empty</h3>
              <p className="text-muted-foreground max-w-sm mt-2 text-sm">No deliverables yet — agents will populate this as they complete work.</p>
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center opacity-50">
          <div className="p-5 rounded-full bg-accent/10 mb-4">
            {folderView && activeFolder
              ? <span className="text-4xl">{OPPRRC_FOLDERS.find((f) => f.folder === activeFolder)?.icon ?? "📦"}</span>
              : <Briefcase className="h-10 w-10 text-muted-foreground" />}
          </div>
          <h3 className="text-lg font-black text-foreground">
            {folderView && activeFolder
              ? `${OPPRRC_FOLDERS.find((f) => f.folder === activeFolder)?.label} folder is empty`
              : "Briefcase is Empty"}
          </h3>
          <p className="text-muted-foreground max-w-sm mt-2 text-sm">
            {search ? "No deliverables match your search." : "No deliverables yet — agents will populate this as they complete work."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {needsReview.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-500">Needs Review</h3>
                <div className="h-px flex-1 bg-border/30" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {needsReview.map((dl: any, i: number) => (
                  <DeliverableCard key={dl.id} dl={dl} index={i} onClick={() => setSelectedId(dl.id)} />
                ))}
              </div>
            </section>
          )}

          {recentDeliverables.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-primary">Recent Deliverables</h3>
                <div className="h-px flex-1 bg-border/30" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recentDeliverables.map((dl: any, i: number) => (
                  <DeliverableCard key={dl.id} dl={dl} index={i} onClick={() => setSelectedId(dl.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Review popup */}
      {selectedId && <DeliverableDialog id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
