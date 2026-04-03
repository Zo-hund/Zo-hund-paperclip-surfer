import React from "react";
import { 
  Globe, 
  ShieldCheck, 
  Activity, 
  Zap, 
  BarChart3,
  Layers
} from "lucide-react";
import { DeliverablesBriefcase } from "@/components/DeliverablesBriefcase";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useEffect } from "react";

export function BoardDeliverables() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Master Briefcase" }]);
  }, [setBreadcrumbs]);

  return (
    <div className="flex flex-col min-h-screen bg-background animate-in fade-in duration-700">
      {/* Hero Section */}
      <section className="relative px-4 pb-12 pt-16 md:px-8 md:py-20 border-b border-border/40 bg-accent/5 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <Globe className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px]" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-black tracking-[0.3em] uppercase text-foreground">
              AMX GOVERNANCE
            </h1>
          </div>
          
          <h2 className="text-3xl md:text-6xl font-black tracking-tighter text-foreground mb-8 leading-tight">
            The Master Briefcase: <span className="text-primary truncate block md:inline">Cross-Organization Oversight</span>
          </h2>
          
          <p className="text-xl text-muted-foreground font-medium max-w-4xl leading-relaxed">
            High-fidelity measurement and complete traceability of all team deliverables across the AMX ecosystem. 
            Monitor manufactured intelligence from West Louisville to the Global Cloud.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
             <div className="p-6 rounded-2xl bg-card border border-border/60 shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                   <Activity className="h-5 w-5 text-emerald-500" />
                   <span className="text-[12px] font-black uppercase tracking-widest text-muted-foreground">Global Health</span>
                </div>
                <div className="text-4xl font-black text-foreground">98.4%</div>
                <div className="text-[11px] font-bold text-muted-foreground mt-2 uppercase tracking-tight italic">Verified Professional Standards</div>
             </div>

             <div className="p-6 rounded-2xl bg-card border border-border/60 shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                   <Zap className="h-5 w-5 text-amber-500" />
                   <span className="text-[12px] font-black uppercase tracking-widest text-muted-foreground">Active Workflows</span>
                </div>
                <div className="text-4xl font-black text-foreground">1,242</div>
                <div className="text-[11px] font-bold text-muted-foreground mt-2 uppercase tracking-tight italic">AI Factory Concurrent Tasks</div>
             </div>

             <div className="p-6 rounded-2xl bg-card border border-border/60 shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                   <Layers className="h-5 w-5 text-primary" />
                   <span className="text-[12px] font-black uppercase tracking-widest text-muted-foreground">Orgs Monitored</span>
                </div>
                <div className="text-4xl font-black text-foreground">12</div>
                <div className="text-[11px] font-bold text-muted-foreground mt-2 uppercase tracking-tight italic">Connected Hubs & Hoods</div>
             </div>
          </div>
        </div>
      </section>

      <main className="px-8 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-12">
             <div className="flex flex-col">
                <h3 className="text-[13px] font-black tracking-[0.2em] uppercase text-primary mb-2">Global Feed</h3>
                <h4 className="text-3xl font-black text-foreground">All Deliverables</h4>
             </div>
             <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 p-2 rounded-xl bg-accent/20 border border-border/40">
                   <BarChart3 className="h-4 w-4 text-muted-foreground" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Export Global Audit</span>
                </div>
             </div>
          </div>

          <DeliverablesBriefcase global={true} />
        </div>
      </main>
    </div>
  );
}
