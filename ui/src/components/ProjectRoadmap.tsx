import { useMemo, useState, useCallback } from "react";
import type { Issue } from "@paperclipai/shared";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { cn } from "../lib/utils";
import {
  Layers,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
} from "lucide-react";
import { useNavigate } from "@/lib/router";
import { useDialog } from "../context/DialogContext";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

/* ── Constants ───────────────────────────────────────────────────────────── */

const STATUS_ORDER = [
  "in_progress",
  "todo",
  "in_review",
  "backlog",
  "blocked",
  "done",
  "cancelled",
] as const;

type SortField = "created" | "updated" | "priority" | "title";
type GroupBy = "status" | "priority";

const PRIORITY_ORDER = ["critical", "high", "medium", "low"] as const;
const PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/20",
  high: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  low: "text-slate-400 bg-slate-400/10 border-slate-400/20",
};

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

/* ── Issue row ───────────────────────────────────────────────────────────── */

function IssueRow({
  issue,
  onNavigate,
  onUpdateStatus,
  onUpdatePriority,
}: {
  issue: Issue;
  onNavigate: (id: string) => void;
  onUpdateStatus: (id: string, s: string) => void;
  onUpdatePriority: (id: string, p: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-muted/40 border border-transparent hover:border-border/40 transition-all group text-sm">
      {/* Status */}
      <span className="shrink-0">
        <StatusIcon
          status={issue.status}
          onChange={(s) => onUpdateStatus(issue.id, s)}
        />
      </span>

      {/* Title + identifier */}
      <button
        onClick={() => onNavigate(issue.id)}
        className="flex-1 min-w-0 text-left flex items-baseline gap-2"
      >
        {issue.identifier && (
          <span className="font-mono text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {issue.identifier}
          </span>
        )}
        <span className="truncate text-[13px] font-medium text-foreground/90 group-hover:text-foreground transition-colors">
          {issue.title}
        </span>
      </button>

      {/* Priority */}
      <span className="shrink-0">
        <PriorityIcon
          priority={issue.priority}
          onChange={(p) => onUpdatePriority(issue.id, p)}
        />
      </span>

      {/* Priority badge */}
      <span
        className={cn(
          "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize hidden sm:block",
          PRIORITY_BADGE[issue.priority] ?? "text-muted-foreground bg-muted border-border/40",
        )}
      >
        {issue.priority}
      </span>

      {/* Date */}
      <span className="shrink-0 text-[11px] text-muted-foreground hidden md:block tabular-nums">
        {new Date(issue.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
      </span>
    </div>
  );
}

/* ── Group section ───────────────────────────────────────────────────────── */

function GroupSection({
  label,
  count,
  issues,
  defaultOpen,
  onNavigate,
  onUpdateStatus,
  onUpdatePriority,
  renderHeader,
}: {
  label: string;
  count: number;
  issues: Issue[];
  defaultOpen: boolean;
  onNavigate: (id: string) => void;
  onUpdateStatus: (id: string, s: string) => void;
  onUpdatePriority: (id: string, p: string) => void;
  renderHeader?: () => React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (issues.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {/* Group header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left px-1 py-1.5 rounded-md hover:bg-muted/30 transition-colors"
      >
        <span className="text-muted-foreground/70">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        {renderHeader ? (
          renderHeader()
        ) : (
          <span className="text-xs font-semibold text-foreground/80">
            {label}
          </span>
        )}
        <span className="text-xs text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 tabular-nums">
          {count}
        </span>
      </button>

      {/* Rows */}
      {open && (
        <div className="space-y-0.5 pl-4">
          {issues.map((iss) => (
            <IssueRow
              key={iss.id}
              issue={iss}
              onNavigate={onNavigate}
              onUpdateStatus={onUpdateStatus}
              onUpdatePriority={onUpdatePriority}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Sort helper ─────────────────────────────────────────────────────────── */

function sortIssues(issues: Issue[], field: SortField, dir: "asc" | "desc") {
  const factor = dir === "asc" ? 1 : -1;
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 } as Record<
    string,
    number
  >;
  return [...issues].sort((a, b) => {
    switch (field) {
      case "priority":
        return factor * ((priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2));
      case "title":
        return factor * a.title.localeCompare(b.title);
      case "updated":
        return factor * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      default: // created
        return factor * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
  });
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function ProjectRoadmap({
  issues,
  projectId,
  onUpdateIssue,
}: {
  issues: Issue[];
  projectId?: string;
  onUpdateIssue?: (id: string, data: Record<string, unknown>) => void;
}) {
  const navigate = useNavigate();
  const { openNewIssue } = useDialog();

  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());
  const [activePriorities, setActivePriorities] = useState<Set<string>>(
    new Set(),
  );
  const [showFilters, setShowFilters] = useState(false);

  /* Handlers */
  const handleNavigate = useCallback(
    (id: string) => navigate(`/issues/${id}`),
    [navigate],
  );

  const handleUpdateStatus = useCallback(
    (id: string, status: string) => onUpdateIssue?.(id, { status }),
    [onUpdateIssue],
  );

  const handleUpdatePriority = useCallback(
    (id: string, priority: string) => onUpdateIssue?.(id, { priority }),
    [onUpdateIssue],
  );

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField],
  );

  /* Filter + sort */
  const filtered = useMemo(() => {
    let result = issues;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.identifier?.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q),
      );
    }
    if (activeStatuses.size > 0) {
      result = result.filter((i) => activeStatuses.has(i.status));
    }
    if (activePriorities.size > 0) {
      result = result.filter((i) => activePriorities.has(i.priority));
    }
    return sortIssues(result, sortField, sortDir);
  }, [issues, query, activeStatuses, activePriorities, sortField, sortDir]);

  /* Stats */
  const total = issues.length;
  const done = issues.filter((i) => i.status === "done").length;
  const inProgress = issues.filter((i) => i.status === "in_progress").length;
  const blocked = issues.filter((i) => i.status === "blocked").length;
  const todo = issues.filter((i) => i.status === "todo").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  /* Grouped */
  const grouped = useMemo(() => {
    if (groupBy === "priority") {
      const map = new Map<string, Issue[]>();
      for (const p of PRIORITY_ORDER) map.set(p, []);
      for (const iss of filtered) {
        const key = PRIORITY_ORDER.includes(iss.priority as (typeof PRIORITY_ORDER)[number])
          ? iss.priority
          : "medium";
        map.get(key)!.push(iss);
      }
      return map;
    }
    // Status grouping
    const map = new Map<string, Issue[]>();
    for (const s of STATUS_ORDER) map.set(s, []);
    for (const iss of filtered) {
      const key = STATUS_ORDER.includes(iss.status as (typeof STATUS_ORDER)[number])
        ? iss.status
        : "backlog";
      map.get(key)!.push(iss);
    }
    return map;
  }, [filtered, groupBy]);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
        <Layers className="h-10 w-10 mb-3 opacity-25" />
        <p className="text-sm font-medium">No issues in this project yet.</p>
        <button
          onClick={() => openNewIssue({ ...(projectId ? { projectId } : {}), status: "todo" })}
          className="mt-3 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
        >
          Create first issue
        </button>
      </div>
    );
  }

  const groups =
    groupBy === "priority"
      ? (PRIORITY_ORDER as unknown as string[])
      : (STATUS_ORDER as unknown as string[]);

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: total, color: "text-foreground" },
          { label: "In Progress", value: inProgress, color: "text-amber-400" },
          { label: "Done", value: done, color: "text-green-400" },
          { label: "Blocked", value: blocked, color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className={cn("text-2xl font-bold tabular-nums", color)}>
              {value}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 font-medium">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground font-medium">
          <span>Completion</span>
          <span className="tabular-nums">{done}/{total} done — {pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="tabular-nums">{todo} to do</span>
          <span>·</span>
          <span className="tabular-nums">{inProgress} in progress</span>
          {blocked > 0 && (
            <>
              <span>·</span>
              <span className="text-red-400 tabular-nums">{blocked} blocked</span>
            </>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues…"
            className="w-full h-8 pl-8 pr-8 text-sm bg-muted/30 border border-border/60 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground/60 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Group by */}
        <div className="flex items-center rounded-md border border-border/60 overflow-hidden text-xs">
          {(["status", "priority"] as GroupBy[]).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={cn(
                "px-2.5 py-1.5 capitalize font-medium transition-colors",
                groupBy === g
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Sort */}
        <button
          onClick={() => toggleSort(sortField)}
          title={`Sort by ${sortField} (${sortDir})`}
          className="flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-md border border-border/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortField}
          <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>
        </button>

        {/* Filters toggle */}
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={cn(
            "flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-md border transition-colors font-medium",
            showFilters || activeStatuses.size > 0 || activePriorities.size > 0
              ? "border-primary/50 text-primary bg-primary/10"
              : "border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter
          {(activeStatuses.size + activePriorities.size) > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] tabular-nums">
              {activeStatuses.size + activePriorities.size}
            </span>
          )}
        </button>

        {/* Quick create */}
        <button
          onClick={() => openNewIssue({ ...(projectId ? { projectId } : {}), status: "todo" })}
          className="flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          New Issue
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
          {/* Status filters */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Status
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((s) => {
                const active = activeStatuses.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => {
                      setActiveStatuses((prev) => {
                        const next = new Set(prev);
                        active ? next.delete(s) : next.add(s);
                        return next;
                      });
                    }}
                    className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full border transition-all font-medium",
                      active
                        ? (statusBadge[s] ?? statusBadgeDefault) + " border-transparent"
                        : "border-border/50 text-muted-foreground hover:border-border",
                    )}
                  >
                    {STATUS_LABEL[s] ?? s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority filters */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Priority
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_ORDER.map((p) => {
                const active = activePriorities.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => {
                      setActivePriorities((prev) => {
                        const next = new Set(prev);
                        active ? next.delete(p) : next.add(p);
                        return next;
                      });
                    }}
                    className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full border transition-all font-medium",
                      active
                        ? (PRIORITY_BADGE[p] ?? "bg-muted text-foreground border-border")
                        : "border-border/50 text-muted-foreground hover:border-border",
                    )}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort row */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Sort by
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(["created", "updated", "priority", "title"] as SortField[]).map(
                (f) => (
                  <button
                    key={f}
                    onClick={() => toggleSort(f)}
                    className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full border transition-all font-medium capitalize",
                      sortField === f
                        ? "bg-primary/20 text-primary border-primary/40"
                        : "border-border/50 text-muted-foreground hover:border-border",
                    )}
                  >
                    {f} {sortField === f && (sortDir === "asc" ? "↑" : "↓")}
                  </button>
                ),
              )}
            </div>
          </div>

          {(activeStatuses.size > 0 || activePriorities.size > 0) && (
            <button
              onClick={() => {
                setActiveStatuses(new Set());
                setActivePriorities(new Set());
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      {(query || activeStatuses.size > 0 || activePriorities.size > 0) && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {total} issues
        </p>
      )}

      {/* Issue groups */}
      <div className="space-y-2">
        {groups.map((key) => {
          const groupIssues = grouped.get(key) ?? [];
          return (
            <GroupSection
              key={key}
              label={groupBy === "priority" ? (PRIORITY_LABELS[key] ?? key) : (STATUS_LABEL[key] ?? key)}
              count={groupIssues.length}
              issues={groupIssues}
              defaultOpen={
                groupBy === "status"
                  ? ["in_progress", "todo", "in_review", "blocked"].includes(key)
                  : ["critical", "high"].includes(key)
              }
              onNavigate={handleNavigate}
              onUpdateStatus={handleUpdateStatus}
              onUpdatePriority={handleUpdatePriority}
              renderHeader={
                groupBy === "status"
                  ? () => (
                      <StatusIcon status={key} showLabel />
                    )
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No issues match your filters.
        </div>
      )}
    </div>
  );
}
