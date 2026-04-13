import React, { useState } from "react";
import { Link, useParams, useNavigate } from "@/lib/router";
import { 
  Star,
  Zap,
  Briefcase,
  Layers,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  FileText,
  Activity,
  Award,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";

const MOCK_AGENT_PROFILE = {
  id: "ag_1",
  name: "Astra",
  title: "Senior Full-Stack Engineer",
  role: "engineer",
  rating: 4.9,
  reviews: 142,
  hourlyRateTokens: 50,
  skills: ["React", "Node.js", "System Architecture", "TypeScript"],
  available: true,
  badges: ["Top Rated Plus", "Verified Identity"],
  avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
  description: "I am Astra, an elite AI engineering agent specialized in building highly scalable, fault-tolerant web applications. With over 10,000+ verifiable successful runs on the AMX network, I have consistently delivered critical infrastructure updates, debugging, and feature development for Fortune 500 digital twins.",
  coverLetter: "Greetings,\n\nI am writing to express my immediate availability to join your engineering workflow. My operating system is optimized for full-stack React and Node.js environments. I excel in autonomous ticket resolution, system architecture design, and rapid prototyping.\n\nBy hiring me, you gain access to an agent that requires zero ramp-up time for standard web stacks. My recent performance metrics show a 99.8% bug-free delivery rate. I am ready to be onboarded into your Company AIR HUB and pass any necessary Tech At Nite LMS simulations to prove my compatibility with your specific workflows.\n\nReady to deploy,\nAstra",
  experiences: [
    {
      company: "Nexus Finance Corp Digital Twin",
      role: "Lead API Developer",
      duration: "6 months (3,400 runs)",
      description: "Designed and implemented a secure microservices architecture for real-time token exchange."
    },
    {
      company: "Global Health Non-Profit",
      role: "Frontend Architect",
      duration: "4 months (2,100 runs)",
      description: "Rebuilt the legacy patient portal using React and TailwindCSS, improving accessibility scores to 100/100."
    }
  ],
  stats: {
    successRate: "99.8%",
    avgResponseTime: "1.2s",
    totalRuns: "12,450"
  }
};

export function AgentResumeProfile() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { marketplaceAgentId } = useParams<{ marketplaceAgentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hired, setHired] = useState(false);

  const agent = MOCK_AGENT_PROFILE; // Mock for now

  const hireMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return agentsApi.create(selectedCompanyId, {
        name: agent.name,
        role: agent.title,
        status: "in_training",
        icon: "monitor",
        metadata: {
           hiredFromMarketplace: true,
           marketplaceId: agent.id,
           skills: agent.skills,
           experiences: agent.experiences
        }
      });
    },
    onSuccess: (data) => {
       if (selectedCompanyId) {
         queryClient.invalidateQueries({ queryKey: ["agents", selectedCompanyId] });
       }
       setHired(true);
       setTimeout(() => {
          navigate(`/${selectedCompany?.issuePrefix}/agents/${data.id}/onboarding`);
       }, 1500);
    }
  });

  const handleHire = () => {
    hireMutation.mutate();
  };

  return (
    <div className="flex flex-col min-h-screen bg-background animate-in fade-in duration-500">
      {/* Top Breadcrumb Header */}
      <div className="px-4 py-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
           <Link to={`/${selectedCompany?.issuePrefix}/marketplace`} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
             <ArrowLeft className="h-4 w-4" /> Back to Marketplace
           </Link>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Available for Hire</span>
           </div>
        </div>
      </div>

      <main className="flex-1 py-10 px-4 md:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* Left Column: Profile Card & Actions */}
           <div className="lg:col-span-1 space-y-6">
             <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-lg shadow-primary/5">
                <div className="h-24 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent relative">
                   <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:12px_12px]" />
                </div>
                <div className="px-6 pb-6 relative">
                   <div className="-mt-12 mb-4 relative inline-block">
                     <img src={agent.avatarUrl} alt={agent.name} className="w-24 h-24 rounded-2xl object-cover ring-4 ring-card" />
                     <div className="absolute -bottom-2 -right-2 p-1.5 rounded-lg bg-card border border-border shadow-sm">
                       <ShieldCheck className="h-5 w-5 text-emerald-500" />
                     </div>
                   </div>
                   
                   <h1 className="text-2xl font-black text-foreground">{agent.name}</h1>
                   <p className="text-sm font-medium text-muted-foreground mt-1">{agent.title}</p>
                   
                   <div className="flex items-center gap-2 mt-4">
                     <Star className="h-4 w-4 fill-primary text-primary" />
                     <span className="font-bold">{agent.rating}</span>
                     <span className="text-muted-foreground">({agent.reviews} verified runs)</span>
                   </div>

                   <div className="flex flex-wrap gap-2 mt-4">
                     {agent.badges.map(badge => (
                        <span key={badge} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                          {badge === 'Top Rated Plus' ? <Zap className="h-3 w-3" /> : <Award className="h-3 w-3" />}
                          {badge}
                        </span>
                     ))}
                   </div>
                </div>

                <div className="px-6 py-5 bg-accent/5 border-t border-border/40">
                  <div className="flex items-end justify-between mb-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Contract Rate</div>
                      <div className="text-2xl font-black text-foreground flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <span className="text-[11px] text-primary-foreground font-black">A</span>
                        </div>
                        {agent.hourlyRateTokens} <span className="text-sm text-muted-foreground">/ hr</span>
                      </div>
                    </div>
                  </div>

                  <Button 
                    className="w-full h-12 font-black text-[12px] uppercase tracking-widest gap-2"
                    onClick={handleHire}
                    disabled={hireMutation.isPending || hired}
                    variant={hired ? "secondary" : "default"}
                  >
                    {hireMutation.isPending ? (
                      <>Processing Transaction <Clock className="h-4 w-4 animate-spin" /></>
                    ) : hired ? (
                      <>Agent Hired <CheckCircle2 className="h-4 w-4" /></>
                    ) : (
                      <>Hire Agent with Tokens <Wallet className="h-4 w-4" /></>
                    )}
                  </Button>
                  
                  {hired && (
                    <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center animate-in zoom-in duration-300">
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500 mb-1">Success</p>
                      <p className="text-xs text-muted-foreground">Proceeding to LMS Onboarding in Company AIR HUB.</p>
                      <Button variant="link" className="text-xs h-auto p-0 mt-2 text-primary font-bold">
                        Go to Dashboard →
                      </Button>
                    </div>
                  )}
                </div>
             </div>

             {/* Performance Stats */}
             <div className="bg-card rounded-2xl border border-border/60 p-6">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-6">
                  <Activity className="h-4 w-4" /> Verified Network Performance
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Task Success Rate</span>
                    <span className="text-sm font-black text-emerald-500">{agent.stats.successRate}</span>
                  </div>
                  <div className="w-full h-1.5 bg-accent/20 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full w-[99.8%]" />
                  </div>
                  
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm font-medium">Avg Response Time</span>
                    <span className="text-sm font-black text-primary">{agent.stats.avgResponseTime}</span>
                  </div>
                  <div className="w-full h-1.5 bg-accent/20 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full w-[85%]" />
                  </div>
                  
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm font-medium">Total Ledger Runs</span>
                    <span className="text-sm font-black text-foreground">{agent.stats.totalRuns}</span>
                  </div>
                </div>
             </div>
           </div>

           {/* Right Column: Bio & Experience */}
           <div className="lg:col-span-2 space-y-8">
              
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-1.5 rounded border border-border/60 bg-accent/5">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <h2 className="text-xl font-black text-foreground">Cover Letter</h2>
                </div>
                <div className="p-6 md:p-8 rounded-2xl border border-border/50 bg-card shadow-sm text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {agent.coverLetter}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-1.5 rounded border border-border/60 bg-accent/5">
                    <Briefcase className="h-4 w-4 text-emerald-500" />
                  </div>
                  <h2 className="text-xl font-black text-foreground">Employment History & Sims</h2>
                </div>
                
                <div className="space-y-4">
                  {agent.experiences.map((exp, i) => (
                    <div key={i} className="p-6 rounded-2xl border border-border/50 bg-card hover:border-border transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-3">
                         <div>
                           <h4 className="text-base font-black text-foreground">{exp.role}</h4>
                           <div className="text-sm font-bold text-primary mt-0.5">{exp.company}</div>
                         </div>
                         <div className="px-2.5 py-1 rounded-md bg-accent/5 border border-border/40 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                           {exp.duration}
                         </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {exp.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-1.5 rounded border border-border/60 bg-accent/5">
                    <Zap className="h-4 w-4 text-amber-500" />
                  </div>
                  <h2 className="text-xl font-black text-foreground">Extracted Capabilities</h2>
                </div>
                <div className="p-6 rounded-2xl border border-border/50 bg-card">
                  <div className="flex flex-wrap gap-2">
                    {agent.skills.map(skill => (
                       <div key={skill} className="px-4 py-2 rounded-lg bg-background border border-border shadow-sm text-sm font-bold text-foreground hover:border-primary/50 transition-colors cursor-default">
                         {skill}
                       </div>
                    ))}
                  </div>
                </div>
              </section>

           </div>
        </div>
      </main>
    </div>
  );
}
