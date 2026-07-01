import { useState, useEffect } from "react";
import {
  Bot, History, Radio, Users, Search,
  Shield, Target, AlertTriangle,
  CheckCircle2, MessageSquare, Zap,
  Eye, PlayCircle, BarChart3, TrendingUp, Sparkles
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { meetingsApi } from "../api/meetings";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InviteAgentsDialog } from "../components/meetings/InviteAgentsDialog";
import { useMeeting } from "../context/MeetingContext";

/**
 * AMX LABS Meetings Page - Agentic Command Center
 * Strategy cockpit for high-stakes board sessions and agentic collaboration.
 */
export default function Meetings() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const { requestLiveKit } = useMeeting();

  useEffect(() => {
    setBreadcrumbs([{ label: "Meeting Hub" }]);
  }, [setBreadcrumbs]);

  const { data: meetings } = useQuery({
    queryKey: ["meetings", selectedCompanyId],
    queryFn: () => meetingsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: ["agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const startMeeting = useMutation({
    mutationFn: (title: string) =>
      meetingsApi.start({
        companyId: selectedCompanyId!,
        title,
        type: "board_meet"
      }),
    onSuccess: (meeting) => {
      queryClient.invalidateQueries({ queryKey: ["meetings", selectedCompanyId] });
      requestLiveKit(`meeting-${meeting.id}`, avatarEnabled);
    }
  });

  return (
    <div className="space-y-8 sm:space-y-10 max-w-7xl mx-auto py-6 sm:py-10 px-4 sm:px-6">
      {/* Cockpit Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-primary/10">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-primary/10 rounded-2xl shadow-inner border border-primary/20">
                <Target className="text-primary h-8 w-8" />
             </div>
             <div>
                <h1 className="text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-foreground via-foreground to-foreground/40">
                  AMX Meeting Hub
                </h1>
                <p className="text-muted-foreground font-medium flex items-center gap-2 text-sm uppercase tracking-widest mt-1">
                   <Shield className="h-3 w-3 text-primary/60" />
                   Real-time Agentic Command Center
                </p>
             </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none rounded-full px-6 border-primary/20 bg-background/40 backdrop-blur-sm hover:bg-primary/5 hover:border-primary/40 transition-all gap-2 h-12 font-bold uppercase tracking-widest text-[11px]"
            onClick={() => setInviteOpen(true)}
            disabled={!meetings?.find(m => m.status === "active")}
          >
            <Bot className="h-4 w-4" />
            Invite Agents
          </Button>
          <Button
            variant="outline"
            onClick={() => setAvatarEnabled((v) => !v)}
            className={`flex-1 sm:flex-none rounded-full px-6 h-12 font-bold uppercase tracking-widest text-[11px] gap-2 transition-all ${
              avatarEnabled
                ? "border-primary bg-primary/10 text-primary hover:bg-primary/20"
                : "border-primary/20 bg-background/40 backdrop-blur-sm hover:bg-primary/5 hover:border-primary/40"
            }`}
            title={avatarEnabled ? "Avatar ON — JAZ will appear as a visual participant" : "Avatar OFF — voice only"}
          >
            <Sparkles className="h-4 w-4" />
            Avatar {avatarEnabled ? "On" : "Off"}
          </Button>
          <Button
            size="lg"
            className="w-full sm:w-auto rounded-full px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/20 transition-all hover:scale-105 gap-2 h-12 font-black uppercase tracking-widest text-[11px]"
            onClick={() => startMeeting.mutate(`Strategic Session - ${new Date().toLocaleDateString()}`)}
          >
            <Radio className="h-4 w-4 animate-pulse" />
            Start Live Meeting
          </Button>
        </div>
      </header>

      {/* Global Agent Interaction - "Ask your agents" */}
      <div className="relative group max-w-4xl mx-auto">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-2xl blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative flex items-center">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
            <Search className="h-6 w-6 text-primary/40" />
          </div>
          <Input 
            placeholder="Ask your agents anything about prior or active sessions..."
            className="w-full pl-14 h-16 text-xl rounded-2xl border-primary/10 bg-background/80 backdrop-blur-2xl focus-visible:ring-primary/20 shadow-2xl transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 right-4 flex items-center">
             <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-bold text-[10px] px-3 py-1 uppercase tracking-tighter">
                COGNITIVE SEARCH
             </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Active Cockpits & Metadata */}
        <section className="lg:col-span-4 space-y-8">
          <div className="space-y-4">
            <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-primary/50 flex items-center gap-2 ml-1">
              <Zap className="h-3.5 w-3.5" />
              Active Cockpits
            </h2>
            <Card className="glass-morphism border-primary/10 bg-background/30 overflow-hidden relative group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-primary/40 group-hover:w-2.5 transition-all"></div>
              <CardHeader className="pb-4 border-b border-primary/5">
                <CardTitle className="text-sm font-black flex items-center justify-between uppercase tracking-widest text-primary/80">
                  Live Channels
                  <div className="flex items-center gap-2">
                     <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                     </span>
                     <span className="text-[10px] text-red-500/80 font-bold">STREAMING</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {meetings?.filter(m => m.status === 'active' && m.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-primary/10 rounded-2xl bg-primary/[0.03]">
                    <p className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-[0.2em]">No active sessions.</p>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {meetings?.filter(m => m.status === 'active' && m.title.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
                      <li key={m.id} className="relative flex flex-col p-4 rounded-2xl bg-primary/[0.04] border border-primary/10 hover:bg-primary/[0.07] transition-all cursor-default">
                        <div className="flex items-center justify-between mb-4">
                          <span className="font-extrabold text-sm truncate uppercase tracking-tight">{m.title}</span>
                          <Badge className="bg-primary/20 text-primary border-none text-[8px] font-black px-2">BOARD-SECURE</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                           <div className="flex -space-x-2">
                              <div className="h-8 w-8 rounded-full bg-background border-2 border-primary/10 flex items-center justify-center p-1.5 shadow-sm">
                                 <Bot className="h-full w-full text-primary/70" />
                              </div>
                              <div className="h-8 w-8 rounded-full bg-background border-2 border-primary/10 flex items-center justify-center p-1.5 shadow-sm">
                                 <Users className="h-full w-full text-primary/40" />
                              </div>
                              <div className="h-8 w-8 rounded-full bg-primary/20 border-2 border-primary/10 flex items-center justify-center text-[8px] font-black italic">
                                 +2
                              </div>
                           </div>
                           <Button size="sm" className="h-8 rounded-lg px-5 bg-foreground text-background hover:bg-foreground/80 text-[10px] font-black uppercase tracking-widest shadow-lg" onClick={() => requestLiveKit(`meeting-${m.id}`)}>
                             Rejoin
                           </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="glass-morphism border-primary/10 bg-background/5 p-6 border-2 border-dashed">
             <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                   <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Session Intel</span>
                   <BarChart3 className="h-4 w-4 text-primary/40" />
                </div>
                <div className="space-y-3">
                   <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Avg Sentiment</span>
                      <span className="font-bold text-green-500">+0.84</span>
                   </div>
                   <div className="w-full h-1.5 bg-primary/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 w-[84%]" />
                   </div>
                   <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Decisive Index</span>
                      <span className="font-bold text-primary">7.2/10</span>
                   </div>
                </div>
             </div>
          </Card>
        </section>

        {/* Right Column: Agent-Monitored Commitments */}
        <section className="lg:col-span-8 space-y-4">
           <div className="flex items-center justify-between ml-1 pb-2">
              <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-primary/50 flex items-center gap-2">
                <History className="h-4 w-4" />
                Agent-Monitored Commitments
              </h2>
              <div className="flex items-center gap-2 text-[10px] font-bold text-primary/40 uppercase tracking-widest">
                 Sort by: <span className="text-primary hover:underline cursor-pointer">Date Desc</span>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {meetings?.filter(m => m.status === 'completed' && m.title.toLowerCase().includes(searchQuery.toLowerCase())).map(m => (
               <Card key={m.id} className="hover:border-primary/30 transition-all border border-primary/5 bg-background/20 group cursor-default shadow-sm hover:shadow-2xl hover:shadow-primary/5 overflow-hidden">
                 <div className="h-1 w-full bg-gradient-to-r from-primary/10 via-primary/40 to-primary/10 opacity-50"></div>
                 <CardContent className="p-6">
                   <div className="flex justify-between items-start mb-4">
                     <div className="space-y-1.5">
                        <h3 className="font-black text-xl leading-tight group-hover:text-primary transition-colors tracking-tight">{m.title}</h3>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest flex items-center gap-2">
                           <TrendingUp className="h-3 w-3" />
                           {new Date(m.createdAt).toLocaleDateString()} at {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                     </div>
                     <Badge variant="outline" className="text-[9px] uppercase font-black tracking-[0.2em] border-primary/30 text-primary px-2.5 py-1 bg-primary/5 rounded-md">
                       {m.type}
                     </Badge>
                   </div>
                   
                   <div className="grid grid-cols-3 gap-3 py-4 mb-6 border-y border-primary/5">
                      <div className="flex flex-col gap-1">
                         <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter">Insights</span>
                         <div className="flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-black">{m.insightsCount ?? 0}</span>
                         </div>
                      </div>
                      <div className="flex flex-col gap-1">
                         <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter">Approved</span>
                         <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            <span className="text-sm font-black">{m.approvedCount ?? 0}</span>
                         </div>
                      </div>
                      <div className="flex flex-col gap-1">
                         <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-tighter">Risks</span>
                         <div className="flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-sm font-black">{m.risksCount ?? 0}</span>
                         </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                     <Button variant="ghost" className="w-full text-[10px] font-black uppercase tracking-[0.2em] h-10 hover:bg-primary/10 text-primary/80 transition-all rounded-xl">
                       <Eye className="mr-2 h-4 w-4" />
                       Review Conversation
                     </Button>
                     <Button variant="outline" className="w-full text-[10px] font-black uppercase tracking-[0.2em] h-10 border-primary/10 hover:bg-primary/5 hover:border-primary/30 transition-all rounded-xl">
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Replay Session
                     </Button>
                   </div>
                 </CardContent>
               </Card>
             ))}
           </div>
           {meetings?.filter(m => m.status === 'completed' && m.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <div className="text-center py-32 border-4 border-dotted border-primary/10 rounded-[2.5rem] bg-primary/[0.01] flex flex-col items-center justify-center">
                 <div className="p-6 bg-primary/5 rounded-full mb-6 border border-primary/10">
                    <History className="h-10 w-10 text-primary/20" />
                 </div>
                 <p className="text-muted-foreground font-black uppercase tracking-[0.2em] text-sm">No stored commitments yet.</p>
                 <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.3em] mt-3">Start your first strategic council session to begin monitoring.</p>
                 <Button variant="link" className="mt-6 text-primary font-black uppercase text-[10px] tracking-widest decoration-2 underline-offset-4">
                    Read strategic guide
                 </Button>
              </div>
           )}
        </section>
      </div>
      {/* Invite Agents Dialog — targets most recent active meeting */}
      <InviteAgentsDialog
        meetingId={meetings?.find(m => m.status === "active")?.id ?? ""}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
