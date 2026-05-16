import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardPen, Loader2, Rocket, ShieldCheck, Wrench } from "lucide-react";
import { pitStopApi } from "@/api/pitStop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/context/CompanyContext";

function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2);
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/80 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-all text-sm font-black text-foreground">{value}</div>
    </div>
  );
}

export function PitStop() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [coachingNotes, setCoachingNotes] = useState("");
  const [mentorNotes, setMentorNotes] = useState("");
  const [sponsorNotes, setSponsorNotes] = useState("");
  const [targetTrack, setTargetTrack] = useState("");
  const [targetRail, setTargetRail] = useState("");
  const [targetLiveSettings, setTargetLiveSettings] = useState("{}");
  const [draftAgentConfig, setDraftAgentConfig] = useState("{}");
  const [preparedRerun, setPreparedRerun] = useState<Record<string, unknown> | null>(null);

  const workspacesQuery = useQuery({
    queryKey: ["pit-stop", "workspaces", selectedCompanyId],
    queryFn: () => pitStopApi.listWorkspaces(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (!selectedWorkspaceId && workspacesQuery.data?.[0]?.id) {
      setSelectedWorkspaceId(workspacesQuery.data[0].id);
    }
  }, [selectedWorkspaceId, workspacesQuery.data]);

  const detailQuery = useQuery({
    queryKey: ["pit-stop", "workspace", selectedCompanyId, selectedWorkspaceId],
    queryFn: () => pitStopApi.getWorkspace(selectedCompanyId!, selectedWorkspaceId!),
    enabled: !!selectedCompanyId && !!selectedWorkspaceId,
  });

  useEffect(() => {
    const workspace = detailQuery.data;
    if (!workspace) return;
    setCoachingNotes(workspace.coachingNotes ?? "");
    setMentorNotes(workspace.mentorNotes ?? "");
    setSponsorNotes(workspace.sponsorNotes ?? "");
    setTargetTrack(workspace.targetTrack ?? "");
    setTargetRail(workspace.targetRail ?? "");
    setTargetLiveSettings(formatJson(workspace.targetLiveSettings ?? {}));
    setDraftAgentConfig(formatJson(workspace.draftAgentConfig ?? {}));
  }, [detailQuery.data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["pit-stop", "workspaces", selectedCompanyId] });
    await queryClient.invalidateQueries({ queryKey: ["pit-stop", "workspace", selectedCompanyId, selectedWorkspaceId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      pitStopApi.updateWorkspace(selectedCompanyId!, selectedWorkspaceId!, {
        coachingNotes,
        mentorNotes,
        sponsorNotes,
        targetTrack: targetTrack || null,
        targetRail: targetRail || null,
        targetLiveSettings: JSON.parse(targetLiveSettings || "{}"),
        draftAgentConfig: JSON.parse(draftAgentConfig || "{}"),
      }),
    onSuccess: refresh,
  });

  const packageMutation = useMutation({
    mutationFn: async () => {
      await pitStopApi.updateWorkspace(selectedCompanyId!, selectedWorkspaceId!, {
        coachingNotes,
        mentorNotes,
        sponsorNotes,
        targetTrack: targetTrack || null,
        targetRail: targetRail || null,
        targetLiveSettings: JSON.parse(targetLiveSettings || "{}"),
        draftAgentConfig: JSON.parse(draftAgentConfig || "{}"),
      });
      return pitStopApi.packagePromotion(selectedCompanyId!, selectedWorkspaceId!);
    },
    onSuccess: refresh,
  });

  const prepareRerunMutation = useMutation({
    mutationFn: async (optimizationId: string) =>
      pitStopApi.prepareOptimizedRerun(selectedCompanyId!, selectedWorkspaceId!, optimizationId),
    onSuccess: (result) => {
      setPreparedRerun(result.rerunPayload);
    },
  });

  const launchRerunMutation = useMutation({
    mutationFn: async (optimizationId: string) =>
      pitStopApi.launchOptimizedRerun(selectedCompanyId!, selectedWorkspaceId!, optimizationId),
    onSuccess: refresh,
  });

  if (workspacesQuery.isLoading) {
    return (
      <div className="flex h-[360px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      </div>
    );
  }

  if (!workspacesQuery.data?.length) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-3xl border border-border/60 bg-card p-8">
          <h1 className="text-2xl font-black tracking-tight">Pit Stop</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Completed simulation runs will land here automatically once they emit a finished `sim` heartbeat run
            with a member context. Each member and scenario gets a rolling Markdown notebook plus a mutable prep
            workspace for coaching and package review.
          </p>
        </div>
      </div>
    );
  }

  const workspace = detailQuery.data;
  const latestOptimization = workspace?.optimizations?.[0] ?? null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-8">
      <section className="rounded-3xl border border-border/60 bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.28em] text-primary">
              <Wrench className="h-4 w-4" />
              Sim To Live Loop
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Pit Stop</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Review the rolling notebook, coach the run, adjust the next package, and send an immutable snapshot
              to board or agency approval before anything touches live tracks or rails.
            </p>
          </div>
          {workspace && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/50 bg-accent/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Readiness</div>
                <div className="mt-2 text-3xl font-black text-foreground">{workspace.readinessScore ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-accent/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Threshold</div>
                <div className={`mt-2 text-lg font-black ${workspace.thresholdPassed ? "text-emerald-500" : "text-amber-500"}`}>
                  {workspace.thresholdPassed ? "Passed" : "Blocked"}
                </div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-accent/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Packages</div>
                <div className="mt-2 text-3xl font-black text-foreground">{workspace.packages.length}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          {workspacesQuery.data.map((item) => {
            const active = item.id === selectedWorkspaceId;
            const summary = item.latestRunSummary ?? {};
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedWorkspaceId(item.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border/60 bg-card hover:border-primary/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black">{item.notebook.scenarioLabel}</div>
                  {item.thresholdPassed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {item.memberUserId}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {(typeof summary.resultSummary === "string" && summary.resultSummary) || "Awaiting structured run summary."}
                </div>
              </button>
            );
          })}
        </aside>

        {!workspace || detailQuery.isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-border/60 bg-card">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          </div>
        ) : (
          <section className="space-y-6 rounded-3xl border border-border/60 bg-card p-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-border/50 bg-accent/10 p-5">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                  <ClipboardPen className="h-4 w-4 text-primary" />
                  Latest Eval
                </div>
                <pre className="mt-4 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl bg-background/80 p-4 text-xs leading-relaxed">
                  {formatJson(workspace.latestEvalSummary ?? {})}
                </pre>
              </div>
              <div className="rounded-2xl border border-border/50 bg-accent/10 p-5">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Notebook
                </div>
                <pre className="mt-4 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl bg-background/80 p-4 text-xs leading-relaxed">
                  {workspace.notebook.currentMarkdown}
                </pre>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-accent/10 p-5">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">
                <Wrench className="h-4 w-4 text-primary" />
                Optimization Loop
              </div>
              {!latestOptimization ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No Pit Stop optimization recommendation has been recorded for this workspace yet.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Trigger" value={latestOptimization.triggerReason} />
                    <MetricCard label="Source Run" value={latestOptimization.sourceSimRunId.slice(0, 8)} />
                    <MetricCard label="Savings" value={`${Number((latestOptimization.estimatedSavings as Record<string, unknown>)?.percent ?? 0)}%`} />
                    <MetricCard label="Relaunch" value={latestOptimization.relaunchEligible ? "Ready" : "Pending"} />
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/80 p-4 text-sm">
                    <div>
                      <span className="font-semibold">Current gear:</span>{" "}
                      {String((latestOptimization.currentExecutionPlan as Record<string, unknown>)?.selectedHarness ?? "—")} /{" "}
                      {String((latestOptimization.currentExecutionPlan as Record<string, unknown>)?.selectedDeployment ?? "—")} /{" "}
                      {String((latestOptimization.currentExecutionPlan as Record<string, unknown>)?.contextTier ?? "—")}
                    </div>
                    <div className="mt-2">
                      <span className="font-semibold">Recommended gear:</span>{" "}
                      {String((latestOptimization.recommendedExecutionPlan as Record<string, unknown>)?.selectedHarness ?? "—")} /{" "}
                      {String((latestOptimization.recommendedExecutionPlan as Record<string, unknown>)?.selectedDeployment ?? "—")} /{" "}
                      {String((latestOptimization.recommendedExecutionPlan as Record<string, unknown>)?.contextTier ?? "—")}
                    </div>
                    <div className="mt-2">
                      <span className="font-semibold">Actions:</span>{" "}
                      {(latestOptimization.optimizationActions ?? []).join(" • ") || "—"}
                    </div>
                    {latestOptimization.explanation && (
                      <div className="mt-2 text-muted-foreground">{latestOptimization.explanation}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => prepareRerunMutation.mutate(latestOptimization.id)}
                      disabled={prepareRerunMutation.isPending}
                    >
                      {prepareRerunMutation.isPending ? "Preparing..." : "Prepare Optimized Rerun"}
                    </Button>
                    <Button
                      onClick={() => launchRerunMutation.mutate(latestOptimization.id)}
                      disabled={launchRerunMutation.isPending || !latestOptimization.relaunchEligible}
                    >
                      {launchRerunMutation.isPending ? "Launching..." : "Launch Optimized Sim Rerun"}
                    </Button>
                  </div>
                  {preparedRerun && (
                    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-xl bg-background/80 p-4 text-xs leading-relaxed">
                      {JSON.stringify(preparedRerun, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Coaching Notes</span>
                <textarea
                  value={coachingNotes}
                  onChange={(event) => setCoachingNotes(event.target.value)}
                  className="min-h-[140px] w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Mentor Notes</span>
                <textarea
                  value={mentorNotes}
                  onChange={(event) => setMentorNotes(event.target.value)}
                  className="min-h-[140px] w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Sponsor Notes</span>
                <textarea
                  value={sponsorNotes}
                  onChange={(event) => setSponsorNotes(event.target.value)}
                  className="min-h-[120px] w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Target Track</span>
                <Input value={targetTrack} onChange={(event) => setTargetTrack(event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Target Rail</span>
                <Input value={targetRail} onChange={(event) => setTargetRail(event.target.value)} />
              </label>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Draft Agent Config</span>
                <textarea
                  value={draftAgentConfig}
                  onChange={(event) => setDraftAgentConfig(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-border/60 bg-background px-4 py-3 font-mono text-xs outline-none transition-colors focus:border-primary"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Target Live Settings</span>
                <textarea
                  value={targetLiveSettings}
                  onChange={(event) => setTargetLiveSettings(event.target.value)}
                  className="min-h-[220px] w-full rounded-2xl border border-border/60 bg-background px-4 py-3 font-mono text-xs outline-none transition-colors focus:border-primary"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-4">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Pit Stop Draft"}
              </Button>
              <Button
                onClick={() => packageMutation.mutate()}
                disabled={packageMutation.isPending || !workspace.thresholdPassed}
                className="gap-2"
              >
                <Rocket className="h-4 w-4" />
                {packageMutation.isPending ? "Packaging..." : "Submit For Live Approval"}
              </Button>
              {!workspace.thresholdPassed && (
                <p className="text-xs font-medium text-amber-600">
                  Readiness threshold must pass before promotion packaging is allowed.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-border/50 bg-accent/10 p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground">Package History</div>
              <div className="mt-4 space-y-3">
                {workspace.packages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No promotion packages submitted yet.</p>
                ) : (
                  workspace.packages.map((pkg) => (
                    <div key={pkg.id} className="rounded-2xl border border-border/50 bg-background/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-black">Package v{pkg.version}</div>
                        <div className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">{pkg.status}</div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Readiness {pkg.readinessScore ?? 0} · Approval {pkg.approvalOutcome ?? "pending"} · Live runs {pkg.promotedLiveRunIds.length}
                      </div>
                      {pkg.approvalNotes && (
                        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{pkg.approvalNotes}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
