import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, GraduationCap, Users, BookOpen, BarChart3, Loader2, CheckCircle2, Clock, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { lmsAnalyticsApi, type CourseAnalytics } from "../api/lmsAnalytics";
import { lmsApi } from "../api/lms";
import { useNavigate } from "@/lib/router";

const FORMAT_BADGE: Record<string, string> = {
  online: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_person: "bg-green-500/10 text-green-400 border-green-500/20",
  metaverse: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const LEVEL_BADGE: Record<string, string> = {
  Beginner: "bg-green-500/10 text-green-400",
  Intermediate: "bg-amber-500/10 text-amber-400",
  Advanced: "bg-orange-500/10 text-orange-400",
  Master: "bg-red-500/10 text-red-400",
};

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="bg-black/60 border border-white/10 rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

export function LmsWorkshops() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "TAN", href: "/lms/dashboard" }, { label: "Workshops" }]);
  }, [setBreadcrumbs]);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: queryKeys.lms.courses(selectedCompanyId!),
    queryFn: () => lmsAnalyticsApi.getCourseAnalytics(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      lmsApi.createWorkshop(selectedCompanyId!, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lms.courses(selectedCompanyId!) });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
  });

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a company to view workshops.
      </div>
    );
  }

  const totalEnrollments = courses.reduce((s, c) => s + c.enrollmentCount, 0);
  const totalCompleted = courses.reduce((s, c) => s + c.completionCount, 0);
  const avgRate = courses.length > 0
    ? Math.round(courses.reduce((s, c) => s + c.completionRate, 0) / courses.length)
    : 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" /> Workshops
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Learning tracks, runways, and skill pods</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> New Workshop
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Workshops" value={courses.length} icon={BookOpen} />
        <StatCard label="Enrollments" value={totalEnrollments} icon={Users} />
        <StatCard label="Completions" value={totalCompleted} icon={CheckCircle2} />
        <StatCard label="Avg Completion" value={`${avgRate}%`} icon={BarChart3} />
      </div>

      {showCreate && (
        <div className="bg-black/60 border border-primary/30 rounded-xl p-4 flex flex-col gap-3">
          <h2 className="font-semibold text-sm">New Workshop</h2>
          <Input
            placeholder="Workshop name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            placeholder="Description"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => createMutation.mutate({ name: newName, description: newDesc })}
              disabled={!newName || !newDesc || createMutation.isPending}
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
          <Loader2 className="h-4 w-4 animate-spin" /> Loading workshops…
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No workshops yet. Create your first runway.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {courses.map((course) => (
            <WorkshopRow key={course.workshopId} course={course} onClick={() => navigate(`/lms/workshops/${course.workshopId}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkshopRow({ course, onClick }: { course: CourseAnalytics; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-black/50 border border-white/8 rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 hover:bg-black/70 transition-all text-left w-full group"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <GraduationCap className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm group-hover:text-primary transition-colors truncate">{course.name}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${FORMAT_BADGE[course.format] ?? "bg-muted text-muted-foreground border-border"}`}>
            {course.format.replace("_", " ")}
          </span>
          <span className="text-[11px] text-muted-foreground">{course.sessionCount} sessions</span>
        </div>
      </div>
      <div className="flex items-center gap-6 text-right shrink-0">
        <div>
          <div className="text-sm font-bold">{course.enrollmentCount}</div>
          <div className="text-[10px] text-muted-foreground">enrolled</div>
        </div>
        <div>
          <div className="text-sm font-bold">{Math.round(course.completionRate)}%</div>
          <div className="text-[10px] text-muted-foreground">complete</div>
        </div>
        <div className="w-16">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(course.completionRate, 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{course.completionCount} done</div>
        </div>
      </div>
    </button>
  );
}
