import React, { useEffect } from "react";
import { Briefcase } from "lucide-react";
import { DeliverablesBriefcase } from "@/components/DeliverablesBriefcase";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";

export function BoardDeliverables() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Master Briefcase" }]);
  }, [setBreadcrumbs]);

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8">
      {/* Animated header */}
      <div className="flex items-center gap-4">
        {/* Icon with pulse rings */}
        <div className="relative shrink-0 flex items-center justify-center w-12 h-12">
          {/* Concentric rings */}
          <span className="briefcase-ring-1 absolute inset-0 rounded-xl bg-primary/30 pointer-events-none" />
          <span className="briefcase-ring-2 absolute inset-0 rounded-xl bg-primary/20 pointer-events-none" />
          <span className="briefcase-ring-3 absolute inset-0 rounded-xl bg-primary/10 pointer-events-none" />
          {/* Core icon */}
          <div className="relative z-10 p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30 shadow-lg shadow-primary/10">
            <Briefcase className="h-5 w-5" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">Master Briefcase</h1>
            {/* Live dot */}
            <span className="relative flex h-2 w-2 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">All agent deliverables — search, filter, and review</p>
        </div>
      </div>

      <DeliverablesBriefcase global={true} />
    </div>
  );
}
