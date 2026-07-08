import { ADAPTER_LOCALITY, type AgentAdapterType } from "@paperclipai/shared";
import { cn } from "../lib/utils";
import { adapterLocalityBadge, adapterLocalityBadgeDefault, adapterLocalityLabel } from "../lib/status-colors";

export function AdapterLocalityBadge({ adapterType }: { adapterType: string }) {
  const locality = ADAPTER_LOCALITY[adapterType as AgentAdapterType];
  if (!locality || locality === "custom") return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap shrink-0",
        adapterLocalityBadge[locality] ?? adapterLocalityBadgeDefault
      )}
    >
      {adapterLocalityLabel[locality] ?? locality}
    </span>
  );
}
