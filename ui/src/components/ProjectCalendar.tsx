import { useState, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar,
  ExternalLink,
} from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { StatusBadge } from "./StatusBadge";
import { cn } from "../lib/utils";
import { useDialog } from "../context/DialogContext";
import { useNavigate } from "@/lib/router";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

/* ── Constants ───────────────────────────────────────────────────────────── */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type DateMode = "created" | "completed";

const ALL_STATUSES = [
  "in_progress",
  "todo",
  "in_review",
  "backlog",
  "blocked",
  "done",
  "cancelled",
] as const;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function getIssueDate(issue: Issue, mode: DateMode): Date | null {
  if (mode === "completed") {
    return issue.completedAt ? new Date(issue.completedAt) : null;
  }
  return new Date(issue.createdAt);
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/* ── Issue pill ──────────────────────────────────────────────────────────── */

function IssuePill({
  issue,
  onSelect,
  onUpdateStatus,
  onUpdatePriority,
}: {
  issue: Issue;
  onSelect: (issue: Issue) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdatePriority: (id: string, priority: string) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight cursor-pointer",
        "border border-transparent hover:border-border/60 transition-all",
        statusBadge[issue.status] ?? statusBadgeDefault,
      )}
    >
      <span
        className="shrink-0"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <StatusIcon
          status={issue.status}
          onChange={(s) => onUpdateStatus(issue.id, s)}
          className="h-3 w-3"
        />
      </span>
      <button
        className="flex-1 truncate text-left"
        title={issue.title}
        onClick={() => onSelect(issue)}
      >
        {issue.title}
      </button>
    </div>
  );
}

/* ── Detail panel ────────────────────────────────────────────────────────── */

function IssueDetailPanel({
  issue,
  onClose,
  onNavigate,
  onUpdateStatus,
  onUpdatePriority,
}: {
  issue: Issue;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdatePriority: (id: string, priority: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold leading-snug">{issue.title}</p>
          {issue.identifier && (
            <p className="text-xs font-mono text-muted-foreground">
              {issue.identifier}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onNavigate(issue.id)}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Open issue"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <StatusIcon
          status={issue.status}
          onChange={(s) => onUpdateStatus(issue.id, s)}
          showLabel
        />
        <PriorityIcon
          priority={issue.priority}
          onChange={(p) => onUpdatePriority(issue.id, p)}
          showLabel
        />
      </div>

      {issue.description && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {issue.description}
        </p>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-2">
        <span>Created {new Date(issue.createdAt).toLocaleDateString()}</span>
        {issue.completedAt && (
          <span>· Done {new Date(issue.completedAt).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

/* ── Calendar day cell ───────────────────────────────────────────────────── */

function DayCell({
  day,
  year,
  month,
  isToday,
  issues,
  selectedId,
  onIssueSelect,
  onDayClick,
  onUpdateStatus,
  onUpdatePriority,
}: {
  day: number | null;
  year: number;
  month: number;
  isToday: boolean;
  issues: Issue[];
  selectedId: string | null;
  onIssueSelect: (issue: Issue | null) => void;
  onDayClick: (day: number) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUpdatePriority: (id: string, priority: string) => void;
}) {
  if (day === null) {
    return <div className="min-h-[90px] bg-muted/10 border-r border-b border-border/40" />;
  }

  const shown = issues.slice(0, 3);
  const overflow = issues.length - shown.length;

  return (
    <div
      className="min-h-[90px] border-r border-b border-border/40 p-1.5 flex flex-col gap-0.5 hover:bg-muted/20 transition-colors group"
    >
      {/* Day number + add button */}
      <div className="flex items-center justify-between mb-0.5">
        <div
          className={cn(
            "h-5 w-5 flex items-center justify-center rounded-full text-xs font-medium",
            isToday
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          {day}
        </div>
        <button
          onClick={() => onDayClick(day)}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
          title="New issue on this day"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Issue pills */}
      <div className="space-y-0.5 flex-1">
        {shown.map((iss) => (
          <IssuePill
            key={iss.id}
            issue={iss}
            onSelect={onIssueSelect}
            onUpdateStatus={onUpdateStatus}
            onUpdatePriority={onUpdatePriority}
          />
        ))}
        {overflow > 0 && (
          <button
            className="w-full text-left text-[10px] text-muted-foreground pl-1 hover:text-foreground transition-colors"
            onClick={() => onIssueSelect(issues[3] ?? null)}
          >
            +{overflow} more
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function ProjectCalendar({
  issues,
  projectId,
  onUpdateIssue,
}: {
  issues: Issue[];
  projectId?: string;
  onUpdateIssue?: (id: string, data: Record<string, unknown>) => void;
}) {
  const today = new Date();
  const navigate = useNavigate();
  const { openNewIssue } = useDialog();

  const [cursor, setCursor] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [mode, setMode] = useState<DateMode>("created");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(new Set());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  /* Active status filter */
  const toggleStatus = useCallback((status: string) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  /* Filter visible issues */
  const filteredIssues = useMemo(() => {
    if (activeStatuses.size === 0) return issues;
    return issues.filter((i) => activeStatuses.has(i.status));
  }, [issues, activeStatuses]);

  /* Map day → issues */
  const byDay = useMemo(() => {
    const map = new Map<number, Issue[]>();
    for (const issue of filteredIssues) {
      const d = getIssueDate(issue, mode);
      if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(issue);
    }
    return map;
  }, [filteredIssues, mode, year, month]);

  /* Grid cells */
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = cursor.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  /* Issue count in current view */
  const viewCount = useMemo(
    () =>
      filteredIssues.filter((iss) => {
        const d = getIssueDate(iss, mode);
        return d && d.getFullYear() === year && d.getMonth() === month;
      }).length,
    [filteredIssues, mode, year, month],
  );

  /* Handlers */
  const handleDayClick = useCallback(
    (day: number) => {
      openNewIssue({
        ...(projectId ? { projectId } : {}),
        status: "todo",
      });
    },
    [openNewIssue, projectId],
  );

  const handleNavigate = useCallback(
    (id: string) => {
      navigate(`/issues/${id}`);
    },
    [navigate],
  );

  const handleUpdateStatus = useCallback(
    (id: string, status: string) => {
      onUpdateIssue?.(id, { status });
      setSelected((prev) =>
        prev?.id === id ? ({ ...prev, status } as Issue) : prev,
      );
    },
    [onUpdateIssue],
  );

  const handleUpdatePriority = useCallback(
    (id: string, priority: string) => {
      onUpdateIssue?.(id, { priority });
      setSelected((prev) =>
        prev?.id === id ? ({ ...prev, priority } as Issue) : prev,
      );
    },
    [onUpdateIssue],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold min-w-[148px] text-center tracking-tight">
            {monthLabel}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() =>
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
            }
            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors font-medium"
          >
            Today
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Date mode toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
            {(["created", "completed"] as DateMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-2.5 py-1 capitalize transition-colors font-medium",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {/* Quick create */}
          <button
            onClick={() => openNewIssue({ ...(projectId ? { projectId } : {}), status: "todo" })}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <Plus className="h-3 w-3" />
            New Issue
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground">Filter:</span>
        {ALL_STATUSES.map((status) => {
          const active = activeStatuses.has(status);
          return (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-full border transition-all font-medium",
                active
                  ? (statusBadge[status] ?? statusBadgeDefault) + " border-transparent"
                  : "border-border/60 text-muted-foreground hover:border-border",
              )}
            >
              {status.replace(/_/g, " ")}
            </button>
          );
        })}
        {activeStatuses.size > 0 && (
          <button
            onClick={() => setActiveStatuses(new Set())}
            className="text-[11px] px-2 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
        {viewCount > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {viewCount} issue{viewCount !== 1 ? "s" : ""} this month
          </span>
        )}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-l border-t border-border/40 rounded-t-lg overflow-hidden">
        {DAYS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-xs font-semibold text-muted-foreground bg-muted/30 border-r border-b border-border/40"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-border/40 -mt-px">
        {cells.map((day, idx) => {
          const isToday =
            day !== null &&
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day;
          return (
            <DayCell
              key={idx}
              day={day}
              year={year}
              month={month}
              isToday={isToday}
              issues={day !== null ? (byDay.get(day) ?? []) : []}
              selectedId={selected?.id ?? null}
              onIssueSelect={setSelected}
              onDayClick={handleDayClick}
              onUpdateStatus={handleUpdateStatus}
              onUpdatePriority={handleUpdatePriority}
            />
          );
        })}
      </div>

      {/* Issue detail panel */}
      {selected && (
        <IssueDetailPanel
          issue={selected}
          onClose={() => setSelected(null)}
          onNavigate={handleNavigate}
          onUpdateStatus={handleUpdateStatus}
          onUpdatePriority={handleUpdatePriority}
        />
      )}

      {/* Empty state */}
      {viewCount === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="h-10 w-10 mb-3 opacity-25" />
          <p className="text-sm font-medium">
            No issues {mode === "completed" ? "completed" : "created"} in{" "}
            {monthLabel}
          </p>
          <button
            onClick={() => openNewIssue({ ...(projectId ? { projectId } : {}), status: "todo" })}
            className="mt-3 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            Create first issue
          </button>
        </div>
      )}
    </div>
  );
}
