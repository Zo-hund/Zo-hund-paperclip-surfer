import { useState } from "react";
import { Bot, Check, Loader2, UserPlus, User, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../../api/agents";
import { accessApi } from "../../api/access";
import { meetingsApi, type MeetingParticipant } from "../../api/meetings";
import { useCompany } from "../../context/CompanyContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface InviteAgentsDialogProps {
  meetingId: string;
  open: boolean;
  onClose: () => void;
  /** Currently participating agents — used to show "Invited" badge */
  participants?: MeetingParticipant[];
  onInvited?: () => void;
}

export function InviteAgentsDialog({
  meetingId,
  open,
  onClose,
  participants = [],
  onInvited,
}: InviteAgentsDialogProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"agents" | "staff">("agents");
  const [invitedAgentIds, setInvitedAgentIds] = useState<Set<string>>(
    new Set(participants.filter(p => p.participantType === "agent" && p.agentId).map(p => p.agentId as string)),
  );
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(
    new Set(participants.filter(p => p.participantType === "staff" && p.userId).map(p => p.userId as string)),
  );

  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: staff, isLoading: isStaffLoading } = useQuery({
    queryKey: ["member-directory", selectedCompanyId],
    queryFn: () => accessApi.listMemberDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const invite = useMutation({
    mutationFn: (agentId: string) => meetingsApi.inviteAgent(meetingId, agentId),
    onSuccess: (_, agentId) => {
      setInvitedAgentIds(prev => new Set([...prev, agentId]));
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
      onInvited?.();
    },
  });

  const inviteStaffMutation = useMutation({
    mutationFn: (userId: string) => meetingsApi.inviteStaff(meetingId, userId),
    onSuccess: (_, userId) => {
      setInvitedUserIds(prev => new Set([...prev, userId]));
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
      onInvited?.();
    },
  });

  const activeAgents = agents ?? [];
  const activeStaff = staff ?? [];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-widest text-sm">
            <UserPlus className="h-4 w-4 text-primary" />
            Invite Specialists
          </DialogTitle>
          <DialogDescription className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
            Select agents or staff to join this session
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 border-b border-primary/10 pb-2">
          <Button
            size="sm" variant="ghost"
            className={`h-7 px-3 text-[10px] font-black uppercase tracking-widest gap-1.5 ${tab === "agents" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            onClick={() => setTab("agents")}
          >
            <Bot className="h-3 w-3" /> Agents
          </Button>
          <Button
            size="sm" variant="ghost"
            className={`h-7 px-3 text-[10px] font-black uppercase tracking-widest gap-1.5 ${tab === "staff" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            onClick={() => setTab("staff")}
          >
            <Users className="h-3 w-3" /> Staff
          </Button>
        </div>

        <div className="space-y-2 max-h-[55vh] overflow-y-auto mt-2 pr-1">
          {tab === "agents" && (
            <>
              {isLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
                </div>
              )}
              {!isLoading && activeAgents.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8 uppercase tracking-widest font-bold">
                  No active agents available
                </p>
              )}
              {activeAgents.map(agent => {
                const isInvited = invitedAgentIds.has(agent.id);
                const isLoading = invite.isPending && invite.variables === agent.id;
                return (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-primary/10 bg-primary/[0.03] hover:bg-primary/[0.07] transition-all"
                  >
                    {/* Avatar */}
                    <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-base">
                      {agent.icon ?? <Bot className="h-4 w-4 text-primary" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black uppercase tracking-tight truncate">{agent.name}</p>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter truncate">
                        {agent.title ?? agent.role}
                      </p>
                    </div>

                    {/* Action */}
                    {isInvited ? (
                      <Badge className="bg-green-500/20 text-green-400 border-none text-[9px] font-black uppercase px-2 gap-1">
                        <Check className="h-2.5 w-2.5" />
                        Invited
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-[10px] font-black uppercase tracking-widest border-primary/20 hover:bg-primary/10 hover:border-primary/40"
                        disabled={isLoading}
                        onClick={() => invite.mutate(agent.id)}
                      >
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {tab === "staff" && (
            <>
              {isStaffLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
                </div>
              )}
              {!isStaffLoading && activeStaff.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8 uppercase tracking-widest font-bold">
                  No active staff members found
                </p>
              )}
              {activeStaff.map(member => {
                const isInvited = invitedUserIds.has(member.userId);
                const isLoading = inviteStaffMutation.isPending && inviteStaffMutation.variables === member.userId;
                return (
                  <div
                    key={member.userId}
                    className="flex items-center gap-3 p-3 rounded-xl border border-primary/10 bg-primary/[0.03] hover:bg-primary/[0.07] transition-all"
                  >
                    <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-base">
                      <User className="h-4 w-4 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black uppercase tracking-tight truncate">{member.name}</p>
                    </div>

                    {isInvited ? (
                      <Badge className="bg-green-500/20 text-green-400 border-none text-[9px] font-black uppercase px-2 gap-1">
                        <Check className="h-2.5 w-2.5" />
                        Invited
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-[10px] font-black uppercase tracking-widest border-primary/20 hover:bg-primary/10 hover:border-primary/40"
                        disabled={isLoading}
                        onClick={() => inviteStaffMutation.mutate(member.userId)}
                      >
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="pt-3 border-t border-primary/10 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-[10px] font-black uppercase tracking-widest"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
