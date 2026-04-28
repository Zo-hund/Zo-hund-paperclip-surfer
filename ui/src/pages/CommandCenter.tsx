import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bot, 
  CircleDot, 
  DollarSign, 
  ShieldCheck, 
  Terminal, 
  Activity, 
  Cpu, 
  Zap,
  LayoutGrid,
  TrendingUp,
  AlertTriangle
} from "lucide-react";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents } from "../lib/utils";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { PageSkeleton } from "../components/PageSkeleton";

/**
 * Command Center: The premium "Cockpit" interface.
 * Focused on high-fidelity visibility, real-time pulsing status, 
 * and optimized data fetching.
 */
export function CommandCenter() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [activePane, setActivePane] = useState<"overview" | "agents" | "finance">("overview");

  useEffect(() => {
    setBreadcrumbs([{ label: "Command Center" }]);
  }, [setBreadcrumbs]);

  // Optimized fetches: Only getting top items
  const { data: dashboard, isLoading: isDashLoading } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: recentActivity, isLoading: isActivityLoading } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!, { limit: 12 }),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (isDashLoading || isActivityLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 min-h-screen bg-[#020617] text-slate-50 font-sans antialiased">
      {/* HUD Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
            Agentic Command Center
          </h1>
          <p className="text-slate-400 text-xs font-mono uppercase tracking-[0.3em]">System: Operational // Node: AMX-MAIN-01</p>
        </div>
        
        <nav className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
          {(["overview", "agents", "finance"] as const).map((pane) => (
            <button
              key={pane}
              onClick={() => setActivePane(pane)}
              className={cn(
                "px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-all rounded",
                activePane === pane 
                  ? "bg-slate-50 text-slate-950 shadow-[0_0_15px_rgba(255,255,255,0.3)]"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
              )}
            >
              {pane}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Cockpit Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1">
        
        {/* Left Column: Status Gauges & Metrics */}
        <aside className="xl:col-span-1 space-y-6">
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl">
             <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
               <Cpu className="w-3 h-3 text-cyan-400" /> System Vitality
             </h2>
             
             <div className="space-y-8">
               {/* Budget Gauge */}
               <div className="space-y-3">
                 <div className="flex justify-between text-xs font-bold uppercase">
                   <span className="text-slate-300">Burn Rate</span>
                   <span className="text-cyan-400">{dashboard?.costs.monthUtilizationPercent}%</span>
                 </div>
                 <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                   <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${dashboard?.costs.monthUtilizationPercent}%` }}
                    className={cn(
                      "h-full rounded-full",
                      (dashboard?.costs.monthUtilizationPercent ?? 0) > 80 ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]" : "bg-cyan-500 shadow-[0_0_8px_#06b6d4]"
                    )}
                   />
                 </div>
                 <p className="text-[9px] text-slate-500 uppercase font-mono">
                    Limit: {formatCents(dashboard?.costs.monthBudgetCents ?? 0)} // Spent: {formatCents(dashboard?.costs.monthSpendCents ?? 0)}
                 </p>
               </div>

               {/* Task Gauge */}
               <div className="space-y-3">
                 <div className="flex justify-between text-xs font-bold uppercase">
                   <span className="text-slate-300">Operations</span>
                   <span className="text-indigo-400">{dashboard?.tasks.inProgress} Active</span>
                 </div>
                 <div className="grid grid-cols-4 gap-1 h-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className={cn(
                        "rounded-sm",
                        i < (dashboard?.tasks.inProgress ?? 0) ? "bg-indigo-500 shadow-[0_0_4px_#6366f1]" : "bg-slate-800"
                      )} />
                    ))}
                 </div>
                 <p className="text-[9px] text-slate-500 uppercase font-mono">
                    Open: {dashboard?.tasks.open} // Blocked: {dashboard?.tasks.blocked}
                 </p>
               </div>
             </div>
          </section>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mb-2" />
              <div className="text-xl font-black text-slate-50 leading-none">{(dashboard?.pendingApprovals ?? 0) + (dashboard?.budgets.pendingApprovals ?? 0)}</div>
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Gates Pending</div>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
               <Activity className="w-4 h-4 text-amber-400 mb-2" />
               <div className="text-xl font-black text-slate-50 leading-none">{dashboard?.budgets.activeIncidents}</div>
               <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Fault Alerts</div>
            </div>
          </div>
        </aside>

        {/* Center/Main Pane: Live Activity Feed */}
        <main className="xl:col-span-2 flex flex-col gap-6">
           <section className="flex-1 bg-slate-900/20 border border-slate-800/50 rounded-2xl flex flex-col overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
               <h2 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                 <Terminal className="w-3 h-3 text-indigo-400" /> Command Log
               </h2>
               <div className="flex items-center gap-2">
                 <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Live Stream</span>
               </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono">
               <AnimatePresence initial={false}>
                 {(recentActivity ?? []).map((event) => (
                   <motion.div
                     key={event.id}
                     initial={{ opacity: 0, x: -10 }}
                     animate={{ opacity: 1, x: 0 }}
                     className="group flex items-start gap-4 px-3 py-2 rounded-lg hover:bg-slate-800/30 transition-colors"
                   >
                     <span className="text-[10px] text-slate-600 shrink-0 mt-0.5">[{new Date(event.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}]</span>
                     <div className="flex-1 text-xs">
                        <span className="text-slate-300 font-bold uppercase tracking-tighter mr-2">{event.action.replace(/\./g, '_')}</span>
                        <span className="text-slate-500">{String(event.details?.title ?? event.entityType)}</span>
                        <div className="mt-1 flex items-center gap-6 opacity-0 group-hover:opacity-100 transition-opacity">
                           <span className="text-[9px] text-slate-700">ENTITY: {event.entityId.slice(0, 8)}</span>
                           {event.agentId && <span className="text-[9px] text-indigo-400/70">AGENT: {event.agentId.slice(0, 8)}</span>}
                        </div>
                     </div>
                     <span className="text-[10px] text-slate-700 shrink-0 italic">{timeAgo(event.createdAt)}</span>
                   </motion.div>
                 ))}
               </AnimatePresence>
             </div>
           </section>
        </main>

        {/* Right Column: Active Agents Pulsing Status */}
        <aside className="xl:col-span-1 space-y-6">
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
               <Bot className="w-3 h-3 text-indigo-400" /> Active Units
             </h2>
             
             <div className="space-y-4">
               {agents?.filter(a => a.status !== 'terminated').map((agent) => (
                 <motion.div 
                   key={agent.id}
                   whileHover={{ x: 4 }}
                   className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/20 border border-slate-800/50"
                 >
                   <div className="relative">
                      <Identity name={agent.name} size="default" />
                      {agent.status === 'running' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                      )}
                      {agent.status === 'idle' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-slate-500" />
                      )}
                      {agent.status === 'paused' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-amber-500 shadow-[0_0_8px_#f59e0b]" />
                      )}
                   </div>
                   <div className="min-w-0">
                      <div className="text-xs font-black text-slate-100 truncate">{agent.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono truncate">{agent.role}</div>
                   </div>
                 </motion.div>
               ))}
             </div>
          </section>

          {/* Health Alert Section */}
          <section className="bg-indigo-950/20 border border-indigo-500/10 rounded-2xl p-6">
             <div className="flex items-center gap-3 mb-4">
               <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                 <Zap className="w-4 h-4 text-indigo-400" />
               </div>
               <div>
                  <h3 className="text-xs font-black uppercase text-indigo-300 tracking-wide">Optimization Suggestion</h3>
                  <p className="text-[10px] text-indigo-100/40 uppercase font-mono">Intelligence Engine v2.4</p>
               </div>
             </div>
             <p className="text-xs text-indigo-100/70 leading-relaxed italic">
               &ldquo;Burn rate is stable, but 3 tasks are pending board approval. Approving these may increase velocity by 14%.&rdquo;
             </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
