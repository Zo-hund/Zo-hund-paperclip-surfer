import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { AgentMemoryTab } from "../components/AgentMemoryTab";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Brain, SearchX } from "lucide-react";

export function Memories() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const companyId = selectedCompanyId!;
  const [selectedAgentId, setSelectedAgentId] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Memories" }]);
  }, [setBreadcrumbs]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const agents = useMemo(
    () => (agentsQuery.data ?? []).filter((agent) => agent.status !== "terminated"),
    [agentsQuery.data],
  );

  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) setSelectedAgentId(agents[0]!.id);
  }, [agents, selectedAgentId]);

  if (agentsQuery.isLoading) return <PageSkeleton />;

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Memories</h1>
          <p className="text-xs text-muted-foreground">Manage global and project memory for one agent at a time.</p>
        </div>
        {agents.length > 0 && (
          <select
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        )}
      </div>

      {agents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <SearchX className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No active agents available.</p>
        </Card>
      ) : selectedAgent ? (
        <div className="space-y-3">
          <Card className="flex items-center gap-3 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Brain className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{selectedAgent.name}</p>
              <p className="text-xs text-muted-foreground truncate">{selectedAgent.role} · {selectedAgent.adapterType}</p>
            </div>
          </Card>
          <AgentMemoryTab agentId={selectedAgent.id} companyId={companyId} />
        </div>
      ) : null}
    </div>
  );
}
