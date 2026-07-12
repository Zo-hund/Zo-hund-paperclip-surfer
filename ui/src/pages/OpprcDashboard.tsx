import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, Layers, FolderOpen, Database, FileText, Award,
  Loader2, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { opprrcApi, type OpprcDelivery } from "../api/opprrc";
import { queryKeys } from "../lib/queryKeys";
import { useNavigate } from "@/lib/router";
import type { OpprcCategorySlug, OpprcDeliveryReviewStatus } from "@paperclipai/shared";

const LANES: Array<{
  key: string;
  category: OpprcCategorySlug;
  label: string;
  icon: typeof Building2;
  color: string;
  bg: string;
}> = [
  { key: "org",         category: "01_organizations", label: "Organization",  icon: Building2,  color: "text-blue-400",   bg: "bg-blue-500/5 border-blue-500/15" },
  { key: "program",     category: "02_programs",      label: "Program",       icon: Layers,     color: "text-purple-400", bg: "bg-purple-500/5 border-purple-500/15" },
  { key: "project",     category: "03_projects",      label: "Project",       icon: FolderOpen, color: "text-amber-400",  bg: "bg-amber-500/5 border-amber-500/15" },
  { key: "resources",   category: "04_resources",     label: "Resources",     icon: Database,   color: "text-green-400",  bg: "bg-green-500/5 border-green-500/15" },
  { key: "report",      category: "05_reports",       label: "Reports",       icon: FileText,   color: "text-cyan-400",   bg: "bg-cyan-500/5 border-cyan-500/15" },
  { key: "certificate", category: "06_certificates",  label: "Certificates",  icon: Award,      color: "text-orange-400", bg: "bg-orange-500/5 border-orange-500/15" },
];

const REVIEW_STATUS_LABEL: Record<OpprcDeliveryReviewStatus, string> = {
  not_submitted: "not submitted",
  pending_review: "pending review",
  approved: "approved",
  revision_requested: "revision requested",
  rejected: "rejected",
};

function reviewBreakdown(records: OpprcDelivery[]): string {
  const counts = new Map<OpprcDeliveryReviewStatus, number>();
  for (const record of records) {
    counts.set(record.reviewStatus, (counts.get(record.reviewStatus) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${count} ${REVIEW_STATUS_LABEL[status] ?? status}`)
    .join(", ");
}

function deliveryDisplayName(delivery: OpprcDelivery): string {
  const path = delivery.vpsFilePath;
  if (path) {
    const parts = path.split(/[\\/]/);
    const name = parts[parts.length - 1];
    if (name) return name;
  }
  return `Delivery ${delivery.id.slice(0, 8)}`;
}

export function OpprcDashboard() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  useEffect(() => {
    setBreadcrumbs([{ label: "OPPRRC" }]);
  }, [setBreadcrumbs]);

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: queryKeys.opprrc.deliveries(selectedCompanyId!),
    queryFn: () => opprrcApi.listDeliveries(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Select a company.</div>;
  }

  const byCategory = new Map<OpprcCategorySlug, OpprcDelivery[]>();
  for (const lane of LANES) byCategory.set(lane.category, []);
  for (const delivery of deliveries) {
    const bucket = byCategory.get(delivery.category);
    if (bucket) bucket.push(delivery);
    else byCategory.set(delivery.category, [delivery]);
  }

  const total = deliveries.length;

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
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Deliveries</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading proof vault…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LANES.map(lane => {
            const records = byCategory.get(lane.category) ?? [];
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

                {records.length > 0 && (
                  <p className="text-[10px] text-muted-foreground -mt-2">{reviewBreakdown(records)}</p>
                )}

                {records.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No deliveries in this lane.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {records.slice(0, 4).map(delivery => {
                      return (
                        <button
                          key={delivery.id}
                          onClick={() => navigate(`/opprrc/deliveries/${delivery.id}`)}
                          className="flex items-center gap-2 text-xs hover:opacity-80 transition-opacity text-left"
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              delivery.reviewStatus === "approved"
                                ? "bg-green-400"
                                : delivery.reviewStatus === "rejected"
                                  ? "bg-red-400"
                                  : delivery.reviewStatus === "pending_review"
                                    ? "bg-amber-400"
                                    : delivery.reviewStatus === "revision_requested"
                                      ? "bg-orange-400"
                                      : "bg-muted-foreground/40"
                            }`}
                          />
                          <span className="truncate flex-1">{deliveryDisplayName(delivery)}</span>
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
