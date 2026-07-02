import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award, GraduationCap, Star, Users, Briefcase, Bot,
  Download, Eye, CheckCircle2, Plus, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { lmsAnalyticsApi, type BadgeDefinition } from "../api/lmsAnalytics";

interface CertType {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

const CERT_TYPES: CertType[] = [
  {
    id: "completion",
    title: "Completion Certificate",
    description: "Awarded upon completing all modules in a workshop.",
    icon: GraduationCap,
    color: "text-blue-400",
    bg: "bg-blue-500/5 border-blue-500/15",
  },
  {
    id: "workshop",
    title: "Workshop Certificate",
    description: "Workshop-specific certification with skill verification.",
    icon: Award,
    color: "text-purple-400",
    bg: "bg-purple-500/5 border-purple-500/15",
  },
  {
    id: "skill_pod",
    title: "Skill Pod Certificate",
    description: "Micro-credential for completing a skill pod or track.",
    icon: Star,
    color: "text-amber-400",
    bg: "bg-amber-500/5 border-amber-500/15",
  },
  {
    id: "trainer",
    title: "Trainer Certificate",
    description: "XRT Train the Trainer certification — authorized to deliver sessions.",
    icon: Users,
    color: "text-green-400",
    bg: "bg-green-500/5 border-green-500/15",
  },
  {
    id: "ambassador",
    title: "Ambassador Certificate",
    description: "Community leadership recognition — Ambassador progression stage.",
    icon: Briefcase,
    color: "text-cyan-400",
    bg: "bg-cyan-500/5 border-cyan-500/15",
  },
  {
    id: "agent_assisted",
    title: "Agent-Assisted Workflow Certificate",
    description: "Proof of completing an AI agent-guided learning workflow.",
    icon: Bot,
    color: "text-rose-400",
    bg: "bg-rose-500/5 border-rose-500/15",
  },
];

export function Certificates() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Certificates" }]);
  }, [setBreadcrumbs]);

  const { data: badges = [], isLoading } = useQuery({
    queryKey: queryKeys.lms.badges(selectedCompanyId!),
    queryFn: () => lmsAnalyticsApi.getBadges(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Select a company.</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" /> Certificates
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Issue, verify, and download proof certificates</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Issue Certificate
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Certificate Types" value={CERT_TYPES.length} />
        <StatCard label="Badges Defined" value={badges.length} />
        <StatCard label="Total Awarded" value={badges.reduce((s, b) => s + b.awardedCount, 0)} />
      </div>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Certificate Types</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CERT_TYPES.map(cert => (
            <CertCard key={cert.id} cert={cert} />
          ))}
        </div>
      </div>

      {badges.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Badge Definitions</h2>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading badges…
            </div>
          ) : (
            <div className="bg-black/40 border border-white/8 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    {["Badge", "Category", "Awarded", ""].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {badges.map(badge => (
                    <BadgeRow key={badge.id} badge={badge} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-black/60 border border-white/10 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function CertCard({ cert }: { cert: CertType }) {
  const Icon = cert.icon;
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${cert.bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${cert.color}`} />
        <div className="font-semibold text-sm">{cert.title}</div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{cert.description}</p>
      <div className="flex gap-2 mt-auto">
        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 flex-1 border border-white/10">
          <Eye className="h-3 w-3" /> Preview
        </Button>
        <Button size="sm" className="h-7 text-[11px] gap-1 flex-1">
          <Plus className="h-3 w-3" /> Issue
        </Button>
      </div>
      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-muted-foreground">
        <CheckCircle2 className="h-3 w-3" /> Verify · <Download className="h-3 w-3" /> Download
      </Button>
    </div>
  );
}

function BadgeRow({ badge }: { badge: BadgeDefinition }) {
  return (
    <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-sm">{badge.name}</div>
        <div className="text-xs text-muted-foreground truncate max-w-xs">{badge.description}</div>
      </td>
      <td className="px-4 py-3">
        <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full">{badge.category}</span>
      </td>
      <td className="px-4 py-3 text-sm text-center">{badge.awardedCount}</td>
      <td className="px-4 py-3">
        <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1">
          <Award className="h-3 w-3" /> Award
        </Button>
      </td>
    </tr>
  );
}
