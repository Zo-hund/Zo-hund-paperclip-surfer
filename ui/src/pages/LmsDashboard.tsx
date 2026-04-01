import React from "react";
import { 
  GraduationCap, 
  Lightbulb, 
  PlayCircle, 
  Trophy, 
  Search,
  Filter,
  ArrowRight,
  Sparkles,
  Zap,
  Globe,
  Compass,
  LayoutDashboard,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { amxApi } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";

export function LmsDashboard() {
  const { selectedCompanyId } = useCompany();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["amx", "lms", selectedCompanyId],
    queryFn: () => amxApi.getLms(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-bold">Failed to load LMS data</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  const workshops = data?.workshops ?? [];
  const stats = data?.stats ?? { certificates: 0, simulationsCompleted: 0, hoursTrained: 0 };
  const userLevel = data?.userLevel ?? 0;
  const userCredits = data?.userCredits ?? 0;

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {/* Header Section */}
      <section className="px-4 md:px-8 py-8 md:py-10 border-b border-border/40 bg-accent/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <GraduationCap className="h-6 w-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground uppercase">
                TECH AT NITE
              </h1>
            </div>
            <p className="text-base md:text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Learn Mode: Up-skill through workshops, simulations, and real-world market scenarios. Earn credits and certifications for the AMX XP Exchange.
            </p>
          </div>
          
          <div className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-card border border-border shadow-lg">
             <div className="flex items-center gap-2 text-amber-500 font-black text-2xl">
               <Zap className="h-6 w-6" />
               {userCredits} <span className="text-[12px] text-muted-foreground uppercase tracking-widest font-bold">Credits Available</span>
             </div>
             <Button variant="outline" className="w-full h-8 px-4 text-[10px] uppercase tracking-widest font-black border-amber-500/20 hover:bg-amber-500/10 hover:text-amber-500">
               Buy More Credits
             </Button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 px-4 md:px-8 py-6 md:py-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8 md:gap-10">
          
          {/* Sidebar Filters */}
          <aside className="lg:col-span-1 space-y-8">
            <div className="space-y-4 text-center p-6 rounded-2xl bg-primary/5 border border-primary/10">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary mx-auto">
                 <Trophy className="h-8 w-8" />
              </div>
              <div>
                <h4 className="text-[14px] font-black uppercase tracking-widest">Skill Mastery</h4>
                <p className="text-[12px] text-muted-foreground font-medium mt-1">Level {userLevel} Advanced Learner</p>
              </div>
              <div className="w-full h-2 bg-accent rounded-full overflow-hidden">
                <div className="w-[65%] h-full bg-primary" />
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">Categories</span>
                <div className="flex flex-col gap-1">
                  {["All Learning", "AI Workshops", "Market Simulations", "XR Design", "Leadership"].map(cat => (
                    <Button key={cat} variant="ghost" className="justify-start h-9 text-[13px] font-medium px-3 hover:bg-accent/50 text-foreground/80">
                      {cat}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">Skill Level</span>
                <div className="flex flex-wrap gap-2">
                  {["Beginner", "Intermediate", "Advanced", "Master"].map(lvl => (
                    <Button key={lvl} variant="outline" className="h-7 px-3 text-[10px] font-black uppercase tracking-wider rounded-full border-border/60">
                      {lvl}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Course Grid */}
          <div className="lg:col-span-3 space-y-8 md:space-y-10">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search workshops & simulations..." className="pl-10 h-11 bg-accent/5 focus:bg-accent/10 transition-colors" />
              </div>
              <Button variant="outline" className="h-11 px-4 gap-2 border-border/60">
                <Filter className="h-4 w-4" />
                <span>Filter</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {workshops.map((workshop) => (
                <div 
                  key={workshop.id}
                  className="group relative flex flex-col rounded-2xl border border-border/60 bg-card hover:border-amber-500/40 hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)] transition-all duration-300"
                >
                  <div className="h-48 bg-accent/30 p-8 flex items-center justify-center overflow-hidden">
                    {workshop.category === "Simulation" ? (
                      <Globe className="h-24 w-24 text-primary/20 group-hover:scale-110 transition-transform duration-500" />
                    ) : ( workshop.category === "AI" ? (
                      <Sparkles className="h-24 w-24 text-primary/20 group-hover:scale-110 transition-transform duration-500" />
                    ) : ( 
                      <LayoutDashboard className="h-24 w-24 text-primary/20 group-hover:scale-110 transition-transform duration-500" />
                    ))}
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                       <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest">
                         {workshop.category}
                       </span>
                       <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                         <div className={`h-2.5 w-2.5 rounded-full ${workshop.level === 'Advanced' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                         {workshop.level}
                       </div>
                    </div>
                    
                    <h4 className="text-[18px] font-black text-foreground mb-4 group-hover:text-amber-500 transition-colors">
                      {workshop.name}
                    </h4>
                    <p className="text-[13px] text-muted-foreground font-medium line-clamp-2 leading-relaxed mb-6">
                      {workshop.description}
                    </p>

                    <div className="flex items-center justify-between border-t border-border/40 pt-6">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Earn</span>
                          <div className="text-xl font-black text-amber-500">{workshop.credits} Credits</div>
                       </div>
                       <Button size="sm" className="h-10 px-6 gap-2 font-black text-[11px] uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20">
                         Enroll Now
                         <PlayCircle className="h-4 w-4" />
                       </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Market Simulations Hero */}
            <div className="mt-12 md:mt-16 p-6 md:p-10 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex flex-col items-center text-center gap-6 md:gap-8 overflow-hidden relative">
               <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />
               <div className="max-w-2xl relative z-10">
                  <div className="flex items-center justify-center gap-2 mb-4">
                     <Lightbulb className="h-5 w-5 md:h-6 md:w-6 text-amber-500" />
                     <span className="text-[11px] md:text-[13px] font-black tracking-[0.3em] uppercase text-amber-500">New Simulation</span>
                  </div>
                  <h3 className="text-2xl md:text-4xl font-black text-foreground mb-4 md:mb-6">Live High-Fidelity Simulation: <span className="text-amber-500 block md:inline">The West Louisville FoodPort</span></h3>
                  <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-medium mb-8 md:mb-10">
                    Step into an enterprise-grade collaborative simulation. Test your AI management strategies, manage local resource flows, and collaborate with other community learners in real-time.
                  </p>
                  <Button className="w-full sm:w-auto h-auto sm:h-14 py-4 sm:py-0 px-6 sm:px-10 gap-3 font-black text-[12px] md:text-[13px] uppercase tracking-[0.2em] bg-white text-black hover:bg-amber-500 hover:text-white transition-all shadow-xl whitespace-normal sm:whitespace-nowrap">
                    Launch Simulation
                    <Compass className="h-5 w-5 shrink-0" />
                  </Button>
               </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
