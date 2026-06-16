import { ISSUE_LIFECYCLE_STAGES, type IssueLifecycleStage } from "@paperclipai/shared";
import { cn } from "../lib/utils";

const STAGE_LABELS: Record<IssueLifecycleStage, string> = {
  sim: "Sim",
  pit_stop: "Pit Stop",
  live: "Live",
  opprrc: "OPPRRC",
  reports: "Reports",
  certified: "Certified",
  learning: "Learning",
};

/**
 * Renders the AMX-AIR-HUBS governing lifecycle as a horizontal stepper:
 * sim -> pit_stop -> live -> opprrc -> reports -> certified -> learning.
 * Stages up to and including the current one are highlighted. Renders nothing
 * for legacy/unmanaged issues (null lifecycleStage).
 */
export function LifecycleStepper({
  stage,
  className,
}: {
  stage: IssueLifecycleStage | null | undefined;
  className?: string;
}) {
  if (!stage) return null;
  const currentIndex = ISSUE_LIFECYCLE_STAGES.indexOf(stage);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} aria-label="Lifecycle stage">
      {ISSUE_LIFECYCLE_STAGES.map((s, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={s} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                isCurrent
                  ? "bg-blue-500 text-white"
                  : reached
                    ? "bg-blue-500/15 text-blue-400"
                    : "bg-muted text-muted-foreground/50",
              )}
            >
              {STAGE_LABELS[s]}
            </span>
            {i < ISSUE_LIFECYCLE_STAGES.length - 1 && (
              <span className={cn("text-[10px]", reached ? "text-blue-400/60" : "text-muted-foreground/30")}>›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
