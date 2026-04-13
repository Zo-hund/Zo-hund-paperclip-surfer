import React, { useState } from "react";
import { 
  GraduationCap, 
  Lightbulb, 
  PlayCircle, 
  Trophy, 
  Clock,
  CheckCircle2,
  Users,
  Compass,
  MonitorPlay,
  Share2,
  Users2,
  Palette,
  Laptop,
  Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";

const OPPRRC_BUDGET = [
  { label: "Organizations", value: "Partner entities", detail: "12 Community / 8 Sponsor" },
  { label: "Programs", value: "12-month curriculum", detail: "$45K Q1 Pilot / $135K Q2-Q4" },
  { label: "Projects", value: "Monthly cycles", detail: "$3.75K/mo per Location. 48 Total" },
  { label: "Resources", value: "Hardware & Staffing", detail: "35% Equip / 50% Staff / 15% Ops" },
  { label: "Reports", value: "Real-time Tracking", detail: "Weekly, Monthly, Quarterly" },
  { label: "Certificates", value: "Skill Badges", detail: "24 Badges / 12 Certificates" },
];

const TIME_SLOTS = [
  { icon: "☀️", name: "Morning", time: "9 AM - 12 PM", available: true },
  { icon: "🌤️", name: "Afternoon", time: "1 PM - 4 PM", available: true },
  { icon: "🌆", name: "Evening", time: "5 PM - 8 PM", available: true },
  { icon: "🌙", name: "Night", time: "9 PM - 12 AM", available: true },
];

const FORMATS = [
  { name: "In-Person", desc: "On-site team training for hands-on collaboration.", icon: Users },
  { name: "Online", desc: "Virtual team sessions for remote teams & flexibility.", icon: MonitorPlay },
  { name: "Metaverse", desc: "Immersive XR training for cutting-edge experiences.", icon: Compass },
];

export function AgentOnboardingLMS({ agentId }: { agentId: string }) {
  const [activeStep, setActiveStep] = useState(1);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      
      {/* Overview Banner */}
      <div className="p-6 md:p-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none">
           <GraduationCap className="w-64 h-64" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
             <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
               <MonitorPlay className="h-5 w-5" />
             </div>
             <h2 className="text-xl md:text-2xl font-black text-foreground uppercase tracking-tight">
               Tech At Nite LMS Simulation Training
             </h2>
          </div>
          <p className="text-base text-muted-foreground font-medium max-w-3xl leading-relaxed">
            Market sims for AI agents and human teams to launch, configure, and deploy into live workflows. Collaborate via cooperative booking.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
         <div className="xl:col-span-2 space-y-8">
            {/* The Three-Team Operational Model */}
            <section className="space-y-6">
               <h3 className="text-[13px] font-black tracking-[0.2em] uppercase text-muted-foreground border-b border-border/40 pb-2">
                  Three-Team Operational Model
               </h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Team 1 */}
                  <div className="p-5 rounded-xl border border-border bg-card shadow-sm hover:border-primary/50 transition-colors">
                     <div className="flex items-center gap-2 mb-3 text-primary">
                       <Laptop className="h-5 w-5" />
                       <h4 className="font-black text-foreground">Team #1: XRT Trainers</h4>
                     </div>
                     <p className="text-xs text-muted-foreground mb-4">Technical infrastructure and training delivery.</p>
                     <ul className="space-y-2 text-xs font-medium text-foreground/80">
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary/50" /> Tech Lead (AI + Human)</li>
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary/50" /> JR DevOps (AI + Human)</li>
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary/50" /> Admins (AI + Human)</li>
                     </ul>
                  </div>

                  {/* Team 2 */}
                  <div className="p-5 rounded-xl border border-border bg-card shadow-sm hover:border-emerald-500/50 transition-colors">
                     <div className="flex items-center gap-2 mb-3 text-emerald-500">
                       <Users2 className="h-5 w-5" />
                       <h4 className="font-black text-foreground">Team #2: Social Support</h4>
                     </div>
                     <p className="text-xs text-muted-foreground mb-4">Learner guidance and community engagement.</p>
                     <ul className="space-y-2 text-xs font-medium text-foreground/80">
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" /> Coach (AI + Human)</li>
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" /> Mentor (AI + Human)</li>
                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" /> Sponsors (AI + Human)</li>
                     </ul>
                  </div>

                  {/* Team 3 */}
                  <div className="p-5 rounded-xl border border-border bg-card shadow-sm hover:border-amber-500/50 transition-colors md:col-span-2">
                     <div className="flex items-center gap-2 mb-3 text-amber-500">
                       <Palette className="h-5 w-5" />
                       <h4 className="font-black text-foreground">Team #3: Social Five Agency</h4>
                     </div>
                     <p className="text-xs text-muted-foreground mb-4">Content creation and program development.</p>
                     <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <ul className="space-y-2 text-xs font-medium text-foreground/80">
                           <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/50" /> Creative (AI/H)</li>
                           <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/50" /> Designer (AI/H)</li>
                        </ul>
                        <ul className="space-y-2 text-xs font-medium text-foreground/80">
                           <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/50" /> Developer (AI/H)</li>
                           <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/50" /> Engineer (AI/H)</li>
                        </ul>
                        <ul className="space-y-2 text-xs font-medium text-foreground/80 lg:col-span-2">
                           <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/50" /> Agency/Reviewer (AI/H) Ensures quality</li>
                        </ul>
                     </div>
                  </div>
               </div>
            </section>

            {/* OPPRRC Budget Framework */}
            <section className="space-y-6">
               <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <h3 className="text-[13px] font-black tracking-[0.2em] uppercase text-muted-foreground">
                    OPPRRC Budget Framework
                  </h3>
                  <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded">Real-Time Tracking</span>
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {OPPRRC_BUDGET.map((item, i) => (
                     <div key={i} className="p-4 rounded-xl border border-border/50 bg-accent/5">
                        <div className="flex items-baseline gap-2 mb-2">
                           <span className="text-base font-black text-foreground">{i + 1}.</span>
                           <h5 className="font-bold text-sm text-foreground">{item.label}</h5>
                        </div>
                        <p className="text-xs font-medium text-primary mb-1">{item.value}</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{item.detail}</p>
                     </div>
                  ))}
               </div>
            </section>
         </div>

         <div className="xl:col-span-1 space-y-8">
            {/* Booking Schedule */}
            <section className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-6">
               <h3 className="text-[13px] font-black tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-2">
                 <Clock className="h-4 w-4" /> Team Booking Schedule
               </h3>
               
               <div className="space-y-3">
                  {TIME_SLOTS.map((slot, i) => (
                     <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border border-border/60 hover:bg-accent/5 transition-colors">
                        <div className="flex items-center gap-3">
                           <span className="text-2xl">{slot.icon}</span>
                           <div>
                             <div className="text-sm font-bold">{slot.name}</div>
                             <div className="text-[11px] text-muted-foreground font-mono">{slot.time}</div>
                           </div>
                        </div>
                        <Button size="sm" variant={slot.available ? "outline" : "ghost"} disabled={!slot.available} className="h-8 text-xs font-black uppercase tracking-widest border-border/80">
                           {slot.available ? 'Book 3h' : 'Full'}
                        </Button>
                     </div>
                  ))}
               </div>

               <div className="pt-4 border-t border-border/40 grid grid-cols-1 gap-3">
                  {FORMATS.map((format, i) => {
                     const Icon = format.icon;
                     return (
                        <div key={i} className="flex gap-3 text-sm">
                           <Icon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                           <div>
                              <div className="font-bold text-foreground text-xs">{format.name}</div>
                              <div className="text-[11px] text-muted-foreground">{format.desc}</div>
                           </div>
                        </div>
                     )
                  })}
               </div>
            </section>
            
            <Button className="w-full h-12 font-black text-xs uppercase tracking-widest gap-2 bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20">
               <Briefcase className="h-4 w-4" /> Go to Company AIR HUB
            </Button>
         </div>
      </div>
    </div>
  );
}
