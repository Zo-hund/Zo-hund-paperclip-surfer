import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cloud,
  DollarSign,
  GitBranch,
  KeyRound,
  Loader2,
  Monitor,
  PlayCircle,
  Route,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { companiesApi } from "@/api/companies";
import { useToast } from "@/context/ToastContext";
import { agentsApi } from "@/api/agents";
import { amxNodesApi } from "@/api/amxNodes";
import { queryKeys } from "@/lib/queryKeys";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

type DeploymentTarget = "local" | "cloud";

const CLOUD_MODEL_PRESETS = ["Kimi", "MiniMax", "Claude", "Gemini", "OpenAI"];

const targetCopy: Record<DeploymentTarget, { title: string; body: string; cost: string }> = {
  local: {
    title: "Local machine first",
    body: "Best for private repos, low API spend, and hands-on operator work.",
    cost: "API spend can stay near $0 when local CLI auth is used.",
  },
  cloud: {
    title: "Cloud workspace first",
    body: "Best for always-on agents, shared operations, and production tasks.",
    cost: "Uses VPS runtime plus any paid provider keys you enable.",
  },
};

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export function DeploymentManagement() {
  const { selectedCompanyId, selectedCompany, reloadCompanies } = useCompany();
  const { pushToast } = useToast();
  const [target, setTarget] = useState<DeploymentTarget>("cloud");
  const [updating, setUpdating] = useState(false);

  const { data: agents } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.agents.list(selectedCompanyId) : ["agents", "none"],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: amxNodes } = useQuery({
    queryKey: selectedCompanyId ? ["amx-nodes", selectedCompanyId] : ["amx-nodes", "none"],
    queryFn: () => amxNodesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  React.useEffect(() => {
    if (selectedCompany?.deploymentTarget) {
      setTarget(selectedCompany.deploymentTarget as DeploymentTarget);
    }
  }, [selectedCompany]);

  const adapterCounts = useMemo(
    () => countBy((agents ?? []).map((agent) => agent.adapterType)),
    [agents],
  );

  const statusCounts = useMemo(
    () => countBy((agents ?? []).map((agent) => agent.status)),
    [agents],
  );

  const localAgentCount =
    (adapterCounts.claude_local ?? 0) +
    (adapterCounts.codex_local ?? 0) +
    (adapterCounts.gemini_local ?? 0) +
    (adapterCounts.opencode_local ?? 0) +
    (adapterCounts.cursor ?? 0) +
    (adapterCounts.pi_local ?? 0);
  const cloudReadyCount = adapterCounts.openrouter ?? 0;
  const pausedOrErroredCount = (statusCounts.paused ?? 0) + (statusCounts.error ?? 0);
  const activeAgentCount = (statusCounts.idle ?? 0) + (statusCounts.active ?? 0) + (statusCounts.running ?? 0);
  const routableNodeCount = (amxNodes ?? []).filter((node) =>
    ["online", "idle", "busy"].includes(node.status),
  ).length;

  const handleToggle = async (newTarget: DeploymentTarget) => {
    if (!selectedCompanyId) return;
    setUpdating(true);
    try {
      await companiesApi.updateDeploymentTarget(selectedCompanyId, newTarget);
      await reloadCompanies();
      pushToast({
        tone: "success",
        title: "Deployment Target Updated!",
        body: `AIR HUB is now routing ${newTarget} deployments for ${selectedCompany?.name}.`
      });
    } catch (err) {
      pushToast({
        tone: "error",
        title: "Update Failed",
        body: "There was an error updating the deployment target."
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-xl overflow-hidden">
      <div className="border-b border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0))] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
              <Route className="h-3.5 w-3.5" />
              Workspace routing
            </div>
            <h3 className="mt-2 text-xl font-black uppercase tracking-tight text-foreground">
              AIR HUB Control
            </h3>
            <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
              Choose where agents run, see what is ready, and avoid surprise cloud spend.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-right">
            <div className="text-lg font-black text-emerald-400">{activeAgentCount}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-emerald-200/80">ready</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {(["local", "cloud"] as const).map((mode) => {
            const Icon = mode === "local" ? Monitor : Cloud;
            const isActive = target === mode;
            return (
              <button
                key={mode}
                onClick={() => handleToggle(mode)}
                disabled={updating}
                className={cn(
                  "min-h-20 rounded-xl border p-3 text-left transition",
                  isActive
                    ? "border-primary/70 bg-primary/15 text-foreground shadow-lg shadow-primary/10"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/35 hover:bg-accent/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {updating && isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                </div>
                <div className="mt-3 text-[11px] font-black uppercase tracking-widest">
                  {mode === "local" ? "Local" : "Cloud"}
                </div>
                <div className="mt-1 text-[10px] font-medium leading-snug opacity-75">
                  {mode === "local" ? "Private files, local auth" : "Always-on VPS"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-widest text-foreground">
                Recommended: on demand
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Route local first, then use cloud only when a task needs uptime, shared access, or Kimi/MiniMax scale.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RuntimeStat
            icon={Route}
            label="AMX nodes"
            value={routableNodeCount}
            tone={routableNodeCount > 0 ? "ok" : "warn"}
          />
          <RuntimeStat icon={Bot} label="Local agents" value={localAgentCount} />
          <RuntimeStat icon={Cloud} label="Cloud adapters" value={cloudReadyCount} />
          <RuntimeStat icon={AlertTriangle} label="Needs review" value={pausedOrErroredCount} tone={pausedOrErroredCount > 0 ? "warn" : "ok"} />
        </div>

        <div className="space-y-2">
          <ProviderRow
            icon={ShieldCheck}
            title="Local CLIs"
            detail={`${localAgentCount} Claude, Codex, Gemini, OpenCode, Cursor, or Pi agents configured`}
            status={localAgentCount > 0 ? "Ready" : "Set up"}
            tone={localAgentCount > 0 ? "ready" : "warn"}
          />
          <ProviderRow
            icon={KeyRound}
            title="OpenRouter cloud"
            detail="Required for Kimi and MiniMax cloud calls"
            status="Key needed"
            tone="warn"
          />
          <ProviderRow
            icon={Zap}
            title="Kimi + MiniMax"
            detail={`Selectable presets: ${CLOUD_MODEL_PRESETS.slice(0, 2).join(", ")}`}
            status="Preset ready"
            tone="ready"
          />
          <ProviderRow
            icon={DollarSign}
            title="Spend guard"
            detail={targetCopy[target].cost}
            status={target === "local" ? "Low risk" : "Watch budget"}
            tone={target === "local" ? "ready" : "info"}
          />
        </div>

        <div className="rounded-xl border border-border/60 bg-background/35 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Current policy
          </div>
          <div className="mt-2 text-sm font-bold text-foreground">{targetCopy[target].title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{targetCopy[target].body}</p>
          <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-primary">
            <GitBranch className="h-3.5 w-3.5" />
            Agent routing: local {"->"} cloud fallback
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild size="sm" className="justify-start">
            <Link to="/agents">
              <PlayCircle className="h-4 w-4" />
              Agents
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="justify-start">
            <Link to="/costs">
              <DollarSign className="h-4 w-4" />
              Budgets
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function RuntimeStat({
  icon: Icon,
  label,
  value,
  tone = "info",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "info" | "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/35 p-2.5">
      <div className="flex items-center justify-between">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-primary",
          )}
        />
        <span className="text-lg font-black text-foreground">{value}</span>
      </div>
      <div className="mt-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ProviderRow({
  icon: Icon,
  title,
  detail,
  status,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  status: string;
  tone: "ready" | "warn" | "info";
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/25 p-3">
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "ready" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-xs font-black uppercase tracking-wider text-foreground">{title}</div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest",
              tone === "ready"
                ? "bg-emerald-500/10 text-emerald-300"
                : tone === "warn"
                  ? "bg-amber-500/10 text-amber-300"
                  : "bg-primary/10 text-primary",
            )}
          >
            {tone === "ready" ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : null}
            {status}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
