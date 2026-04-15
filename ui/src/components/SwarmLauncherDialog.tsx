import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { agentsApi } from "../api/agents";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Rocket,
  Shield,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import type { Agent } from "@paperclipai/shared";

type RunMode = "sim" | "live";

interface SwarmState {
  batchId: string | null;
  runMode: RunMode;
  agentIds: string[];
  startedAt: Date | null;
}

// ── Step indicators ──────────────────────────────────────────────────────────

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black transition-all",
          done
            ? "bg-primary text-primary-foreground"
            : active
              ? "bg-primary/20 text-primary border-2 border-primary"
              : "bg-accent/20 text-muted-foreground",
        )}
      >
        {done ? <CheckCircle2 className="w-4 h-4" /> : label}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SwarmLauncherDialog() {
  const { swarmLauncherOpen, closeSwarmLauncher } = useDialog();
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = React.useState(1);
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<Set<string>>(new Set());
  const [taskRequest, setTaskRequest] = React.useState("");
  const [runMode, setRunMode] = React.useState<RunMode>("sim");
  const [failureThreshold, setFailureThreshold] = React.useState(50);
  const [maxConcurrentAgents, setMaxConcurrentAgents] = React.useState<number | "">(""); // "" = all at once
  const [lastSwarm, setLastSwarm] = React.useState<SwarmState | null>(null);

  // Reset on close
  React.useEffect(() => {
    if (!swarmLauncherOpen) {
      setStep(1);
      setSelectedAgentIds(new Set());
      setTaskRequest("");
      setRunMode("sim");
      setFailureThreshold(50);
      setMaxConcurrentAgents("");
      setLastSwarm(null);
    }
  }, [swarmLauncherOpen]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && swarmLauncherOpen,
  });

  const activeAgents = React.useMemo(
    () => (agents ?? []).filter((a) => a.status !== "terminated"),
    [agents],
  );

  // Live runs to drive the monitor after launch
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!lastSwarm,
    refetchInterval: lastSwarm ? 3000 : false,
  });

  // Swarm stats derived from live runs
  const swarmRuns = React.useMemo<LiveRunForIssue[]>(() => {
    if (!lastSwarm?.batchId || !lastSwarm.startedAt) return [];
    const cutoff = lastSwarm.startedAt.getTime() - 5000;
    return (liveRuns ?? []).filter(
      (r) =>
        lastSwarm.agentIds.includes(r.agentId) &&
        r.startedAt != null &&
        new Date(r.startedAt).getTime() >= cutoff,
    );
  }, [liveRuns, lastSwarm]);

  const swarmStats = React.useMemo(() => {
    const running = swarmRuns.filter((r) => r.status === "running").length;
    const done = swarmRuns.filter((r) => r.status === "succeeded").length;
    const failed = swarmRuns.filter((r) => r.status === "failed" || r.status === "timed_out").length;
    const total = lastSwarm?.agentIds.length ?? 0;
    const queued = swarmRuns.filter((r) => r.status === "queued").length;
    return { running, done, failed, total, queued, progress: total > 0 ? (done + failed) / total : 0 };
  }, [swarmRuns, lastSwarm]);

  const allSimDone =
    lastSwarm?.runMode === "sim" &&
    swarmStats.total > 0 &&
    swarmStats.progress >= 1;

  // Launch mutation
  const launchMutation = useMutation({
    mutationFn: () =>
      agentsApi.swarmLaunch(selectedCompanyId!, {
        agentIds: Array.from(selectedAgentIds),
        payload: { taskRequest },
        runMode,
        protections: {
          failureThreshold: failureThreshold / 100,
          maxConcurrentAgents: maxConcurrentAgents === "" ? undefined : maxConcurrentAgents,
        },
      }),
    onSuccess: (result) => {
      setLastSwarm({
        batchId: result.batchId,
        runMode: result.runMode,
        agentIds: Array.from(selectedAgentIds),
        startedAt: new Date(),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId!) });
      pushToast({
        title: `Swarm launched — ${Array.from(selectedAgentIds).length} agents ${runMode === "sim" ? "(Sim)" : "(Live)"} queued`,
      });
      setStep(4); // monitor step
    },
    onError: () => pushToast({ tone: "warn", title: "Swarm failed to launch" }),
  });

  // Promote mutation
  const promoteMutation = useMutation({
    mutationFn: () =>
      agentsApi.swarmPromote(selectedCompanyId!, {
        swarmBatchId: lastSwarm!.batchId!,
        agentIds: lastSwarm!.agentIds,
      }),
    onSuccess: (result) => {
      setLastSwarm({
        batchId: result.batchId,
        runMode: "live",
        agentIds: lastSwarm!.agentIds,
        startedAt: new Date(),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId!) });
      pushToast({ title: `Promoted ${result.runs.length} runs → Live` });
    },
    onError: () => pushToast({ tone: "warn", title: "Promotion failed" }),
  });

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedAgentIds(new Set(activeAgents.map((a) => a.id)));
  const selectNone = () => setSelectedAgentIds(new Set());

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={swarmLauncherOpen} onOpenChange={(o) => { if (!o) closeSwarmLauncher(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <DialogTitle className="text-base font-bold">Launch Swarm</DialogTitle>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-2 mt-3">
            {["Agents", "Work Order", "Mode"].map((label, i) => (
              <React.Fragment key={label}>
                <StepDot active={step === i + 1} done={step > i + 1 || step === 4} label={String(i + 1)} />
                {i < 2 && <div className={cn("flex-1 h-0.5 rounded-full transition-all", step > i + 1 ? "bg-primary" : "bg-accent/20")} />}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">

          {/* ── Step 1: Select agents ── */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Select agents to include in the swarm
                </p>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-[11px] text-primary hover:underline">All</button>
                  <span className="text-muted-foreground text-[11px]">/</span>
                  <button onClick={selectNone} className="text-[11px] text-primary hover:underline">None</button>
                </div>
              </div>

              <div className="space-y-1 max-h-64 overflow-y-auto rounded-lg border border-border/50 bg-accent/5 p-1">
                {activeAgents.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No active agents</p>
                )}
                {activeAgents.map((agent: Agent) => {
                  const selected = selectedAgentIds.has(agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => toggleAgent(agent.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-all",
                        selected ? "bg-primary/10 border border-primary/20" : "hover:bg-accent/10 border border-transparent",
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded flex-shrink-0 border transition-all",
                        selected ? "bg-primary border-primary" : "border-border/60",
                      )}>
                        {selected && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground m-auto" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{agent.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{agent.adapterType} · {agent.status}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Users className="w-3.5 h-3.5" />
                <span>{selectedAgentIds.size} of {activeAgents.length} agents selected</span>
                {selectedAgentIds.size > 10 && (
                  <span className="text-primary font-medium">· {selectedAgentIds.size} parallel workers</span>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Work order ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">What should all agents work on?</p>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Task Request
                </label>
                <textarea
                  value={taskRequest}
                  onChange={(e) => setTaskRequest(e.target.value)}
                  placeholder="Describe the work order for this swarm..."
                  className="w-full h-32 rounded-lg border border-border/60 bg-accent/5 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="rounded-lg border border-border/40 bg-accent/5 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Summary</div>
                <div className="text-sm text-foreground">{selectedAgentIds.size} agents · {taskRequest.trim() ? `"${taskRequest.trim().slice(0, 60)}${taskRequest.length > 60 ? "..." : ""}"` : "No task set"}</div>
              </div>
            </div>
          )}

          {/* ── Step 3: Mode & protections ── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Run mode */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                  Run Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["sim", "live"] as RunMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setRunMode(mode)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all",
                        runMode === mode
                          ? "border-primary bg-primary/10"
                          : "border-border/40 bg-accent/5 hover:border-border hover:bg-accent/10",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {mode === "sim" ? <Shield className="w-4 h-4 text-blue-400" /> : <Rocket className="w-4 h-4 text-green-400" />}
                        <span className="text-sm font-bold capitalize">{mode === "sim" ? "Simulation" : "Live"}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        {mode === "sim"
                          ? "Test run — tagged as Sim. Review results before promoting to Live."
                          : "Real execution — agents work on the task immediately."}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Protections */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                  Swarm Protections
                </label>
                <div className="space-y-3 rounded-xl border border-border/40 bg-accent/5 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">Failure threshold</div>
                      <div className="text-[10px] text-muted-foreground">Abort swarm if this % of agents fail</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={10}
                        max={100}
                        value={failureThreshold}
                        onChange={(e) => setFailureThreshold(Number(e.target.value))}
                        className="w-16 rounded-md border border-border/60 bg-background px-2 py-1 text-sm text-center"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">Max concurrent agents</div>
                      <div className="text-[10px] text-muted-foreground">Leave blank to fire all at once</div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="All"
                      value={maxConcurrentAgents}
                      onChange={(e) => setMaxConcurrentAgents(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-16 rounded-md border border-border/60 bg-background px-2 py-1 text-sm text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Launch summary */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  {runMode === "sim" ? <Shield className="w-3.5 h-3.5 text-blue-400" /> : <Rocket className="w-3.5 h-3.5 text-green-400" />}
                  <span className="text-sm font-bold">{runMode === "sim" ? "Simulation" : "Live"} swarm · {selectedAgentIds.size} agents</span>
                </div>
                {taskRequest.trim() && (
                  <p className="text-[11px] text-muted-foreground truncate">{taskRequest.trim().slice(0, 80)}{taskRequest.length > 80 ? "..." : ""}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Monitor ── */}
          {step === 4 && lastSwarm && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    swarmStats.progress < 1 ? "bg-primary animate-ping" : "bg-green-400",
                  )} />
                  <span className="text-sm font-bold">
                    {swarmStats.progress < 1 ? "Swarm running..." : "Swarm complete"}
                  </span>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                    lastSwarm.runMode === "sim" ? "bg-blue-400/10 text-blue-400" : "bg-green-400/10 text-green-400",
                  )}>
                    {lastSwarm.runMode === "sim" ? "SIM" : "LIVE"}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{swarmStats.done + swarmStats.failed}/{swarmStats.total} done</span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full bg-accent/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500 shadow-[0_0_8px_var(--primary)]"
                  style={{ width: `${Math.round(swarmStats.progress * 100)}%` }}
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Queued", value: swarmStats.queued, color: "text-muted-foreground" },
                  { label: "Running", value: swarmStats.running, color: "text-blue-400" },
                  { label: "Done", value: swarmStats.done, color: "text-green-400" },
                  { label: "Failed", value: swarmStats.failed, color: "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className={cn("text-xl font-black tabular-nums", color)}>{value}</div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {/* Per-agent rows */}
              <div className="space-y-1 max-h-36 overflow-y-auto rounded-lg border border-border/40 bg-accent/5 p-2">
                {lastSwarm.agentIds.map((agentId) => {
                  const run = swarmRuns.find((r) => r.agentId === agentId);
                  const status = run?.status ?? "queued";
                  const agentName = agents?.find((a) => a.id === agentId)?.name ?? agentId.slice(0, 8);
                  return (
                    <div key={agentId} className="flex items-center gap-2 text-[10px] px-1">
                      {status === "running" && <Loader2 className="h-3 w-3 text-blue-400 animate-spin shrink-0" />}
                      {status === "succeeded" && <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />}
                      {(status === "failed" || status === "timed_out" || status === "cancelled") && <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
                      {status === "queued" && <div className="h-3 w-3 rounded-full bg-muted-foreground/30 shrink-0" />}
                      <span className="truncate text-muted-foreground">{agentName}</span>
                    </div>
                  );
                })}
              </div>

              {/* Promote to live (shown when all sim runs finish) */}
              {allSimDone && (
                <div className="rounded-xl border border-green-400/30 bg-green-400/5 p-4">
                  <p className="text-sm font-medium text-green-400 mb-2">All sim runs complete</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Promote these {lastSwarm.agentIds.length} agents to live execution?
                  </p>
                  <Button
                    size="sm"
                    className="bg-green-500 hover:bg-green-600 text-white border-0"
                    disabled={promoteMutation.isPending}
                    onClick={() => promoteMutation.mutate()}
                  >
                    {promoteMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Rocket className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Promote to Live
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 flex items-center justify-between shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (step > 1 && step < 4) setStep((s) => s - 1);
              else closeSwarmLauncher();
            }}
          >
            {step === 4 ? "Close" : step === 1 ? "Cancel" : (
              <><ArrowLeft className="w-3.5 h-3.5 mr-1" />Back</>
            )}
          </Button>

          {step < 3 && (
            <Button
              size="sm"
              disabled={step === 1 && selectedAgentIds.size === 0}
              onClick={() => setStep((s) => s + 1)}
            >
              Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}

          {step === 3 && (
            <Button
              size="sm"
              className={runMode === "live" ? "bg-green-500 hover:bg-green-600 text-white border-0" : ""}
              disabled={launchMutation.isPending || selectedAgentIds.size === 0}
              onClick={() => launchMutation.mutate()}
            >
              {launchMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Launching...</>
              ) : (
                <><Zap className="w-3.5 h-3.5 mr-1.5" />Launch {runMode === "sim" ? "Sim" : "Live"}</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
