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
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Briefcase className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight text-foreground">Master Briefcase</h1>
          <p className="text-xs text-muted-foreground mt-0.5">All agent deliverables — search, filter, and review</p>
        </div>
      </div>

      <DeliverablesBriefcase global={true} />
    </div>
  );
}
