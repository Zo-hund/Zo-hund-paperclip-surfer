import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  analyticsApi,
  experimentsApi,
  type CompanyAnalytics,
  type KpiObservation,
  type AgentExperiment,
  type ObservationCreateRequest,
} from "../api/agentKpis";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { companiesApi } from "../api/companies";
import { projectsApi } from "../api/projects";
import type { Company } from "@paperclipai/shared";
import type { Project } from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents } from "../lib/utils";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { EvalNewRunModal } from "../components/EvalNewRunModal";
import { EvalComparePanel, type CompareRun } from "../components/EvalComparePanel";
import { EVAL_TEMPLATES, autoScore } from "../data/evalTemplates";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  Plus,
  Trash2,
  Eye,
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ListChecks,
  Trophy,
  GitCompareArrows,
  Medal,
  Rocket,
  ArrowRight,
  Building2,
} from "lucide-react";

const severityColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const experimentStatusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export function Analytics() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId!;

  const [activeTab, setActiveTab] = useState<"overview" | "evals">("overview");
  const [evalsMode, setEvalsMode] = useState<"sandbox" | "live">("sandbox");
  const [sandboxAgentId, setSandboxAgentId] = useState<string>("");
  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);

  // CRM sort state
  const [crmSortBy, setCrmSortBy] = useState<"health" | "lastRun" | "deliveries">("health");

  // Sim Launch Pipeline state
  const [simCompanyId, setSimCompanyId] = useState<string>("");
  const [simProjectId, setSimProjectId] = useState<string>("");
  const [simTemplateId, setSimTemplateId] = useState<string>(EVAL_TEMPLATES[0]?.id ?? "");
  const [simAgentId, setSimAgentId] = useState<string>("");

  const [obsDialogOpen, setObsDialogOpen] = useState(false);
  const [obsForm, setObsForm] = useState({
    title: "",
    content: "",
    severity: "info" as "info" | "warning" | "critical",
  });
  const [deleteObsConfirm, setDeleteObsConfirm] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Analytics" }]);
  }, [setBreadcrumbs]);

  const analyticsQuery = useQuery({
    queryKey: queryKeys.companyAnalytics(companyId),
    queryFn: () => analyticsApi.getCompanyAnalytics(companyId),
    enabled: !!companyId,
  });

  const observationsQuery = useQuery({
    queryKey: queryKeys.observations.list(companyId),
    queryFn: () => analyticsApi.listObservations(companyId),
    enabled: !!companyId,
  });

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const evalsQuery = useQuery({
    queryKey: ["heartbeat-runs", companyId],
    queryFn: () => heartbeatsApi.list(companyId, undefined, 100),
    enabled: !!companyId && activeTab === "evals",
    refetchInterval: activeTab === "evals" ? 10_000 : false,
  });

  // Utilization: fetch recent runs for overview tab (up to 200, used for resource calcs)
  const utilizationRunsQuery = useQuery({
    queryKey: ["heartbeat-runs-utilization", companyId],
    queryFn: () => heartbeatsApi.list(companyId, undefined, 200),
    enabled: !!companyId && activeTab === "overview",
    refetchInterval: activeTab === "overview" ? 30_000 : false,
  });

  // Sim Launch Pipeline queries
  const allCompaniesQuery = useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: () => companiesApi.list(),
    enabled: activeTab === "evals",
  });

  const simProjectsQuery = useQuery({
    queryKey: queryKeys.projects.list(simCompanyId || "__none__"),
    queryFn: () => projectsApi.list(simCompanyId),
    enabled: !!simCompanyId && activeTab === "evals",
  });

  const simAgentsQuery = useQuery({
    queryKey: queryKeys.agents.list(simCompanyId || companyId),
    queryFn: () => agentsApi.list(simCompanyId || companyId),
    enabled: activeTab === "evals",
  });

  const wakeupMutation = useMutation({
    mutationFn: (agentId: string) =>
      agentsApi.wakeup(agentId, { source: "on_demand", triggerDetail: "manual", reason: "Eval sandbox test" }, companyId),
    onSuccess: (result) => {
      if ("status" in result && result.status === "skipped") {
        pushToast({ tone: "warn", title: "Run skipped — agent may already be running" });
      } else {
        pushToast({ title: "Test run started" });
        queryClient.invalidateQueries({ queryKey: ["heartbeat-runs", companyId] });
      }
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to start test run" }),
  });

  const createObsMutation = useMutation({
    mutationFn: (data: ObservationCreateRequest) => analyticsApi.createObservation(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.observations.list(companyId) });
      pushToast({ title: "Observation created" });
      setObsDialogOpen(false);
      setObsForm({ title: "", content: "", severity: "info" });
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to create observation" }),
  });

  const deleteObsMutation = useMutation({
    mutationFn: (id: string) => analyticsApi.deleteObservation(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.observations.list(companyId) });
      pushToast({ title: "Observation deleted" });
      setDeleteObsConfirm(null);
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to delete observation" }),
  });

  const analytics = analyticsQuery.data;
  const observations = observationsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];
  const agentSummaries = analytics?.agentSummaries ?? [];

  // Auto-select first agent for sandbox
  useEffect(() => {
    if (!sandboxAgentId && agents.length > 0) setSandboxAgentId(agents[0].id);
  }, [agents, sandboxAgentId]);

  // Auto-select first company for sim
  useEffect(() => {
    const list = allCompaniesQuery.data;
    if (!simCompanyId && list && list.length > 0) setSimCompanyId(list[0].id);
  }, [allCompaniesQuery.data, simCompanyId]);

  // Auto-select first project when company changes
  useEffect(() => {
    const list = simProjectsQuery.data;
    if (!simProjectId && list && list.length > 0) setSimProjectId(list[0].id);
  }, [simProjectsQuery.data, simProjectId]);

  // Auto-select first agent for sim
  useEffect(() => {
    const list = simAgentsQuery.data;
    if (!simAgentId && list && list.length > 0) setSimAgentId(list[0].id);
  }, [simAgentsQuery.data, simAgentId]);

  // Sim wakeup mutation
  const simRunMutation = useMutation({
    mutationFn: () => {
      const template = EVAL_TEMPLATES.find((t) => t.id === simTemplateId);
      if (!template || !simAgentId) throw new Error("Missing template or agent");
      const project = simProjectsQuery.data?.find((p) => p.id === simProjectId);
      const company = allCompaniesQuery.data?.find((c) => c.id === simCompanyId);
      return agentsApi.wakeup(
        simAgentId,
        {
          source: "on_demand",
          triggerDetail: "manual",
          reason: `Sim: ${template.name}`,
          payload: {
            evalTemplateId: template.id,
            templateName: template.name,
            sector: template.sector,
            simContext: {
              companyId: simCompanyId,
              projectId: simProjectId,
              projectName: project?.name ?? "",
            },
            outputCompany: company?.name ?? "",
            outputCategory: template.defaultOutputCategory,
            outputAudience: template.defaultOutputAudience,
            scoringWeights: template.scoringWeights,
            successCriteria: template.successCriteria,
          },
        },
        simCompanyId || companyId,
      );
    },
    onSuccess: (result) => {
      if ("status" in result && result.status === "skipped") {
        pushToast({ tone: "warn", title: "Sim skipped — agent may already be running" });
      } else {
        pushToast({ title: "Sim run started" });
        queryClient.invalidateQueries({ queryKey: ["heartbeat-runs", companyId] });
      }
    },
    onError: () => pushToast({ tone: "warn", title: "Sim run failed to start" }),
  });

  // Resource utilization computation (7-day window)
  const UTIL_WINDOW_DAYS = 7;
  const UTIL_WINDOW_S = UTIL_WINDOW_DAYS * 24 * 60 * 60;
  const utilizationStats = useMemo(() => {
    const rawRuns = utilizationRunsQuery.data ?? [];
    const cutoff = Date.now() - UTIL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const byAgent = new Map<string, {
      name: string;
      activeSeconds: number;
      runs: number;
      completed: number;
      failed: number;
      categories: Record<string, number>;
    }>();

    for (const run of rawRuns) {
      const r = run as unknown as Record<string, unknown>;
      const agentId = r.agentId as string;
      const agentName = (r.agentName as string) ?? "Agent";
      const startedAt = r.startedAt as string | null | undefined;
      const finishedAt = r.finishedAt as string | null | undefined;
      if (!startedAt) continue;
      if (new Date(startedAt).getTime() < cutoff) continue;

      if (!byAgent.has(agentId)) {
        byAgent.set(agentId, { name: agentName, activeSeconds: 0, runs: 0, completed: 0, failed: 0, categories: {} });
      }
      const bucket = byAgent.get(agentId)!;
      bucket.runs++;

      const status = r.status as string;
      if (status === "completed") bucket.completed++;
      if (status === "failed" || status === "error") bucket.failed++;

      if (startedAt && finishedAt) {
        const dur = (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000;
        if (dur > 0) bucket.activeSeconds += dur;
      }

      // OPPRRC category from payload
      const payload = r.payload as Record<string, unknown> | undefined;
      const cat = (payload?.outputCategory as string | undefined) ?? "uncategorized";
      bucket.categories[cat] = (bucket.categories[cat] ?? 0) + 1;
    }

    return [...byAgent.entries()].map(([agentId, b]) => ({
      agentId,
      name: b.name,
      activeSeconds: b.activeSeconds,
      utilization: Math.min(100, (b.activeSeconds / UTIL_WINDOW_S) * 100),
      runs: b.runs,
      completed: b.completed,
      failed: b.failed,
      categories: b.categories,
    })).sort((a, b) => b.utilization - a.utilization);
  }, [utilizationRunsQuery.data]);

  // CRM client records derived from utilization run history
  interface CRMClient {
    name: string;
    healthScore: number;
    healthSource: "evals" | "rate";
    deliveries: number;
    totalRuns: number;
    deliveryRate: number;
    lastRunAt: string | null;
    lastAgentName: string;
    pipelineStage: "prospect" | "sim" | "live" | "evals";
    categories: Record<string, number>;
    templateIds: Set<string>;
    avgCostCents: number | null;
  }

  const crmClients = useMemo<CRMClient[]>(() => {
    const rawRuns = utilizationRunsQuery.data ?? [];
    const byClient = new Map<string, {
      name: string;
      runs: { status: string; invocationSource?: string; startedAt?: string | null; finishedAt?: string | null; costCents?: number | null; agentName?: string; templateId?: string; category?: string }[];
    }>();

    for (const run of rawRuns) {
      const r = run as unknown as Record<string, unknown>;
      const payload = r.payload as Record<string, unknown> | undefined;
      const clientName = payload?.outputCompany as string | undefined;
      if (!clientName) continue;

      if (!byClient.has(clientName)) byClient.set(clientName, { name: clientName, runs: [] });
      byClient.get(clientName)!.runs.push({
        status: (r.status as string) ?? "unknown",
        invocationSource: r.invocationSource as string | undefined,
        startedAt: r.startedAt as string | null | undefined,
        finishedAt: r.finishedAt as string | null | undefined,
        costCents: r.costCents as number | null | undefined,
        agentName: r.agentName as string | undefined,
        templateId: payload?.evalTemplateId as string | undefined,
        category: payload?.outputCategory as string | undefined,
      });
    }

    const result: CRMClient[] = [];

    for (const { name, runs } of byClient.values()) {
      const completed = runs.filter((r) => r.status === "completed").length;
      const deliveryRate = runs.length > 0 ? completed / runs.length : 0;

      // Sort runs by startedAt desc to find latest
      const sorted = [...runs].sort((a, b) => {
        const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        return tb - ta;
      });
      const lastRun = sorted[0];

      // Health score: avg weighted_auto from template runs if available
      const templateRuns = runs.filter((r) => r.templateId);
      let healthScore: number;
      let healthSource: "evals" | "rate";
      if (templateRuns.length > 0) {
        const scores = templateRuns.map((r) => {
          const template = EVAL_TEMPLATES.find((t) => t.id === r.templateId);
          if (!template) return 0;
          const dur = r.startedAt && r.finishedAt
            ? (new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000
            : null;
          return autoScore(template, { status: r.status, durationSeconds: dur, costCents: r.costCents ?? null }).weighted_auto;
        });
        healthScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        healthSource = "evals";
      } else {
        healthScore = deliveryRate * 100;
        healthSource = "rate";
      }

      // Pipeline stage (highest wins)
      const hasEvals = runs.some((r) => r.templateId && r.status === "completed");
      const hasLive = runs.some((r) => r.invocationSource && r.invocationSource !== "on_demand");
      const hasSim = runs.some((r) => r.invocationSource === "on_demand");
      const pipelineStage: CRMClient["pipelineStage"] =
        hasEvals ? "evals" : hasLive ? "live" : hasSim ? "sim" : "prospect";

      // Category breakdown
      const categories: Record<string, number> = {};
      for (const r of runs) {
        if (r.category) categories[r.category] = (categories[r.category] ?? 0) + 1;
      }

      // Avg cost
      const costsWithValues = runs.filter((r) => r.costCents != null).map((r) => r.costCents!);
      const avgCostCents = costsWithValues.length > 0
        ? costsWithValues.reduce((a, b) => a + b, 0) / costsWithValues.length
        : null;

      result.push({
        name,
        healthScore,
        healthSource,
        deliveries: completed,
        totalRuns: runs.length,
        deliveryRate,
        lastRunAt: lastRun?.startedAt ?? null,
        lastAgentName: lastRun?.agentName ?? "—",
        pipelineStage,
        categories,
        templateIds: new Set(runs.map((r) => r.templateId).filter(Boolean) as string[]),
        avgCostCents,
      });
    }

    return result.sort((a, b) => b.healthScore - a.healthScore);
  }, [utilizationRunsQuery.data]);

  // Budget intelligence derived from utilization run history
  const budgetStats = useMemo(() => {
    const rawRuns = utilizationRunsQuery.data ?? [];

    let totalCents = 0;
    let runsWithCost = 0;
    const byAgent = new Map<string, { name: string; totalCents: number; runs: number; completed: number }>();
    const byCategory = new Map<string, { totalCents: number; runs: number; completed: number }>();
    const byClient = new Map<string, { totalCents: number; runs: number; completed: number }>();

    for (const run of rawRuns) {
      const r = run as unknown as Record<string, unknown>;
      const costCents = r.costCents as number | null | undefined;
      const status = (r.status as string) ?? "unknown";
      const agentId = r.agentId as string;
      const agentName = (r.agentName as string) ?? "Agent";
      const payload = r.payload as Record<string, unknown> | undefined;
      const category = (payload?.outputCategory as string | undefined) ?? "uncategorized";
      const client = payload?.outputCompany as string | undefined;

      const cost = costCents ?? 0;
      if (costCents != null) { totalCents += cost; runsWithCost++; }

      // By agent
      if (!byAgent.has(agentId)) byAgent.set(agentId, { name: agentName, totalCents: 0, runs: 0, completed: 0 });
      const ab = byAgent.get(agentId)!;
      ab.runs++;
      ab.totalCents += cost;
      if (status === "completed") ab.completed++;

      // By category
      if (!byCategory.has(category)) byCategory.set(category, { totalCents: 0, runs: 0, completed: 0 });
      const cb = byCategory.get(category)!;
      cb.runs++;
      cb.totalCents += cost;
      if (status === "completed") cb.completed++;

      // By client
      if (client) {
        if (!byClient.has(client)) byClient.set(client, { totalCents: 0, runs: 0, completed: 0 });
        const clb = byClient.get(client)!;
        clb.runs++;
        clb.totalCents += cost;
        if (status === "completed") clb.completed++;
      }
    }

    const avgCostPerRun = runsWithCost > 0 ? totalCents / runsWithCost : 0;

    const agentBreakdown = [...byAgent.entries()]
      .map(([id, b]) => ({
        id,
        name: b.name,
        totalCents: b.totalCents,
        runs: b.runs,
        completed: b.completed,
        costPerRun: b.runs > 0 ? b.totalCents / b.runs : 0,
        costPerDelivery: b.completed > 0 ? b.totalCents / b.completed : null,
      }))
      .sort((a, b) => b.totalCents - a.totalCents);

    const categoryBreakdown = [...byCategory.entries()]
      .map(([cat, b]) => ({
        cat,
        totalCents: b.totalCents,
        runs: b.runs,
        completed: b.completed,
      }))
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 8);

    const clientBreakdown = [...byClient.entries()]
      .map(([name, b]) => ({
        name,
        totalCents: b.totalCents,
        runs: b.runs,
        completed: b.completed,
        costPerDelivery: b.completed > 0 ? b.totalCents / b.completed : null,
      }))
      .sort((a, b) => b.totalCents - a.totalCents);

    return { totalCents, avgCostPerRun, agentBreakdown, categoryBreakdown, clientBreakdown };
  }, [utilizationRunsQuery.data]);

  // Skills matrix derived from utilization run history
  const skillsMatrix = useMemo(() => {
    const rawRuns = utilizationRunsQuery.data ?? [];

    // agent → template → { runs, completed, avgScore }
    const agentTemplateMap = new Map<string, {
      agentName: string;
      templates: Map<string, { runs: number; completed: number; scoreSum: number; scoredRuns: number }>;
      categories: Map<string, { runs: number; completed: number }>;
    }>();

    for (const run of rawRuns) {
      const r = run as unknown as Record<string, unknown>;
      const agentId = r.agentId as string;
      const agentName = (r.agentName as string) ?? "Agent";
      const status = (r.status as string) ?? "unknown";
      const payload = r.payload as Record<string, unknown> | undefined;
      const templateId = payload?.evalTemplateId as string | undefined;
      const category = (payload?.outputCategory as string | undefined) ?? "uncategorized";

      if (!agentTemplateMap.has(agentId)) {
        agentTemplateMap.set(agentId, { agentName, templates: new Map(), categories: new Map() });
      }
      const ab = agentTemplateMap.get(agentId)!;
      ab.agentName = agentName;

      // Template skill
      if (templateId) {
        if (!ab.templates.has(templateId)) ab.templates.set(templateId, { runs: 0, completed: 0, scoreSum: 0, scoredRuns: 0 });
        const tb = ab.templates.get(templateId)!;
        tb.runs++;
        if (status === "completed") {
          tb.completed++;
          const template = EVAL_TEMPLATES.find((t) => t.id === templateId);
          if (template) {
            const startedAt = r.startedAt as string | null | undefined;
            const finishedAt = r.finishedAt as string | null | undefined;
            const dur = startedAt && finishedAt
              ? (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
              : null;
            const s = autoScore(template, { status, durationSeconds: dur, costCents: (r.costCents as number | null) ?? null });
            tb.scoreSum += s.weighted_auto;
            tb.scoredRuns++;
          }
        }
      }

      // Category skill
      if (!ab.categories.has(category)) ab.categories.set(category, { runs: 0, completed: 0 });
      const cb = ab.categories.get(category)!;
      cb.runs++;
      if (status === "completed") cb.completed++;
    }

    // All unique template IDs seen
    const allTemplateIds = new Set<string>();
    for (const { templates } of agentTemplateMap.values()) {
      for (const tid of templates.keys()) allTemplateIds.add(tid);
    }
    const templateList = [...allTemplateIds].map((id) => ({
      id,
      name: EVAL_TEMPLATES.find((t) => t.id === id)?.name ?? id,
    }));

    // All unique categories seen
    const allCategories = new Set<string>();
    for (const { categories } of agentTemplateMap.values()) {
      for (const cat of categories.keys()) allCategories.add(cat);
    }
    const categoryList = [...allCategories].filter((c) => c !== "uncategorized").sort();

    // Build agent rows
    const agentRows = [...agentTemplateMap.entries()].map(([agentId, { agentName, templates, categories }]) => {
      const totalRuns = [...templates.values()].reduce((s, t) => s + t.runs, 0)
        + (templates.size === 0 ? [...categories.values()].reduce((s, c) => s + c.runs, 0) : 0);
      const templateSkills = templateList.map(({ id }) => {
        const t = templates.get(id);
        if (!t) return null;
        return {
          runs: t.runs,
          successRate: t.runs > 0 ? t.completed / t.runs : 0,
          avgScore: t.scoredRuns > 0 ? t.scoreSum / t.scoredRuns : null,
        };
      });
      const catSkills = categoryList.map((cat) => {
        const c = categories.get(cat);
        if (!c) return null;
        return { runs: c.runs, successRate: c.runs > 0 ? c.completed / c.runs : 0 };
      });
      const breadth = templateSkills.filter(Boolean).length + catSkills.filter(Boolean).length;
      return { agentId, agentName, templateSkills, catSkills, breadth, totalRuns };
    }).sort((a, b) => b.breadth - a.breadth || b.totalRuns - a.totalRuns);

    return { agentRows, templateList, categoryList };
  }, [utilizationRunsQuery.data]);

  // Delivery pipeline derived from utilization run history
  const deliveryPipeline = useMemo(() => {
    const rawRuns = utilizationRunsQuery.data ?? [];
    const now = Date.now();
    const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 min running = stale

    interface PipelineRun {
      id: string;
      agentName: string;
      agentId: string;
      status: string;
      startedAt: string | null;
      finishedAt: string | null;
      client: string | null;
      templateName: string | null;
      category: string | null;
      costCents: number | null;
      durationSeconds: number | null;
      isStale: boolean;
    }

    const runs: PipelineRun[] = rawRuns.map((run) => {
      const r = run as unknown as Record<string, unknown>;
      const payload = r.payload as Record<string, unknown> | undefined;
      const startedAt = r.startedAt as string | null | undefined ?? null;
      const finishedAt = r.finishedAt as string | null | undefined ?? null;
      const status = (r.status as string) ?? "unknown";
      const durationSeconds = startedAt && finishedAt
        ? (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
        : null;
      const isStale = status === "running" && startedAt != null
        && (now - new Date(startedAt).getTime()) > STALE_THRESHOLD_MS;
      const templateId = payload?.evalTemplateId as string | undefined;
      return {
        id: r.id as string,
        agentName: (r.agentName as string) ?? "Agent",
        agentId: r.agentId as string,
        status,
        startedAt,
        finishedAt,
        client: (payload?.outputCompany as string | undefined) ?? null,
        templateName: (payload?.templateName as string | undefined) ?? (templateId ? EVAL_TEMPLATES.find((t) => t.id === templateId)?.name ?? null : null),
        category: (payload?.outputCategory as string | undefined) ?? null,
        costCents: r.costCents as number | null ?? null,
        durationSeconds,
        isStale,
      };
    });

    const inProgress = runs.filter((r) => r.status === "running").sort((a, b) => {
      // stale first, then by startedAt asc
      if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
      return (a.startedAt ?? "").localeCompare(b.startedAt ?? "");
    });

    const completed = runs
      .filter((r) => r.status === "completed")
      .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))
      .slice(0, 15);

    const failed = runs
      .filter((r) => r.status === "failed" || r.status === "error")
      .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
      .slice(0, 10);

    const totalRuns = runs.length;
    const completedToday = completed.filter((r) => {
      if (!r.finishedAt) return false;
      return (now - new Date(r.finishedAt).getTime()) < 86_400_000;
    }).length;
    const staleCount = inProgress.filter((r) => r.isStale).length;

    return { inProgress, completed, failed, totalRuns, completedToday, staleCount };
  }, [utilizationRunsQuery.data]);

  const allRuns = evalsQuery.data ?? [];
  const filteredRuns = allRuns.filter((r) =>
    evalsMode === "sandbox"
      ? r.invocationSource === "on_demand"
      : r.invocationSource !== "on_demand",
  );

  function formatDuration(seconds: number): string {
    const ms = seconds * 1000;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  }

  function toCompareRun(run: (typeof allRuns)[number]): CompareRun {
    const r = run as unknown as Record<string, unknown>;
    return {
      id: r.id as string,
      agentName: r.agentName as string | undefined,
      agentId: r.agentId as string | undefined,
      status: (r.status as string) ?? "unknown",
      invocationSource: r.invocationSource as string | undefined,
      startedAt: r.startedAt as string | null | undefined,
      finishedAt: r.finishedAt as string | null | undefined,
      costCents: r.costCents as number | null | undefined,
      payload: r.payload as Record<string, unknown> | undefined,
    };
  }

  function toggleRunSelect(id: string) {
    setSelectedRunIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function clearSelection() {
    setSelectedRunIds([]);
    setCompareMode(false);
  }

  if (!companyId) return null;
  if (analyticsQuery.isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Company-wide performance analytics and insights.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "evals")}>
        <PageTabBar
          align="start"
          items={[
            { value: "overview", label: "Overview" },
            { value: "evals", label: "Evals" },
          ]}
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "overview" | "evals")}
        />

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="mt-6 space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              icon={Activity}
              label="Total Runs"
              value={analytics ? String(analytics.totalRuns) : "--"}
            />
            <SummaryCard
              icon={TrendingUp}
              label="Avg Completion Rate"
              value={
                analytics?.avgCompletionRate != null
                  ? `${Math.round(analytics.avgCompletionRate * 100)}%`
                  : "--"
              }
            />
            <SummaryCard
              icon={DollarSign}
              label="Total Cost"
              value={analytics?.totalCostCents != null ? formatCents(analytics.totalCostCents) : "--"}
            />
            <SummaryCard
              icon={Users}
              label="Active Agents"
              value={analytics ? String(analytics.activeAgents) : "--"}
            />
          </div>

          {/* Agent Comparison */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Agent Comparison</h3>
            {agentSummaries.length === 0 ? (
              <EmptySection icon={BarChart3} message="No agent data yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Agent</th>
                      <th className="px-3 py-2 text-left font-medium">Completion</th>
                      <th className="px-3 py-2 text-left font-medium">Avg Cost</th>
                      <th className="px-3 py-2 text-left font-medium">Avg Duration</th>
                      <th className="px-3 py-2 text-left font-medium">Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentSummaries.map((trend) => (
                      <tr key={trend.agentId} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2 font-medium">{trend.agentName}</td>
                        <td className="px-3 py-2">{Math.round(trend.completionRate * 100)}%</td>
                        <td className="px-3 py-2">{formatCents(Math.round(trend.avgCostCents))}</td>
                        <td className="px-3 py-2">{formatDuration(trend.avgDurationSeconds)}</td>
                        <td className="px-3 py-2">{trend.totalRuns}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Resource Utilization */}
          <ResourceUtilization
            stats={utilizationStats}
            windowDays={UTIL_WINDOW_DAYS}
            isLoading={utilizationRunsQuery.isLoading}
          />

          {/* CRM — Client Manager */}
          <ClientCRM
            clients={crmClients}
            sortBy={crmSortBy}
            onSortChange={setCrmSortBy}
            isLoading={utilizationRunsQuery.isLoading}
          />

          {/* Budget Intelligence */}
          <BudgetIntelligence
            stats={budgetStats}
            windowDays={UTIL_WINDOW_DAYS}
            isLoading={utilizationRunsQuery.isLoading}
          />

          {/* Skills Matrix */}
          <SkillsMatrix
            matrix={skillsMatrix}
            isLoading={utilizationRunsQuery.isLoading}
          />

          {/* Delivery Pipeline */}
          <DeliveryPipeline
            pipeline={deliveryPipeline}
            isLoading={utilizationRunsQuery.isLoading}
            formatDuration={formatDuration}
          />

          {/* Observations */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Observations</h3>
              <Button size="sm" variant="outline" onClick={() => setObsDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Observation
              </Button>
            </div>
            {observations.length === 0 ? (
              <EmptySection icon={Eye} message="No observations recorded yet." />
            ) : (
              <div className="space-y-2">
                {observations.map((obs) => {
                  const agentName = obs.agentId
                    ? agents.find((a) => a.id === obs.agentId)?.name ?? "Unknown"
                    : "Company-wide";
                  return (
                    <Card key={obs.id} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="text-sm font-medium truncate">{obs.title}</h4>
                            <Badge
                              variant="secondary"
                              className={cn("text-[10px] px-1.5 py-0", severityColors[obs.severity ?? "info"])}
                            >
                              {obs.severity}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {obs.observerType}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{agentName}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{obs.content}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive shrink-0"
                          onClick={() => setDeleteObsConfirm(obs.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Experiments grouped by agent */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Experiments</h3>
            {agents.length === 0 ? (
              <EmptySection icon={FlaskConical} message="No agents available." />
            ) : (
              <div className="space-y-6">
                {agents.map((agent) => (
                  <AgentExperimentsSection key={agent.id} agentId={agent.id} agentName={agent.name} />
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Evals Tab ── */}
        <TabsContent value="evals" className="mt-6 space-y-6">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Sandbox / Live toggle */}
            <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
              <button
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  evalsMode === "sandbox"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setEvalsMode("sandbox")}
              >
                Sandbox
              </button>
              <button
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  evalsMode === "live"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setEvalsMode("live")}
              >
                Live
              </button>
            </div>

            {/* Quick run (no template) */}
            {evalsMode === "sandbox" && agents.length > 0 && (
              <>
                <Select value={sandboxAgentId} onValueChange={setSandboxAgentId}>
                  <SelectTrigger className="h-8 text-xs w-44">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!sandboxAgentId || wakeupMutation.isPending}
                  onClick={() => sandboxAgentId && wakeupMutation.mutate(sandboxAgentId)}
                >
                  {wakeupMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Quick Run
                </Button>
              </>
            )}

            {/* New Eval (template-based) */}
            {evalsMode === "sandbox" && (
              <Button size="sm" onClick={() => setEvalModalOpen(true)}>
                <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                New Eval
              </Button>
            )}

            <span className="text-xs text-muted-foreground ml-auto">
              {evalsMode === "sandbox"
                ? `${filteredRuns.filter((r) => (r as any).payload?.evalTemplateId).length} template runs`
                : `${filteredRuns.length} live runs`}
            </span>
          </div>

          {/* Sim → Live → Evals Launch Pipeline */}
          {evalsMode === "sandbox" && (
            <SimLaunchPanel
              companies={allCompaniesQuery.data ?? []}
              simCompanyId={simCompanyId}
              onCompanyChange={(id) => { setSimCompanyId(id); setSimProjectId(""); setSimAgentId(""); }}
              projects={simProjectsQuery.data ?? []}
              simProjectId={simProjectId}
              onProjectChange={setSimProjectId}
              agents={simAgentsQuery.data ?? agents}
              simAgentId={simAgentId}
              onAgentChange={setSimAgentId}
              simTemplateId={simTemplateId}
              onTemplateChange={setSimTemplateId}
              allRuns={allRuns}
              companyId={simCompanyId || companyId}
              onRunSim={() => simRunMutation.mutate()}
              isRunning={simRunMutation.isPending}
              onInvalidate={() => queryClient.invalidateQueries({ queryKey: ["heartbeat-runs", companyId] })}
            />
          )}

          {/* Leaderboards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EvalLeaderboard runs={allRuns} />
            <CompanyLeaderboard runs={allRuns} />
          </div>

          {/* Compare action bar */}
          {selectedRunIds.length >= 1 && (
            <div className="flex items-center gap-3 rounded-md border border-amber-300/60 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
              <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-medium flex-1">
                {selectedRunIds.length} run{selectedRunIds.length !== 1 ? "s" : ""} selected
              </span>
              {selectedRunIds.length >= 2 && !compareMode && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0"
                  onClick={() => setCompareMode(true)}
                >
                  <GitCompareArrows className="h-3.5 w-3.5" />
                  Compare
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={clearSelection}
              >
                Clear
              </Button>
            </div>
          )}

          {/* Side-by-side comparison panel */}
          {compareMode && selectedRunIds.length >= 2 && (
            <EvalComparePanel
              runs={filteredRuns
                .filter((r) => selectedRunIds.includes((r as unknown as { id: string }).id))
                .map(toCompareRun)}
              onClose={clearSelection}
              onRemove={(id) => {
                setSelectedRunIds((prev) => {
                  const next = prev.filter((x) => x !== id);
                  if (next.length < 2) setCompareMode(false);
                  return next;
                });
              }}
            />
          )}

          {/* Runs list */}
          {evalsQuery.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRuns.length === 0 ? (
            <EmptySection
              icon={Activity}
              message={
                evalsMode === "sandbox"
                  ? "No sandbox runs yet. Select an agent and click Run Test."
                  : "No live heartbeat runs recorded."
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredRuns.map((run) => {
                const runId = (run as unknown as { id: string }).id;
                return (
                  <EvalRunCard
                    key={runId}
                    run={run}
                    formatDuration={formatDuration}
                    companyId={companyId}
                    selected={selectedRunIds.includes(runId)}
                    onToggleSelect={() => toggleRunSelect(runId)}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Observation Dialog */}
      <Dialog open={obsDialogOpen} onOpenChange={(open) => !open && setObsDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Observation</DialogTitle>
            <DialogDescription>Record a company-wide observation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={obsForm.title}
                onChange={(e) => setObsForm({ ...obsForm, title: e.target.value })}
                placeholder="Observation title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <Textarea
                value={obsForm.content}
                onChange={(e) => setObsForm({ ...obsForm, content: e.target.value })}
                placeholder="Describe the observation..."
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Severity</label>
              <Select
                value={obsForm.severity}
                onValueChange={(v) =>
                  setObsForm({ ...obsForm, severity: v as "info" | "warning" | "critical" })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setObsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createObsMutation.mutate({
                  observerType: "board_human",
                  observation: obsForm.content,
                  agentIds: [],
                })
              }
              disabled={!obsForm.title.trim() || !obsForm.content.trim() || createObsMutation.isPending}
            >
              {createObsMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Observation Confirmation */}
      <Dialog open={!!deleteObsConfirm} onOpenChange={(open) => !open && setDeleteObsConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Observation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this observation?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteObsConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteObsConfirm && deleteObsMutation.mutate(deleteObsConfirm)}
              disabled={deleteObsMutation.isPending}
            >
              {deleteObsMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Eval Modal */}
      <EvalNewRunModal
        open={evalModalOpen}
        onClose={() => setEvalModalOpen(false)}
        agents={agents}
        companyId={companyId}
      />
    </div>
  );
}

function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={cn("text-xs font-semibold", color)}>{Math.round(value)}</span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function EvalRunCard({
  run,
  formatDuration,
  companyId,
  selected,
  onToggleSelect,
}: {
  run: import("../api/heartbeats").LiveRunForIssue | import("@paperclipai/shared").HeartbeatRun;
  formatDuration: (s: number) => string;
  companyId: string;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const pushToLiveMutation = useMutation({
    mutationFn: (agentId: string) =>
      agentsApi.wakeup(
        agentId,
        { source: "assignment", triggerDetail: "manual", reason: "Promoted from sandbox eval", payload: anyRun.payload as Record<string, unknown> },
        companyId,
      ),
    onSuccess: (result) => {
      if ("status" in result && result.status === "skipped") {
        pushToast({ tone: "warn", title: "Live run skipped — agent busy" });
      } else {
        pushToast({ title: "Pushed to live run" });
        queryClient.invalidateQueries({ queryKey: ["heartbeat-runs", companyId] });
      }
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to push to live" }),
  });

  const anyRun = run as unknown as Record<string, unknown>;
  const status = (anyRun.status as string) ?? "unknown";
  const startedAt = anyRun.startedAt as string | null | undefined;
  const finishedAt = anyRun.finishedAt as string | null | undefined;
  const agentName = anyRun.agentName as string | undefined;
  const agentId = anyRun.agentId as string | undefined;
  const invocationSource = anyRun.invocationSource as string | undefined;
  const costCents = anyRun.costCents as number | undefined;
  const payload = anyRun.payload as Record<string, unknown> | undefined;

  const durationSeconds =
    startedAt && finishedAt
      ? (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
      : null;

  // Template info
  const templateId = payload?.evalTemplateId as string | undefined;
  const template = templateId ? EVAL_TEMPLATES.find((t) => t.id === templateId) : undefined;
  const templateName = (payload?.templateName as string | undefined) ?? template?.name;

  // Auto-scores
  const scores = template
    ? autoScore(template, {
        status,
        durationSeconds,
        costCents: costCents ?? null,
      })
    : null;

  const StatusIcon =
    status === "completed"
      ? CheckCircle2
      : status === "failed" || status === "error"
        ? XCircle
        : status === "running"
          ? Loader2
          : Clock;

  const statusColor =
    status === "completed"
      ? "text-green-600 dark:text-green-400"
      : status === "failed" || status === "error"
        ? "text-destructive"
        : status === "running"
          ? "text-blue-500"
          : "text-muted-foreground";

  return (
    <Card className={cn("p-3 space-y-2 transition-colors", selected && "border-amber-400/60 dark:border-amber-600/50 bg-amber-50/30 dark:bg-amber-950/10")}>
      <div className="flex items-center gap-3 flex-wrap">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={onToggleSelect}
            className="h-3.5 w-3.5 accent-amber-500 shrink-0 cursor-pointer"
            title="Select for comparison"
          />
        )}
        <StatusIcon
          className={cn("h-4 w-4 shrink-0", statusColor, status === "running" && "animate-spin")}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{agentName ?? "Agent"}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{status}</Badge>
            {templateName && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30">
                {templateName}
              </Badge>
            )}
            {!templateName && invocationSource && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{invocationSource}</Badge>
            )}
          </div>
          {startedAt && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {new Date(startedAt).toLocaleString()}
              {durationSeconds !== null && ` · ${formatDuration(durationSeconds)}`}
            </p>
          )}
        </div>
        {costCents != null && (
          <span className="text-xs text-muted-foreground shrink-0">{formatCents(costCents)}</span>
        )}
      </div>

      {/* Auto-scores row — only for template runs */}
      {scores && (
        <div className="flex items-center gap-4 pt-1 border-t border-border/50 pl-7">
          <ScorePill
            label="Complete"
            value={scores.completion}
            color={scores.completion >= 80 ? "text-green-600 dark:text-green-400" : scores.completion >= 40 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}
          />
          <ScorePill
            label="Speed"
            value={scores.speed}
            color={scores.speed >= 80 ? "text-green-600 dark:text-green-400" : scores.speed >= 50 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}
          />
          <ScorePill
            label="Cost"
            value={scores.cost_efficiency}
            color={scores.cost_efficiency >= 80 ? "text-green-600 dark:text-green-400" : scores.cost_efficiency >= 50 ? "text-amber-600 dark:text-amber-400" : "text-destructive"}
          />
          <div className="ml-auto flex flex-col items-end">
            <span className="text-xs font-bold text-foreground">{Math.round(scores.weighted_auto)}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Auto Score</span>
          </div>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-muted-foreground">
            Judge pending
          </Badge>
          {status === "completed" && invocationSource === "on_demand" && agentId && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 ml-1"
              disabled={pushToLiveMutation.isPending}
              onClick={() => pushToLiveMutation.mutate(agentId)}
            >
              {pushToLiveMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Push to Live"
              )}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Sim Launch Pipeline ─────────────────────────────────────────────────────

interface SimLaunchPanelProps {
  companies: Company[];
  simCompanyId: string;
  onCompanyChange: (id: string) => void;
  projects: Project[];
  simProjectId: string;
  onProjectChange: (id: string) => void;
  agents: { id: string; name: string }[];
  simAgentId: string;
  onAgentChange: (id: string) => void;
  simTemplateId: string;
  onTemplateChange: (id: string) => void;
  allRuns: (import("../api/heartbeats").LiveRunForIssue | import("@paperclipai/shared").HeartbeatRun)[];
  companyId: string;
  onRunSim: () => void;
  isRunning: boolean;
  onInvalidate: () => void;
}

function SimLaunchPanel({
  companies, simCompanyId, onCompanyChange,
  projects, simProjectId, onProjectChange,
  agents, simAgentId, onAgentChange,
  simTemplateId, onTemplateChange,
  allRuns, companyId,
  onRunSim, isRunning, onInvalidate,
}: SimLaunchPanelProps) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  // Derive stage runs
  const stageRuns = useMemo(() => {
    return allRuns.filter((run) => {
      const r = run as unknown as Record<string, unknown>;
      const p = r.payload as Record<string, unknown> | undefined;
      if (p?.evalTemplateId !== simTemplateId) return false;
      if (simProjectId) {
        const ctx = p?.simContext as Record<string, unknown> | undefined;
        if (ctx && ctx.projectId && ctx.projectId !== simProjectId) return false;
      }
      return true;
    });
  }, [allRuns, simTemplateId, simProjectId]);

  const simRuns = useMemo(
    () => stageRuns.filter((r) => (r as unknown as Record<string, unknown>).invocationSource === "on_demand"),
    [stageRuns],
  );
  const liveRuns = useMemo(
    () => stageRuns.filter((r) => (r as unknown as Record<string, unknown>).invocationSource !== "on_demand"),
    [stageRuns],
  );

  const latestSim = simRuns[0] ? (simRuns[0] as unknown as Record<string, unknown>) : null;
  const latestLive = liveRuns[0] ? (liveRuns[0] as unknown as Record<string, unknown>) : null;

  const template = EVAL_TEMPLATES.find((t) => t.id === simTemplateId);

  // Best eval score from any completed stage run
  const bestScore = useMemo(() => {
    if (!template) return null;
    let best: number | null = null;
    for (const run of stageRuns) {
      const r = run as unknown as Record<string, unknown>;
      if (r.status !== "completed") continue;
      const startedAt = r.startedAt as string | null | undefined;
      const finishedAt = r.finishedAt as string | null | undefined;
      const dur = startedAt && finishedAt
        ? (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
        : null;
      const s = autoScore(template, { status: "completed", durationSeconds: dur, costCents: (r.costCents as number | null) ?? null });
      if (best === null || s.weighted_auto > best) best = s.weighted_auto;
    }
    return best;
  }, [stageRuns, template]);

  // Push to live mutation
  const pushLiveMutation = useMutation({
    mutationFn: () => {
      if (!latestSim || !simAgentId) throw new Error("No completed sim run");
      return agentsApi.wakeup(
        simAgentId,
        {
          source: "assignment",
          triggerDetail: "manual",
          reason: `Live: ${template?.name ?? "Eval"}`,
          payload: {
            ...(latestSim.payload as Record<string, unknown>),
            promotedFromSimRunId: latestSim.id as string,
          },
        },
        companyId,
      );
    },
    onSuccess: () => {
      pushToast({ title: "Pushed to live" });
      onInvalidate();
    },
    onError: () => pushToast({ tone: "warn", title: "Push to live failed" }),
  });

  function fmtAgo(ts: unknown): string {
    if (!ts) return "—";
    const ms = Date.now() - new Date(ts as string).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
    return `${Math.round(ms / 3_600_000)}h ago`;
  }

  const stageStatus = (run: Record<string, unknown> | null) => {
    if (!run) return "pending";
    return (run.status as string) ?? "pending";
  };

  const statusBadgeClass = (s: string) =>
    s === "completed" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
    : s === "running" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
    : s === "failed" || s === "error" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
    : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
        <Rocket className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Launch Pipeline</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sim → Live → Evals</Badge>
      </div>

      <div className="p-4 space-y-4">
        {/* Selectors row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Company</label>
            <Select value={simCompanyId} onValueChange={onCompanyChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Project</label>
            <Select value={simProjectId} onValueChange={onProjectChange} disabled={!simCompanyId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={simCompanyId ? "Select project" : "Pick company first"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Template</label>
            <Select value={simTemplateId} onValueChange={onTemplateChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {EVAL_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Agent</label>
            <Select value={simAgentId} onValueChange={onAgentChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pipeline stages */}
        <div className="flex items-stretch gap-2">
          {/* SIM stage */}
          <Card className="flex-1 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Sim</span>
              <Badge variant="secondary" className={cn("ml-auto text-[9px] px-1.5 py-0", statusBadgeClass(stageStatus(latestSim)))}>
                {stageStatus(latestSim)}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {latestSim ? fmtAgo(latestSim.startedAt) : "Not run yet"}
            </p>
            <Button
              size="sm"
              className="w-full h-7 text-xs"
              disabled={!simAgentId || !simTemplateId || isRunning}
              onClick={onRunSim}
            >
              {isRunning ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Play className="h-3 w-3 mr-1.5" />}
              Run Sim
            </Button>
          </Card>

          <div className="flex items-center self-center shrink-0">
            <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
          </div>

          {/* LIVE stage */}
          <Card className="flex-1 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Live</span>
              <Badge variant="secondary" className={cn("ml-auto text-[9px] px-1.5 py-0", statusBadgeClass(stageStatus(latestLive)))}>
                {stageStatus(latestLive)}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {latestLive ? fmtAgo(latestLive.startedAt) : "Not promoted yet"}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              disabled={stageStatus(latestSim) !== "completed" || pushLiveMutation.isPending}
              onClick={() => pushLiveMutation.mutate()}
            >
              {pushLiveMutation.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Rocket className="h-3 w-3 mr-1.5" />}
              Push to Live
            </Button>
          </Card>

          <div className="flex items-center self-center shrink-0">
            <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
          </div>

          {/* EVALS stage */}
          <Card className="flex-1 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-semibold">Evals</span>
              {bestScore !== null && (
                <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  {Math.round(bestScore)}
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {bestScore !== null
                ? `Best weighted auto-score across ${stageRuns.filter((r) => (r as any).status === "completed").length} run(s)`
                : "No scored runs yet"}
            </p>
            <div className={cn(
              "h-1.5 w-full rounded-full overflow-hidden",
              bestScore !== null ? "bg-amber-100 dark:bg-amber-900/20" : "bg-muted/40",
            )}>
              <div
                className="h-full bg-amber-500 transition-all duration-500"
                style={{ width: bestScore !== null ? `${bestScore}%` : "0%" }}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Eval Leaderboard ────────────────────────────────────────────────────────

interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  runs: number;
  avgWeighted: number;
  avgCompletion: number;
  avgSpeed: number;
  avgCostEff: number;
  bestWeighted: number;
}

function EvalLeaderboard({ runs }: { runs: (import("../api/heartbeats").LiveRunForIssue | import("@paperclipai/shared").HeartbeatRun)[] }) {
  const entries = useMemo<LeaderboardEntry[]>(() => {
    // Only template runs with scores
    const scored: { agentId: string; agentName: string; scores: ReturnType<typeof autoScore> }[] = [];

    for (const run of runs) {
      const r = run as unknown as Record<string, unknown>;
      const templateId = (r.payload as Record<string, unknown> | undefined)?.evalTemplateId as string | undefined;
      if (!templateId) continue;
      const template = EVAL_TEMPLATES.find((t) => t.id === templateId);
      if (!template) continue;
      const status = r.status as string;
      const startedAt = r.startedAt as string | null | undefined;
      const finishedAt = r.finishedAt as string | null | undefined;
      const costCents = r.costCents as number | null | undefined;
      const durationSeconds =
        startedAt && finishedAt
          ? (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
          : null;
      const s = autoScore(template, { status, durationSeconds, costCents: costCents ?? null });
      scored.push({
        agentId: r.agentId as string,
        agentName: (r.agentName as string) ?? "Agent",
        scores: s,
      });
    }

    // Group by agent
    const byAgent = new Map<string, { agentName: string; scores: ReturnType<typeof autoScore>[] }>();
    for (const { agentId, agentName, scores } of scored) {
      if (!byAgent.has(agentId)) byAgent.set(agentId, { agentName, scores: [] });
      byAgent.get(agentId)!.scores.push(scores);
    }

    const result: LeaderboardEntry[] = [];
    for (const [agentId, { agentName, scores }] of byAgent) {
      const n = scores.length;
      const avg = (key: keyof ReturnType<typeof autoScore>) =>
        scores.reduce((s, r) => s + r[key], 0) / n;
      result.push({
        agentId,
        agentName,
        runs: n,
        avgWeighted: avg("weighted_auto"),
        avgCompletion: avg("completion"),
        avgSpeed: avg("speed"),
        avgCostEff: avg("cost_efficiency"),
        bestWeighted: Math.max(...scores.map((s) => s.weighted_auto)),
      });
    }

    return result.sort((a, b) => b.avgWeighted - a.avgWeighted);
  }, [runs]);

  if (entries.length === 0) return null;

  const medalColor = ["text-amber-400", "text-slate-400", "text-amber-700"];

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
        <Trophy className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold">Leaderboard</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{entries.length} agents</Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">ranked by avg weighted auto-score</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium w-8">#</th>
              <th className="px-3 py-2 text-left font-medium">Agent</th>
              <th className="px-3 py-2 text-center font-medium">Runs</th>
              <th className="px-3 py-2 text-center font-medium">Complete</th>
              <th className="px-3 py-2 text-center font-medium">Speed</th>
              <th className="px-3 py-2 text-center font-medium">Cost</th>
              <th className="px-3 py-2 text-center font-medium font-semibold">Avg Score</th>
              <th className="px-3 py-2 text-center font-medium">Best</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isTop = i === 0;
              return (
                <tr
                  key={e.agentId}
                  className={cn(
                    "border-b border-border/50 last:border-b-0",
                    isTop ? "bg-amber-50/40 dark:bg-amber-950/10" : "hover:bg-muted/20",
                  )}
                >
                  <td className="px-3 py-2.5 text-center">
                    {i < 3 ? (
                      <Medal className={cn("h-3.5 w-3.5 mx-auto", medalColor[i])} />
                    ) : (
                      <span className="text-muted-foreground">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    <div className="flex items-center gap-1.5">
                      {isTop && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                      <span className={isTop ? "text-amber-700 dark:text-amber-400" : ""}>{e.agentName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{e.runs}</td>
                  <td className="px-3 py-2.5 text-center">
                    <ScoreChip value={e.avgCompletion} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <ScoreChip value={e.avgSpeed} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <ScoreChip value={e.avgCostEff} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn("font-bold", isTop ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                      {Math.round(e.avgWeighted)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{Math.round(e.bestWeighted)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Company Leaderboard ─────────────────────────────────────────────────────

interface CompanyEntry {
  company: string;
  runs: number;
  avgWeighted: number;
  bestWeighted: number;
  templates: number;
  topAgent: string;
}

function CompanyLeaderboard({ runs }: { runs: (import("../api/heartbeats").LiveRunForIssue | import("@paperclipai/shared").HeartbeatRun)[] }) {
  const entries = useMemo<CompanyEntry[]>(() => {
    const byCompany = new Map<string, { scores: number[]; templates: Set<string>; agents: Map<string, number> }>();

    for (const run of runs) {
      const r = run as unknown as Record<string, unknown>;
      const payload = r.payload as Record<string, unknown> | undefined;
      const company = payload?.outputCompany as string | undefined;
      const templateId = payload?.evalTemplateId as string | undefined;
      if (!company || !templateId) continue;

      const template = EVAL_TEMPLATES.find((t) => t.id === templateId);
      if (!template) continue;

      const status = r.status as string;
      const startedAt = r.startedAt as string | null | undefined;
      const finishedAt = r.finishedAt as string | null | undefined;
      const costCents = r.costCents as number | null | undefined;
      const durationSeconds =
        startedAt && finishedAt
          ? (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000
          : null;
      const s = autoScore(template, { status, durationSeconds, costCents: costCents ?? null });

      if (!byCompany.has(company)) {
        byCompany.set(company, { scores: [], templates: new Set(), agents: new Map() });
      }
      const bucket = byCompany.get(company)!;
      bucket.scores.push(s.weighted_auto);
      bucket.templates.add(templateId);
      const agentName = (r.agentName as string) ?? "Agent";
      bucket.agents.set(agentName, (bucket.agents.get(agentName) ?? 0) + 1);
    }

    const result: CompanyEntry[] = [];
    for (const [company, { scores, templates, agents }] of byCompany) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const topAgent = [...agents.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      result.push({
        company,
        runs: scores.length,
        avgWeighted: avg,
        bestWeighted: Math.max(...scores),
        templates: templates.size,
        topAgent,
      });
    }

    return result.sort((a, b) => b.avgWeighted - a.avgWeighted);
  }, [runs]);

  if (entries.length === 0) return null;

  const medalColor = ["text-amber-400", "text-slate-400", "text-amber-700"];

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
        <Medal className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Company Leaders</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{entries.length} companies</Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">by avg score</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium w-8">#</th>
              <th className="px-3 py-2 text-left font-medium">Company</th>
              <th className="px-3 py-2 text-center font-medium">Runs</th>
              <th className="px-3 py-2 text-center font-medium">Templates</th>
              <th className="px-3 py-2 text-left font-medium">Top Agent</th>
              <th className="px-3 py-2 text-center font-medium font-semibold">Avg</th>
              <th className="px-3 py-2 text-center font-medium">Best</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isTop = i === 0;
              return (
                <tr
                  key={e.company}
                  className={cn(
                    "border-b border-border/50 last:border-b-0",
                    isTop ? "bg-primary/5" : "hover:bg-muted/20",
                  )}
                >
                  <td className="px-3 py-2.5 text-center">
                    {i < 3 ? (
                      <Medal className={cn("h-3.5 w-3.5 mx-auto", medalColor[i])} />
                    ) : (
                      <span className="text-muted-foreground">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    <div className="flex items-center gap-1.5">
                      {isTop && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                      <span className={cn("font-mono text-[11px]", isTop && "text-primary font-semibold")}>
                        {e.company}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{e.runs}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{e.templates}</td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[100px]">{e.topAgent}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn("font-bold", isTop ? "text-primary" : "text-foreground")}>
                      {Math.round(e.avgWeighted)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{Math.round(e.bestWeighted)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreChip({ value }: { value: number }) {
  const rounded = Math.round(value);
  const color =
    rounded >= 80
      ? "text-green-600 dark:text-green-400"
      : rounded >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-500";
  return <span className={cn("text-xs font-medium", color)}>{rounded}</span>;
}

function AgentExperimentsSection({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const experimentsQuery = useQuery({
    queryKey: queryKeys.experiments.list(agentId),
    queryFn: () => experimentsApi.list(agentId),
  });

  const experiments = experimentsQuery.data ?? [];

  if (experiments.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-2">{agentName}</h4>
      <div className="space-y-2">
        {experiments.map((exp) => (
          <Card key={exp.id} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
              <h5 className="text-sm font-medium truncate">{exp.name}</h5>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] px-1.5 py-0",
                  experimentStatusColors[exp.status],
                )}
              >
                {exp.status}
              </Badge>
            </div>
            {exp.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 ml-5">
                {exp.description}
              </p>
            )}
            {exp.result && (
              <p className="text-xs text-green-600 dark:text-green-400 ml-5 mt-0.5 line-clamp-1">
                Result: {exp.result}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Resource Utilization ────────────────────────────────────────────────────

const OPPRRC_CATEGORY_COLORS: Record<string, string> = {
  "01_OPERATIONS":  "bg-slate-500",
  "02_PROGRAMS":    "bg-purple-500",
  "03_PROJECTS":    "bg-blue-500",
  "04_REPORTS":     "bg-amber-500",
  "05_REPORTS":     "bg-amber-500",
  "06_RESOURCES":   "bg-green-500",
  "07_COMMS":       "bg-pink-500",
  "uncategorized":  "bg-muted-foreground/30",
};

interface UtilStat {
  agentId: string;
  name: string;
  activeSeconds: number;
  utilization: number;
  runs: number;
  completed: number;
  failed: number;
  categories: Record<string, number>;
}

function ResourceUtilization({
  stats,
  windowDays,
  isLoading,
}: {
  stats: UtilStat[];
  windowDays: number;
  isLoading: boolean;
}) {
  const avgUtil = stats.length
    ? stats.reduce((s, a) => s + a.utilization, 0) / stats.length
    : 0;
  const mostActive = stats[0];
  const underUtil = stats.filter((a) => a.utilization < 20).length;
  const overloaded = stats.filter((a) => a.utilization > 80).length;

  function fmtSeconds(s: number) {
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${(s / 60).toFixed(0)}m`;
    return `${(s / 3600).toFixed(1)}h`;
  }

  function utilColor(pct: number) {
    if (pct < 20) return "bg-red-400";
    if (pct > 80) return "bg-amber-400";
    return "bg-green-500";
  }

  function utilTextColor(pct: number) {
    if (pct < 20) return "text-red-600 dark:text-red-400";
    if (pct > 80) return "text-amber-600 dark:text-amber-400";
    return "text-green-600 dark:text-green-400";
  }

  if (isLoading) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Resource Utilization</h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (stats.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Resource Utilization</h3>
        <EmptySection icon={Users} message={`No run data in the last ${windowDays} days.`} />
      </section>
    );
  }

  // Aggregate OPPRRC category totals across all agents
  const catTotals: Record<string, number> = {};
  for (const a of stats) {
    for (const [cat, count] of Object.entries(a.categories)) {
      catTotals[cat] = (catTotals[cat] ?? 0) + count;
    }
  }
  const totalCatRuns = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const topCats = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Resource Utilization</h3>
        <span className="text-[10px] text-muted-foreground">Last {windowDays} days</span>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Avg Utilization</p>
          <p className={cn("text-xl font-bold", utilTextColor(avgUtil))}>{avgUtil.toFixed(1)}%</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Most Active</p>
          <p className="text-sm font-semibold truncate">{mostActive?.name ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">{fmtSeconds(mostActive?.activeSeconds ?? 0)} active</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Under-utilized</p>
          <p className={cn("text-xl font-bold", underUtil > 0 ? "text-red-500" : "text-muted-foreground")}>{underUtil}</p>
          <p className="text-[10px] text-muted-foreground">agents below 20%</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Overloaded</p>
          <p className={cn("text-xl font-bold", overloaded > 0 ? "text-amber-500" : "text-muted-foreground")}>{overloaded}</p>
          <p className="text-[10px] text-muted-foreground">agents above 80%</p>
        </Card>
      </div>

      {/* Per-agent utilization bars */}
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20">
          <p className="text-xs font-medium">Agent Utilization</p>
        </div>
        <div className="divide-y divide-border/50">
          {stats.map((a) => (
            <div key={a.agentId} className="px-4 py-3 flex items-center gap-4">
              <div className="w-32 shrink-0">
                <p className="text-xs font-medium truncate">{a.name}</p>
                <p className="text-[10px] text-muted-foreground">{a.runs} runs · {fmtSeconds(a.activeSeconds)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", utilColor(a.utilization))}
                      style={{ width: `${Math.max(a.utilization, 0.5)}%` }}
                    />
                  </div>
                  <span className={cn("text-xs font-semibold w-12 text-right shrink-0", utilTextColor(a.utilization))}>
                    {a.utilization.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {a.completed > 0 && (
                    <span className="text-[9px] text-green-600 dark:text-green-400 flex items-center gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" />{a.completed} done
                    </span>
                  )}
                  {a.failed > 0 && (
                    <span className="text-[9px] text-red-500 flex items-center gap-0.5">
                      <XCircle className="h-2.5 w-2.5" />{a.failed} failed
                    </span>
                  )}
                  {/* Category mini-dots */}
                  <div className="flex gap-0.5 ml-auto">
                    {Object.entries(a.categories).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([cat]) => (
                      <span
                        key={cat}
                        className={cn("h-2 w-2 rounded-full shrink-0", OPPRRC_CATEGORY_COLORS[cat] ?? "bg-muted-foreground/30")}
                        title={cat}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* OPPRRC category breakdown */}
      {topCats.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/20">
            <p className="text-xs font-medium">Work by OPPRRC Category</p>
          </div>
          <div className="p-4 space-y-2">
            {topCats.map(([cat, count]) => {
              const pct = totalCatRuns > 0 ? (count / totalCatRuns) * 100 : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", OPPRRC_CATEGORY_COLORS[cat] ?? "bg-muted-foreground/30")} />
                  <span className="text-xs font-mono text-muted-foreground w-32 truncate shrink-0">{cat}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", OPPRRC_CATEGORY_COLORS[cat] ?? "bg-muted-foreground/30")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{count} runs ({pct.toFixed(0)}%)</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </section>
  );
}

// ─── CRM Client Manager ──────────────────────────────────────────────────────

interface CRMClientDisplay {
  name: string;
  healthScore: number;
  healthSource: "evals" | "rate";
  deliveries: number;
  totalRuns: number;
  deliveryRate: number;
  lastRunAt: string | null;
  lastAgentName: string;
  pipelineStage: "prospect" | "sim" | "live" | "evals";
  categories: Record<string, number>;
  templateIds: Set<string>;
  avgCostCents: number | null;
}

function ClientCRM({
  clients,
  sortBy,
  onSortChange,
  isLoading,
}: {
  clients: CRMClientDisplay[];
  sortBy: "health" | "lastRun" | "deliveries";
  onSortChange: (s: "health" | "lastRun" | "deliveries") => void;
  isLoading: boolean;
}) {
  const sorted = useMemo(() => {
    const copy = [...clients];
    if (sortBy === "lastRun") {
      copy.sort((a, b) => {
        const ta = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
        const tb = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
        return tb - ta;
      });
    } else if (sortBy === "deliveries") {
      copy.sort((a, b) => b.deliveries - a.deliveries);
    }
    return copy;
  }, [clients, sortBy]);

  function fmtAgo(ts: string | null): string {
    if (!ts) return "—";
    const ms = Date.now() - new Date(ts).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
    return `${Math.round(ms / 86_400_000)}d`;
  }

  function healthColor(score: number) {
    if (score >= 75) return "text-green-600 dark:text-green-400";
    if (score >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-500";
  }

  function healthBarColor(score: number) {
    if (score >= 75) return "bg-green-500";
    if (score >= 50) return "bg-amber-400";
    return "bg-red-400";
  }

  const stageConfig: Record<CRMClientDisplay["pipelineStage"], { label: string; cls: string; Icon: typeof Trophy }> = {
    evals:   { label: "Evals",   cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",   Icon: Trophy },
    live:    { label: "Live",    cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",   Icon: Rocket },
    sim:     { label: "Sim",     cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",       Icon: FlaskConical },
    prospect:{ label: "Prospect",cls: "bg-muted text-muted-foreground",                                         Icon: Clock },
  };

  if (isLoading) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">CRM — Client Manager</h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (clients.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">CRM — Client Manager</h3>
        <EmptySection icon={Building2} message="No client run data yet. Clients appear when agents run with outputCompany set." />
      </section>
    );
  }

  const totalDeliveries = clients.reduce((s, c) => s + c.deliveries, 0);
  const avgHealth = clients.length ? clients.reduce((s, c) => s + c.healthScore, 0) / clients.length : 0;
  const evalsClients = clients.filter((c) => c.pipelineStage === "evals").length;
  const liveClients = clients.filter((c) => c.pipelineStage === "live" || c.pipelineStage === "evals").length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">CRM — Client Manager</h3>
        <div className="flex items-center gap-1 rounded-md border border-border overflow-hidden text-[10px]">
          {(["health", "lastRun", "deliveries"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSortChange(s)}
              className={cn(
                "px-2.5 py-1 font-medium transition-colors",
                sortBy === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "health" ? "Health" : s === "lastRun" ? "Last Run" : "Deliveries"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Total Clients</p>
          <p className="text-xl font-bold">{clients.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Avg Health</p>
          <p className={cn("text-xl font-bold", healthColor(avgHealth))}>{Math.round(avgHealth)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Live / Evals</p>
          <p className="text-xl font-bold">{liveClients}</p>
          <p className="text-[10px] text-muted-foreground">{evalsClients} scored</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Deliveries</p>
          <p className="text-xl font-bold">{totalDeliveries}</p>
        </Card>
      </div>

      {/* Client table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-medium">Client Accounts</p>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">{clients.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium w-8">#</th>
                <th className="px-3 py-2 text-left font-medium">Client</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
                <th className="px-3 py-2 text-left font-medium">Health</th>
                <th className="px-3 py-2 text-center font-medium">Rate</th>
                <th className="px-3 py-2 text-center font-medium">Deliveries</th>
                <th className="px-3 py-2 text-left font-medium">Agent</th>
                <th className="px-3 py-2 text-right font-medium">Last Run</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((client, i) => {
                const stage = stageConfig[client.pipelineStage];
                const StageIcon = stage.Icon;
                return (
                  <tr
                    key={client.name}
                    className="border-b border-border/50 last:border-b-0 hover:bg-muted/20"
                  >
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                        <span className="font-medium truncate max-w-[140px]">{client.name}</span>
                        {client.templateIds.size > 0 && (
                          <span className="text-[9px] text-muted-foreground">
                            {client.templateIds.size} tmpl
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="secondary"
                        className={cn("text-[9px] px-1.5 py-0 gap-1 flex items-center w-fit", stage.cls)}
                      >
                        <StageIcon className="h-2.5 w-2.5" />
                        {stage.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold w-8 shrink-0", healthColor(client.healthScore))}>
                          {Math.round(client.healthScore)}
                        </span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                          <div
                            className={cn("h-full rounded-full transition-all", healthBarColor(client.healthScore))}
                            style={{ width: `${Math.max(client.healthScore, 1)}%` }}
                          />
                        </div>
                        {client.healthSource === "rate" && (
                          <span className="text-[9px] text-muted-foreground/60">rate</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(
                        "font-medium",
                        client.deliveryRate >= 0.8 ? "text-green-600 dark:text-green-400"
                          : client.deliveryRate >= 0.5 ? "text-amber-600 dark:text-amber-400"
                          : "text-red-500",
                      )}>
                        {Math.round(client.deliveryRate * 100)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">
                      {client.deliveries}
                      <span className="text-[9px] ml-0.5">/{client.totalRuns}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[100px]">
                      {client.lastAgentName}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                      {fmtAgo(client.lastRunAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

// ─── Budget Intelligence ─────────────────────────────────────────────────────

interface BudgetStats {
  totalCents: number;
  avgCostPerRun: number;
  agentBreakdown: { id: string; name: string; totalCents: number; runs: number; completed: number; costPerRun: number; costPerDelivery: number | null }[];
  categoryBreakdown: { cat: string; totalCents: number; runs: number; completed: number }[];
  clientBreakdown: { name: string; totalCents: number; runs: number; completed: number; costPerDelivery: number | null }[];
}

function BudgetIntelligence({
  stats,
  windowDays,
  isLoading,
}: {
  stats: BudgetStats;
  windowDays: number;
  isLoading: boolean;
}) {
  const { totalCents, avgCostPerRun, agentBreakdown, categoryBreakdown, clientBreakdown } = stats;

  if (isLoading) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Budget Intelligence</h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (agentBreakdown.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Budget Intelligence</h3>
        <EmptySection icon={DollarSign} message={`No cost data in the last ${windowDays} days.`} />
      </section>
    );
  }

  const maxAgentCost = agentBreakdown[0]?.totalCents ?? 1;
  const maxCatCost = categoryBreakdown[0]?.totalCents ?? 1;
  const maxClientCost = clientBreakdown[0]?.totalCents ?? 1;
  const totalDeliveries = agentBreakdown.reduce((s, a) => s + a.completed, 0);
  const costPerDelivery = totalDeliveries > 0 ? totalCents / totalDeliveries : null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Budget Intelligence</h3>
        <span className="text-[10px] text-muted-foreground">Last {windowDays} days</span>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Total Spend</p>
          <p className="text-xl font-bold">{formatCents(totalCents)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Avg / Run</p>
          <p className="text-xl font-bold">{formatCents(Math.round(avgCostPerRun))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Cost / Delivery</p>
          <p className="text-xl font-bold">
            {costPerDelivery != null ? formatCents(Math.round(costPerDelivery)) : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">{totalDeliveries} deliveries</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Top Spender</p>
          <p className="text-sm font-semibold truncate">{agentBreakdown[0]?.name ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">{formatCents(agentBreakdown[0]?.totalCents ?? 0)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Agent cost breakdown */}
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/20">
            <p className="text-xs font-medium">Spend by Agent</p>
          </div>
          <div className="p-4 space-y-2.5">
            {agentBreakdown.slice(0, 8).map((a) => {
              const pct = maxAgentCost > 0 ? (a.totalCents / maxAgentCost) * 100 : 0;
              return (
                <div key={a.id} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate max-w-[130px]">{a.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground">{a.runs} runs</span>
                      {a.costPerDelivery != null && (
                        <span className="text-[10px] text-muted-foreground">{formatCents(Math.round(a.costPerDelivery))}/del</span>
                      )}
                      <span className="font-semibold w-14 text-right">{formatCents(a.totalCents)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right column: category + client */}
        <div className="space-y-4">
          {/* Category cost breakdown */}
          {categoryBreakdown.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/20">
                <p className="text-xs font-medium">Spend by OPPRRC Category</p>
              </div>
              <div className="p-4 space-y-2">
                {categoryBreakdown.map(({ cat, totalCents: cc, runs }) => {
                  const pct = maxCatCost > 0 ? (cc / maxCatCost) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span
                        className={cn("h-2 w-2 rounded-full shrink-0", OPPRRC_CATEGORY_COLORS[cat] ?? "bg-muted-foreground/30")}
                      />
                      <span className="text-[10px] font-mono text-muted-foreground w-28 truncate shrink-0">{cat}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", OPPRRC_CATEGORY_COLORS[cat] ?? "bg-muted-foreground/30")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground w-8 text-center shrink-0">{runs}</span>
                      <span className="text-xs font-medium w-14 text-right shrink-0">{formatCents(cc)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Client cost breakdown */}
          {clientBreakdown.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/20">
                <p className="text-xs font-medium">Spend by Client</p>
              </div>
              <div className="p-4 space-y-2">
                {clientBreakdown.slice(0, 6).map(({ name, totalCents: cc, runs, costPerDelivery: cpd }) => {
                  const pct = maxClientCost > 0 ? (cc / maxClientCost) * 100 : 0;
                  return (
                    <div key={name} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-medium truncate max-w-[120px]">{name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground">{runs}r</span>
                          {cpd != null && <span className="text-muted-foreground">{formatCents(Math.round(cpd))}/del</span>}
                          <span className="font-semibold">{formatCents(cc)}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500/60 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 0.5)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Skills Matrix ───────────────────────────────────────────────────────────

interface SkillCell {
  runs: number;
  successRate: number;
  avgScore?: number | null;
}

interface AgentSkillRow {
  agentId: string;
  agentName: string;
  templateSkills: (SkillCell | null)[];
  catSkills: (SkillCell | null)[];
  breadth: number;
  totalRuns: number;
}

interface MatrixData {
  agentRows: AgentSkillRow[];
  templateList: { id: string; name: string }[];
  categoryList: string[];
}

function SkillsMatrix({
  matrix,
  isLoading,
}: {
  matrix: MatrixData;
  isLoading: boolean;
}) {
  const { agentRows, templateList, categoryList } = matrix;

  if (isLoading) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Skills Matrix</h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (agentRows.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Skills Matrix</h3>
        <EmptySection icon={ListChecks} message="No agent run data yet." />
      </section>
    );
  }

  function cellBg(cell: SkillCell | null): string {
    if (!cell) return "";
    if (cell.successRate >= 0.8) return "bg-green-100 dark:bg-green-900/30";
    if (cell.successRate >= 0.5) return "bg-amber-100 dark:bg-amber-900/20";
    return "bg-red-100 dark:bg-red-900/20";
  }

  function cellText(cell: SkillCell | null): string {
    if (!cell) return "text-muted-foreground/30";
    if (cell.successRate >= 0.8) return "text-green-700 dark:text-green-400";
    if (cell.successRate >= 0.5) return "text-amber-700 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  }

  const hasTemplates = templateList.length > 0;
  const hasCategories = categoryList.length > 0;
  const mostVersatile = agentRows[0];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Skills Matrix</h3>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-green-400 inline-block" /> ≥80% success
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber-400 inline-block" /> 50–79%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-red-400 inline-block" /> &lt;50%
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Most Versatile</p>
          <p className="text-sm font-semibold truncate">{mostVersatile?.agentName ?? "—"}</p>
          <p className="text-[10px] text-muted-foreground">{mostVersatile?.breadth ?? 0} skills</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Templates Covered</p>
          <p className="text-xl font-bold">{templateList.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Categories Active</p>
          <p className="text-xl font-bold">{categoryList.length}</p>
        </Card>
      </div>

      {/* Template skills grid */}
      {hasTemplates && (
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/20">
            <p className="text-xs font-medium">Template Proficiency</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground sticky left-0 bg-background w-32">Agent</th>
                  {templateList.map((t) => (
                    <th key={t.id} className="px-2 py-2 text-center font-medium text-muted-foreground min-w-[80px]">
                      <span className="truncate block max-w-[78px] mx-auto" title={t.name}>{t.name}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">Breadth</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((row) => (
                  <tr key={row.agentId} className="border-b border-border/50 last:border-b-0 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium sticky left-0 bg-background">
                      <span className="truncate block max-w-[120px]">{row.agentName}</span>
                      <span className="text-[9px] text-muted-foreground">{row.totalRuns} runs</span>
                    </td>
                    {row.templateSkills.map((cell, i) => (
                      <td key={templateList[i].id} className="px-2 py-2 text-center">
                        {cell ? (
                          <div
                            className={cn("rounded px-1.5 py-0.5 inline-flex flex-col items-center gap-0", cellBg(cell))}
                            title={`${cell.runs} runs · ${Math.round(cell.successRate * 100)}% success${cell.avgScore != null ? ` · score ${Math.round(cell.avgScore)}` : ""}`}
                          >
                            <span className={cn("font-semibold text-[10px]", cellText(cell))}>
                              {Math.round(cell.successRate * 100)}%
                            </span>
                            {cell.avgScore != null && (
                              <span className="text-[8px] text-muted-foreground">{Math.round(cell.avgScore)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-semibold text-primary">
                        {row.templateSkills.filter(Boolean).length}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Category skills grid */}
      {hasCategories && (
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/20">
            <p className="text-xs font-medium">OPPRRC Category Coverage</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground sticky left-0 bg-background w-32">Agent</th>
                  {categoryList.map((cat) => (
                    <th key={cat} className="px-2 py-2 text-center font-medium text-muted-foreground min-w-[70px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={cn("h-2 w-2 rounded-full", OPPRRC_CATEGORY_COLORS[cat] ?? "bg-muted-foreground/30")} />
                        <span className="truncate block max-w-[68px] font-mono text-[9px]">{cat.replace(/^\d+_/, "")}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentRows.map((row) => (
                  <tr key={row.agentId} className="border-b border-border/50 last:border-b-0 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium sticky left-0 bg-background">
                      <span className="truncate block max-w-[120px]">{row.agentName}</span>
                    </td>
                    {row.catSkills.map((cell, i) => (
                      <td key={categoryList[i]} className="px-2 py-2 text-center">
                        {cell ? (
                          <div
                            className={cn("rounded px-1.5 py-0.5 inline-block", cellBg(cell))}
                            title={`${cell.runs} runs · ${Math.round(cell.successRate * 100)}% success`}
                          >
                            <span className={cn("font-semibold text-[10px]", cellText(cell))}>
                              {cell.runs}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}

// ─── Delivery Pipeline ───────────────────────────────────────────────────────

interface PipelineRun {
  id: string;
  agentName: string;
  agentId: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  client: string | null;
  templateName: string | null;
  category: string | null;
  costCents: number | null;
  durationSeconds: number | null;
  isStale: boolean;
}

interface PipelineData {
  inProgress: PipelineRun[];
  completed: PipelineRun[];
  failed: PipelineRun[];
  totalRuns: number;
  completedToday: number;
  staleCount: number;
}

function DeliveryPipeline({
  pipeline,
  isLoading,
  formatDuration,
}: {
  pipeline: PipelineData;
  isLoading: boolean;
  formatDuration: (s: number) => string;
}) {
  const { inProgress, completed, failed, totalRuns, completedToday, staleCount } = pipeline;

  function fmtAgo(ts: string | null): string {
    if (!ts) return "—";
    const ms = Date.now() - new Date(ts).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
    return `${Math.round(ms / 86_400_000)}d ago`;
  }

  if (isLoading) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Delivery Pipeline</h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (totalRuns === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold mb-3">Delivery Pipeline</h3>
        <EmptySection icon={Activity} message="No pipeline data yet." />
      </section>
    );
  }

  function RunCard({ run, variant }: { run: PipelineRun; variant: "progress" | "done" | "failed" }) {
    const borderClass =
      run.isStale ? "border-amber-400/60 dark:border-amber-600/40 bg-amber-50/30 dark:bg-amber-950/10"
      : variant === "done" ? "border-green-300/40 dark:border-green-800/30"
      : variant === "failed" ? "border-red-300/40 dark:border-red-800/30"
      : "border-border";

    const elapsed = run.startedAt
      ? (Date.now() - new Date(run.startedAt).getTime()) / 1000
      : null;

    return (
      <div className={cn("rounded-md border p-2.5 space-y-1", borderClass)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {variant === "progress" && (
                run.isStale
                  ? <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                  : <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />
              )}
              {variant === "done" && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
              {variant === "failed" && <XCircle className="h-3 w-3 text-destructive shrink-0" />}
              <span className="text-xs font-medium truncate">{run.agentName}</span>
              {run.isStale && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  stale
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {run.templateName && (
                <span className="text-[10px] text-primary/70 truncate max-w-[120px]">{run.templateName}</span>
              )}
              {run.client && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{run.client}</span>
              )}
              {run.category && (
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", OPPRRC_CATEGORY_COLORS[run.category] ?? "bg-muted-foreground/30")} title={run.category} />
              )}
            </div>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            {variant === "progress" && elapsed != null && (
              <p className="text-[10px] font-medium text-muted-foreground">{formatDuration(elapsed)}</p>
            )}
            {variant === "done" && run.durationSeconds != null && (
              <p className="text-[10px] text-muted-foreground">{formatDuration(run.durationSeconds)}</p>
            )}
            {run.costCents != null && (
              <p className="text-[10px] text-muted-foreground">{formatCents(run.costCents)}</p>
            )}
            {variant !== "progress" && (
              <p className="text-[10px] text-muted-foreground">{fmtAgo(run.finishedAt ?? run.startedAt)}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Delivery Pipeline</h3>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">In Progress</p>
          <p className={cn("text-xl font-bold", inProgress.length > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")}>
            {inProgress.length}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Delivered Today</p>
          <p className={cn("text-xl font-bold", completedToday > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
            {completedToday}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Stale Runs</p>
          <p className={cn("text-xl font-bold", staleCount > 0 ? "text-amber-500" : "text-muted-foreground")}>
            {staleCount}
          </p>
          <p className="text-[10px] text-muted-foreground">&gt;30 min running</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Failed</p>
          <p className={cn("text-xl font-bold", failed.length > 0 ? "text-destructive" : "text-muted-foreground")}>
            {failed.length}
          </p>
        </Card>
      </div>

      {/* 3-column pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* In Progress */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-semibold">In Progress</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">{inProgress.length}</Badge>
          </div>
          {inProgress.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-4 text-center">No active runs</p>
          ) : (
            <div className="space-y-1.5">
              {inProgress.map((run) => <RunCard key={run.id} run={run} variant="progress" />)}
            </div>
          )}
        </div>

        {/* Completed */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs font-semibold">Completed</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">{completed.length}</Badge>
          </div>
          {completed.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-4 text-center">No completed runs</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
              {completed.map((run) => <RunCard key={run.id} run={run} variant="done" />)}
            </div>
          )}
        </div>

        {/* Failed / Needs Attention */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs font-semibold">Needs Attention</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">{failed.length}</Badge>
          </div>
          {failed.length === 0 ? (
            <p className="text-[10px] text-muted-foreground py-4 text-center">All clear</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
              {failed.map((run) => <RunCard key={run.id} run={run} variant="failed" />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-semibold">{value}</p>
    </Card>
  );
}

function EmptySection({ icon: Icon, message }: { icon: typeof BarChart3; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/30 mb-2" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
