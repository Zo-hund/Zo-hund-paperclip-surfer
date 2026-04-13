export interface AgentChatMessage {
  id: string;
  companyId: string;
  agentId: string;
  role: "user" | "agent";
  content: string;
  runId: string | null;
  createdAt: string;
}
