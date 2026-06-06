import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { formatDateTime, relativeTime } from "../lib/utils";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, GitBranch, Route, SearchX } from "lucide-react";
import type { HeartbeatRun } from "@paperclipai/shared";

function readTraceValue(run: HeartbeatRun, key: string) {
  const result = run.resultJson ?? {};
  const context = run.contextSnapshot ?? {};
  const usage = run.usageJson ?? {};
  return result[key] ?? context[key] ?? usage[key] ?? null;
}

function traceSummary(run: HeartbeatRun) {
  const pitStopTriggered = readTraceValue(run, "pitStopTriggered");
  const pitStopReason = readTraceValue(run, "pitStopTriggerReason");
  const workspaceId = readTraceValue(run, "pitStopWorkspaceId") ?? readTraceValue(run, "executionWorkspaceId");
  const sourceRunId = readTraceValue(run, "pitStopSourceRunId") ?? run.retryOfRunId;
  return {
    pitStopTriggered: pitStopTriggered === true || pitStopTriggered === "true",
    pitStopReason: typeof pitStopReason === "string" ? pitStopReason : null,
    workspaceId: typeof workspaceId === "string" ? workspaceId : null,
    sourceRunId: typeof sourceRunId === "string" ? sourceRunId : null,
  };
}

export function Tracing() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const companyId = selectedCompanyId!;
  const [selectedRunId, setSelectedRunId] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Tracing" }]);
  }, [setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const runsQuery = useQuery({
    queryKey: ["trace-runs", companyId],
    queryFn: () => heartbeatsApi.list(companyId, undefined, 100),
    enabled: !!companyId,
    refetchInterval: 10_000,
  });

  const runs = runsQuery.data ?? [];

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) setSelectedRunId(runs[0]!.id);
  }, [runs, selectedRunId]);

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null;
  const agentsById = useMemo(
    () => new Map((agentsQuery.data ?? []).map((agent) => [agent.id, agent])),
    [agentsQuery.data],
  );

  const eventsQuery = useQuery({
    queryKey: ["trace-events", selectedRun?.id],
    queryFn: () => heartbeatsApi.events(selectedRun!.id, 0, 300),
    enabled: !!selectedRun,
    refetchInterval: selectedRun?.status === "running" ? 3000 : false,
  });

  if (runsQuery.isLoading || agentsQuery.isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Tracing</h1>
          <p className="text-xs text-muted-foreground">Run lineage, trace events, and Pit Stop metadata.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/tests/ux/runs">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            UX Trace Lab
          </Link>
        </Button>
      </div>

      {runs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <SearchX className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No runs available to trace.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-3 py-2">
              <p className="text-xs font-semibold">Recent Runs</p>
            </div>
            <div className="max-h-[calc(100vh-13rem)] overflow-y-auto">
              {runs.map((run) => {
                const agent = agentsById.get(run.agentId);
                const trace = traceSummary(run);
                const started = run.startedAt ?? run.createdAt;
                const active = run.id === selectedRun?.id;
                return (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`flex w-full flex-col gap-1 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted/30 ${active ? "bg-accent" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{agent?.name ?? run.agentId.slice(0, 8)}</span>
                      <Badge variant="secondary" className="text-[10px]">{run.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{started ? relativeTime(started) : "—"}</span>
                      <span>·</span>
                      <span>{run.runMode}</span>
                      {trace.pitStopTriggered && (
                        <>
                          <span>·</span>
                          <span className="text-amber-500">Pit Stop</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {selectedRun && (
            <div className="space-y-4">
              <TraceMetadata run={selectedRun} agentName={agentsById.get(selectedRun.agentId)?.name ?? selectedRun.agentId.slice(0, 8)} />
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <p className="text-xs font-semibold">Events</p>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/agents/${agentsById.get(selectedRun.agentId)?.urlKey ?? selectedRun.agentId}/runs/${selectedRun.id}`}>
                      Open run
                    </Link>
                  </Button>
                </div>
                {eventsQuery.isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading events...</div>
                ) : (eventsQuery.data ?? []).length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No trace events recorded.</div>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto">
                    {(eventsQuery.data ?? []).map((event) => (
                      <div key={event.id} className="grid grid-cols-[72px_140px_1fr] gap-3 border-b border-border/60 px-3 py-2 text-xs last:border-b-0">
                        <span className="font-mono text-muted-foreground">#{event.seq}</span>
                        <span className="truncate font-medium">{event.eventType}</span>
                        <span className={event.level === "error" ? "text-destructive" : "text-muted-foreground"}>
                          {event.message ?? (event.payload ? JSON.stringify(event.payload).slice(0, 220) : "—")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TraceMetadata({ run, agentName }: { run: HeartbeatRun; agentName: string }) {
  const trace = traceSummary(run);
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Card className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Agent</p>
        <p className="mt-1 truncate text-sm font-semibold">{agentName}</p>
      </Card>
      <Card className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Started</p>
        <p className="mt-1 truncate text-sm font-semibold">{run.startedAt ? formatDateTime(run.startedAt) : "—"}</p>
      </Card>
      <Card className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Lineage</p>
        <p className="mt-1 flex items-center gap-1 truncate text-sm font-semibold">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          {trace.sourceRunId ? trace.sourceRunId.slice(0, 8) : run.sessionIdAfter?.slice(0, 12) ?? "—"}
        </p>
      </Card>
      <Card className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pit Stop</p>
        <p className="mt-1 flex items-center gap-1 truncate text-sm font-semibold">
          <Route className="h-3.5 w-3.5 text-muted-foreground" />
          {trace.pitStopTriggered ? trace.pitStopReason ?? "triggered" : "not triggered"}
        </p>
      </Card>
    </div>
  );
}
