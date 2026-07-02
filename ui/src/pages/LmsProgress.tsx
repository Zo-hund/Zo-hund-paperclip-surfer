import { useEffect } from "react";
import { useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy, Medal, Loader2, CheckCircle2, Clock, AlertTriangle, TrendingUp, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { lmsAnalyticsApi, engagementLabel, riskBadgeColor } from "../api/lmsAnalytics";
import { useNavigate } from "@/lib/router";

export function LmsProgress() {
  const { userId } = useParams<{ userId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  useEffect(() => {
    setBreadcrumbs([
      { label: "TAN", href: "/lms/dashboard" },
      { label: "Enrollments", href: "/lms/enrollments" },
      { label: "Learner Progress" },
    ]);
  }, [setBreadcrumbs]);

  const { data: learner, isLoading } = useQuery({
    queryKey: queryKeys.lms.memberDetail(selectedCompanyId!, userId ?? ""),
    queryFn: () => lmsAnalyticsApi.getMemberDetail(selectedCompanyId!, userId!),
    enabled: !!selectedCompanyId && !!userId,
  });

  if (!selectedCompanyId || !userId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading learner profile…
      </div>
    );
  }

  if (!learner) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Learner not found.</div>;
  }

  const { label: engLabel, color: engColor } = engagementLabel(learner.engagementScore);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/lms/enrollments")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{learner.name}</h1>
          <p className="text-sm text-muted-foreground">{learner.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-[10px] px-2 py-1 rounded-full border font-medium ${riskBadgeColor(learner.riskLevel)}`}>
            {learner.riskLevel} risk
          </span>
          <span className={`text-[11px] font-semibold ${engColor}`}>{engLabel}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Stage", value: learner.progressionStage ?? "explorer" },
          { label: "Enrolled", value: learner.enrollmentCount },
          { label: "Completed", value: learner.completedCourses },
          { label: "Badges", value: learner.badgeCount },
        ].map(s => (
          <div key={s.label} className="bg-black/60 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-xl font-bold capitalize">{s.value}</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Enrollments */}
        <div className="bg-black/50 border border-white/8 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Enrollments
          </h2>
          {learner.enrollments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No enrollments yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {learner.enrollments.map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  {e.completedAt
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                    : <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  }
                  <span className="flex-1 truncate">{e.workshopName}</span>
                  <span className="text-muted-foreground shrink-0">{Math.round(e.progress)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="bg-black/50 border border-white/8 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" /> Badges
          </h2>
          {learner.badges.length === 0 ? (
            <p className="text-xs text-muted-foreground">No badges earned yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {learner.badges.map(b => (
                <span key={b.id} className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                  🏅 {b.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Interventions */}
        {learner.interventions.length > 0 && (
          <div className="bg-black/50 border border-red-500/10 rounded-xl p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Interventions
            </h2>
            <div className="flex flex-col gap-2">
              {learner.interventions.map(inv => (
                <div key={inv.id} className="flex items-start gap-2 text-xs">
                  <span className="bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0">
                    {inv.type}
                  </span>
                  <span className="text-muted-foreground">{inv.notes ?? "No notes"}</span>
                  {inv.resolvedAt && <span className="text-green-400 shrink-0">resolved</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional stats */}
        <div className="bg-black/50 border border-white/8 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" /> Activity
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "XR Sessions", value: learner.xrSessionCount },
              { label: "Community Mins", value: learner.communityMinutes },
              { label: "Marketplace Rev", value: `${learner.marketplaceRevenue} SIMS` },
              { label: "Last Active", value: learner.lastActive ? new Date(learner.lastActive).toLocaleDateString() : "—" },
            ].map(s => (
              <div key={s.label}>
                <div className="text-sm font-semibold">{s.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
