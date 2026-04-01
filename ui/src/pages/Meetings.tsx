import { useState } from "react";
import { Mic, Plus, History, Play, StopCircle, Radio, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { meetingsApi } from "../api/meetings";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect } from "react";
import { VoiceMeetingRoom } from "../components/meetings/VoiceMeetingRoom";

/**
 * AMX LABS Meetings Page
 */

export default function Meetings() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Meetings" }]);
  }, [setBreadcrumbs]);

  const { data: meetings, isLoading } = useQuery({
    queryKey: ["meetings", selectedCompanyId],
    queryFn: () => meetingsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const startMeeting = useMutation({
    mutationFn: (title: string) => 
      meetingsApi.start({ 
        companyId: selectedCompanyId!, 
        title, 
        type: "standup" 
      }),
    onSuccess: (meeting) => {
      setActiveMeetingId(meeting.id);
      queryClient.invalidateQueries({ queryKey: ["meetings", selectedCompanyId] });
    }
  });

  if (activeMeetingId) {
    return <VoiceMeetingRoom meetingId={activeMeetingId} onClose={() => setActiveMeetingId(null)} />;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-8 px-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Mic className="text-primary h-8 w-8" />
            AMX Meeting Hub
          </h1>
          <p className="text-muted-foreground mt-2">
            Real-time agentic AI communications & strategic board sessions.
          </p>
        </div>
        <Button 
          size="lg" 
          className="rounded-full px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-105"
          onClick={() => startMeeting.mutate(`Strategy Session - ${new Date().toLocaleDateString()}`)}
        >
          <Radio className="mr-2 h-5 w-5 animate-pulse" />
          Start Live Meeting
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="glass-morphism border-primary/20 bg-background/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Active Sessions
            </CardTitle>
            <CardDescription>Currently running strategic sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            {meetings?.filter(m => m.status === 'active').length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No active sessions.</p>
            ) : (
              <ul className="space-y-3">
                {meetings?.filter(m => m.status === 'active').map(m => (
                  <li key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/10">
                    <span className="font-medium truncate">{m.title}</span>
                    <Button size="sm" variant="ghost" className="text-primary" onClick={() => setActiveMeetingId(m.id)}>
                      Rejoin
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Meeting History */}
        <div className="col-span-full mt-8">
           <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
             <History className="h-5 w-5" />
             Stored Accountability Logs
           </h2>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {meetings?.filter(m => m.status === 'completed').map(m => (
               <Card key={m.id} className="hover:border-primary/40 transition-colors border border-border/50 bg-card/30">
                 <CardContent className="p-4">
                   <div className="flex justify-between items-start mb-2">
                     <h3 className="font-semibold truncate pr-4">{m.title}</h3>
                     <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">
                       {m.type}
                     </Badge>
                   </div>
                   <p className="text-xs text-muted-foreground mb-4">
                     {new Date(m.createdAt).toLocaleString()}
                   </p>
                   <div className="flex gap-2">
                     <Button variant="ghost" size="sm" className="w-full text-xs h-8">
                       View Transcript
                     </Button>
                     <Button variant="outline" size="sm" className="w-full text-xs h-8">
                       Play Audio
                     </Button>
                   </div>
                 </CardContent>
               </Card>
             ))}
           </div>
           {meetings?.filter(m => m.status === 'completed').length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                 <p className="text-muted-foreground">No stored meetings yet. Start your first AMX Hub session.</p>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
