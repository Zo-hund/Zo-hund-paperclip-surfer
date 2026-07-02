import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, AlertTriangle, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { lmsAnalyticsApi, type LearnerRosterItem, riskBadgeColor, engagementLabel } from "../api/lmsAnalytics";
import { useNavigate } from "@/lib/router";

const STAGE_BADGE: Record<string, string> = {
  explorer: "bg-muted text-muted-foreground",
  builder: "bg-blue-500/10 text-blue-400",
  ambassador: "bg-purple-500/10 text-purple-400",
  earner: "bg-amber-500/10 text-amber-400",
  leader: "bg-green-500/10 text-green-400",
};

export function LmsEnrollments() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  useEffect(() => {
    setBreadcrumbs([{ label: "TAN", href: "/lms/dashboard" }, { label: "Enrollments" }]);
  }, [setBreadcrumbs]);

  const { data: members = [], isLoading } = useQuery({
    queryKey: queryKeys.lms.members(selectedCompanyId!),
    queryFn: () => lmsAnalyticsApi.getMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Select a company.</div>;
  }

  const atRisk = members.filter(m => m.riskLevel === "red" || m.riskLevel === "critical" || m.riskLevel === "orange").length;
  const leaders = members.filter(m => m.progressionStage === "leader" || m.progressionStage === "ambassador").length;
  const totalEnrolled = members.reduce((s, m) => s + m.enrollmentCount, 0);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Enrollments
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Learner roster, progress, and engagement</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Learners", value: members.length, icon: Users, color: "text-primary" },
          { label: "Total Enrolled", value: totalEnrolled, icon: TrendingUp, color: "text-blue-400" },
          { label: "At Risk", value: atRisk, icon: AlertTriangle, color: "text-red-400" },
          { label: "Leaders", value: leaders, icon: CheckCircle2, color: "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-black/60 border border-white/10 rounded-xl p-4 flex items-center gap-3">
            <s.icon className={`h-5 w-5 shrink-0 ${s.color}`} />
            <div>
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading learners…
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No learners enrolled yet.</p>
        </div>
      ) : (
        <div className="bg-black/40 border border-white/8 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {["Learner", "Stage", "Enrollments", "Completions", "Badges", "Risk", "Engagement", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <MemberRow key={member.userId} member={member} onView={() => navigate(`/lms/progress/${member.userId}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, onView }: { member: LearnerRosterItem; onView: () => void }) {
  const { label: engLabel, color: engColor } = engagementLabel(member.engagementScore);
  return (
    <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium truncate max-w-[160px]">{member.name}</div>
        <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">{member.email}</div>
      </td>
      <td className="px-4 py-3">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${STAGE_BADGE[member.progressionStage ?? "explorer"] ?? "bg-muted text-muted-foreground"}`}>
          {member.progressionStage ?? "explorer"}
        </span>
      </td>
      <td className="px-4 py-3 text-center">{member.enrollmentCount}</td>
      <td className="px-4 py-3 text-center">{member.completedCourses}</td>
      <td className="px-4 py-3 text-center">{member.badgeCount}</td>
      <td className="px-4 py-3">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${riskBadgeColor(member.riskLevel)}`}>
          {member.riskLevel}
        </span>
      </td>
      <td className={`px-4 py-3 text-xs font-medium ${engColor}`}>{engLabel}</td>
      <td className="px-4 py-3">
        <button onClick={onView} className="text-muted-foreground hover:text-primary transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
