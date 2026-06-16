import {
  UserPlus,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  FlaskConical,
  DollarSign,
  Clock,
  Gauge,
  AlertTriangle,
  RotateCcw,
  Workflow,
  ExternalLink,
} from "lucide-react";
import { cn, formatCents } from "../lib/utils";
import { Link } from "../lib/router";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

export const typeLabel: Record<string, string> = {
  hire_agent: "Hire Agent",
  approve_ceo_strategy: "CEO Strategy",
  budget_override_required: "Budget Override",
  pit_stop_review: "PIT STOP Review",
};

/** Build a contextual label for an approval, e.g. "Hire Agent: Designer" */
export function approvalLabel(type: string, payload?: Record<string, unknown> | null): string {
  const base = typeLabel[type] ?? type;
  if (type === "hire_agent" && payload?.name) {
    return `${base}: ${String(payload.name)}`;
  }
  return base;
}

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
  budget_override_required: ShieldAlert,
  pit_stop_review: FlaskConical,
};

export const defaultTypeIcon = ShieldCheck;

function PayloadField({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

function BadgeListField({ label, values }: { label: string; values: unknown }) {
  if (!Array.isArray(values)) return null;
  const items = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function SkillList({ values }: { values: unknown }) {
  return <BadgeListField label="Skills" values={values} />;
}

/** Format a millisecond duration for display, e.g. 1500 -> "1.5s". */
function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

type StatTone = "default" | "warn" | "danger";

function StatBlock({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  tone?: StatTone;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-orange-600 dark:text-orange-400"
        : "text-foreground";
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
      <Icon className={cn("h-4 w-4 shrink-0", toneClass)} />
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={cn("text-sm font-medium truncate", toneClass)}>{value}</div>
      </div>
    </div>
  );
}

export function HireAgentPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Name</span>
        <span className="font-medium">{String(payload.name ?? "—")}</span>
      </div>
      <PayloadField label="Role" value={payload.role} />
      <PayloadField label="Title" value={payload.title} />
      <PayloadField label="Icon" value={payload.icon} />
      {!!payload.capabilities && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Capabilities</span>
          <span className="text-muted-foreground">{String(payload.capabilities)}</span>
        </div>
      )}
      {!!payload.adapterType && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Adapter</span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {String(payload.adapterType)}
          </span>
        </div>
      )}
      <SkillList values={payload.desiredSkills} />
    </div>
  );
}

export function CeoStrategyPayload({ payload }: { payload: Record<string, unknown> }) {
  const plan = payload.plan ?? payload.description ?? payload.strategy ?? payload.text;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Title" value={payload.title} />
      {!!plan && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto">
          {String(plan)}
        </div>
      )}
      {!plan && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function BudgetOverridePayload({ payload }: { payload: Record<string, unknown> }) {
  const budgetAmount = typeof payload.budgetAmount === "number" ? payload.budgetAmount : null;
  const observedAmount = typeof payload.observedAmount === "number" ? payload.observedAmount : null;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Scope" value={payload.scopeName ?? payload.scopeType} />
      <PayloadField label="Window" value={payload.windowKind} />
      <PayloadField label="Metric" value={payload.metric} />
      {(budgetAmount !== null || observedAmount !== null) ? (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Limit {budgetAmount !== null ? formatCents(budgetAmount) : "—"} · Observed {observedAmount !== null ? formatCents(observedAmount) : "—"}
        </div>
      ) : null}
      {!!payload.guidance && (
        <p className="text-muted-foreground">{String(payload.guidance)}</p>
      )}
    </div>
  );
}

interface SimArtifactBundleLike {
  executionGraph?: Array<{ seq: number; eventType: string; message: string | null }>;
  estimatedRuntimeMs?: number | null;
  estimatedCostCents?: number | null;
  modelsUsed?: string[];
  requiredPermissions?: string[];
  workspace?: {
    strategy?: string | null;
    isolated?: boolean;
    branchName?: string | null;
    worktreePath?: string | null;
    cwd?: string | null;
    warnings?: string[];
  };
  riskScore?: number;
  riskFactors?: string[];
  rollbackPlan?: string;
}

export function PitStopReviewPayload({
  payload,
  agentId,
}: {
  payload: Record<string, unknown>;
  agentId?: string | null;
}) {
  const simArtifacts = (payload.simArtifacts ?? null) as SimArtifactBundleLike | null;
  const outcome = typeof payload.outcome === "string" ? payload.outcome : null;
  const simRunId = typeof payload.simRunId === "string" ? payload.simRunId : null;
  const auditHref = agentId && simRunId ? `/agents/${agentId}/runs/${simRunId}` : null;

  const riskScore = typeof simArtifacts?.riskScore === "number" ? simArtifacts.riskScore : null;
  const complianceScore = riskScore === null ? null : Math.max(0, Math.min(100, 100 - riskScore));
  const riskTone: StatTone = riskScore === null ? "default" : riskScore >= 70 ? "danger" : riskScore >= 40 ? "warn" : "default";

  const workspace = simArtifacts?.workspace;
  const executionGraph = simArtifacts?.executionGraph ?? [];

  return (
    <div className="mt-3 space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {outcome && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
              statusBadge[outcome] ?? statusBadgeDefault,
            )}
          >
            {outcome.replace(/_/g, " ")}
          </span>
        )}
        {auditHref && (
          <Link
            to={auditHref}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> View SIM run
          </Link>
        )}
      </div>

      {!simArtifacts && (
        <p className="text-muted-foreground text-xs">No SIM artifact bundle was recorded for this run.</p>
      )}

      {simArtifacts && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatBlock
              icon={DollarSign}
              label="Est. cost"
              value={typeof simArtifacts.estimatedCostCents === "number" ? formatCents(simArtifacts.estimatedCostCents) : "—"}
            />
            <StatBlock icon={Clock} label="Est. runtime" value={formatMs(simArtifacts.estimatedRuntimeMs)} />
            <StatBlock
              icon={Gauge}
              label="Risk score"
              value={riskScore === null ? "—" : String(riskScore)}
              tone={riskTone}
            />
            <StatBlock
              icon={ShieldCheck}
              label="Compliance"
              value={complianceScore === null ? "—" : `${complianceScore}/100`}
              tone={riskTone}
            />
          </div>

          <BadgeListField label="Models" values={simArtifacts.modelsUsed} />
          <BadgeListField label="Permissions" values={simArtifacts.requiredPermissions} />

          {!!simArtifacts.riskFactors?.length && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Risk flags</span>
              <ul className="space-y-1">
                {simArtifacts.riskFactors.map((factor, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {workspace && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Workspace</span>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  {workspace.isolated ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  )}
                  <span>
                    {workspace.strategy ?? "unknown"} · {workspace.isolated ? "isolated" : "not isolated"}
                  </span>
                </div>
                {!!workspace.branchName && (
                  <div>
                    Branch: <span className="font-mono">{workspace.branchName}</span>
                  </div>
                )}
                {!!workspace.worktreePath && (
                  <div>
                    Worktree: <span className="font-mono">{workspace.worktreePath}</span>
                  </div>
                )}
                {!!workspace.cwd && (
                  <div>
                    CWD: <span className="font-mono">{workspace.cwd}</span>
                  </div>
                )}
                {!!workspace.warnings?.length && (
                  <ul className="space-y-0.5">
                    {workspace.warnings.map((warning, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-orange-600 dark:text-orange-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {!!simArtifacts.rollbackPlan && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Rollback</span>
              <div className="flex items-start gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap">{simArtifacts.rollbackPlan}</span>
              </div>
            </div>
          )}

          {!!executionGraph.length && (
            <details>
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Workflow className="h-3.5 w-3.5" />
                Execution trace ({executionGraph.length} step{executionGraph.length === 1 ? "" : "s"})
              </summary>
              <ol className="mt-2 space-y-1 max-h-48 overflow-y-auto rounded-md bg-muted/40 px-3 py-2">
                {executionGraph.map((step) => (
                  <li key={step.seq} className="flex items-start gap-2 font-mono text-[11px] text-muted-foreground">
                    <span className="shrink-0 text-muted-foreground/70">#{step.seq}</span>
                    <span className="shrink-0 rounded bg-muted px-1 text-foreground">{step.eventType}</span>
                    <span className="whitespace-pre-wrap">{step.message ?? ""}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function ApprovalPayloadRenderer({
  type,
  payload,
  agentId,
}: {
  type: string;
  payload: Record<string, unknown>;
  agentId?: string | null;
}) {
  if (type === "hire_agent") return <HireAgentPayload payload={payload} />;
  if (type === "budget_override_required") return <BudgetOverridePayload payload={payload} />;
  if (type === "pit_stop_review") return <PitStopReviewPayload payload={payload} agentId={agentId} />;
  return <CeoStrategyPayload payload={payload} />;
}
