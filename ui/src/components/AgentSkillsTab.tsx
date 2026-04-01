import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentDetail } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { AgentSkillSelector } from "./AgentSkillSelector";
import { PageSkeleton } from "./PageSkeleton";

export function AgentSkillsTab({
  agent,
  companyId,
}: {
  agent: AgentDetail;
  companyId?: string;
}) {
  const queryClient = useQueryClient();

  const { data: snapshot, isLoading } = useQuery({
    queryKey: queryKeys.agents.skills(agent.id),
    queryFn: () => agentsApi.skills(agent.id, companyId),
    enabled: !!companyId,
  });

  const mutation = useMutation({
    mutationFn: (skills: string[]) =>
      agentsApi.syncSkills(agent.id, skills, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.skills(agent.id) });
    },
  });

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (!snapshot || !companyId) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="text-lg font-medium">Agent Skills</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Select which skills this agent should have access to during operation. 
          Selected skills will be symlinked into the agent's worktree during execution.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <AgentSkillSelector
          companyId={companyId}
          selectedSkills={snapshot.desiredSkills}
          onSave={(skills) => mutation.mutate(skills)}
          saving={mutation.isPending}
        />
      </div>
    </div>
  );
}
