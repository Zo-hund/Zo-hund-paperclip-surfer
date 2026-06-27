import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  getQuarter,
  startOfQuarter,
  eachMonthOfInterval,
  addQuarters,
  subQuarters,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Video,
  GraduationCap,
  Zap,
  Target,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { meetingsApi } from "@/api/meetings";
import { agentsApi } from "@/api/agents";
import { amxApi } from "@/api/amx";
import { queryKeys } from "@/lib/queryKeys";
import type { Meeting } from "@/api/meetings";
import type { Agent } from "@paperclipai/shared";

type ViewMode = "day" | "week" | "month" | "quarter";

interface CalendarEvent {
  id: string;
  title: string;
  type: "meeting" | "session" | "agent_run" | "milestone";
  date: Date;
  status?: string;
  meta?: string;
}

function eventColor(type: CalendarEvent["type"]): string {
  switch (type) {
    case "meeting": return "bg-blue-500/20 border-blue-500/40 text-blue-400";
    case "session": return "bg-emerald-500/20 border-emerald-500/40 text-emerald-400";
    case "agent_run": return "bg-amber-500/20 border-amber-500/40 text-amber-400";
    case "milestone": return "bg-purple-500/20 border-purple-500/40 text-purple-400";
  }
}

function eventIcon(type: CalendarEvent["type"]) {
  switch (type) {
    case "meeting": return Video;
    case "session": return GraduationCap;
    case "agent_run": return Zap;
    case "milestone": return Target;
  }
}

function buildEvents(
  meetings: Meeting[],
  agents: Agent[],
  sessions: Array<{ id: string; title: string; scheduledDate: string; status: string }>,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const m of meetings) {
    events.push({
      id: m.id,
      title: m.title,
      type: "meeting",
      date: new Date(m.createdAt),
      status: m.status,
      meta: m.type,
    });
  }

  for (const a of agents) {
    if (a.scheduleEnabled && a.nextScheduledAt) {
      events.push({
        id: `run-${a.id}`,
        title: `${a.name} run`,
        type: "agent_run",
        date: new Date(a.nextScheduledAt),
        status: a.status,
        meta: a.role,
      });
    }
  }

  for (const s of sessions) {
    events.push({
      id: s.id,
      title: s.title,
      type: "session",
      date: new Date(s.scheduledDate),
      status: s.status,
    });
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function EventChip({ event }: { event: CalendarEvent }) {
  const Icon = eventIcon(event.type);
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium truncate ${eventColor(event.type)}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{event.title}</span>
    </div>
  );
}

// ── Week View ───────────────────────────────────────────────────────────────
function WeekView({ anchor, events }: { anchor: Date; events: CalendarEvent[] }) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });
  const today = new Date();

  return (
    <div className="grid grid-cols-7 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/60">
      {days.map((day) => {
        const dayEvents = events.filter((e) => isSameDay(e.date, day));
        const isToday = isSameDay(day, today);
        return (
          <div
            key={day.toISOString()}
            className={`flex flex-col gap-1 p-2 min-h-[140px] bg-card ${isToday ? "ring-1 ring-primary/40" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {format(day, "EEE")}
              </span>
              <span className={`text-sm font-bold ${isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : "text-foreground"}`}>
                {format(day, "d")}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {dayEvents.slice(0, 4).map((e) => (
                <EventChip key={e.id} event={e} />
              ))}
              {dayEvents.length > 4 && (
                <span className="text-[10px] text-muted-foreground font-medium pl-1">+{dayEvents.length - 4} more</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Month View ──────────────────────────────────────────────────────────────
function MonthView({ anchor, events }: { anchor: Date; events: CalendarEvent[] }) {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = new Date();

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/60">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(e.date, day));
          const isToday = isSameDay(day, today);
          const inMonth = isSameMonth(day, anchor);
          return (
            <div
              key={day.toISOString()}
              className={`p-1.5 min-h-[90px] bg-card ${!inMonth ? "opacity-40" : ""} ${isToday ? "ring-1 ring-primary/40" : ""}`}
            >
              <span className={`text-xs font-bold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </span>
              <div className="flex flex-wrap gap-0.5 mt-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <span key={e.id} className={`w-2 h-2 rounded-full ${eventColor(e.type).split(" ")[0]}`} title={e.title} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day View ────────────────────────────────────────────────────────────────
function DayView({ anchor, events }: { anchor: Date; events: CalendarEvent[] }) {
  const dayEvents = events.filter((e) => isSameDay(e.date, anchor));

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <h3 className="text-sm font-bold text-foreground mb-4">{format(anchor, "EEEE, MMMM d, yyyy")}</h3>
      {dayEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No events scheduled</p>
      ) : (
        <div className="flex flex-col gap-2">
          {dayEvents.map((e) => {
            const Icon = eventIcon(e.type);
            return (
              <div key={e.id} className={`flex items-center gap-3 p-3 rounded-lg border ${eventColor(e.type)}`}>
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">{e.title}</span>
                  <span className="text-xs opacity-70">{format(e.date, "h:mm a")} · {e.type}{e.meta ? ` · ${e.meta}` : ""}</span>
                </div>
                {e.status && (
                  <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{e.status}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Quarter View ────────────────────────────────────────────────────────────
function QuarterView({ anchor, events }: { anchor: Date; events: CalendarEvent[] }) {
  const qStart = startOfQuarter(anchor);
  const months = eachMonthOfInterval({ start: qStart, end: addMonths(qStart, 2) });
  const qLabel = `Q${getQuarter(anchor)} ${format(anchor, "yyyy")}`;

  return (
    <div>
      <h3 className="text-lg font-black text-foreground mb-4">{qLabel} Runway</h3>
      <div className="grid grid-cols-3 gap-4">
        {months.map((month) => {
          const mStart = startOfMonth(month);
          const mEnd = endOfMonth(month);
          const monthEvents = events.filter((e) => e.date >= mStart && e.date <= mEnd);
          return (
            <div key={month.toISOString()} className="rounded-lg border border-border/60 bg-card p-4">
              <h4 className="text-sm font-black uppercase tracking-wide text-primary mb-3">{format(month, "MMMM")}</h4>
              {monthEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No events</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {monthEvents.slice(0, 8).map((e) => (
                    <EventChip key={e.id} event={e} />
                  ))}
                  {monthEvents.length > 8 && (
                    <span className="text-[10px] text-muted-foreground pl-1">+{monthEvents.length - 8} more</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Calendar Page ──────────────────────────────────────────────────────
export function Calendar() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());

  useEffect(() => {
    setBreadcrumbs([{ label: "Calendar" }]);
  }, [setBreadcrumbs]);

  const meetingsQuery = useQuery({
    queryKey: ["meetings", selectedCompanyId],
    queryFn: () => meetingsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const sessionsQuery = useQuery({
    queryKey: ["lms-sessions", selectedCompanyId],
    queryFn: () => amxApi.getLms(selectedCompanyId!).then((d) =>
      (d.workshops ?? []).map((w) => ({ id: w.id, title: w.name, scheduledDate: w.createdAt, status: w.status }))
    ),
    enabled: !!selectedCompanyId,
  });

  const events = useMemo(
    () => buildEvents(meetingsQuery.data ?? [], agentsQuery.data ?? [], sessionsQuery.data ?? []),
    [meetingsQuery.data, agentsQuery.data, sessionsQuery.data],
  );

  function navigate(dir: -1 | 1) {
    switch (view) {
      case "day": setAnchor((d) => dir === 1 ? addWeeks(d, 0) : subWeeks(d, 0)); setAnchor((d) => new Date(d.getTime() + dir * 86400000)); break;
      case "week": setAnchor((d) => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)); break;
      case "month": setAnchor((d) => dir === 1 ? addMonths(d, 1) : subMonths(d, 1)); break;
      case "quarter": setAnchor((d) => dir === 1 ? addQuarters(d, 1) : subQuarters(d, 1)); break;
    }
  }

  const headerLabel = useMemo(() => {
    switch (view) {
      case "day": return format(anchor, "EEEE, MMM d, yyyy");
      case "week": {
        const ws = startOfWeek(anchor, { weekStartsOn: 1 });
        const we = endOfWeek(anchor, { weekStartsOn: 1 });
        return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
      }
      case "month": return format(anchor, "MMMM yyyy");
      case "quarter": return `Q${getQuarter(anchor)} ${format(anchor, "yyyy")}`;
    }
  }, [view, anchor]);

  const views: ViewMode[] = ["day", "week", "month", "quarter"];

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground">Calendar</h1>
          <p className="text-xs text-muted-foreground">Meetings, sessions, agent runs, and milestones</p>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Event
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())} className="text-xs font-bold">Today</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold text-foreground ml-2">{headerLabel}</span>
        </div>
        <div className="flex rounded-lg border border-border/60 overflow-hidden">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                view === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/60" /> Meetings</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/60" /> Sessions</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/60" /> Agent Runs</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500/60" /> Milestones</span>
      </div>

      {/* Calendar Grid */}
      {view === "day" && <DayView anchor={anchor} events={events} />}
      {view === "week" && <WeekView anchor={anchor} events={events} />}
      {view === "month" && <MonthView anchor={anchor} events={events} />}
      {view === "quarter" && <QuarterView anchor={anchor} events={events} />}
    </div>
  );
}
