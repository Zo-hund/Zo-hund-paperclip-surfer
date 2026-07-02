import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, MapPin, Users, Plus, Loader2, Video, Globe, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { lmsAnalyticsApi, type LmsSession } from "../api/lmsAnalytics";

const FORMAT_ICON: Record<string, React.ElementType> = {
  online: Video,
  in_person: Building,
  metaverse: Globe,
  hybrid: Globe,
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function LmsSessions() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", scheduledDate: "", timeSlot: "", format: "online", location: "" });

  useEffect(() => {
    setBreadcrumbs([{ label: "TAN", href: "/lms/dashboard" }, { label: "Sessions" }]);
  }, [setBreadcrumbs]);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.lms.sessions(selectedCompanyId!),
    queryFn: () => lmsAnalyticsApi.getSessions(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      lmsAnalyticsApi.createSession(selectedCompanyId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lms.sessions(selectedCompanyId!) });
      setShowCreate(false);
      setForm({ title: "", scheduledDate: "", timeSlot: "", format: "online", location: "" });
    },
  });

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Select a company.</div>;
  }

  const upcoming = sessions.filter(s => s.status === "scheduled" || s.status === "active");
  const past = sessions.filter(s => s.status === "completed" || s.status === "cancelled");

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" /> Sessions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live sessions, office hours, XRT trainer blocks</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Book Session
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Sessions", value: sessions.length },
          { label: "Upcoming", value: upcoming.length },
          { label: "Completed", value: past.filter(s => s.status === "completed").length },
        ].map(s => (
          <div key={s.label} className="bg-black/60 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="bg-black/60 border border-primary/30 rounded-xl p-4 flex flex-col gap-3">
          <h2 className="font-semibold text-sm">New Session</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Session title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
            <Input
              type="date"
              value={form.scheduledDate}
              onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
            />
            <Input
              placeholder="Time slot (e.g. 10:00 AM – 12:00 PM)"
              value={form.timeSlot}
              onChange={e => setForm(f => ({ ...f, timeSlot: e.target.value }))}
            />
            <Input
              placeholder="Location (optional)"
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate(form)}
              disabled={!form.title || !form.scheduledDate || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No sessions scheduled. Book the first one.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {upcoming.length > 0 && (
            <Section title="Upcoming" sessions={upcoming} />
          )}
          {past.length > 0 && (
            <Section title="Past" sessions={past} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, sessions }: { title: string; sessions: LmsSession[] }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{title}</h2>
      <div className="flex flex-col gap-2">
        {sessions.map(s => <SessionRow key={s.id} session={s} />)}
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: LmsSession }) {
  const FormatIcon = FORMAT_ICON[session.format] ?? Globe;
  return (
    <div className="bg-black/50 border border-white/8 rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <FormatIcon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{session.title}</div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {session.scheduledDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {new Date(session.scheduledDate).toLocaleDateString()}
            </span>
          )}
          {session.timeSlot && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {session.timeSlot}
            </span>
          )}
          {session.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {session.location}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {session.maxCapacity && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" /> {session.maxCapacity}
          </span>
        )}
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_BADGE[session.status] ?? "bg-muted text-muted-foreground border-border"}`}>
          {session.status}
        </span>
      </div>
    </div>
  );
}
