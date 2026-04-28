import React, { useEffect, useState } from "react";
import {
  Briefcase, Activity, Users, CheckCircle2, AlertTriangle,
  Clock, DollarSign,
  Loader2, Eye, Zap,
  Star, Crown, FolderOpen,
} from "lucide-react";
import { getDriveFolderUrl } from "@/lib/opprrc-drive";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DeliverablesBriefcase } from "@/components/DeliverablesBriefcase";
import { CeoReviewDialog } from "@/components/CeoReviewDialog";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { dashboardApi } from "@/api/dashboard";
import { projectsApi } from "@/api/projects";
import { issuesApi } from "@/api/issues";
import { agentsApi } from "@/api/agents";
import { Button } from "@/components/ui/button";
import type { Project, Issue, Agent } from "@paperclipai/shared";

// ── OPPRRC folder mapping for projects ───────────────────────────────────────

function opprcFolderForProject(project: Project): { folder: string; icon: string; color: string } {
  const name = (project.name ?? "").toLowerCase();
  const desc = (project.description ?? "").toLowerCase();
  const text = `${name} ${desc}`;
  if (/code|dev|build|deploy|api|service|backend|frontend|tech/.test(text))
    return { folder: "04 · CODE", icon: "💻", color: "text-emerald-400" };
  if (/design|image|visual|brand|ui|ux|art/.test(text))
    return { folder: "02 · IMAGE", icon: "🖼️", color: "text-violet-400" };
  if (/video|media|stream|content/.test(text))
    return { folder: "03 · VIDEO", icon: "🎬", color: "text-pink-400" };
  if (/skill|agent|model|ai|train|audit/.test(text))
    return { folder: "05 · SKILLS", icon: "🤖", color: "text-amber-400" };
  if (/doc|report|write|plan|brief|proposal/.test(text))
    return { folder: "01 · TEXT", icon: "📄", color: "text-blue-400" };
  return { folder: "BRIEFCASE", icon: "🗂️", color: "text-cyan-400" };
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ label, value, icon: Icon, color, pulse }: {
  label: string; value: number | string; icon: React.ElementType; color: string; pulse?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-card/60 border border-border/40 hover:border-border/70 transition-colors">
      <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground`}>
        <Icon className={`h-3 w-3 ${color}`} />
        {label}
        {pulse && (
          <span className="relative flex h-1.5 w-1.5 ml-auto">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
        )}
      </div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}

// ── Issue → CEO review row ────────────────────────────────────────────────────

function InReviewIssueRow({
  issue,
  onReview,
}: {
  issue: Issue;
  onReview: (issue: Issue) => void;
}) {
  const statusMap: Record<string, { label: string; cls: string; dot: string }> = {
    in_review:   { label: "Review",      cls: "text-amber-400 bg-amber-400/10",   dot: "bg-amber-400" },
    in_progress: { label: "In Progress", cls: "text-blue-400 bg-blue-400/10",     dot: "bg-blue-400" },
    todo:        { label: "Todo",        cls: "text-foreground/50 bg-muted/20",   dot: "bg-muted-foreground/40" },
    done:        { label: "Done",        cls: "text-emerald-400 bg-emerald-400/10", dot: "bg-emerald-400" },
    blocked:     { label: "Blocked",     cls: "text-red-400 bg-red-400/10",       dot: "bg-red-400" },
    backlog:     { label: "Backlog",     cls: "text-muted-foreground/50 bg-muted/10", dot: "bg-muted-foreground/30" },
  };
  const s = statusMap[issue.status] ?? { label: issue.status, cls: "text-muted-foreground bg-muted/20", dot: "bg-muted-foreground/40" };

  return (
    <div className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border/30 bg-card/40 hover:bg-card/80 hover:border-amber-500/25 transition-all cursor-default">
      {/* Status dot */}
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${s.dot}`} />

      {/* Identifier */}
      <span className="shrink-0 text-[10px] font-mono text-muted-foreground/50 w-[72px] truncate">{issue.identifier}</span>

      {/* Title — takes all remaining space */}
      <span className="flex-1 text-[12px] font-medium text-foreground/90 truncate leading-tight">{issue.title}</span>

      {/* Project tag (hidden on small) */}
      {issue.project && (
        <span className="hidden md:inline-block shrink-0 text-[9px] font-mono text-muted-foreground/40 max-w-[100px] truncate">
          {issue.project.name}
        </span>
      )}

      {/* Status chip */}
      <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${s.cls} hidden sm:inline-block`}>
        {s.label}
      </span>

      {/* Review button — appears on hover */}
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 h-6 px-2 gap-1 text-amber-400 hover:bg-amber-400/10 text-[10px] font-black uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onReview(issue)}
      >
        <Crown className="h-3 w-3" />
        <span>Review</span>
      </Button>
    </div>
  );
}

// ── Completed project card ────────────────────────────────────────────────────

function CompletedProjectCard({ project, index }: { project: Project; index: number }) {
  const opprrc = opprcFolderForProject(project);
  const completedAt = project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "—";

  return (
    <div
      className="briefcase-card-enter flex flex-col gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 hover:bg-emerald-500/8 transition-all"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Folder badge */}
      <div className="flex items-center gap-2">
        <span className="text-base">{opprrc.icon}</span>
        <span className={`text-[9px] font-black uppercase tracking-widest ${opprrc.color}`}>{opprrc.folder}</span>
        <div className="flex-1 h-px bg-border/20 ml-1" />
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      </div>

      {/* Project name */}
      <div>
        <p className="text-sm font-bold text-foreground leading-tight line-clamp-2">{project.name}</p>
        {project.description && (
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/20">
        <span className="done-pill-enter inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500 text-white">
          <CheckCircle2 className="h-2.5 w-2.5" />Done
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />{completedAt}
        </span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function formatAgentDisplayName(name?: string | null): string {
  if (!name) return "Unknown";
  return name.replace(/^\s*CEO\s*:\s*/i, "").trim();
}

export function BoardDeliverables() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId, companies } = useCompany();
  const queryClient = useQueryClient();
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [reviewingIssue, setReviewingIssue] = useState<Issue | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Master Briefcase" }]);
  }, [setBreadcrumbs]);

  // Use first available company if none selected
  const companyId = selectedCompanyId ?? companies[0]?.id ?? null;

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard", companyId],
    queryFn: () => dashboardApi.summary(companyId!),
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", companyId],
    queryFn: () => projectsApi.list(companyId!),
    enabled: !!companyId,
    refetchInterval: 60_000,
  });

  const { data: allIssues = [], isLoading: issuesLoading } = useQuery({
    queryKey: ["issues-active", companyId],
    queryFn: () => issuesApi.list(companyId!),
    enabled: !!companyId,
    refetchInterval: 15_000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents", companyId],
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });

  const ACTIVE_STATUSES = ["todo", "in_progress", "in_review", "blocked"];
  const ceoAgent = (agents as Agent[]).find((a) => (a as any).role === "ceo");
  const completedProjects = (projects as Project[]).filter((p) => p.status === "completed");
  const visibleReviewIssues = (allIssues as Issue[])
    .filter((i) => ACTIVE_STATUSES.includes(i.status) && !sentIds.has(i.id));

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8">

      {/* ── Animated header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0 flex items-center justify-center w-12 h-12">
          <span className="briefcase-ring-1 absolute inset-0 rounded-xl bg-primary/30 pointer-events-none" />
          <span className="briefcase-ring-2 absolute inset-0 rounded-xl bg-primary/20 pointer-events-none" />
          <span className="briefcase-ring-3 absolute inset-0 rounded-xl bg-primary/10 pointer-events-none" />
          <div className="relative z-10 p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30 shadow-lg shadow-primary/10">
            <Briefcase className="h-5 w-5" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">Master Briefcase</h1>
            <span className="relative flex h-2 w-2 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            All active issues · CEO escalation · OPPRRC archive
          </p>
        </div>
        {ceoAgent && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/40 bg-card/50">
            <Crown className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
              CEO: {formatAgentDisplayName((ceoAgent as any).name)}
            </span>
          </div>
        )}
        {/* OPPRRC Google Drive shortcut */}
        <a
          href={getDriveFolderUrl("_root")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors touch-manipulation"
          title="Open AMX OPPRRC folder in Google Drive"
        >
          <FolderOpen className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hidden sm:inline">OPPRRC Drive</span>
        </a>
      </div>

      {/* ── Site Status Summary ──────────────────────────────────────────── */}
      {dashboard && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Site Status</span>
            <div className="flex-1 h-px bg-border/30 ml-1" />
            <span className="text-[9px] text-muted-foreground/50 font-mono">live · 30s refresh</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <StatusChip label="Open Tasks"    value={dashboard.tasks.open}       icon={Clock}         color="text-foreground"  />
            <StatusChip label="In Progress"   value={dashboard.tasks.inProgress} icon={Activity}      color="text-blue-400"    pulse />
            <StatusChip label="Blocked"       value={dashboard.tasks.blocked}    icon={AlertTriangle} color="text-red-400"     />
            <StatusChip label="Done"          value={dashboard.tasks.done}       icon={CheckCircle2}  color="text-emerald-400" />
            <StatusChip label="Active Agents" value={dashboard.agents.active}    icon={Users}         color="text-primary"     pulse />
            <StatusChip label="Running"       value={dashboard.agents.running}   icon={Zap}           color="text-amber-400"   pulse={dashboard.agents.running > 0} />
            <StatusChip label="Approvals"     value={dashboard.pendingApprovals} icon={Eye}           color="text-amber-400"   pulse={dashboard.pendingApprovals > 0} />
            <StatusChip label="Budget Used"   value={`${Math.round(dashboard.costs.monthUtilizationPercent)}%`} icon={DollarSign} color="text-violet-400" />
          </div>
        </div>
      )}

      {/* ── Issues → CEO Review ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Issues</span>
          {visibleReviewIssues.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-black tabular-nums">
              {visibleReviewIssues.length}
            </span>
          )}
          <div className="flex-1 h-px bg-border/30 ml-1" />
          {ceoAgent && (
            <span className="text-[9px] text-muted-foreground/40 font-mono">→ {formatAgentDisplayName((ceoAgent as any).name)}</span>
          )}
        </div>

        {issuesLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
          </div>
        ) : visibleReviewIssues.length === 0 ? (
          <div className="flex items-center gap-2.5 px-3 py-3 rounded-lg border border-dashed border-border/30 text-muted-foreground/40">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/50 shrink-0" />
            <span className="text-xs">All clear — no active issues.</span>
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
            {/* Column headers */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 border-b border-border/30 bg-muted/10">
              <span className="w-1.5 shrink-0" />
              <span className="w-[72px] shrink-0 text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">ID</span>
              <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">Title</span>
              <span className="hidden md:block w-[100px] shrink-0 text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">Project</span>
              <span className="hidden sm:block text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 pr-1">Status</span>
              <span className="w-[70px] shrink-0" />
            </div>
            {/* Scrollable list — shows ~4 rows before scrolling */}
            <div className="flex flex-col divide-y divide-border/20 max-h-[136px] overflow-y-auto scrollbar-auto-hide">
              {visibleReviewIssues.map((issue) => (
                <InReviewIssueRow
                  key={issue.id}
                  issue={issue}
                  onReview={setReviewingIssue}
                />
              ))}
            </div>
            {/* Scroll hint when > 4 items */}
            {visibleReviewIssues.length > 4 && (
              <div className="px-3 py-1.5 border-t border-border/30 bg-muted/10 text-center">
                <span className="text-[9px] text-muted-foreground/40 font-mono">
                  {visibleReviewIssues.length} issues · scroll to see all
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Completed Projects → OPPRRC ──────────────────────────────────── */}
      {completedProjects.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Completed Projects</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-black">
              {completedProjects.length}
            </span>
            <div className="flex-1 h-px bg-border/30 ml-1" />
            <span className="text-[9px] text-muted-foreground/50 font-mono">filed to OPPRRC</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {completedProjects.map((project, i) => (
              <CompletedProjectCard key={project.id} project={project} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Deliverables Briefcase ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Briefcase className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">All Agent Deliverables</span>
          <div className="flex-1 h-px bg-border/30 ml-1" />
        </div>
        <DeliverablesBriefcase global={false} />
      </div>

      {/* ── CEO Review Dialog ────────────────────────────────────────────── */}
      {reviewingIssue && companyId && (
        <CeoReviewDialog
          issue={reviewingIssue}
          ceoAgent={ceoAgent}
          companyId={companyId}
          onClose={() => setReviewingIssue(null)}
          onSent={() => setSentIds((prev) => new Set([...prev, reviewingIssue.id]))}
        />
      )}
    </div>
  );
}
