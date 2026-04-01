import React from "react";
import { 
  ShieldCheck, 
  BadgeCheck, 
  Key, 
  FileCheck, 
  ExternalLink,
  Activity,
  Fingerprint,
  Clock,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { amxApi } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";

export function AmxChain() {
  const { selectedCompanyId } = useCompany();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["amx", "chain", selectedCompanyId],
    queryFn: () => amxApi.getChain(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-bold">Failed to load ledger data</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  const logs = data?.logs ?? [];
  const certificates = data?.certificates ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {/* Header Section */}
      <section className="px-4 md:px-8 py-8 md:py-10 border-b border-border/40 bg-accent/5 overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
             <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground uppercase">
                AMX CHAIN EXPLORER
              </h1>
            </div>
            <p className="text-base md:text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Verifiable proof of work and immutable security auditing. Track every transaction, permission grant, and intelligence deliverable on the AMX Labs ledger.
            </p>
          </div>

          <div className="flex wrap items-center gap-4 mt-2 md:mt-0">
            <div className="flex flex-col items-center">
               <span className="text-2xl md:text-3xl font-black text-emerald-500">12,402</span>
               <span className="text-[9px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-1">Verified Events</span>
            </div>
            <div className="w-px h-10 bg-border/60 mx-2 md:mx-4" />
            <div className="flex flex-col items-center">
               <span className="text-2xl md:text-3xl font-black text-emerald-500">99.9%</span>
               <span className="text-[9px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-1">Uptime Reliability</span>
            </div>
          </div>
        </div>
      </section>

      {/* Audit Panels */}
      <main className="px-4 md:px-8 py-6 md:py-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Recent Security Events */}
          <div className="lg:col-span-2 space-y-6">
             <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-black tracking-[0.3em] uppercase text-muted-foreground">Recent Security Events</h3>
                <Button variant="ghost" className="h-8 text-[11px] font-black uppercase tracking-widest text-primary hover:bg-primary/10">View Full Ledger</Button>
             </div>

             <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
                <div className="min-w-[700px]">
                  <div className="bg-accent/5 flex items-center px-6 py-3 text-[10px] font-black tracking-widest uppercase text-muted-foreground">
                   <div className="w-[15%]">Event ID</div>
                   <div className="w-[20%]">Type</div>
                   <div className="w-[25%]">Principal</div>
                   <div className="w-[25%]">Action</div>
                   <div className="w-[15%] text-right">Status</div>
                </div>
                
                <div className="divide-y divide-border/40">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center px-6 py-4 hover:bg-accent/5 transition-colors group">
                      <div className="w-[15%] text-[11px] font-mono text-muted-foreground">{log.id}</div>
                      <div className="w-[20%]">
                         <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                           {log.action}
                         </span>
                      </div>
                      <div className="w-[25%] text-[12px] font-black text-foreground">{log.principal}</div>
                      <div className="w-[25%] text-[12px] text-muted-foreground font-medium truncate pr-4" title={log.hash}>{log.hash}</div>
                      <div className="w-[15%] text-right">
                         <div className={`flex items-center justify-end gap-1.5 text-[10px] font-black uppercase tracking-widest ${log.status === 'VERIFIED' ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`}>
                           {log.status === 'VERIFIED' ? <BadgeCheck className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                           {log.status}
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
             </div>
             
             {/* Certificate Explorer */}
             <div className="mt-12 space-y-6">
                <h3 className="text-[13px] font-black tracking-[0.3em] uppercase text-muted-foreground">Proof of Work Certificates</h3>
                
                {certificates.map((cert) => (
                   <div key={cert.id} className="p-8 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col gap-6 relative group overflow-hidden">
                      <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none group-hover:opacity-[0.06] transition-opacity">
                         <ShieldCheck className="w-64 h-64" />
                      </div>
                      
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                             <FileCheck className="h-5 w-5 text-primary" />
                             <span className="text-lg md:text-xl font-black text-primary">{cert.id}</span>
                          </div>
                          <h4 className="text-[16px] md:text-[18px] font-black text-foreground">{cert.title}</h4>
                          <p className="text-[12px] md:text-[13px] text-muted-foreground font-medium mt-1">Issued To: {cert.issuedTo} | Verified: {cert.date}</p>
                        </div>
                      </div>
                      
                      <div className="p-4 rounded-xl bg-background/80 border border-primary/10 backdrop-blur-sm relative z-10">
                         <div className="flex items-center gap-2 mb-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                           <Fingerprint className="h-3.5 w-3.5" />
                           Cryptographic Footprint
                         </div>
                         <div className="text-[9px] md:text-[11px] font-mono break-all text-primary/80 font-bold leading-relaxed">{cert.footprint}</div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10">
                         <Button className="h-10 px-6 gap-2 font-black text-[11px] uppercase tracking-widest justify-center">
                           Download Certificate PDF
                           <ExternalLink className="h-4 w-4" />
                         </Button>
                         <Button variant="outline" className="h-10 px-6 gap-2 font-black text-[11px] uppercase tracking-widest border-border/60 justify-center">
                           Verify on Pacific L2
                         </Button>
                      </div>
                   </div>
                ))}
             </div>
          </div>
          
          {/* Side Info */}
          <aside className="space-y-8">
             <div className="p-8 rounded-2xl bg-card border border-border shadow-md">
                <div className="flex items-center gap-2 mb-6 text-primary">
                   <Activity className="h-5 w-5" />
                   <h4 className="text-[12px] font-black uppercase tracking-widest">Ledger Health</h4>
                </div>
                
                <div className="space-y-6">
                   <div className="flex items-center justify-between">
                     <span className="text-[12px] font-medium text-muted-foreground">Block Height</span>
                     <span className="text-[14px] font-black text-foreground">#1,059,203</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-[12px] font-medium text-muted-foreground">Nodes Active</span>
                     <span className="text-[14px] font-black text-foreground">14</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-[12px] font-medium text-muted-foreground">Transactions (24h)</span>
                     <span className="text-[14px] font-black text-foreground">4,204</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-[12px] font-medium text-muted-foreground">Network Hashrate</span>
                     <span className="text-[14px] font-black text-foreground">8.2 GH/s</span>
                   </div>
                </div>
                
                <div className="mt-8 pt-8 border-t border-border/40">
                   <Button variant="outline" className="w-full h-11 uppercase font-black tracking-widest text-[11px] border-border/60">
                      Explorer Console
                   </Button>
                </div>
             </div>

             <div className="p-8 rounded-2xl bg-card border border-border shadow-md">
                <div className="flex items-center gap-2 mb-4 text-emerald-500">
                   <Key className="h-5 w-5" />
                   <h4 className="text-[12px] font-black uppercase tracking-widest">Secure Access</h4>
                </div>
                <p className="text-[12px] text-muted-foreground font-medium leading-relaxed mb-6">
                  Only authorized Principals (Owners, Adms, Security Guards) can view sensitive audit details.
                </p>
                <div className="p-4 rounded-xl bg-accent/5 border border-border/40 font-mono text-[11px] text-muted-foreground">
                   Principal Key: PRE_AUTH_OK
                   Status: SECURE_ENVIRONMENT
                </div>
             </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
