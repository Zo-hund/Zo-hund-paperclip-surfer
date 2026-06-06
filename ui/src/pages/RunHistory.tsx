import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { formatDateTime, formatTokens, relativeTime, visibleRunCostUsd } from "../lib/utils";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, SearchX } from "lucide-react";
import type { HeartbeatRun } from "@paperclipai/shared";

function statusTone(status: string) {
  if (status === "completed" || status === "succeeded") return "text-green-600 dark:text-green-400";
  if (status === "running" || status === "queued") return "text-blue-600 dark:text-blue-400";
  if (status === "failed" || status === "error" || status === "timed_out") return "text-destructive";
  return "text-muted-foreground";
}

function statusIcon(status: string) {
  if (status === "completed" || status === "succeeded") return CheckCircle2;
  if (status === "running" || status === "queued") return Loader2;
  if (status === "failed" || status === "error" || status === "timed_out") return AlertTriangle;
  return Clock;
}

function asDate(value: Date | string | null | undefined) {
  return value ? new Date(value) : null;
}

function durationLabel(run: HeartbeatRun) {
  const started = asDate(run.startedAt);
  const finished = asDate(run.finishedAt);
  if (!started || !finished) return "—";
  const seconds = Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function tokenTotal(run: HeartbeatRun) {
  const usage = run.usageJson ?? {};
  const input = Number(usage.inputTokens ?? usage.input_tokens ?? 0);
  const cached = Number(usage.cachedInputTokens ?? usage.cached_input_tokens ?? 0);
  const output = Number(usage.outputTokens ?? usage.output_tokens ?? 0);
  return [input, cached, output].filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
}

export function RunHistory() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const companyId = selectedCompanyId!;
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Run History" }]);
  }, [setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const runsQuery = useQuery({
    queryKey: ["run-history", companyId, agentFilter],
    queryFn: () => heartbeatsApi.list(companyId, agentFilter === "all" ? undefined : agentFilter, 250),
    enabled: !!companyId,
    refetchInterval: 10_000,
  });

  const agentsById = useMemo(
    () => new Map((agentsQuery.data ?? []).map((agent) => [agent.id, agent])),
    [agentsQuery.data],
  );

  const runs = useMemo(() => {
    const list = runsQuery.data ?? [];
    return statusFilter === "all" ? list : list.filter((run) => run.status === statusFilter);
  }, [runsQuery.data, statusFilter]);

  const statuses = useMemo(
    () => Array.from(new Set((runsQuery.data ?? []).map((run) => run.status))).sort(),
    [runsQuery.data],
  );

  if (runsQuery.isLoading || agentsQuery.isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Run History</h1>
          <p className="text-xs text-muted-foreground">Recent heartbeat runs across this company.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="all">All agents</option>
            {(agentsQuery.data ?? []).map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="all">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Runs Loaded</p>
          <p className="mt-1 text-xl font-semibold">{runs.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Running</p>
          <p className="mt-1 text-xl font-semibold text-blue-600 dark:text-blue-400">
            {runs.filter((run) => run.status === "running" || run.status === "queued").length}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Failed</p>
          <p className="mt-1 text-xl font-semibold text-destructive">
            {runs.filter((run) => run.status === "failed" || run.status === "timed_out").length}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tokens</p>
          <p className="mt-1 text-xl font-semibold">{formatTokens(runs.reduce((sum, run) => sum + tokenTotal(run), 0))}</p>
        </Card>
      </div>

      {runs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <SearchX className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No runs match these filters.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Tokens</th>
                  <th className="px-3 py-2 font-medium">Cost</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const agent = agentsById.get(run.agentId);
                  const Icon = statusIcon(run.status);
                  const started = asDate(run.startedAt ?? run.createdAt);
                  const cost = visibleRunCostUsd(run.usageJson, run.resultJson);
                  return (
                    <tr key={run.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 ${statusTone(run.status)}`}>
                          <Icon className={`h-3.5 w-3.5 ${run.status === "running" ? "animate-spin" : ""}`} />
                          <span className="capitalize">{run.status.replace(/_/g, " ")}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {agent ? (
                          <Link className="font-medium hover:underline" to={`/agents/${agent.urlKey ?? agent.id}`}>
                            {agent.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{run.agentId.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-[10px]">{run.runMode ?? run.invocationSource}</Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground" title={started ? formatDateTime(started) : undefined}>
                        {started ? relativeTime(started) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{durationLabel(run)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatTokens(tokenTotal(run))}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cost > 0 ? `$${cost.toFixed(4)}` : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/agents/${agent?.urlKey ?? run.agentId}/runs/${run.id}`}>
                            <Activity className="mr-1 h-3.5 w-3.5" />
                            Open
                            <ExternalLink className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
