import React, { useState } from "react";
import {
  GraduationCap,
  Lightbulb,
  PlayCircle,
  Trophy,
  Search,
  Filter,
  Sparkles,
  Zap,
  Globe,
  Compass,
  LayoutDashboard,
  Loader2,
  ChevronLeft,
  Coins,
  Medal,
  Lock,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { amxApi } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";
import { DeliverablesBriefcase } from "@/components/DeliverablesBriefcase";
import { ModuleList } from "@/components/lms/ModuleList";
import { ModulePlayer } from "@/components/lms/ModulePlayer";
import { lmsAnalyticsApi, type LmsModule, type ProgressionStage, type LeaderboardEntry } from "@/api/lmsAnalytics";

const STAGES: { key: ProgressionStage; label: string; icon: React.ElementType }[] = [
  { key: "explorer",   label: "Explorer",    icon: Compass },
  { key: "builder",    label: "Builder",     icon: Sparkles },
  { key: "ambassador", label: "Ambassador",  icon: Trophy },
  { key: "earner",     label: "Earner",      icon: Coins },
  { key: "leader",     label: "Leader",      icon: Medal },
];

function ProgressionBar({ stage }: { stage: ProgressionStage }) {
  const currentIdx = STAGES.findIndex(s => s.key === stage);
  return (
    <div className="flex items-center gap-0 w-full">
      {STAGES.map((s, i) => {
        const Icon = s.icon;
        const done = i < currentIdx;
        const active = i === currentIdx;
        const locked = i > currentIdx;
        return (
          <React.Fragment key={s.key}>
            <div className={`flex flex-col items-center gap-1 flex-1 ${locked ? "opacity-40" : ""}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all
                ${active ? "bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/30" :
                  done ? "bg-primary/20 border-primary/40 text-primary" :
                  "bg-muted border-border text-muted-foreground"}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : locked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[9px] font-black uppercase tracking-widest ${active ? "text-amber-500" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 rounded-full ${done ? "bg-primary/40" : "bg-border/40"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function LeaderboardSection({ entries }: { entries: LeaderboardEntry[] }) {
  const stageColors: Record<ProgressionStage, string> = {
    explorer:   "bg-slate-500/10 text-slate-600",
    builder:    "bg-blue-500/10 text-blue-600",
    ambassador: "bg-violet-500/10 text-violet-600",
    earner:     "bg-amber-500/10 text-amber-600",
    leader:     "bg-emerald-500/10 text-emerald-600",
  };
  if (!entries.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">No leaderboard data yet — complete workshops to appear here.</div>
  );
  return (
    <div className="space-y-2">
      {entries.map(e => (
        <div key={e.userId} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-card border border-border/60 hover:border-primary/20 transition-colors">
          <span className={`w-8 text-center text-sm font-black ${e.rank <= 3 ? "text-amber-500" : "text-muted-foreground"}`}>
            #{e.rank}
          </span>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-black text-primary">
            {e.userId.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{e.userId.slice(0, 8)}…</p>
            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${stageColors[e.progressionStage]}`}>
              {e.progressionStage}
            </span>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-black text-primary">{e.totalScore} pts</p>
            <p className="text-[10px] text-muted-foreground">{e.completions} completions</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LmsDashboard() {
  const { selectedCompanyId } = useCompany();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"learn" | "earn">("learn");
  const [activeWorkshopId, setActiveWorkshopId] = useState<string | null>(null);
  const [activeWorkshopName, setActiveWorkshopName] = useState<string>("");
  const [activeModule, setActiveModule] = useState<LmsModule | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["amx", "lms", selectedCompanyId],
    queryFn: () => amxApi.getLms(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const leaderboardQ = useQuery({
    queryKey: ["lms", "leaderboard", selectedCompanyId],
    queryFn: () => lmsAnalyticsApi.getLeaderboard(selectedCompanyId!, 10),
    enabled: !!selectedCompanyId,
  });

  const modulesQ = useQuery({
    queryKey: ["lms", "modules", selectedCompanyId, activeWorkshopId],
    queryFn: () => lmsAnalyticsApi.getModules(selectedCompanyId!, activeWorkshopId!),
    enabled: !!selectedCompanyId && !!activeWorkshopId,
  });

  function openWorkshop(workshopId: string, workshopName: string) {
    setActiveWorkshopId(workshopId);
    setActiveWorkshopName(workshopName);
    setActiveModule(null);
  }

  function closeWorkshop() {
    setActiveWorkshopId(null);
    setActiveWorkshopName("");
    setActiveModule(null);
  }

  function handleModuleComplete() {
    // Invalidate modules so the next module unlocks
    qc.invalidateQueries({ queryKey: ["lms", "modules", selectedCompanyId, activeWorkshopId] });
    // Auto-advance to next module if possible
    const modules = modulesQ.data ?? [];
    if (!activeModule) return;
    const idx = modules.findIndex(m => m.id === activeModule.id);
    const next = modules[idx + 1];
    if (next?.unlocked) {
      setActiveModule(next);
    }
  }

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
  const tokenBalance = data?.tokenBalance ?? 0;
  const progressionStage = (data?.progressionStage ?? "explorer") as ProgressionStage;

  // ── Module drill-down view ─────────────────────────────────────────────────
  if (activeWorkshopId) {
    const modules = modulesQ.data ?? [];

    return (
      <div className="flex flex-col min-h-screen bg-background/50">
        {/* Sub-header */}
        <div className="px-4 md:px-8 py-4 border-b border-border/40 bg-accent/5 flex items-center gap-3">
          <button
            onClick={closeWorkshop}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            TECH AT NITE
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-black truncate">{activeWorkshopName}</span>
        </div>

        {modulesQ.isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500/60" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Module list sidebar */}
            <aside className="lg:w-72 xl:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto">
              <div className="p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 py-2">
                  {modules.length} Module{modules.length !== 1 ? "s" : ""}
                </p>
                <ModuleList
                  modules={modules}
                  activeModuleId={activeModule?.id ?? null}
                  onSelect={m => setActiveModule(m)}
                />
              </div>
            </aside>

            {/* Player area */}
            <main className="flex-1 overflow-y-auto p-5 md:p-8">
              {activeModule ? (
                <div className="max-w-3xl mx-auto space-y-4">
                  <div>
                    <h2 className="text-xl font-black">{activeModule.title}</h2>
                    {activeModule.durationSeconds && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Math.round(activeModule.durationSeconds / 60)} min
                      </p>
                    )}
                  </div>
                  <ModulePlayer
                    module={activeModule}
                    companyId={selectedCompanyId!}
                    onComplete={handleModuleComplete}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4">
                  <PlayCircle className="h-12 w-12 text-muted-foreground/30" />
                  <div>
                    <p className="font-black text-muted-foreground">Select a module to begin</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Complete modules in order to unlock the next
                    </p>
                  </div>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    );
  }

  // ── Main workshop listing ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {/* Header Section */}
      <section className="px-4 md:px-8 py-8 md:py-10 border-b border-border/40 bg-accent/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
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
                {mode === "learn"
                  ? "Learn Mode: Up-skill through workshops, simulations, and real-world market scenarios."
                  : "Earn Mode: Deploy your skills, accept projects, and earn SIMS tokens from the marketplace."}
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-card border border-border shadow-lg shrink-0">
              {/* Mode Toggle */}
              <div className="flex rounded-lg overflow-hidden border border-border/60 w-full">
                <button
                  onClick={() => setMode("learn")}
                  className={`flex-1 h-8 text-[10px] font-black uppercase tracking-widest transition-colors ${mode === "learn" ? "bg-amber-500 text-white" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  Learn
                </button>
                <button
                  onClick={() => setMode("earn")}
                  className={`flex-1 h-8 text-[10px] font-black uppercase tracking-widest transition-colors ${mode === "earn" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  Earn
                </button>
              </div>
              {mode === "learn" ? (
                <div className="flex items-center gap-2 text-amber-500 font-black text-2xl">
                  <Zap className="h-6 w-6" />
                  {userCredits} <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold">Credits</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-primary font-black text-2xl">
                  <Coins className="h-6 w-6" />
                  {tokenBalance} <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-bold">SIMS</span>
                </div>
              )}
            </div>
          </div>

          {/* Progression Pathway */}
          <div className="bg-card rounded-2xl border border-border/60 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Your Pathway</p>
            <ProgressionBar stage={progressionStage} />
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
                  className="group relative flex flex-col rounded-2xl border border-border/60 bg-card hover:border-amber-500/40 hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)] transition-all duration-300 cursor-pointer"
                  onClick={() => openWorkshop(workshop.id, workshop.name)}
                >
                  <div className="h-48 bg-accent/30 p-8 flex items-center justify-center overflow-hidden">
                    {workshop.category === "Simulation" ? (
                      <Globe className="h-24 w-24 text-primary/20 group-hover:scale-110 transition-transform duration-500" />
                    ) : workshop.category === "AI" ? (
                      <Sparkles className="h-24 w-24 text-primary/20 group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <LayoutDashboard className="h-24 w-24 text-primary/20 group-hover:scale-110 transition-transform duration-500" />
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest">
                        {workshop.category}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                        <div className={`h-2.5 w-2.5 rounded-full ${workshop.level === "Advanced" ? "bg-rose-500" : "bg-emerald-500"}`} />
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
                        <div className="text-xl font-black text-amber-500">{workshop.creditsAwarded} Credits</div>
                      </div>
                      <Button
                        size="sm"
                        className="h-10 px-6 gap-2 font-black text-[11px] uppercase tracking-widest bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20"
                        onClick={e => { e.stopPropagation(); openWorkshop(workshop.id, workshop.name); }}
                      >
                        Start Learning
                        <PlayCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Earn Mode View */}
            {mode === "earn" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black uppercase tracking-wider">Earn Mode</h3>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">
                    {tokenBalance} SIMS Balance
                  </span>
                </div>
                <div className="p-8 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col items-center text-center gap-4">
                  <Coins className="h-10 w-10 text-primary/40" />
                  <div>
                    <p className="font-black text-foreground">Ready to Start Earning?</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                      Create a marketplace listing to offer your skills. Clients book you, you earn SIMS tokens.
                    </p>
                  </div>
                  <Button className="gap-2 font-black text-[11px] uppercase tracking-widest" onClick={() => window.location.href = `/${(window.location.pathname.split("/")[1])}/${(window.location.pathname.split("/")[2])}/xp-exchange`}>
                    Go to Skills Marketplace
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Leaderboard */}
            {mode === "learn" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-black uppercase tracking-wider text-primary">Leaderboard</h3>
                  <span className="text-[10px] text-muted-foreground font-bold">Top Learners</span>
                </div>
                {leaderboardQ.isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" /></div>
                ) : (
                  <LeaderboardSection entries={leaderboardQ.data ?? []} />
                )}
              </div>
            )}

            {/* Market Simulations Hero */}
            <div className="mt-12 md:mt-16 p-6 md:p-10 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex flex-col items-center text-center gap-6 md:gap-8 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />
              <div className="max-w-2xl relative z-10">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5 md:h-6 md:w-6 text-amber-500" />
                  <span className="text-[11px] md:text-[13px] font-black tracking-[0.3em] uppercase text-amber-500">New Simulation</span>
                </div>
                <h3 className="text-2xl md:text-4xl font-black text-foreground mb-4 md:mb-6">
                  Live High-Fidelity Simulation: <span className="text-amber-500 block md:inline">The West Louisville FoodPort</span>
                </h3>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-medium mb-8 md:mb-10">
                  Step into an enterprise-grade collaborative simulation. Test your AI management strategies, manage local resource flows, and collaborate with other community learners in real-time.
                </p>
                <Button className="w-full sm:w-auto h-auto sm:h-14 py-4 sm:py-0 px-6 sm:px-10 gap-3 font-black text-[12px] md:text-[13px] uppercase tracking-[0.2em] bg-white text-black hover:bg-amber-500 hover:text-white transition-all shadow-xl whitespace-normal sm:whitespace-nowrap">
                  Launch Simulation
                  <Compass className="h-5 w-5 shrink-0" />
                </Button>
              </div>
            </div>

            <div className="mt-16 md:mt-24 border-t border-border/40 pt-16 md:pt-20">
              <div className="mb-12">
                <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">Skill Outputs</h2>
                <h3 className="text-3xl font-black text-foreground mb-4">Briefcase: Training Deliverables</h3>
                <p className="text-sm md:text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed">
                  The tangible results of your simulations and workshops. Measured and verified.
                </p>
              </div>
              <DeliverablesBriefcase />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
