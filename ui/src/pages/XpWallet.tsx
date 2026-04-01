import React from "react";
import { 
  Wallet, 
  Zap, 
  Send, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ShieldCheck, 
  RefreshCcw,
  Sparkles,
  Download,
  Coins,
  History,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { amxApi } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";

export function XpWallet() {
  const { selectedCompanyId } = useCompany();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["amx", "wallet", selectedCompanyId],
    queryFn: () => amxApi.getWallet(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-bold">Failed to load wallet data</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  const transactions = data?.transactions ?? [];
  const balance = data?.balance ?? 0;
  const currency = data?.currency ?? "SIMS";

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {/* Header Section */}
      <section className="px-4 md:px-8 py-8 md:py-12 border-b border-border/40 bg-accent/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-10">
          <div>
            <div className="flex items-center gap-3 mb-4 md:mb-6">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Wallet className="h-7 w-7 md:h-8 md:w-8" />
              </div>
              <h1 className="text-2xl md:text-4xl font-black tracking-tight text-foreground uppercase">
                AMX WALLET
              </h1>
            </div>
            <p className="text-base md:text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Manage your production tokens and learning credits. Secured by the AMX Chain.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4">
             <Button className="h-12 md:h-14 px-6 md:px-8 gap-3 font-black text-[12px] md:text-[13px] uppercase tracking-[0.2em] shadow-lg shadow-primary/20 justify-center">
               <Send className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
               Send Tokens
             </Button>
             <Button variant="outline" className="h-12 md:h-14 px-6 md:px-8 gap-3 font-black text-[12px] md:text-[13px] uppercase tracking-[0.2em] border-border/60 justify-center">
               <Download className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
               Withdraw Fiat
             </Button>
          </div>
        </div>
      </section>

      {/* Wallet Cards Section */}
      <main className="px-4 md:px-8 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8 md:mb-12">
            
            {/* AMX Tokens Card */}
            <div className="relative p-6 md:p-10 rounded-3xl border border-primary/20 bg-primary/5 overflow-hidden group hover:border-primary/40 transition-all duration-500">
               <div className="absolute top-0 right-0 p-6 md:p-10 opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform">
                  <Zap className="w-32 h-32 md:w-48 md:h-48" />
               </div>
               
               <div className="flex items-center gap-2 mb-6 md:mb-10">
                  <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20">Production Currency</span>
               </div>
               
               <div className="flex flex-col gap-1 mb-6 md:mb-10">
                  <span className="text-[11px] md:text-[13px] font-black text-muted-foreground uppercase tracking-widest">Active {currency} Balance</span>
                  <div className="text-4xl md:text-6xl font-black text-foreground flex items-baseline gap-2">
                    {balance.toLocaleString()} <span className="text-xl md:text-2xl text-primary uppercase">{currency}</span>
                  </div>
                  <div className="text-[13px] md:text-[14px] text-emerald-500 font-bold mt-2 flex items-center gap-1">
                    <ArrowUpRight className="h-4 w-4" />
                    +5.2% (24h)
                  </div>
               </div>
               
               <div className="flex items-center gap-3 md:gap-4">
                  <Button className="flex-1 h-11 md:h-12 font-black text-[11px] uppercase tracking-widest">Buy {currency}</Button>
                  <Button variant="outline" className="flex-1 h-11 md:h-12 font-black text-[11px] uppercase tracking-widest border-border/60">Portfolio</Button>
               </div>
            </div>

            {/* Learning Credits Card */}
            <div className="relative p-6 md:p-10 rounded-3xl border border-amber-500/20 bg-amber-500/5 overflow-hidden group hover:border-amber-500/40 transition-all duration-500">
               <div className="absolute top-0 right-0 p-6 md:p-10 opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform">
                  <RefreshCcw className="w-32 h-32 md:w-48 md:h-48" />
               </div>
               
               <div className="flex items-center gap-2 mb-6 md:mb-10">
                  <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-500/20">Learning Resource</span>
               </div>
               
               <div className="flex flex-col gap-1 mb-6 md:mb-10">
                  <span className="text-[11px] md:text-[13px] font-black text-muted-foreground uppercase tracking-widest">Available Credits</span>
                  <div className="text-4xl md:text-6xl font-black text-foreground flex items-baseline gap-2">
                    500 <span className="text-xl md:text-2xl text-amber-500 uppercase">Credits</span>
                  </div>
                  <div className="text-[13px] md:text-[14px] text-muted-foreground font-bold mt-2">
                    Next Reward: +50 Credits (Complete Simulation)
                  </div>
               </div>
               
               <div className="flex items-center gap-3 md:gap-4">
                  <Button className="flex-1 h-11 md:h-12 font-black text-[11px] uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600">Buy Credits</Button>
                  <Button variant="outline" className="flex-1 h-11 md:h-12 font-black text-[10px] uppercase tracking-widest border-border/60">Schedule</Button>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-10">
             {/* Transaction Feed */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                   <h3 className="text-[12px] md:text-[14px] font-black tracking-[0.3em] uppercase text-muted-foreground flex items-center gap-2">
                     <History className="h-4 w-4" />
                     Recent Ledger Activity
                   </h3>
                   <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-8 text-[10px] md:text-[11px] font-black uppercase tracking-widest text-primary hover:bg-primary/10">Export History</Button>
                   </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                   <div className="divide-y divide-border/40">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6 hover:bg-accent/5 transition-colors group gap-4">
                           <div className="flex items-center gap-3 md:gap-6 min-w-0">
                              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 ${tx.type === 'debit' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                 {tx.type === 'debit' ? <ArrowUpRight className="h-5 w-5 md:h-6 md:w-6" /> : <ArrowDownLeft className="h-5 w-5 md:h-6 md:w-6" />}
                              </div>
                              <div className="flex flex-col min-w-0">
                                 <span className="text-[13px] md:text-[15px] font-black text-foreground truncate uppercase tracking-tight">{tx.description}</span>
                                 <span className="text-[11px] md:text-[12px] text-muted-foreground font-medium">{new Date(tx.date).toLocaleDateString()}</span>
                              </div>
                           </div>
                           
                           <div className="flex items-center justify-end gap-3 md:gap-10 shrink-0">
                              <div className="flex flex-col items-end">
                                 <div className={`text-[14px] md:text-xl font-black ${tx.type === 'debit' ? 'text-foreground/80' : 'text-emerald-500'}`}>
                                    {tx.type === 'debit' ? '-' : '+'}{tx.amount.toLocaleString()} {currency}
                                 </div>
                                 <span className="text-[9px] md:text-[10px] text-muted-foreground font-black uppercase tracking-widest">VERIFIED</span>
                              </div>
                              <Button variant="ghost" size="icon" className="text-muted-foreground/30 hover:text-foreground hidden md:flex">
                                 <Download className="h-4 w-4" />
                              </Button>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              </div>

             {/* Sidebar Info */}
             <aside className="space-y-8">
                <div className="p-8 rounded-2xl bg-card border border-border shadow-md">
                   <div className="flex items-center gap-2 mb-6 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                      <h4 className="text-[12px] font-black uppercase tracking-widest">Security Mode</h4>
                   </div>
                   <p className="text-[12px] text-muted-foreground font-medium leading-relaxed mb-6">
                     Every financial ledger entry is signed and verified on the AMX Chain. No external API keys are ever stored raw.
                   </p>
                   <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-emerald-500">
                      <Sparkles className="h-4 w-4" />
                      Biometric Auth Enabled
                   </div>
                </div>

                <div className="p-8 rounded-2xl bg-primary/5 border border-primary/20 shadow-md">
                   <div className="flex items-center gap-2 mb-4 text-primary">
                      <Coins className="h-5 w-5" />
                      <h4 className="text-[12px] font-black uppercase tracking-widest">AMX Chain Staking</h4>
                   </div>
                   <p className="text-[12px] text-muted-foreground font-medium leading-relaxed mb-6">
                     Stake your AMX tokens to earn higher reputation levels and lower RQ portal platform fees.
                   </p>
                   <Button className="w-full h-11 uppercase font-black tracking-widest text-[11px] bg-primary text-white">
                      Start Staking
                   </Button>
                </div>
             </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
