import { EVAL_TEMPLATES, autoScore, type OpprrCategory, type OpprrAudience } from "../data/evalTemplates";
import { cn, formatCents } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Trophy,
  X,
  ExternalLink,
  Minus,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompareRun {
  id: string;
  agentName?: string;
  agentId?: string;
  status: string;
  invocationSource?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  costCents?: number | null;
  payload?: Record<string, unknown>;
}

interface Props {
  runs: CompareRun[];
  onClose: () => void;
  onRemove?: (id: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function duration(run: CompareRun): number | null {
  if (!run.startedAt || !run.finishedAt) return null;
  return (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000;
}

function fmtDur(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

function fmtCost(c: number | null | undefined): string {
  if (c == null) return "—";
  return formatCents(c);
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === "failed" || status === "error") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

type WinnerMode = "highest" | "lowest";

function winners(values: (number | null)[], mode: WinnerMode): boolean[] {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return values.map(() => false);
  const best = mode === "highest" ? Math.max(...valid) : Math.min(...valid);
  return values.map((v) => v != null && v === best);
}

// ─── Row types ────────────────────────────────────────────────────────────────

interface MetricRow {
  label: string;
  values: (string | number | null)[];
  winnerIdxs?: boolean[];
  type?: "score" | "text" | "cost" | "duration" | "status" | "link";
}

// ─── Section header row ───────────────────────────────────────────────────────

function SectionRow({ label }: { label: string }) {
  return (
    <tr className="bg-muted/30">
      <td
        colSpan={100}
        className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </td>
    </tr>
  );
}

// ─── Data cell ────────────────────────────────────────────────────────────────

function DataCell({
  value,
  isWinner,
  type,
}: {
  value: string | number | null;
  isWinner?: boolean;
  type?: MetricRow["type"];
}) {
  if (value == null || value === "—") {
    return (
      <td className="px-3 py-2 text-center">
        <Minus className="h-3 w-3 text-muted-foreground/40 mx-auto" />
      </td>
    );
  }

  const isLink = type === "link" && typeof value === "string" && value.startsWith("http");

  return (
    <td className="px-3 py-2 text-center">
      <div className={cn("flex items-center justify-center gap-1", isWinner && "text-green-600 dark:text-green-400 font-semibold")}>
        {isWinner && <Trophy className="h-3 w-3 shrink-0" />}
        {isLink ? (
          <a
            href={value as string}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary flex items-center gap-0.5 hover:underline"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs">{String(value)}</span>
        )}
      </div>
    </td>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function EvalComparePanel({ runs, onClose, onRemove }: Props) {
  if (runs.length === 0) return null;

  // Build scores for each run
  const runScores = runs.map((r) => {
    const templateId = r.payload?.evalTemplateId as string | undefined;
    const template = templateId ? EVAL_TEMPLATES.find((t) => t.id === templateId) : undefined;
    if (!template) return null;
    return autoScore(template, {
      status: r.status,
      durationSeconds: duration(r),
      costCents: r.costCents ?? null,
    });
  });

  const durations = runs.map(duration);
  const costs = runs.map((r) => r.costCents ?? null);
  const completions = runScores.map((s) => s?.completion ?? null);
  const speeds = runScores.map((s) => s?.speed ?? null);
  const costEffs = runScores.map((s) => s?.cost_efficiency ?? null);
  const weighteds = runScores.map((s) => s?.weighted_auto ?? null);

  const durationWinners = winners(durations, "lowest");
  const costWinners = winners(costs, "lowest");
  const completionWinners = winners(completions, "highest");
  const speedWinners = winners(speeds, "highest");
  const costEffWinners = winners(costEffs, "highest");
  const weightedWinners = winners(weighteds, "highest");

  // Overall winner: highest weighted auto score
  const overallWinner = weightedWinners.indexOf(true);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Side-by-Side Comparison</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{runs.length} runs</Badge>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          {/* Column headers */}
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32 sticky left-0 bg-background">
                Metric
              </th>
              {runs.map((r, i) => (
                <th key={r.id} className="px-3 py-2 text-center font-medium min-w-[140px]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      {i === overallWinner && runScores[i] != null && (
                        <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="truncate max-w-[120px]">{r.agentName ?? `Run ${i + 1}`}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <StatusIcon status={r.status} />
                      <span className="text-[10px] text-muted-foreground capitalize">{r.status}</span>
                    </div>
                    {onRemove && (
                      <button
                        className="text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(r.id)}
                      >
                        remove
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* ── Info ── */}
            <SectionRow label="Run Info" />
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Template</td>
              {runs.map((r) => (
                <td key={r.id} className="px-3 py-2 text-center text-xs">
                  {(r.payload?.templateName as string) ?? "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Started</td>
              {runs.map((r) => (
                <td key={r.id} className="px-3 py-2 text-center text-muted-foreground">
                  {r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : "—"}
                </td>
              ))}
            </tr>
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Duration</td>
              {durations.map((d, i) => (
                <DataCell key={runs[i].id} value={d != null ? fmtDur(d) : null} isWinner={durationWinners[i]} type="duration" />
              ))}
            </tr>
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Cost</td>
              {costs.map((c, i) => (
                <DataCell key={runs[i].id} value={c != null ? fmtCost(c) : null} isWinner={costWinners[i]} type="cost" />
              ))}
            </tr>

            {/* ── Auto Scores ── */}
            <SectionRow label="Auto Scores (0–100)" />
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Completion</td>
              {completions.map((v, i) => (
                <DataCell key={runs[i].id} value={v != null ? Math.round(v) : null} isWinner={completionWinners[i]} type="score" />
              ))}
            </tr>
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Speed</td>
              {speeds.map((v, i) => (
                <DataCell key={runs[i].id} value={v != null ? Math.round(v) : null} isWinner={speedWinners[i]} type="score" />
              ))}
            </tr>
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Cost Efficiency</td>
              {costEffs.map((v, i) => (
                <DataCell key={runs[i].id} value={v != null ? Math.round(v) : null} isWinner={costEffWinners[i]} type="score" />
              ))}
            </tr>
            <tr className="border-b border-border bg-muted/10">
              <td className="px-3 py-2 font-semibold sticky left-0 bg-muted/10">Weighted Auto</td>
              {weighteds.map((v, i) => (
                <DataCell key={runs[i].id} value={v != null ? Math.round(v) : null} isWinner={weightedWinners[i]} type="score" />
              ))}
            </tr>

            {/* ── Output ── */}
            <SectionRow label="Output Mapping" />
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">OPPRRC Path</td>
              {runs.map((r) => (
                <td key={r.id} className="px-3 py-2 text-center">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {(r.payload?.outputPath as string) ?? "—"}
                  </span>
                </td>
              ))}
            </tr>
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Drive Input</td>
              {runs.map((r) => {
                const url = r.payload?.driveFolderUrl as string | null;
                return <DataCell key={r.id} value={url || null} type="link" />;
              })}
            </tr>
            <tr className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-background">Drive Output</td>
              {runs.map((r) => {
                const url = r.payload?.driveOutputUrl as string | null;
                return <DataCell key={r.id} value={url || null} type="link" />;
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Winner summary */}
      {overallWinner >= 0 && runScores[overallWinner] != null && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/20 border-t border-amber-200/50 dark:border-amber-800/30 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-xs font-medium">
            <span className="text-amber-700 dark:text-amber-400">
              {runs[overallWinner].agentName ?? `Run ${overallWinner + 1}`}
            </span>
            {" "}leads with weighted auto-score{" "}
            <span className="font-bold">{Math.round(weighteds[overallWinner]!)}</span>
          </span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto border-amber-300 dark:border-amber-700">
            Judge review pending
          </Badge>
        </div>
      )}
    </div>
  );
}
