import { useEffect } from "react";
import { useParams } from "@/lib/router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GraduationCap, Play, Lock, CheckCircle2, Clock, Users, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { lmsAnalyticsApi } from "../api/lmsAnalytics";
import { lmsApi } from "../api/lms";
import { useNavigate } from "@/lib/router";

export function LmsWorkshopDetail() {
  const { workshopId } = useParams<{ workshopId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  useEffect(() => {
    setBreadcrumbs([
      { label: "TAN", href: "/lms/dashboard" },
      { label: "Workshops", href: "/lms/workshops" },
      { label: "Detail" },
    ]);
  }, [setBreadcrumbs]);

  const { data: modules = [], isLoading } = useQuery({
    queryKey: queryKeys.lms.modules(selectedCompanyId!, workshopId ?? ""),
    queryFn: () => lmsAnalyticsApi.getModules(selectedCompanyId!, workshopId!),
    enabled: !!selectedCompanyId && !!workshopId,
  });

  const enrollMutation = useMutation({
    mutationFn: () => lmsApi.enroll(selectedCompanyId!, workshopId!),
  });

  if (!selectedCompanyId) return null;

  const completed = modules.filter(m => m.progress?.completedAt).length;
  const total = modules.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/lms/workshops")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" /> Workshop Detail
          </h1>
          <p className="text-sm text-muted-foreground">Modules and learning content</p>
        </div>
        <Button
          size="sm"
          onClick={() => enrollMutation.mutate()}
          disabled={enrollMutation.isPending || enrollMutation.isSuccess}
        >
          {enrollMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          {enrollMutation.isSuccess ? "Enrolled ✓" : "Enroll"}
        </Button>
      </div>

      {total > 0 && (
        <div className="bg-black/60 border border-white/10 rounded-xl p-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>Progress</span>
              <span>{completed}/{total} modules</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="text-2xl font-bold text-primary">{pct}%</div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading modules…
        </div>
      ) : modules.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No modules in this workshop yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {modules.map((mod, i) => {
            const done = !!mod.progress?.completedAt;
            const locked = !mod.unlocked;
            return (
              <div
                key={mod.id}
                className={`bg-black/50 border rounded-xl p-4 flex items-center gap-4 transition-all
                  ${locked ? "border-white/5 opacity-60" : done ? "border-green-500/20 bg-green-500/5" : "border-white/10 hover:border-primary/30"}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                  ${done ? "bg-green-500/20 text-green-400" : locked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : locked ? <Lock className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{mod.title}</div>
                  {mod.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{mod.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                  {mod.durationSeconds && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {Math.round(mod.durationSeconds / 60)}m
                    </span>
                  )}
                  {mod.progress && !done && (
                    <div className="w-16">
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{
                            width: mod.progress.totalSeconds
                              ? `${Math.min((mod.progress.watchedSeconds / mod.progress.totalSeconds) * 100, 100)}%`
                              : "0%"
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {done && <span className="text-green-400 font-medium">Done</span>}
                  {locked && <span className="text-muted-foreground/60">Locked</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BookIcon({ className }: { className?: string }) {
  return <GraduationCap className={className} />;
}
