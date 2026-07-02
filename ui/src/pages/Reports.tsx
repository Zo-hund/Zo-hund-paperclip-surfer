import { useEffect } from "react";
import {
  FileText, BarChart3, Users, BookOpen, DollarSign, Building2,
  TrendingUp, Award, Download, Eye, Plus, Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";

interface ReportType {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  category: string;
}

const REPORT_TYPES: ReportType[] = [
  {
    id: "learner_progress",
    title: "Learner Progress Report",
    description: "Individual and cohort progress across workshops, modules, and milestones.",
    icon: Users,
    color: "text-blue-400",
    bg: "bg-blue-500/5 border-blue-500/15",
    category: "LMS",
  },
  {
    id: "session_report",
    title: "Session Report",
    description: "Attendance, engagement, and outcomes for a given live session.",
    icon: BookOpen,
    color: "text-purple-400",
    bg: "bg-purple-500/5 border-purple-500/15",
    category: "LMS",
  },
  {
    id: "workshop_report",
    title: "Workshop Report",
    description: "Completion rates, average scores, and enrollment trends per workshop.",
    icon: BarChart3,
    color: "text-amber-400",
    bg: "bg-amber-500/5 border-amber-500/15",
    category: "LMS",
  },
  {
    id: "grant_report",
    title: "Grant Report",
    description: "Program delivery metrics formatted for grant compliance and reporting.",
    icon: FileText,
    color: "text-green-400",
    bg: "bg-green-500/5 border-green-500/15",
    category: "Compliance",
  },
  {
    id: "sponsor_report",
    title: "Sponsor Report",
    description: "Impact summary for sponsors and donors — participants served, outcomes achieved.",
    icon: Building2,
    color: "text-cyan-400",
    bg: "bg-cyan-500/5 border-cyan-500/15",
    category: "Compliance",
  },
  {
    id: "tenant_activity",
    title: "Tenant Activity Report",
    description: "Full activity log, agent runs, and system usage for this organization.",
    icon: TrendingUp,
    color: "text-orange-400",
    bg: "bg-orange-500/5 border-orange-500/15",
    category: "Admin",
  },
  {
    id: "revenue_report",
    title: "Revenue Report",
    description: "Subscription revenue, credits purchased, marketplace earnings, and token flow.",
    icon: DollarSign,
    color: "text-emerald-400",
    bg: "bg-emerald-500/5 border-emerald-500/15",
    category: "Finance",
  },
  {
    id: "opprrc_proof",
    title: "OPPRRC Proof Report",
    description: "Auditable proof-of-work export across all six OPPRRC lanes.",
    icon: Award,
    color: "text-rose-400",
    bg: "bg-rose-500/5 border-rose-500/15",
    category: "OPPRRC",
  },
];

const CATEGORIES = Array.from(new Set(REPORT_TYPES.map(r => r.category)));

export function Reports() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Reports" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Select a company.</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Generate, preview, and export proof-ready reports</p>
      </div>

      {CATEGORIES.map(cat => (
        <div key={cat}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">{cat}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {REPORT_TYPES.filter(r => r.category === cat).map(report => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportCard({ report }: { report: ReportType }) {
  const Icon = report.icon;
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${report.bg}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg bg-black/40 flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${report.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight">{report.title}</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{report.description}</p>
      <div className="flex gap-2 mt-auto">
        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 flex-1 border border-white/10">
          <Eye className="h-3 w-3" /> Preview
        </Button>
        <Button size="sm" className="h-7 text-[11px] gap-1 flex-1">
          <Download className="h-3 w-3" /> Export
        </Button>
      </div>
      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground">
        <Save className="h-3 w-3" /> Save to OPPRRC
      </Button>
    </div>
  );
}
