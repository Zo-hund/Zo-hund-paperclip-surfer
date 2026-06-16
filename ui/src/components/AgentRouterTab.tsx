import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RouterPreviewResult } from "@paperclipai/shared";

interface Props {
  agentId: string;
  companyId: string;
}

function privacyBadge(privacy: string) {
  return (
    <Badge variant={privacy === "local" ? "secondary" : "outline"} className="text-xs">
      {privacy === "local" ? "Local" : "Cloud"}
    </Badge>
  );
}

function costBadge(tier: string) {
  const cls =
    tier === "free" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
    : tier === "subscription" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
    : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return <span className={cn("text-xs rounded px-1.5 py-0.5 font-medium", cls)}>{tier}</span>;
}

function reasonLabel(reason: RouterPreviewResult["decision"]["reason"]) {
  switch (reason) {
    case "primary_selected": return "Primary adapter selected";
    case "budget_fallback": return "Budget threshold exceeded — switched to cheaper adapter";
    case "privacy_filter": return "Privacy policy requires local adapter";
    case "fallback_to_primary": return "Fallback chain exhausted — using primary";
    case "explicit_override": return "Explicitly overridden by run context";
  }
}

export function AgentRouterTab({ agentId, companyId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["agents", "router-preview", agentId],
    queryFn: () => agentsApi.routerPreview(agentId, companyId),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading router preview…</div>;
  if (error || !data) return <div className="text-sm text-destructive p-4">Failed to load router preview.</div>;

  const { policy, decision, candidates, budgetStatus } = data;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Decision */}
      <div className="rounded-lg border p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Decision</p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold">{decision.adapterType}</span>
          <Badge variant="outline" className="text-xs">{decision.reason.replace(/_/g, " ")}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{reasonLabel(decision.reason)}</p>
      </div>

      {/* Policy */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Router Policy</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label="Mode">{policy.mode}</Row>
          <Row label="Privacy">{policy.privacyRequirement === "local_only" ? "Local only" : "Any"}</Row>
          <Row label="Cost preference">{policy.costPreference}</Row>
          <Row label="Budget threshold">{`${((policy.budgetThresholdPct ?? 0.9) * 100).toFixed(0)}%`}</Row>
          {policy.fallbackChain && policy.fallbackChain.length > 0 && (
            <Row label="Fallback chain">
              <span className="font-mono text-xs">{policy.fallbackChain.join(" → ")}</span>
            </Row>
          )}
        </div>
      </div>

      {/* Budget status */}
      {budgetStatus && (
        <div className={cn("rounded-lg border p-4 space-y-2", budgetStatus.overThreshold && "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20")}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Budget Status</p>
          <div className="flex items-center gap-4 text-sm">
            <span>
              ${((budgetStatus.spentCents) / 100).toFixed(2)} / ${((budgetStatus.budgetCents ?? 0) / 100).toFixed(2)}
            </span>
            {budgetStatus.overThreshold && (
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300 text-xs">
                Over {(budgetStatus.thresholdPct * 100).toFixed(0)}% threshold
              </Badge>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", budgetStatus.overThreshold ? "bg-amber-500" : "bg-primary")}
              style={{ width: `${Math.min(100, budgetStatus.budgetCents ? (budgetStatus.spentCents / budgetStatus.budgetCents) * 100 : 0).toFixed(1)}%` }}
            />
          </div>
        </div>
      )}

      {/* Candidates */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adapter Candidates</p>
        <div className="space-y-1.5">
          {candidates.map(({ adapterType, capabilities: caps, eligible, reason }) => (
            <div
              key={adapterType}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                adapterType === decision.adapterType
                  ? "bg-primary/10 border border-primary/30"
                  : eligible
                  ? "bg-muted/40"
                  : "opacity-40"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs w-36 shrink-0">{adapterType}</span>
                {adapterType === decision.adapterType && (
                  <Badge className="text-xs px-1.5 py-0">selected</Badge>
                )}
                {!eligible && reason && (
                  <span className="text-xs text-muted-foreground">({reason.replace(/_/g, " ")})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {privacyBadge(caps.privacy)}
                {costBadge(caps.costTier)}
                <span className="text-xs text-muted-foreground">{caps.latencyClass} latency</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </>
  );
}
