import React, { useState } from "react";
import { 
  Cloud, 
  Monitor, 
  Zap, 
  Settings, 
  Activity, 
  ShieldCheck,
  MoreVertical,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { companiesApi } from "@/api/companies";
import { useToast } from "@/context/ToastContext";

export function DeploymentManagement() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const [target, setTarget] = useState<"local" | "cloud">("cloud");
  const [updating, setUpdating] = useState(false);

  const handleToggle = async (newTarget: "local" | "cloud") => {
    if (!selectedCompanyId) return;
    setUpdating(true);
    try {
      await companiesApi.updateDeploymentTarget(selectedCompanyId, newTarget);
      setTarget(newTarget);
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
    <div className="flex flex-col gap-6 p-8 rounded-3xl border border-border/40 bg-card/60 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
           <div className="p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Activity className="h-6 w-6" />
           </div>
           <h3 className="text-xl font-black text-foreground uppercase tracking-tight">AIR HUB Deployment</h3>
        </div>
        <Button variant="ghost" size="sm" className="h-10 w-10 p-0 rounded-xl hover:bg-accent/40">
           <MoreVertical className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>

      <div className="flex flex-col gap-4 relative z-10">
         <div className="flex items-center justify-between p-1 rounded-2xl bg-accent/20 border border-border/40">
            <button 
               onClick={() => handleToggle("local")}
               disabled={updating}
               className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-300 font-black text-[12px] uppercase tracking-widest ${target === 'local' ? 'bg-background text-primary shadow-xl shadow-primary/5' : 'text-muted-foreground opacity-60 hover:opacity-100 hover:bg-accent/30'}`}
            >
               {updating && target === 'local' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
               Local FS
            </button>
            <button 
               onClick={() => handleToggle("cloud")}
               disabled={updating}
               className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-300 font-black text-[12px] uppercase tracking-widest ${target === 'cloud' ? 'bg-background text-primary shadow-xl shadow-primary/5' : 'text-muted-foreground opacity-60 hover:opacity-100 hover:bg-accent/30'}`}
            >
               {updating && target === 'cloud' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
               Cloud Workspace
            </button>
         </div>

         <div className="p-4 rounded-2xl bg-accent/10 border border-border/20 space-y-4">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Status
               </div>
               <span className="text-[12px] font-black text-emerald-500 uppercase tracking-widest">Active & Verified</span>
            </div>

            <div className="flex items-center justify-between">
               <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Latency
               </div>
               <span className="text-[12px] font-black text-foreground uppercase tracking-widest">12ms (Target: {target})</span>
            </div>
         </div>
      </div>

      <div className="flex flex-col gap-2 relative z-10 pt-4 mt-2 border-t border-border/40">
         <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Local Node Connection</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
         </div>
         <p className="text-[12px] text-muted-foreground/60 font-medium leading-tight">
            Deploy your agents locally to utilize institution-grade legacy compute resources or to minimize cloud egress costs.
         </p>
      </div>
    </div>
  );
}
