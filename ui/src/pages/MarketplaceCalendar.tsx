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
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarClock, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { Link } from "@/lib/router";
import { calendarApi, type CalendarEvent } from "@/api/calendar";

type ViewMode = "week" | "month";

// Color coding: company_event branches by eventType, marketplace_booking is
// always the same accent (its own status is shown as a badge instead).
function eventColor(event: CalendarEvent): string {
  if (event.kind === "marketplace_booking") return "bg-emerald-500/20 border-emerald-500/40 text-emerald-400";
  switch (event.eventType) {
    case "marketplace": return "bg-emerald-500/20 border-emerald-500/40 text-emerald-400";
    case "workshop": return "bg-blue-500/20 border-blue-500/40 text-blue-400";
    case "community": return "bg-violet-500/20 border-violet-500/40 text-violet-400";
    case "board": return "bg-amber-500/20 border-amber-500/40 text-amber-400";
    default: return "bg-slate-500/20 border-slate-500/40 text-slate-300";
  }
}

function EventChip({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium truncate w-full text-left ${eventColor(event)}`}
    >
      <span className="truncate">{event.title}</span>
    </button>
  );
}

// The API's `href` is a stable API-shaped reference (see calendar.ts route),
// not necessarily a routable frontend path — for marketplace bookings we can
// recover the listing id from its trailing path segment and build a real
// in-app link; company events have no dedicated detail page yet, so they
// just don't render a "View Details" action.
function detailLinkFor(event: CalendarEvent, companyPrefix: string | undefined): string | null {
  if (event.kind !== "marketplace_booking" || !companyPrefix) return null;
  const listingId = event.href.split("/").filter(Boolean).pop();
  if (!listingId) return null;
  return `/${companyPrefix}/marketplace/agent/${listingId}`;
}

function EventDetailPanel({ event, companyPrefix, onClose }: { event: CalendarEvent; companyPrefix?: string; onClose: () => void }) {
  const link = detailLinkFor(event, companyPrefix);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-2xl border border-border/60 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border mb-2 ${eventColor(event)}`}>
              {event.kind === "marketplace_booking" ? "Marketplace Booking" : (event.eventType ?? "general")}
            </span>
            <h2 className="text-lg font-black text-foreground">{event.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent/20 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>{format(new Date(event.startAt), "EEE, MMM d · h:mm a")} – {format(new Date(event.endAt), "h:mm a")}</span>
          </div>
          {event.status && (
            <div className="text-[11px] font-black uppercase tracking-widest text-foreground/80">
              Status: {event.status}
            </div>
          )}
        </div>
        {link && (
          <Link to={link}>
            <Button variant="outline" className="w-full mt-5 gap-2 h-10 text-[11px] font-black uppercase tracking-widest">
              View Details <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function WeekView({ anchor, events, onSelect }: { anchor: Date; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });
  const today = new Date();

  return (
    <div className="grid grid-cols-7 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/60">
      {days.map((day) => {
        const dayEvents = events.filter((e) => isSameDay(new Date(e.startAt), day));
        const isToday = isSameDay(day, today);
        return (
          <div key={day.toISOString()} className={`flex flex-col gap-1 p-2 min-h-[140px] bg-card ${isToday ? "ring-1 ring-primary/40" : ""}`}>
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
                <EventChip key={e.id} event={e} onClick={() => onSelect(e)} />
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

function MonthView({ anchor, events, onSelect }: { anchor: Date; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
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
          const dayEvents = events.filter((e) => isSameDay(new Date(e.startAt), day));
          const isToday = isSameDay(day, today);
          const inMonth = isSameMonth(day, anchor);
          return (
            <div key={day.toISOString()} className={`p-1.5 min-h-[90px] bg-card ${!inMonth ? "opacity-40" : ""} ${isToday ? "ring-1 ring-primary/40" : ""}`}>
              <span className={`text-xs font-bold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </span>
              <div className="flex flex-col gap-0.5 mt-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} onClick={() => onSelect(e)} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[9px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MarketplaceCalendar() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Marketplace" }, { label: "Calendar" }]);
  }, [setBreadcrumbs]);

  // Widen the fetch window a bit past the visible range so navigating by a
  // week/month doesn't need an immediate refetch.
  const rangeStart = useMemo(() => startOfMonth(subMonths(anchor, 1)), [anchor]);
  const rangeEnd = useMemo(() => endOfMonth(addMonths(anchor, 1)), [anchor]);

  const calendarQuery = useQuery({
    queryKey: ["marketplace-calendar", selectedCompanyId, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () => calendarApi.getCalendar(selectedCompanyId!, {
      since: rangeStart.toISOString(),
      until: rangeEnd.toISOString(),
    }),
    enabled: !!selectedCompanyId,
  });
  const events = calendarQuery.data?.events ?? [];

  function navigate(dir: -1 | 1) {
    switch (view) {
      case "week": setAnchor((d) => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1)); break;
      case "month": setAnchor((d) => dir === 1 ? addMonths(d, 1) : subMonths(d, 1)); break;
    }
  }

  const headerLabel = useMemo(() => {
    if (view === "week") {
      const ws = startOfWeek(anchor, { weekStartsOn: 1 });
      const we = endOfWeek(anchor, { weekStartsOn: 1 });
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    return format(anchor, "MMMM yyyy");
  }, [view, anchor]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      {selected && (
        <EventDetailPanel event={selected} companyPrefix={selectedCompany?.issuePrefix} onClose={() => setSelected(null)} />
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground">Marketplace Calendar</h1>
          <p className="text-xs text-muted-foreground">Company events and scheduled marketplace bookings</p>
        </div>
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
          {(["week", "month"] as ViewMode[]).map((v) => (
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
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/60" /> Marketplace Bookings</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/60" /> Workshops</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500/60" /> Community</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/60" /> Board</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500/60" /> Other</span>
      </div>

      {calendarQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading calendar…</p>
      ) : (
        <>
          {view === "week" && <WeekView anchor={anchor} events={events} onSelect={setSelected} />}
          {view === "month" && <MonthView anchor={anchor} events={events} onSelect={setSelected} />}
        </>
      )}
    </div>
  );
}
