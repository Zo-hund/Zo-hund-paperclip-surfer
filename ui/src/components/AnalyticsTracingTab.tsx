import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Agent, HeartbeatRunEvent, WorkspaceOperation } from "@paperclipai/shared";
import { analyticsApi, type KpiObservation } from "../api/agentKpis";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Clock3, Loader2, RotateCcw, Slash } from "lucide-react";

const statusTone: Record<string, string> = {
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  succeeded: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  timed_out: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  cancelled: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-300",
  queued: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

function relativeTime(value: string | Date | null) {
  if (!value) return "—";
  const ts = new Date(value).getTime();
  const delta = Date.now() - ts;
  if (!Number.isFinite(delta)) return "—";
  if (delta < 60_000) return `${Math.max(1, Math.round(delta / 1000))}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}

function formatTimestamp(value: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatEventPayload(payload: Record<string, unknown> | null) {
  if (!payload) return "";
  const preferredKeys = [
    "wakeReason",
    "triggerDetail",
    "issueId",
    "cwd",
    "sessionRotationReason",
    "errorMessage",
    "errorCode",
    "inputTokens",
    "outputTokens",
    "durationSeconds",
  ] as const;
  const parts = preferredKeys
    .map((key) => {
      const value = payload[key];
      if (value == null) return null;
      return `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`;
    })
    .filter((value): value is string => Boolean(value));
  return parts.join(" • ");
}

function renderStatusIcon(status: string) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  if (status === "failed") return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  if (status === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === "timed_out") return <Clock3 className="h-3.5 w-3.5 text-amber-500" />;
  return <Slash className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function AnalyticsTracingTab({
  companyId,
  agents,
  observations,
  onCreateObservation,
}: {
  companyId: string;
  agents: Agent[];
  observations: KpiObservation[];
  onCreateObservation: (agentIds: string[]) => void;
}) {
  const [agentId, setAgentId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [issueId, setIssueId] = useState<string>("");
  const [windowPreset, setWindowPreset] = useState<string>("7d");
  const [limit, setLimit] = useState<string>("50");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const since = useMemo(() => {
    const now = Date.now();
    if (windowPreset === "24h") return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    if (windowPreset === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (windowPreset === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    return undefined;
  }, [windowPreset]);

  const filters = useMemo(
    () => ({
      agentId: agentId !== "all" ? agentId : undefined,
      status: status !== "all" ? status : undefined,
      issueId: issueId.trim() || undefined,
      since,
      limit: Math.max(1, Math.min(Number(limit) || 50, 200)),
    }),
    [agentId, issueId, limit, since, status],
  );

  const tracesQuery = useQuery({
    queryKey: queryKeys.traceSummaries(companyId, filters),
    queryFn: () => analyticsApi.listTraces(companyId, filters),
    enabled: Boolean(companyId),
    refetchInterval: 15_000,
  });

  const traces = tracesQuery.data ?? [];
  const selectedTrace = traces.find((trace) => trace.runId === selectedRunId) ?? traces[0] ?? null;
  const traceRollups = useMemo(() => {
    const laneMap = new Map<string, { label: string; runs: number; tokens: number; succeeded: number; failed: number }>();
    const gearMap = new Map<string, { label: string; runs: number; tokens: number }>();
    let localRuns = 0;
    let cloudRuns = 0;
    let fallbackRuns = 0;
    let autoSwitchRuns = 0;
    let manualOverrideRuns = 0;

    for (const trace of traces) {
      const totalTokens = trace.inputTokens + trace.outputTokens;
      if (trace.selectedDeployment === "local") localRuns += 1;
      if (trace.selectedDeployment === "cloud") cloudRuns += 1;
      if (trace.fallbackApplied) fallbackRuns += 1;
      if (trace.failoverAttempt > 1 || trace.attemptedModels.length > 1) autoSwitchRuns += 1;
      if (trace.manualOverrideApplied) manualOverrideRuns += 1;

      const laneLabel = [trace.selectedHarness, trace.selectedModel ?? trace.model, trace.selectedDeployment]
        .filter(Boolean)
        .join(" • ") || "unclassified lane";
      const laneBucket = laneMap.get(laneLabel) ?? {
        label: laneLabel,
        runs: 0,
        tokens: 0,
        succeeded: 0,
        failed: 0,
      };
      laneBucket.runs += 1;
      laneBucket.tokens += totalTokens;
      if (trace.status === "succeeded") laneBucket.succeeded += 1;
      if (trace.status === "failed") laneBucket.failed += 1;
      laneMap.set(laneLabel, laneBucket);

      const gear = trace.gearProfile;
      const gearLabel = [
        gear?.objectiveClass ?? "default",
        gear?.qualityTier ?? "standard",
        gear?.budgetMode ?? "balanced",
      ].join(" • ");
      const gearBucket = gearMap.get(gearLabel) ?? { label: gearLabel, runs: 0, tokens: 0 };
      gearBucket.runs += 1;
      gearBucket.tokens += totalTokens;
      gearMap.set(gearLabel, gearBucket);
    }

    return {
      localRuns,
      cloudRuns,
      fallbackRuns,
      autoSwitchRuns,
      manualOverrideRuns,
      topLanes: [...laneMap.values()].sort((a, b) => b.tokens - a.tokens || b.runs - a.runs).slice(0, 3),
      topGearProfiles: [...gearMap.values()].sort((a, b) => b.tokens - a.tokens || b.runs - a.runs).slice(0, 3),
    };
  }, [traces]);

  useEffect(() => {
    if (!selectedTrace) {
      setSelectedRunId(null);
      return;
    }
    setSelectedRunId((current) => (current && traces.some((trace) => trace.runId === current) ? current : selectedTrace.runId));
  }, [selectedTrace, traces]);

  const eventsQuery = useQuery({
    queryKey: ["trace-events", selectedTrace?.runId],
    queryFn: () => heartbeatsApi.events(selectedTrace!.runId),
    enabled: Boolean(selectedTrace?.runId),
    refetchInterval: selectedTrace?.status === "running" ? 5000 : false,
  });

  const logQuery = useQuery({
    queryKey: ["trace-log", selectedTrace?.runId],
    queryFn: () => heartbeatsApi.log(selectedTrace!.runId),
    enabled: Boolean(selectedTrace?.runId && selectedTrace.hasLog),
    refetchInterval: selectedTrace?.status === "running" ? 5000 : false,
  });

  const workspaceOperationsQuery = useQuery({
    queryKey: queryKeys.runWorkspaceOperations(selectedTrace?.runId ?? "__none__"),
    queryFn: () => heartbeatsApi.workspaceOperations(selectedTrace!.runId),
    enabled: Boolean(selectedTrace?.runId),
  });

  const relatedObservations = observations.filter((observation) =>
    selectedTrace ? observation.agentIds?.includes(selectedTrace.agentId) : false,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailStat
          label="Local vs Cloud"
          value={`${traceRollups.localRuns} local • ${traceRollups.cloudRuns} cloud`}
        />
        <DetailStat
          label="Policy Overrides"
          value={`${traceRollups.manualOverrideRuns} manual • ${traceRollups.fallbackRuns} fallback`}
        />
        <DetailStat
          label="Auto Switches"
          value={`${traceRollups.autoSwitchRuns} runs`}
        />
        <DetailStat
          label="Top Gear Profile"
          value={traceRollups.topGearProfiles[0]?.label ?? "—"}
        />
        <DetailStat label="Top Lane" value={traceRollups.topLanes[0]?.label ?? "—"} />
      </div>

      {(traceRollups.topGearProfiles.length > 0 || traceRollups.topLanes.length > 0) && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Gear Spend</div>
            <div className="space-y-2">
              {traceRollups.topGearProfiles.map((profile) => (
                <div key={profile.label} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm">
                  <div className="min-w-0 truncate">{profile.label}</div>
                  <div className="shrink-0 text-xs text-muted-foreground">{profile.runs} runs • {profile.tokens} tokens</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">Lane Reliability</div>
            <div className="space-y-2">
              {traceRollups.topLanes.map((lane) => (
                <div key={lane.label} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm">
                  <div className="min-w-0 truncate">{lane.label}</div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {lane.runs} runs • {lane.succeeded} ok • {lane.failed} failed
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger>
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="timed_out">Timed out</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Input value={issueId} onChange={(event) => setIssueId(event.target.value)} placeholder="Issue id" />
          <Select value={windowPreset} onValueChange={setWindowPreset}>
            <SelectTrigger>
              <SelectValue placeholder="Time window" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7d</SelectItem>
              <SelectItem value="30d">Last 30d</SelectItem>
              <SelectItem value="all">All recent</SelectItem>
            </SelectContent>
          </Select>
          <Input value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="Limit" />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Recent Traces</div>
          <div className="max-h-[72vh] overflow-y-auto">
            {tracesQuery.isLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading traces...
              </div>
            ) : traces.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No traces matched the current filters.</div>
            ) : (
              <div className="divide-y divide-border">
                {traces.map((trace) => (
                  <button
                    key={trace.runId}
                    type="button"
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-muted/20",
                      selectedTrace?.runId === trace.runId && "bg-muted/30",
                    )}
                    onClick={() => setSelectedRunId(trace.runId)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          {renderStatusIcon(trace.status)}
                          <span className="truncate text-sm font-medium">{trace.agentName}</span>
                          <Badge className={cn("capitalize", statusTone[trace.status] ?? statusTone.cancelled)}>
                            {trace.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {trace.wakeReason ?? trace.wakeSource ?? "unknown wake"}{trace.issueId ? ` • ${trace.issueId}` : ""}
                        </div>
                        {(trace.selectedHarness || trace.selectedDeployment || trace.contextTier) && (
                          <div className="text-xs text-muted-foreground">
                            {[trace.selectedHarness, trace.selectedDeployment, trace.contextTier].filter(Boolean).join(" • ")}
                          </div>
                        )}
                        {trace.pitStopTriggered && (
                          <div className="text-xs text-amber-600">
                            Pit Stop: {trace.pitStopTriggerReason ?? "optimization recommended"}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {trace.sessionRotated ? (
                            <span className="inline-flex items-center gap-1">
                              <RotateCcw className="h-3 w-3" />
                              {trace.sessionRotationReason ?? "session rotated"}
                            </span>
                          ) : (
                            trace.errorMessage ?? trace.cwd ?? trace.model ?? "no extra detail"
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                        <div>{relativeTime(trace.finishedAt ?? trace.startedAt)}</div>
                        <div>{trace.eventCount} events</div>
                        <div>{trace.logBytes} bytes</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          {!selectedTrace ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Select a trace to inspect run details.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{selectedTrace.agentName}</h3>
                    <Badge className={cn("capitalize", statusTone[selectedTrace.status] ?? statusTone.cancelled)}>
                      {selectedTrace.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedTrace.wakeReason ?? selectedTrace.wakeSource ?? "unknown wake"}{selectedTrace.triggerDetail ? ` • ${selectedTrace.triggerDetail}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onCreateObservation([selectedTrace.agentId])}>
                  Create Observation
                </Button>
              </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailStat label="Started" value={formatTimestamp(selectedTrace.startedAt)} />
                  <DetailStat label="Finished" value={formatTimestamp(selectedTrace.finishedAt)} />
                  <DetailStat label="Adapter" value={selectedTrace.adapterType ?? "—"} />
                  <DetailStat label="Model" value={selectedTrace.model ?? "—"} />
                  <DetailStat label="Initial Model" value={selectedTrace.initialSelectedModel ?? "—"} />
                  <DetailStat label="Failover" value={selectedTrace.failoverAttempt > 1 ? `attempt ${selectedTrace.failoverAttempt}` : "none"} />
                  <DetailStat label="Gear" value={selectedTrace.selectedHarness ?? "—"} />
                  <DetailStat label="Deployment" value={selectedTrace.selectedDeployment ?? "—"} />
                  <DetailStat label="Context Tier" value={selectedTrace.contextTier ?? "—"} />
                  <DetailStat label="Workspace Mode" value={selectedTrace.selectedWorkspaceMode ?? "—"} />
                  <DetailStat label="Workspace" value={selectedTrace.workspaceId ?? "—"} />
                  <DetailStat label="CWD" value={selectedTrace.cwd ?? "—"} />
                  <DetailStat label="Tokens" value={`${selectedTrace.inputTokens + selectedTrace.outputTokens}`} />
                  <DetailStat label="Duration" value={selectedTrace.durationSeconds != null ? `${selectedTrace.durationSeconds}s` : "—"} />
                </div>

              {(selectedTrace.errorMessage || selectedTrace.sessionRotated || selectedTrace.issueId) && (
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  {selectedTrace.issueId && <div><span className="text-muted-foreground">Issue:</span> {selectedTrace.issueId}</div>}
                  {selectedTrace.sessionRotated && (
                    <div><span className="text-muted-foreground">Session rotation:</span> {selectedTrace.sessionRotationReason ?? "rotated"}</div>
                  )}
                  {selectedTrace.selectionReason && (
                    <div><span className="text-muted-foreground">Gear decision:</span> {selectedTrace.selectionReason}</div>
                  )}
                  {selectedTrace.pitStopTriggered && (
                    <div>
                      <span className="text-muted-foreground">Pit Stop:</span>{" "}
                      {selectedTrace.pitStopTriggerReason ?? "optimization recommended"}
                      {selectedTrace.pitStopWorkspaceId ? ` • workspace ${selectedTrace.pitStopWorkspaceId}` : ""}
                      {selectedTrace.pitStopOptimizationId ? ` • optimization ${selectedTrace.pitStopOptimizationId}` : ""}
                    </div>
                  )}
                  {(selectedTrace.fallbackApplied || selectedTrace.manualOverrideApplied) && (
                    <div>
                      <span className="text-muted-foreground">Policy flags:</span>{" "}
                      {[selectedTrace.fallbackApplied ? "fallback" : null, selectedTrace.manualOverrideApplied ? "manual override" : null]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  )}
                  {(selectedTrace.failoverAttempt > 1 || selectedTrace.failureCategory || selectedTrace.failoverExhausted) && (
                    <div>
                      <span className="text-muted-foreground">Runtime failover:</span>{" "}
                      {[
                        selectedTrace.failoverFromModel && selectedTrace.failoverToModel
                          ? `${selectedTrace.failoverFromModel} -> ${selectedTrace.failoverToModel}`
                          : null,
                        selectedTrace.failureCategory,
                        selectedTrace.failoverExhausted ? "exhausted" : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  )}
                  {selectedTrace.errorMessage && (
                    <div><span className="text-muted-foreground">Failure:</span> {selectedTrace.errorMessage}</div>
                  )}
                </div>
              )}

              {selectedTrace.attemptedModels.length > 0 && (
                <section className="space-y-2">
                  <div className="text-sm font-semibold">Model Attempts</div>
                  <div className="rounded-lg border border-border bg-background/70">
                    <div className="divide-y divide-border">
                      {selectedTrace.attemptedModels.map((attempt) => (
                        <div key={`${attempt.attempt}-${attempt.model ?? "none"}`} className="px-4 py-3 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">
                              Attempt {attempt.attempt}: {attempt.model ?? "unconfigured model"}
                            </div>
                            <Badge variant="outline">{attempt.outcome}</Badge>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {[attempt.harness, attempt.provider, attempt.variant, attempt.failureCategory]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                          {attempt.errorMessage && <div className="mt-1 text-muted-foreground">{attempt.errorMessage}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <div className="text-sm font-semibold">Event Timeline</div>
                <div className="rounded-lg border border-border bg-background/70">
                  {(eventsQuery.data ?? []).length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">No structured events recorded.</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {(eventsQuery.data ?? []).map((event: HeartbeatRunEvent) => (
                        <div key={`${event.runId}-${event.seq}`} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-xs">{event.eventType}</div>
                            <div className="text-[11px] text-muted-foreground">{formatTimestamp(event.createdAt)}</div>
                          </div>
                          {(event.message || event.payload) && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {event.message ?? formatEventPayload(event.payload)}
                              {event.message && event.payload ? ` • ${formatEventPayload(event.payload)}` : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-sm font-semibold">Workspace Operations</div>
                <div className="rounded-lg border border-border bg-background/70">
                  {(workspaceOperationsQuery.data ?? []).length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">No workspace operations recorded.</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {(workspaceOperationsQuery.data ?? []).map((operation: WorkspaceOperation) => (
                        <div key={operation.id} className="px-4 py-3 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">{operation.phase}</div>
                            <Badge variant="outline" className="capitalize">{operation.status.replace("_", " ")}</Badge>
                          </div>
                          {operation.command && <div className="mt-1 break-all text-muted-foreground">{operation.command}</div>}
                          {operation.cwd && <div className="break-all text-muted-foreground">{operation.cwd}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <div className="text-sm font-semibold">Raw Log</div>
                <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-neutral-100 p-3 text-xs whitespace-pre-wrap dark:bg-neutral-950">
                  {logQuery.data?.content ?? (selectedTrace.hasLog ? "Loading log..." : "No persisted log.")}
                </pre>
              </section>

              <section className="space-y-2">
                <div className="text-sm font-semibold">Related Observations</div>
                {relatedObservations.length === 0 ? (
                  <div className="rounded-lg border border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                    No observations linked to this agent yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {relatedObservations.map((observation) => (
                      <div key={observation.id} className="rounded-lg border border-border bg-background/70 px-4 py-3">
                        <div className="text-sm">{observation.observation}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatTimestamp(observation.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-all text-sm font-medium">{value}</div>
    </div>
  );
}
