import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import {
  X, ChevronLeft, ChevronRight, Crown, Send, AlertTriangle,
  CheckCircle2, Clock, Loader2, User, GitCommit, FileText,
  Code2, Image, Globe, Zap, GitPullRequest, GitBranch,
  PackageOpen, Briefcase, ListTree, ArrowUpRight, Flag,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { issuesApi } from "@/api/issues";
import { approvalsApi } from "@/api/approvals";
import { projectsApi } from "@/api/projects";
import { agentsApi } from "@/api/agents";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Issue, IssueWorkProduct, Agent, Project } from "@paperclipai/shared";
// IssueAncestor is not re-exported from the shared index, inline the shape
interface IssueAncestor {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  projectId: string | null;
  goalId: string | null;
}

// ── Status / priority helpers ────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  backlog:     { label: "Backlog",     color: "text-muted-foreground", bg: "bg-muted/30" },
  todo:        { label: "Todo",        color: "text-blue-400",         bg: "bg-blue-400/10" },
  in_progress: { label: "In Progress", color: "text-blue-400",         bg: "bg-blue-400/10" },
  in_review:   { label: "In Review",   color: "text-amber-400",        bg: "bg-amber-400/10" },
  done:        { label: "Done",        color: "text-emerald-400",      bg: "bg-emerald-400/10" },
  blocked:     { label: "Blocked",     color: "text-red-400",          bg: "bg-red-400/10" },
  cancelled:   { label: "Cancelled",   color: "text-muted-foreground", bg: "bg-muted/30" },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "text-red-400" },
  high:     { label: "High",     color: "text-orange-400" },
  medium:   { label: "Medium",   color: "text-amber-400" },
  low:      { label: "Low",      color: "text-blue-400/70" },
};

const WP_ICON: Record<string, React.ElementType> = {
  document:        FileText,
  text:            FileText,
  code:            Code2,
  image:           Image,
  visual:          Image,
  artifact:        PackageOpen,
  preview_url:     Globe,
  runtime_service: Zap,
  pull_request:    GitPullRequest,
  pr:              GitPullRequest,
  branch:          GitBranch,
  commit:          GitCommit,
};

function wpIcon(type: string): React.ElementType {
  return WP_ICON[(type ?? "").toLowerCase()] ?? Briefcase;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: "text-muted-foreground", bg: "bg-muted/30" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

// ── Chain node types ─────────────────────────────────────────────────────────

type ChainNode =
  | { kind: "ancestor";     data: IssueAncestor }
  | { kind: "current";      data: Issue }
  | { kind: "subissue";     data: Issue }
  | { kind: "workproduct";  data: IssueWorkProduct };

const NODE_META: Record<ChainNode["kind"], { label: string; color: string; icon: React.ElementType }> = {
  ancestor:    { label: "Parent",       color: "text-violet-400",  icon: ArrowUpRight },
  current:     { label: "Work Order",   color: "text-amber-400",   icon: Flag },
  subissue:    { label: "Sub-task",     color: "text-blue-400",    icon: ListTree },
  workproduct: { label: "Deliverable",  color: "text-emerald-400", icon: CheckCircle2 },
};

// ── Individual chain card ────────────────────────────────────────────────────

function WorkOrderCard({ node, isActive }: { node: ChainNode; isActive: boolean }) {
  const meta = NODE_META[node.kind];
  const MetaIcon = meta.icon;

  // Unified field access
  const title = node.kind === "workproduct" ? node.data.title : node.data.title;
  const status = node.kind === "workproduct"
    ? node.data.status
    : (node.data as any).status ?? "";
  const summary = node.kind === "workproduct"
    ? node.data.summary
    : (node.data as any).description;
  const identifier = node.kind === "workproduct"
    ? null
    : (node.data as any).identifier ?? null;
  const assignee = node.kind === "workproduct"
    ? null
    : (node.data as any).assigneeAgentId;
  const priority = node.kind === "workproduct"
    ? null
    : (node.data as any).priority ?? null;

  // Work product specific
  const wpType = node.kind === "workproduct" ? (node.data as IssueWorkProduct).type : null;
  const wpUrl  = node.kind === "workproduct" ? (node.data as IssueWorkProduct).url  : null;
  const reviewState = node.kind === "workproduct" ? (node.data as IssueWorkProduct).reviewState : null;
  const WPIcon = wpType ? wpIcon(wpType) : null;

  const priorityCfg = priority ? (PRIORITY_CFG[priority] ?? null) : null;

  return (
    <div
      className={`
        flex flex-col gap-3 h-full rounded-2xl border p-4 sm:p-6 transition-all duration-300 overflow-y-auto
        ${isActive
          ? "border-primary/50 bg-card shadow-2xl shadow-primary/10 ring-1 ring-primary/20"
          : "border-border/40 bg-card/40 opacity-50 scale-95"
        }
      `}
    >
      {/* Node type tag */}
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${meta.color} bg-current/10`}
          style={{ background: "transparent" }}
        >
          <MetaIcon className={`h-3 w-3 ${meta.color}`} />
          <span className={meta.color}>{meta.label}</span>
        </div>
        {identifier && (
          <span className="text-[10px] font-mono text-muted-foreground/60">{identifier}</span>
        )}
        {node.kind === "current" && (
          <span className="relative flex h-1.5 w-1.5 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
          </span>
        )}
        {node.kind !== "workproduct" && status && (
          <div className="ml-auto">
            <StatusBadge status={status} />
          </div>
        )}
      </div>

      {/* Work product type icon */}
      {WPIcon && (
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-400/10">
            <WPIcon className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
            {wpType?.replace(/_/g, " ")}
          </span>
          {reviewState && reviewState !== "none" && (
            <span className={`ml-auto text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
              reviewState === "approved" ? "text-emerald-400 bg-emerald-400/10" :
              reviewState === "needs_board_review" ? "text-amber-400 bg-amber-400/10" :
              "text-red-400 bg-red-400/10"
            }`}>
              {reviewState.replace(/_/g, " ")}
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <div className="flex-1 min-h-0">
        <h3 className={`font-black leading-snug mb-2 ${isActive ? "text-xl text-foreground" : "text-base text-foreground/70"}`}>
          {title}
        </h3>

        {summary && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
            {summary}
          </p>
        )}

        {wpUrl && (
          <a
            href={wpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="h-3 w-3" />Open asset
          </a>
        )}
      </div>

      {/* Footer: priority + assignee */}
      {(priorityCfg || assignee) && (
        <div className="flex items-center gap-3 pt-3 border-t border-border/30">
          {priorityCfg && (
            <span className={`text-[10px] font-black uppercase tracking-widest ${priorityCfg.color}`}>
              ↑ {priorityCfg.label}
            </span>
          )}
          {assignee && (
            <div className="flex items-center gap-1.5 ml-auto">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
                {assignee.slice(0, 8)}…
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface CeoReviewDialogProps {
  issue: Issue;
  ceoAgent: Agent | undefined;
  companyId: string;
  onClose: () => void;
  onSent: () => void;
}

export function CeoReviewDialog({ issue, ceoAgent, companyId, onClose, onSent }: CeoReviewDialogProps) {
  const queryClient = useQueryClient();
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerW, setContainerW] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch sub-issues and work products ───────────────────────────────────
  const { data: allIssues = [] } = useQuery({
    queryKey: ["issues-all", companyId],
    queryFn: () => issuesApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: workProducts = [], isLoading: wpLoading } = useQuery({
    queryKey: ["work-products", issue.id],
    queryFn: () => issuesApi.listWorkProducts(issue.id),
    enabled: !!issue.id,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents", companyId],
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", companyId],
    queryFn: () => projectsApi.list(companyId),
    enabled: !!companyId,
  });

  const updateIssueMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => issuesApi.update(issue.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues-all", companyId] });
      queryClient.invalidateQueries({ queryKey: ["issues-active", companyId] });
    }
  });

  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  const subIssues = useMemo(
    () => (allIssues as Issue[]).filter((i) => i.parentId === issue.id),
    [allIssues, issue.id],
  );

  // ── Build chain ───────────────────────────────────────────────────────────
  const chain = useMemo<ChainNode[]>(() => {
    const nodes: ChainNode[] = [];
    if (issue.ancestors?.length) {
      for (const a of issue.ancestors) {
        nodes.push({ kind: "ancestor", data: a });
      }
    }
    nodes.push({ kind: "current", data: issue });
    for (const s of subIssues) {
      nodes.push({ kind: "subissue", data: s });
    }
    for (const w of workProducts as IssueWorkProduct[]) {
      nodes.push({ kind: "workproduct", data: w });
    }
    return nodes;
  }, [issue, subIssues, workProducts]);

  // Clamp active index when chain changes
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, chain.length - 1)));
  }, [chain.length]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goTo = useCallback((i: number) => {
    setActiveIndex(Math.max(0, Math.min(i, chain.length - 1)));
  }, [chain.length]);

  const prev = useCallback(() => goTo(activeIndex - 1), [goTo, activeIndex]);
  const next = useCallback(() => goTo(activeIndex + 1), [goTo, activeIndex]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  { e.preventDefault(); prev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.key === "Escape")     { onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onClose]);

  // ── Measure container for responsive card width ───────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerW(entry!.contentRect.width);
    });
    ro.observe(el);
    setContainerW(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  // Touch swipe (same pattern as Layout.tsx)
  const MIN_DISTANCE  = 50;
  const MAX_VERTICAL  = 75;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]!.clientX;
    touchStartY.current = e.touches[0]!.clientY;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0]!.clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0]!.clientY - touchStartY.current);
    if (dy > MAX_VERTICAL) return;
    if (dx < -MIN_DISTANCE) next();
    if (dx >  MIN_DISTANCE) prev();
  }, [next, prev]);

  // ── CEO escalation mutation ───────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: () =>
      approvalsApi.create(companyId, {
        title: `CEO Review: ${issue.title}`,
        description: `Board-escalated for CEO sign-off.\n\nIssue: ${issue.identifier ?? issue.id}\n${issue.title}`,
        requestingAgentId: issue.assigneeAgentId ?? undefined,
        issueIds: [issue.id],
        ...(ceoAgent ? { assignedToAgentId: (ceoAgent as any).id } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues-in-review"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      onSent();
      onClose();
    },
  });

  // ── Track offset calculation (responsive) ────────────────────────────────
  // Card fills the container width; gap=12px; offset shifts by one card+gap per step
  const gap   = 12;
  const cardW = containerW > 0 ? containerW : 320;
  const offsetX = -(activeIndex * (cardW + gap));

  // ── Status summary for header ─────────────────────────────────────────────
  const statusCfg = STATUS_CFG[issue.status] ?? STATUS_CFG["in_review"];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Dialog panel — bottom sheet on mobile, centered modal on desktop */}
      <div
        className="relative z-10 flex flex-col w-full max-w-4xl
          mt-auto mx-0 rounded-t-2xl
          sm:m-auto sm:mx-4 sm:rounded-2xl
          max-h-[92dvh] border border-border/60 bg-background shadow-2xl
          animate-in fade-in-0 slide-in-from-bottom-4 sm:zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 px-4 sm:px-6 py-4 sm:py-5 border-b border-border/40 bg-card/30 shrink-0">
          <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 shrink-0 mt-0.5">
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">CEO Work Order Review</span>
              {issue.identifier && (
                <span className="text-[10px] font-mono text-muted-foreground/60">{issue.identifier}</span>
              )}
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${statusCfg.color} ${statusCfg.bg}`}>
                {statusCfg.label}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-foreground leading-tight line-clamp-2">{issue.title}</h2>
            {issue.project && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{issue.project.name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Chain label row ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 sm:px-6 pt-3 sm:pt-4 pb-2 shrink-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
            Work Order Chain
          </span>
          <span className="text-[9px] text-muted-foreground/50 bg-muted/30 px-2 py-0.5 rounded font-mono">
            {activeIndex + 1} / {chain.length || "…"}
          </span>
          {wpLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40 ml-1" />}
          <div className="flex-1 h-px bg-border/30 ml-1" />
          {/* Keyboard hint */}
          <span className="hidden md:inline text-[9px] text-muted-foreground/40 font-mono">← → to navigate</span>
        </div>

        {/* ── Swipeable card track ─────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 overflow-hidden px-3 sm:px-10 py-3"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {chain.length === 0 ? (
            <div className="flex items-center justify-center h-full py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
            </div>
          ) : (
            <div
              ref={trackRef}
              className="flex h-full"
              style={{
                gap: `${gap}px`,
                transform: `translateX(${offsetX}px)`,
                transition: "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
                width: `${chain.length * (cardW + gap)}px`,
              }}
            >
              {chain.map((node, i) => (
                <div
                  key={`${node.kind}-${i}`}
                  style={{ width: `${cardW}px`, flexShrink: 0 }}
                  className="h-full"
                  onClick={() => goTo(i)}
                >
                  <WorkOrderCard node={node} isActive={i === activeIndex} />
                </div>
              ))}
            </div>
          )}

          {/* Left arrow — hidden on mobile (swipe only) */}
          {activeIndex > 0 && (
            <button
              onClick={prev}
              className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-card/80 border border-border/40 hover:bg-accent hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all shadow-lg backdrop-blur-sm"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {/* Right arrow — hidden on mobile */}
          {activeIndex < chain.length - 1 && (
            <button
              onClick={next}
              className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-card/80 border border-border/40 hover:bg-accent hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all shadow-lg backdrop-blur-sm"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* ── Progress dots ────────────────────────────────────────────────── */}
        {chain.length > 1 && (
          <div className="flex items-center justify-center gap-2 py-3 shrink-0">
            {chain.map((node, i) => {
              const meta = NODE_META[node.kind];
              return (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`rounded-full transition-all duration-200 ${
                    i === activeIndex
                      ? `w-6 h-2 ${meta.color.replace("text-", "bg-")}`
                      : "w-2 h-2 bg-border/50 hover:bg-border"
                  }`}
                  title={`${meta.label} ${i + 1}`}
                />
              );
            })}
          </div>
        )}

        {/* ── Assignee / Project Mappers ───────────────────────────────────── */}
        <div className="flex items-center gap-4 px-4 sm:px-6 py-2 border-t border-border/40 bg-card/20 shrink-0">
          {/* Project Picker */}
          <Popover open={projectOpen} onOpenChange={(open) => { setProjectOpen(open); if (!open) setProjectSearch(""); }}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent">
                {issue.projectId ? (
                  <>
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: (projects as Project[]).find(p => p.id === issue.projectId)?.color ?? "#6366f1" }} />
                    <span className="truncate max-w-[120px]">{(projects as Project[]).find(p => p.id === issue.projectId)?.name ?? issue.projectId.slice(0, 8)}</span>
                  </>
                ) : (
                  <>
                    <Briefcase className="h-3 w-3" />
                    <span>No Project</span>
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start">
              <input
                className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                placeholder="Search projects..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto">
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap"
                  onClick={() => { updateIssueMutation.mutate({ projectId: null }); setProjectOpen(false); }}
                >
                  Clear Project
                </button>
                {(projects as Project[]).filter(p => !projectSearch.trim() || p.name.toLowerCase().includes(projectSearch.toLowerCase())).map(p => (
                  <button
                    key={p.id}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap"
                    onClick={() => { updateIssueMutation.mutate({ projectId: p.id }); setProjectOpen(false); }}
                  >
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? "#6366f1" }} />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Assignee Picker */}
          <Popover open={assigneeOpen} onOpenChange={(open) => { setAssigneeOpen(open); if (!open) setAssigneeSearch(""); }}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent">
                {issue.assigneeAgentId ? (
                  <>
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">{((agents as Agent[]).find(a => a.id === issue.assigneeAgentId) as any)?.name ?? issue.assigneeAgentId.slice(0, 8)}</span>
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3" />
                    <span>Unassigned</span>
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start">
              <input
                className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                placeholder="Search assignees..."
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto">
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap"
                  onClick={() => { updateIssueMutation.mutate({ assigneeAgentId: null }); setAssigneeOpen(false); }}
                >
                  Clear Assignee
                </button>
                {(agents as Agent[]).filter((a: any) => !assigneeSearch.trim() || a.name.toLowerCase().includes(assigneeSearch.toLowerCase())).map((a: any) => (
                  <button
                    key={a.id}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 whitespace-nowrap"
                    onClick={() => { updateIssueMutation.mutate({ assigneeAgentId: a.id }); setAssigneeOpen(false); }}
                  >
                    <span className="truncate">{a.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-4 sm:px-6 py-4 border-t border-border/40 bg-card/20 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          {ceoAgent && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Crown className="h-3 w-3 text-amber-400" />
              <span>Routes to <span className="text-amber-400 font-bold">{(ceoAgent as any).name}</span></span>
            </div>
          )}

          <div className="flex items-center gap-2 sm:ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 sm:flex-none text-muted-foreground border-border/50 hover:bg-accent"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 sm:flex-none gap-2 bg-amber-500 hover:bg-amber-600 text-white font-black uppercase tracking-wider shadow-lg shadow-amber-500/20"
              disabled={sendMutation.isPending}
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Crown className="h-3.5 w-3.5" />
              )}
              Send to CEO Review
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
