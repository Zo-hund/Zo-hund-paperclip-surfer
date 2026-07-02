import { useEffect } from "react";
import { useParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, FileText, Download, CheckCircle2, Loader2, Tag, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { issuesApi } from "../api/issues";
import { useNavigate } from "@/lib/router";

export function OpprcRecord() {
  const { recordId } = useParams<{ recordId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  useEffect(() => {
    setBreadcrumbs([
      { label: "OPPRRC", href: "/opprrc" },
      { label: "Record Detail" },
    ]);
  }, [setBreadcrumbs]);

  const { data: issue, isLoading } = useQuery({
    queryKey: ["issues", "detail", recordId],
    queryFn: () => issuesApi.get(recordId!),
    enabled: !!recordId,
  });

  if (!selectedCompanyId || !recordId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading record…
      </div>
    );
  }

  if (!issue) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Record not found.</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/opprrc")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{issue.title}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="capitalize">{issue.status}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(issue.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
          <Button size="sm" className="gap-1.5">
            <Award className="h-3.5 w-3.5" /> Issue Certificate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-black/50 border border-white/8 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Summary</h2>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">
            {issue.description ?? "No description provided."}
          </p>
        </div>

        <div className="bg-black/50 border border-white/8 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Proof Status</h2>
          <div className="flex flex-col gap-2">
            {[
              { label: "Organization Link", done: !!issue.projectId },
              { label: "Program Evidence", done: false },
              { label: "Resource Attachments", done: false },
              { label: "Report Generated", done: false },
              { label: "Certificate Issued", done: false },
              { label: "Approved", done: issue.status === "done" },
            ].map(step => (
              <div key={step.label} className="flex items-center gap-2 text-xs">
                <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${step.done ? "text-green-400" : "text-muted-foreground/40"}`} />
                <span className={step.done ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {(issue.labels ?? []).length > 0 && (
          <div className="bg-black/50 border border-white/8 rounded-xl p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Labels
            </h2>
            <div className="flex flex-wrap gap-2">
              {(issue.labels ?? []).map(label => (
                <span key={label.id} className="bg-primary/10 text-primary border border-primary/20 text-[10px] px-2 py-0.5 rounded-full font-medium">
                  {label.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-black/50 border border-white/8 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Actions</h2>
          <div className="flex flex-col gap-2">
            {[
              { label: "Generate Report", icon: FileText },
              { label: "Issue Certificate", icon: Award },
              { label: "Export PDF", icon: Download },
            ].map(action => (
              <Button key={action.label} size="sm" variant="outline" className="justify-start gap-2">
                <action.icon className="h-3.5 w-3.5" />
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
