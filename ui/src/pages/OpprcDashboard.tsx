import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, Layers, FolderOpen, Database, FileText, Award,
  Loader2, ExternalLink, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { useNavigate } from "@/lib/router";
import type { Issue } from "@paperclipai/shared";

const LANES = [
  { key: "org",         label: "Organization",  icon: Building2, color: "text-blue-400",   bg: "bg-blue-500/5 border-blue-500/15" },
  { key: "program",     label: "Program",        icon: Layers,    color: "text-purple-400", bg: "bg-purple-500/5 border-purple-500/15" },
  { key: "project",     label: "Project",        icon: FolderOpen, color: "text-amber-400", bg: "bg-amber-500/5 border-amber-500/15" },
  { key: "resources",   label: "Resources",      icon: Database,  color: "text-green-400",  bg: "bg-green-500/5 border-green-500/15" },
  { key: "report",      label: "Reports",        icon: FileText,  color: "text-cyan-400",   bg: "bg-cyan-500/5 border-cyan-500/15" },
  { key: "certificate", label: "Certificates",   icon: Award,     color: "text-orange-400", bg: "bg-orange-500/5 border-orange-500/15" },
] as const;


export function OpprcDashboard() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  useEffect(() => {
    setBreadcrumbs([{ label: "OPPRRC" }]);
  }, [setBreadcrumbs]);

  const { data: issues = [], isLoading } = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "opprrc"],
    queryFn: () => issuesApi.list(selectedCompanyId!, { lifecycleStage: "opprrc" } as Record<string, string>),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Select a company.</div>;
  }

  // Group issues by title keyword or label name matching lane key
  const byLane: Record<string, Issue[]> = {};
  for (const lane of LANES) {
    byLane[lane.key] = issues.filter(issue => {
      const title = issue.title.toLowerCase();
      const labelNames = (issue.labels ?? []).map(l => l.name.toLowerCase());
      return title.includes(lane.key) || labelNames.some(l => l.includes(lane.key));
    });
  }
  // Fallback: put unclassified into "resources"
  const classified = new Set(Object.values(byLane).flat().map(i => i.id));
  byLane["resources"] = [...(byLane["resources"] ?? []), ...issues.filter(i => !classified.has(i.id))];

  const total = issues.length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" /> OPPRRC Proof Vault
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organization · Program · Project · Resources · Report · Certificate
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Records</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading proof vault…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LANES.map(lane => {
            const records = byLane[lane.key] ?? [];
            const Icon = lane.icon;
            return (
              <div key={lane.key} className={`rounded-xl border p-4 flex flex-col gap-3 ${lane.bg}`}>
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 font-semibold text-sm ${lane.color}`}>
                    <Icon className="h-4 w-4" />
                    {lane.label}
                  </div>
                  <span className="text-lg font-bold">{records.length}</span>
                </div>

                {records.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No proof records in this lane.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {records.slice(0, 4).map(issue => {
                      return (
                        <button
                          key={issue.id}
                          onClick={() => navigate(`/opprrc/${issue.id}`)}
                          className="flex items-center gap-2 text-xs hover:opacity-80 transition-opacity text-left"
                        >
                          <CheckCircle2 className={`h-3 w-3 shrink-0 ${issue.status === "done" ? "text-green-400" : "text-muted-foreground/60"}`} />
                          <span className="truncate flex-1">{issue.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                        </button>
                      );
                    })}
                    {records.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{records.length - 4} more</span>
                    )}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[11px] h-7 w-full mt-auto border border-white/10"
                  onClick={() => navigate(`/issues?lifecycleStage=opprrc&lane=${lane.key}`)}
                >
                  View All
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
