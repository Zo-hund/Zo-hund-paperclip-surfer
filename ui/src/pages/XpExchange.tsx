import React from "react";
import { 
  Zap, 
  Search, 
  Filter, 
  Star, 
  MapPin, 
  BadgeCheck, 
  TrendingUp,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { amxApi } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";

export function XpExchange() {
  const { selectedCompanyId } = useCompany();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["amx", "exchange", selectedCompanyId],
    queryFn: () => amxApi.getExchange(selectedCompanyId!),
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
        <p className="text-muted-foreground font-bold">Failed to load marketplace data</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  const earners = data?.earners ?? [];
  const stats = data?.stats ?? { availableEarners: 0, projectsCompleted: 0, averageRating: 0 };

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {/* Header Section */}
      <section className="px-8 py-10 border-b border-border/40 bg-accent/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Zap className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground uppercase">
              AMX SKILLS MARKETPLACE
            </h1>
          </div>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
            Find Your Dream Team. Connect with skilled Earners who can bring your AI and XR projects to life.
          </p>
          
          <div className="flex items-center gap-8 mt-10">
            <div className="flex flex-col">
              <span className="text-2xl font-black text-primary">{stats.availableEarners}</span>
              <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mt-1">Available Earners</span>
            </div>
            <div className="w-px h-10 bg-border/60" />
            <div className="flex flex-col">
              <span className="text-2xl font-black text-primary">{stats.projectsCompleted}</span>
              <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mt-1">Projects Completed</span>
            </div>
            <div className="w-px h-10 bg-border/60" />
            <div className="flex flex-col">
              <span className="text-2xl font-black text-primary">{stats.averageRating}</span>
              <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mt-1">Average Rating</span>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filter Bar */}
      <div className="sticky top-0 z-10 px-8 py-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by expertise e.g., Unity, Machine Learning, Louisville..." 
              className="pl-10 h-11 bg-accent/5 focus:bg-accent/10 transition-colors"
            />
          </div>
          <Button variant="outline" className="h-11 px-4 gap-2 border-border/60">
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </Button>
          <div className="flex items-center gap-2">
            {["XR", "AI", "Design", "Development", "Leadership"].map(tag => (
              <Button key={tag} variant="secondary" size="sm" className="h-8 text-[11px] font-bold uppercase tracking-wider">
                {tag}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Earner Grid */}
      <main className="px-4 md:px-8 py-6 md:py-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <h2 className="text-[11px] md:text-[13px] font-black tracking-[0.2em] uppercase text-muted-foreground/80">
              Showing {earners.length} of {stats.availableEarners} Earners
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-muted-foreground">Sort by:</span>
              <select className="bg-transparent text-[12px] font-bold uppercase tracking-wider text-foreground outline-none">
                <option>Highest Rated</option>
                <option>Most Projects</option>
                <option>Hourly Rate</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {earners.map((earner) => (
              <div 
                key={earner.id}
                className="group relative flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden hover:border-primary/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300"
              >
                {/* Status Bar */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-wider z-10">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {earner.status}
                </div>

                {/* Profile Header */}
                <div className="p-6 pb-0">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-xl bg-accent border border-border shadow-sm flex items-center justify-center text-xl font-black text-primary">
                      {earner.id === "U4" || earner.id === "U2" ? earner.id : "U"}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-foreground group-hover:text-primary transition-colors">
                        {earner.name}
                      </h3>
                      <p className="text-[11px] font-black tracking-widest uppercase text-primary/80 flex items-center gap-1 mt-0.5">
                        <BadgeCheck className="h-3 w-3" />
                        {earner.title}
                      </p>
                    </div>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-4 line-clamp-2 leading-relaxed">
                    {earner.bio}
                  </p>
                </div>

                {/* Tags */}
                <div className="px-6 py-4 flex flex-wrap gap-1.5">
                  {earner.skills.map(skill => (
                    <span key={skill} className="px-2 py-0.5 rounded bg-accent/50 text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                      {skill}
                    </span>
                  ))}
                </div>

                {/* Stats Grid */}
                <div className="px-6 py-4 border-t border-border/40 grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 text-primary font-black text-sm">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {earner.rating.toFixed(1)}
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">({earner.reviews}) Reviews</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 text-foreground font-black text-sm">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {earner.projects}
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Projects</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 text-foreground font-black text-sm">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {earner.badges}
                    </div>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Badges</span>
                  </div>
                </div>

                {/* Footer Info */}
                <div className="px-6 py-4 bg-accent/5 flex items-center justify-between">
                  <div className="flex flex-col">
                    <div className="text-lg font-black text-primary">
                      {earner.rate} SIMS
                      <span className="text-[10px] text-muted-foreground font-bold ml-1">/HR</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {earner.location}
                    </div>
                  </div>
                  <Button size="sm" className="h-9 px-5 gap-2 font-black text-[11px] uppercase tracking-widest">
                    Book Now
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Call to Action */}
          <div className="mt-16 p-10 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-lg">
              <h2 className="text-2xl font-black text-foreground">Want to Become an Earner?</h2>
              <p className="text-muted-foreground mt-2 leading-relaxed">
                Build your skills, earn badges, and start offering your services to the community through the TECH AT NITE LMS.
              </p>
            </div>
            <Button size="lg" className="h-14 px-8 gap-3 font-black text-[13px] uppercase tracking-[0.2em] shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
              Start Your Journey
              <UserCheck className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
