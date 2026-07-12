import { Clock, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Renders next to a promotion-eligible portfolio item (an RQ Factory
 * submission or marketplace booking still sitting in simulation): a
 * "Promote to Market" button when no promote_to_live approval is pending
 * yet, or a disabled "Pending Board Approval" pill once one has been
 * requested. Shared between AgentResumeProfile and MemberProfile, the two
 * pages that surface a member/agent's portfolio.
 */
export function PromoteToMarketControl({
  isPending,
  isRequesting,
  onPromote,
}: {
  /** True when a pending promote_to_live approval already exists for this entity. */
  isPending: boolean;
  /** True while this specific item's promotion request is in flight. */
  isRequesting: boolean;
  onPromote: () => void;
}) {
  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-500 shrink-0">
        <Clock className="h-3 w-3" /> Pending Board Approval
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 shrink-0 text-[10px] font-black uppercase tracking-widest"
      disabled={isRequesting}
      onClick={onPromote}
    >
      {isRequesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
      Promote to Market
    </Button>
  );
}
