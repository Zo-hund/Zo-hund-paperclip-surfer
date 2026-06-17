import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, BookOpen, Brain, Award, Briefcase, Globe2, BarChart3,
  Headset, FileText, ShieldCheck, Loader2, AlertTriangle,
  ChevronRight, X, RefreshCw, Flag, UserCheck, MessageSquare,
  Calendar, Star, TrendingUp, AlertCircle, CheckSquare, Download,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/context/CompanyContext";
import { useQuery as useAutoRefreshQuery } from "@tanstack/react-query";
import {
  lmsAnalyticsApi,
  riskBadgeColor,
  engagementLabel,
  type LearnerRosterItem,
  type LearnerDetail,
} from "@/api/lmsAnalytics";
import { amxApi, type ChainLog, type AmxCertificate } from "@/api/amx";
import { reportExportUrl, type ReportExportFormat } from "@/api/agentKpis";

// ── Helpers ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg shrink-0 ${accent ?? "bg-primary/10 text-primary"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-2xl font-black text-foreground">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function RiskPill({ risk }: { risk: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${riskBadgeColor(risk)}`}>
      {risk}
    </span>
  );
}

const STAGE_COLORS: Record<string, string> = {
  explorer:   "bg-slate-500/10 text-slate-600 border-slate-500/20",
  builder:    "bg-blue-500/10 text-blue-600 border-blue-500/20",
  ambassador: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  earner:     "bg-amber-500/10 text-amber-600 border-amber-500/20",
  leader:     "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
};

function StagePill({ stage }: { stage?: string }) {
  const s = stage ?? "explorer";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${STAGE_COLORS[s] ?? "bg-muted text-muted-foreground border-border"}`}>
      {s}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <AlertCircle className="h-8 w-8 mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ── Learner Detail Panel ──────────────────────────────────────────────────────

function LearnerDetailPanel({
  userId, companyId, onClose,
}: { userId: string; companyId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lms", "member", companyId, userId],
    queryFn: () => lmsAnalyticsApi.getMemberDetail(companyId, userId),
  });
  const qc = useQueryClient();
  const [interventionType, setInterventionType] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submittingIntervention, setSubmittingIntervention] = useState(false);

  const d = data as LearnerDetail | undefined;

  async function handleIntervention() {
    if (!interventionType) return;
    setSubmittingIntervention(true);
    try {
      await lmsAnalyticsApi.createIntervention(companyId, userId, {
        type: interventionType,
        notes: notes || undefined,
      });
      setInterventionType("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["lms", "member", companyId, userId] });
    } finally {
      setSubmittingIntervention(false);
    }
  }

  const INTERVENTION_TYPES = [
    { value: "flag", label: "Flag", icon: Flag },
    { value: "mentor", label: "Assign Mentor", icon: UserCheck },
    { value: "nudge", label: "AI Nudge", icon: MessageSquare },
    { value: "coaching", label: "Coaching", icon: Calendar },
    { value: "course", label: "Recommend Course", icon: BookOpen },
    { value: "badge", label: "Award Badge", icon: Star },
    { value: "escalate", label: "Escalate", icon: AlertTriangle },
    { value: "task", label: "Create Task", icon: CheckSquare },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-background border-l border-border shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h3 className="text-sm font-black uppercase tracking-widest">Learner Profile</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {isLoading || !d ? (
        <LoadingState />
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Identity */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-sm">
                {d.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-black text-base">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <RiskPill risk={d.riskLevel} />
              <span className={`text-xs font-bold ${engagementLabel(d.engagementScore).color}`}>
                {engagementLabel(d.engagementScore).label} ({d.engagementScore})
              </span>
              {d.memberTypes.map(t => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-accent text-[10px] uppercase tracking-wider font-medium">
                  {t}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-muted-foreground">
              {d.organization && <span>Org: <strong className="text-foreground">{d.organization}</strong></span>}
              {d.cohort && <span>Cohort: <strong className="text-foreground">{d.cohort}</strong></span>}
              {d.teamAssignment && <span>Team: <strong className="text-foreground">{d.teamAssignment}</strong></span>}
              {d.careerInterest && <span>Career: <strong className="text-foreground">{d.careerInterest}</strong></span>}
              {d.partnerStatus && <span>Partner: <strong className="text-foreground capitalize">{d.partnerStatus}</strong></span>}
              {d.ambassadorStatus && <span>Ambassador: <strong className="text-foreground capitalize">{d.ambassadorStatus}</strong></span>}
              {d.sponsorshipTier && <span>Sponsorship: <strong className="text-foreground capitalize">{d.sponsorshipTier}</strong></span>}
            </div>
            {(d.marketplaceRevenue > 0 || d.donationAmount > 0) && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {d.marketplaceRevenue > 0 && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-2 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/70">Marketplace Rev</p>
                    <p className="text-sm font-black text-amber-300">${(d.marketplaceRevenue / 100).toLocaleString()}</p>
                  </div>
                )}
                {d.donationAmount > 0 && (
                  <div className="rounded-md bg-orange-500/10 border border-orange-500/20 p-2 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-400/70">Total Donated</p>
                    <p className="text-sm font-black text-orange-300">${(d.donationAmount / 100).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-accent/30 p-3 text-center">
              <p className="text-xl font-black">{d.enrollmentCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Enrolled</p>
            </div>
            <div className="rounded-lg bg-accent/30 p-3 text-center">
              <p className="text-xl font-black">{d.completedCourses}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Completed</p>
            </div>
            <div className="rounded-lg bg-accent/30 p-3 text-center">
              <p className="text-xl font-black">{d.badgeCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Badges</p>
            </div>
          </div>

          {/* Enrollments */}
          {d.enrollments.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Course Timeline</p>
              <div className="space-y-2">
                {d.enrollments.map(e => (
                  <div key={e.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{e.workshopName}</p>
                      <p className="text-muted-foreground">{e.status} · {e.progress}%{e.score != null ? ` · Score: ${e.score}%` : ""}</p>
                    </div>
                    {e.completedAt ? (
                      <span className="text-green-600 text-[10px] shrink-0">✓ Done</span>
                    ) : (
                      <span className="text-muted-foreground shrink-0">{e.progress}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Badges */}
          {d.badges.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Achievements</p>
              <div className="flex flex-wrap gap-2">
                {d.badges.map(b => (
                  <span key={b.id} className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[11px] font-medium border border-amber-500/20">
                    {b.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Interventions */}
          {d.interventions.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Intervention Log</p>
              <div className="space-y-2">
                {d.interventions.map(i => (
                  <div key={i.id} className="rounded-md border border-border p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-black uppercase tracking-wider">{i.type}</span>
                      <span className={`text-[10px] ${i.resolvedAt ? "text-green-600" : "text-muted-foreground"}`}>
                        {i.resolvedAt ? "Resolved" : "Open"}
                      </span>
                    </div>
                    {i.notes && <p className="mt-1 text-muted-foreground">{i.notes}</p>}
                    <p className="text-muted-foreground mt-1">{new Date(i.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create Intervention */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">New Intervention</p>
            <div className="flex flex-wrap gap-2">
              {INTERVENTION_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setInterventionType(value === interventionType ? "" : value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${
                    interventionType === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
            {interventionType && (
              <div className="space-y-2">
                <Input
                  placeholder="Notes (optional)"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="text-sm h-9"
                />
                <Button
                  size="sm"
                  onClick={handleIntervention}
                  disabled={submittingIntervention}
                  className="w-full"
                >
                  {submittingIntervention ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log Intervention"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function LmsCommandCenter() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState("overview");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [rosterSearch, setRosterSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [memberTypeFilter, setMemberTypeFilter] = useState("all");
  const [createBadgeName, setCreateBadgeName] = useState("");
  const [createBadgeDesc, setCreateBadgeDesc] = useState("");
  const [creatingBadge, setCreatingBadge] = useState(false);
  const qc = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────

  const overviewQ = useAutoRefreshQuery({
    queryKey: ["lms", "overview", companyId],
    queryFn: () => lmsAnalyticsApi.getOverview(companyId),
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const membersQ = useQuery({
    queryKey: ["lms", "members", companyId],
    queryFn: () => lmsAnalyticsApi.getMembers(companyId),
    enabled: !!companyId,
  });

  const coursesQ = useQuery({
    queryKey: ["lms", "courses", companyId],
    queryFn: () => lmsAnalyticsApi.getCourseAnalytics(companyId),
    enabled: !!companyId && (activeTab === "courses" || activeTab === "ai-coach"),
  });

  const badgesQ = useQuery({
    queryKey: ["lms", "badges", companyId],
    queryFn: () => lmsAnalyticsApi.getBadges(companyId),
    enabled: !!companyId && activeTab === "badges",
  });

  const workforceQ = useQuery({
    queryKey: ["lms", "workforce", companyId],
    queryFn: () => lmsAnalyticsApi.getWorkforceMetrics(companyId),
    enabled: !!companyId && activeTab === "workforce",
  });

  const communityQ = useQuery({
    queryKey: ["lms", "community", companyId],
    queryFn: () => lmsAnalyticsApi.getCommunityMetrics(companyId),
    enabled: !!companyId && activeTab === "community",
  });

  const xrQ = useQuery({
    queryKey: ["lms", "xr", companyId],
    queryFn: () => lmsAnalyticsApi.getXrMetrics(companyId),
    enabled: !!companyId && activeTab === "xr",
  });

  const chainQ = useQuery({
    queryKey: ["amx", "chain", companyId],
    queryFn: () => amxApi.getChain(companyId),
    enabled: !!companyId && activeTab === "audit",
  });

  const certsQ = useQuery({
    queryKey: ["amx", "certs", companyId],
    queryFn: () => amxApi.getCertificates(companyId),
    enabled: !!companyId && activeTab === "audit",
  });

  // ── Filtered roster ───────────────────────────────────────────────────────

  const allMembers = membersQ.data ?? [];
  const filteredMembers = allMembers.filter(m => {
    if (riskFilter !== "all" && m.riskLevel !== riskFilter) return false;
    if (memberTypeFilter !== "all" && !m.memberTypes.includes(memberTypeFilter)) return false;
    if (rosterSearch) {
      const q = rosterSearch.toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const riskQueue = allMembers
    .filter(m => m.riskLevel === "critical" || m.riskLevel === "red")
    .sort((a, b) => {
      const order = { critical: 0, red: 1 };
      return (order[a.riskLevel as keyof typeof order] ?? 2) - (order[b.riskLevel as keyof typeof order] ?? 2);
    });

  // ── Badge creation ─────────────────────────────────────────────────────────

  async function handleCreateBadge() {
    if (!createBadgeName.trim()) return;
    setCreatingBadge(true);
    try {
      await lmsAnalyticsApi.createBadge(companyId, {
        name: createBadgeName.trim(),
        description: createBadgeDesc.trim(),
      });
      setCreateBadgeName("");
      setCreateBadgeDesc("");
      qc.invalidateQueries({ queryKey: ["lms", "badges", companyId] });
    } finally {
      setCreatingBadge(false);
    }
  }

  const ov = overviewQ.data;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-background/50">
      {/* Header */}
      <div className="px-6 py-6 border-b border-border/40 bg-accent/5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-black uppercase tracking-widest">CRM Command Center</h1>
          </div>
          <p className="text-xs text-muted-foreground">AMX AIR HUB · Live Operations Dashboard · No Mock Data</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => qc.invalidateQueries({ queryKey: ["lms"] })}
          className="gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border px-6 overflow-x-auto">
          <TabsList className="h-12 bg-transparent gap-1 p-0">
            {[
              { value: "overview", label: "Overview", icon: BarChart3 },
              { value: "learners", label: "Learners", icon: Users },
              { value: "courses", label: "Courses", icon: BookOpen },
              { value: "ai-coach", label: "AI Coach", icon: Brain },
              { value: "badges", label: "Badges", icon: Award },
              { value: "workforce", label: "Workforce", icon: Briefcase },
              { value: "community", label: "Community", icon: Globe2 },
              { value: "xr", label: "XR", icon: Headset },
              { value: "reports", label: "Reports", icon: FileText },
              { value: "audit", label: "Audit", icon: ShieldCheck },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-12 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-[11px] font-black uppercase tracking-widest gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="p-6 space-y-6 mt-0">
            {overviewQ.isLoading ? <LoadingState /> : !ov ? null : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard label="Active Learners" value={ov.activeLearners} sub={`of ${ov.totalMembers} total`} icon={Users} accent="bg-blue-500/10 text-blue-600" />
                  <KpiCard label="Enrollments" value={ov.totalEnrollments} sub={`${Math.round(ov.completionRate)}% completion`} icon={BookOpen} accent="bg-green-500/10 text-green-600" />
                  <KpiCard label="Badges Issued" value={ov.badgesIssued} icon={Award} accent="bg-amber-500/10 text-amber-600" />
                  <KpiCard label="Certificates" value={ov.certificatesEarned} icon={ShieldCheck} accent="bg-purple-500/10 text-purple-600" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard label="XR Sessions" value={ov.xrSessions} icon={Headset} accent="bg-cyan-500/10 text-cyan-600" />
                  <KpiCard label="AI Agent Runs" value={ov.aiActivityRuns} sub="TAZ · JAZ · RAZ · NAZ · GAZ · OPS" icon={Brain} accent="bg-indigo-500/10 text-indigo-600" />
                  <KpiCard label="Workforce Placed" value={ov.workforcePlaced} icon={Briefcase} accent="bg-emerald-500/10 text-emerald-600" />
                  <KpiCard label="Community Projects" value={ov.communityProjects} sub={`${ov.volunteerHours}h volunteer · ${ov.mentoringHours}h mentoring`} icon={Globe2} accent="bg-orange-500/10 text-orange-600" />
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                  Auto-refreshes every 30 seconds · {new Date().toLocaleTimeString()}
                </p>
              </>
            )}
          </TabsContent>

          {/* ── LEARNERS ─────────────────────────────────────────────────── */}
          <TabsContent value="learners" className="p-6 space-y-4 mt-0">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search by name or email…"
                value={rosterSearch}
                onChange={e => setRosterSearch(e.target.value)}
                className="flex-1 h-9 text-sm"
              />
              <select
                value={riskFilter}
                onChange={e => setRiskFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All Risk Levels</option>
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
                <option value="orange">Orange</option>
                <option value="red">Red</option>
                <option value="critical">Critical</option>
              </select>
              <select
                value={memberTypeFilter}
                onChange={e => setMemberTypeFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All Member Types</option>
                {["learner","builder","ambassador","earner","parent","community","sponsor","volunteer","donor"].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            {membersQ.isLoading ? <LoadingState /> : filteredMembers.length === 0 ? (
              <EmptyState message="No learners match the current filters." />
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Team</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Risk</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">Stage</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Engagement</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden xl:table-cell">Courses</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((m: LearnerRosterItem) => {
                      const eng = engagementLabel(m.engagementScore);
                      return (
                        <tr
                          key={m.userId}
                          className="border-b border-border/40 hover:bg-accent/20 cursor-pointer transition-colors"
                          onClick={() => setDetailUserId(m.userId)}
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium">{m.name}</p>
                              <p className="text-[11px] text-muted-foreground">{m.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">{m.teamAssignment ?? "—"}</td>
                          <td className="px-4 py-3"><RiskPill risk={m.riskLevel} /></td>
                          <td className="px-4 py-3 hidden md:table-cell"><StagePill stage={m.progressionStage} /></td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className={`text-xs font-bold ${eng.color}`}>{eng.label}</span>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell text-xs">
                            {m.completedCourses}/{m.enrollmentCount}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── COURSES ──────────────────────────────────────────────────── */}
          <TabsContent value="courses" className="p-6 space-y-4 mt-0">
            {coursesQ.isLoading ? <LoadingState /> : !coursesQ.data?.length ? (
              <EmptyState message="No course data yet." />
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-accent/30">
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Workshop</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Format</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Enrolled</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Completion</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Avg Score</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coursesQ.data.map(c => (
                      <tr key={c.workshopId} className="border-b border-border/40 hover:bg-accent/20">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.format}</td>
                        <td className="px-4 py-3 text-right text-xs">{c.enrollmentCount}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold ${c.completionRate >= 70 ? "text-green-600" : c.completionRate >= 40 ? "text-amber-600" : "text-red-600"}`}>
                            {Math.round(c.completionRate)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">{c.avgScore != null ? `${Math.round(c.avgScore)}%` : "—"}</td>
                        <td className="px-4 py-3 text-right text-xs">{c.sessionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── AI COACH ─────────────────────────────────────────────────── */}
          <TabsContent value="ai-coach" className="p-6 space-y-4 mt-0">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-sm font-black uppercase tracking-widest">Risk Queue — Intervention Required</p>
            </div>
            {membersQ.isLoading ? <LoadingState /> : riskQueue.length === 0 ? (
              <EmptyState message="No high-risk learners at this time." />
            ) : (
              <div className="space-y-3">
                {riskQueue.map(m => {
                  const eng = engagementLabel(m.engagementScore);
                  return (
                    <div key={m.userId} className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-600 font-black text-xs shrink-0">
                          {m.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{m.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <RiskPill risk={m.riskLevel} />
                            <span className={`text-[11px] font-bold ${eng.color}`}>{eng.label} ({m.engagementScore})</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailUserId(m.userId)}
                        className="shrink-0 gap-1.5 text-[11px]"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        Intervene
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── BADGES ───────────────────────────────────────────────────── */}
          <TabsContent value="badges" className="p-6 space-y-6 mt-0">
            {/* Create badge */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Create New Badge</p>
              <div className="flex gap-3">
                <Input
                  placeholder="Badge name"
                  value={createBadgeName}
                  onChange={e => setCreateBadgeName(e.target.value)}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Description"
                  value={createBadgeDesc}
                  onChange={e => setCreateBadgeDesc(e.target.value)}
                  className="h-9 text-sm flex-1"
                />
                <Button size="sm" onClick={handleCreateBadge} disabled={creatingBadge || !createBadgeName.trim()} className="shrink-0">
                  {creatingBadge ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
              </div>
            </div>

            {/* Badge catalog */}
            {badgesQ.isLoading ? <LoadingState /> : !badgesQ.data?.length ? (
              <EmptyState message="No badges defined yet. Create your first badge above." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {badgesQ.data.map(b => (
                  <div key={b.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Star className="h-4 w-4 text-amber-600" />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{b.awardedCount} awarded</span>
                    </div>
                    <p className="font-black text-sm">{b.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-accent text-[10px] uppercase tracking-wider">{b.category}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── WORKFORCE ────────────────────────────────────────────────── */}
          <TabsContent value="workforce" className="p-6 space-y-6 mt-0">
            {workforceQ.isLoading ? <LoadingState /> : !workforceQ.data ? (
              <EmptyState message="No workforce data available." />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard label="Total Profiles" value={workforceQ.data.total} icon={Briefcase} />
                  <KpiCard label="Avg Resume" value={`${Math.round(workforceQ.data.avgResume)}%`} icon={FileText} accent="bg-blue-500/10 text-blue-600" />
                  <KpiCard label="Avg Portfolio" value={`${Math.round(workforceQ.data.avgPortfolio)}%`} icon={Star} accent="bg-amber-500/10 text-amber-600" />
                  <KpiCard label="Placed" value={workforceQ.data.byStatus["placed"] ?? 0} icon={CheckSquare} accent="bg-green-500/10 text-green-600" />
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-accent/30">
                        <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(workforceQ.data.byStatus).map(([status, count]) => (
                        <tr key={status} className="border-b border-border/40">
                          <td className="px-4 py-3 capitalize font-medium">{status.replace(/_/g, " ")}</td>
                          <td className="px-4 py-3 text-right font-black">{count as number}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── COMMUNITY ────────────────────────────────────────────────── */}
          <TabsContent value="community" className="p-6 space-y-6 mt-0">
            {communityQ.isLoading ? <LoadingState /> : !communityQ.data ? (
              <EmptyState message="No community data available." />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard label="Total Activities" value={communityQ.data.totalActivities} icon={Globe2} />
                  <KpiCard label="Volunteer Hours" value={communityQ.data.volunteerHours} icon={Users} accent="bg-green-500/10 text-green-600" />
                  <KpiCard label="Mentoring Hours" value={communityQ.data.mentoringHours} icon={Brain} accent="bg-blue-500/10 text-blue-600" />
                  <KpiCard label="Projects" value={communityQ.data.communityProjects} icon={CheckSquare} accent="bg-amber-500/10 text-amber-600" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KpiCard label="Innovation Challenges" value={communityQ.data.innovationChallenges} icon={TrendingUp} />
                  <KpiCard label="Hackathons" value={communityQ.data.hackathons} icon={Star} />
                </div>
                {Object.keys(communityQ.data.byType).length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-accent/30">
                          <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Activity Type</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(communityQ.data.byType).map(([type, count]) => (
                          <tr key={type} className="border-b border-border/40">
                            <td className="px-4 py-3 capitalize font-medium">{type.replace(/_/g, " ")}</td>
                            <td className="px-4 py-3 text-right font-black">{count as number}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ── XR ───────────────────────────────────────────────────────── */}
          <TabsContent value="xr" className="p-6 space-y-6 mt-0">
            {xrQ.isLoading ? <LoadingState /> : !xrQ.data ? (
              <EmptyState message="No XR session data yet." />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KpiCard label="Total Sessions" value={xrQ.data.totalSessions} icon={Headset} accent="bg-cyan-500/10 text-cyan-600" />
                  <KpiCard label="Duration" value={`${xrQ.data.totalDurationMinutes}m`} icon={Calendar} />
                  <KpiCard label="World Visits" value={xrQ.data.totalWorldVisits} icon={Globe2} />
                  <KpiCard label="Simulations" value={xrQ.data.totalSimulations} icon={Brain} />
                </div>
                {xrQ.data.sessions.length > 0 ? (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-accent/30">
                          <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Member</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Duration</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Worlds</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sims</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {xrQ.data.sessions.map(s => (
                          <tr key={s.id} className="border-b border-border/40 hover:bg-accent/20">
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.memberId.slice(0, 8)}…</td>
                            <td className="px-4 py-3 text-right text-xs">{Math.round(s.sessionDurationSeconds / 60)}m</td>
                            <td className="px-4 py-3 text-right text-xs">{s.worldVisits}</td>
                            <td className="px-4 py-3 text-right text-xs">{s.simulationsCompleted}</td>
                            <td className="px-4 py-3 text-right text-xs text-muted-foreground">{new Date(s.recordedAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState message="No individual XR sessions recorded yet." />
                )}
              </>
            )}
          </TabsContent>

          {/* ── REPORTS ──────────────────────────────────────────────────── */}
          <TabsContent value="reports" className="p-6 space-y-6 mt-0">
            <div className="max-w-xl space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Export Analytics Report</p>
              <div className="grid grid-cols-2 gap-3">
                {(["csv", "json", "markdown", "pdf"] as ReportExportFormat[]).map(fmt => (
                  <a
                    key={fmt}
                    href={reportExportUrl(companyId, fmt)}
                    download
                    className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-4 hover:bg-accent/30 transition-colors text-sm font-black uppercase tracking-widest"
                  >
                    <Download className="h-4 w-4" />
                    {fmt.toUpperCase()}
                  </a>
                ))}
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Grant-Ready Templates</p>
                <p className="text-sm text-muted-foreground">
                  OPPRRC impact reports and grant documentation templates are generated from live program data.
                  Use the PDF export above to produce a grant-ready summary.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ── AUDIT ────────────────────────────────────────────────────── */}
          <TabsContent value="audit" className="p-6 space-y-6 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chain events */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">OPPRRC Chain Events</p>
                {chainQ.isLoading ? <LoadingState /> : !chainQ.data?.logs?.length ? (
                  <EmptyState message="No chain events yet." />
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {chainQ.data.logs.slice(0, 50).map((ev: ChainLog) => (
                      <div key={ev.id} className="rounded-md border border-border p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black uppercase tracking-wider">{ev.action}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${ev.status === "success" ? "text-green-600 bg-green-500/10" : "text-muted-foreground bg-accent"}`}>
                            {ev.status}
                          </span>
                          <span className="text-muted-foreground shrink-0">{new Date(ev.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground font-mono truncate">{ev.principal}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Certificates */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Certificates Earned</p>
                {certsQ.isLoading ? <LoadingState /> : !certsQ.data?.length ? (
                  <EmptyState message="No certificates issued yet." />
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {certsQ.data.map((cert: AmxCertificate) => (
                      <div key={cert.id} className="rounded-md border border-border p-3 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-medium font-mono text-[11px]">{cert.issueIdentifier ?? cert.id.slice(0, 8)}</p>
                          <p className="text-muted-foreground mt-0.5">{cert.responsiblePrincipalName ?? cert.responsiblePrincipalId.slice(0, 8)}</p>
                          <p className="text-muted-foreground mt-0.5">{new Date(cert.issuedAt).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <ShieldCheck className="h-4 w-4 text-green-600 shrink-0 ml-auto mb-1" />
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${cert.status === "active" ? "text-green-600 bg-green-500/10" : "text-muted-foreground bg-accent"}`}>
                            {cert.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

        </div>
      </Tabs>

      {/* Learner detail slide-out */}
      {detailUserId && (
        <LearnerDetailPanel
          userId={detailUserId}
          companyId={companyId}
          onClose={() => setDetailUserId(null)}
        />
      )}
    </div>
  );
}
