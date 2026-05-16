import { asc, desc, eq, and, inArray, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentChatMessages, agents, issues } from "@paperclipai/db";
import type { AgentChatMessage } from "@paperclipai/shared";
import { notFound } from "../errors.js";
import { publishLiveEvent } from "./live-events.js";
import { logActivity } from "./activity-log.js";
import { heartbeatService } from "./heartbeat.js";
import { memoryLoaderService } from "./agent-runtime/memory-loader.js";
import { issueService } from "./issues.js";

export function agentChatService(db: Db) {
  async function getAgent(agentId: string) {
    const rows = await db.select().from(agents).where(eq(agents.id, agentId));
    return rows[0] ?? null;
  }

  function rowToMessage(row: typeof agentChatMessages.$inferSelect): AgentChatMessage {
    return {
      id: row.id,
      companyId: row.companyId,
      agentId: row.agentId,
      role: row.role as "user" | "agent",
      content: row.content,
      runId: row.runId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  return {
    async listMessages(agentId: string, companyId: string, limit = 100): Promise<AgentChatMessage[]> {
      const rows = await db
        .select()
        .from(agentChatMessages)
        .where(
          and(
            eq(agentChatMessages.agentId, agentId),
            eq(agentChatMessages.companyId, companyId),
          ),
        )
        .orderBy(asc(agentChatMessages.createdAt))
        .limit(limit);
      return rows.map(rowToMessage);
    },

    async sendMessage(input: {
      agentId: string;
      companyId: string;
      content: string;
      actorType: "user" | "agent" | "system";
      actorId: string;
    }): Promise<{ message: AgentChatMessage; runId: string | null }> {
      const agent = await getAgent(input.agentId);
      if (!agent || agent.companyId !== input.companyId) {
        throw notFound("Agent not found");
      }

      // Persist user message
      const [row] = await db
        .insert(agentChatMessages)
        .values({
          companyId: input.companyId,
          agentId: input.agentId,
          role: "user",
          content: input.content,
        })
        .returning();

      const message = rowToMessage(row!);

      // Broadcast via WebSocket
      publishLiveEvent({
        companyId: input.companyId,
        type: "agent.chat.message",
        payload: { message },
      });

      // Activity log
      await logActivity(db, {
        companyId: input.companyId,
        actorType: input.actorType,
        actorId: input.actorId,
        agentId: input.agentId,
        action: "agent.chat.message.sent",
        entityType: "agent",
        entityId: input.agentId,
        details: { messageId: message.id, contentLength: input.content.length },
      });

      // Build context snapshot with agent memories + recent chat history
      const memLoader = memoryLoaderService(db);
      const memories = await memLoader.loadMemories(input.agentId, null, {
        operatingEnvironment: agent.environment === "simulation" ? "simulation" : "live",
      });
      const memoryContext = memories.slice(0, 30).map((m) => ({
        category: m.category,
        title: m.title,
        content: m.content,
        scope: m.scope,
      }));

      const recentRows = await db
        .select()
        .from(agentChatMessages)
        .where(
          and(
            eq(agentChatMessages.agentId, input.agentId),
            eq(agentChatMessages.companyId, input.companyId),
          ),
        )
        .orderBy(desc(agentChatMessages.createdAt))
        .limit(20);
      const chatHistory = recentRows.reverse().map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }));

      // Role-level real-time context: peer agents and cross-agent work orders.
      const sameRoleAgents = await db
        .select({
          id: agents.id,
          name: agents.name,
          title: agents.title,
          role: agents.role,
          status: agents.status,
          updatedAt: agents.updatedAt,
        })
        .from(agents)
        .where(and(eq(agents.companyId, input.companyId), eq(agents.role, agent.role)))
        .orderBy(desc(agents.updatedAt))
        .limit(12);

      const roleAgentIds = sameRoleAgents.map((a) => a.id);
      const includeStatuses = ["backlog", "todo", "in_progress", "in_review", "blocked"];
      const recentDoneStatuses = ["done"];
      const roleOpenWorkOrders = roleAgentIds.length
        ? await db
            .select({
              id: issues.id,
              identifier: issues.identifier,
              title: issues.title,
              status: issues.status,
              priority: issues.priority,
              assigneeAgentId: issues.assigneeAgentId,
              updatedAt: issues.updatedAt,
              projectId: issues.projectId,
            })
            .from(issues)
            .where(
              and(
                eq(issues.companyId, input.companyId),
                isNull(issues.hiddenAt),
                inArray(issues.assigneeAgentId, roleAgentIds),
                inArray(issues.status, includeStatuses),
              ),
            )
            .orderBy(desc(issues.updatedAt))
            .limit(25)
        : [];

      const recentDoneWorkOrders = roleAgentIds.length
        ? await db
            .select({
              id: issues.id,
              identifier: issues.identifier,
              title: issues.title,
              status: issues.status,
              priority: issues.priority,
              assigneeAgentId: issues.assigneeAgentId,
              updatedAt: issues.updatedAt,
              projectId: issues.projectId,
            })
            .from(issues)
            .where(
              and(
                eq(issues.companyId, input.companyId),
                isNull(issues.hiddenAt),
                inArray(issues.assigneeAgentId, roleAgentIds),
                inArray(issues.status, recentDoneStatuses),
              ),
            )
            .orderBy(desc(issues.updatedAt))
            .limit(10)
        : [];

      const roleContext = {
        role: agent.role,
        selfAgentId: input.agentId,
        peers: sameRoleAgents.map((peer) => ({
          id: peer.id,
          name: peer.name,
          title: peer.title,
          role: peer.role,
          status: peer.status,
          updatedAt: peer.updatedAt?.toISOString?.() ?? null,
        })),
        workOrders: {
          active: roleOpenWorkOrders.map((issue) => ({
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            status: issue.status,
            priority: issue.priority,
            assigneeAgentId: issue.assigneeAgentId,
            updatedAt: issue.updatedAt?.toISOString?.() ?? null,
            projectId: issue.projectId,
          })),
          recentDone: recentDoneWorkOrders.map((issue) => ({
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            status: issue.status,
            priority: issue.priority,
            assigneeAgentId: issue.assigneeAgentId,
            updatedAt: issue.updatedAt?.toISOString?.() ?? null,
            projectId: issue.projectId,
          })),
        },
      };

      // Wake the agent with enriched context
      let runId: string | null = null;
      try {
        const heartbeat = heartbeatService(db);
        const run = await heartbeat.wakeup(input.agentId, {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "chat_message",
          requestedByActorType: input.actorType,
          requestedByActorId: input.actorId,
          contextSnapshot: {
            source: "chat",
            chatMessageId: message.id,
            content: input.content,
            memories: memoryContext,
            chatHistory,
            roleContext,
          },
        });
        runId = run?.id ?? null;

        // Update the user message with the runId so the UI can track streaming
        if (runId) {
          await db
            .update(agentChatMessages)
            .set({ runId })
            .where(eq(agentChatMessages.id, message.id));
          message.runId = runId;
        }
      } catch {
        // Wakeup failure is non-fatal — message is persisted, agent may be paused
      }

      return { message, runId };
    },

    async persistAgentReply(input: {
      companyId: string;
      agentId: string;
      runId: string;
      content: string;
    }): Promise<AgentChatMessage> {
      const [row] = await db
        .insert(agentChatMessages)
        .values({
          companyId: input.companyId,
          agentId: input.agentId,
          role: "agent",
          content: input.content,
          runId: input.runId,
        })
        .returning();

      const message = rowToMessage(row!);

      publishLiveEvent({
        companyId: input.companyId,
        type: "agent.chat.message",
        payload: { message },
      });

      return message;
    },

    async createWorkOrder(input: {
      agentId: string;
      companyId: string;
      runId: string | null;
      title: string;
      description?: string;
      priority?: "critical" | "high" | "medium" | "low";
      assigneeAgentId?: string;
      projectId?: string;
      chatMessageId?: string;
    }) {
      const agent = await getAgent(input.agentId);
      if (!agent || agent.companyId !== input.companyId) {
        throw notFound("Agent not found");
      }

      const billingCode = `chat-${input.chatMessageId ?? input.runId ?? "direct"}`;

      const isvc = issueService(db);
      const issue = await isvc.create(input.companyId, {
        title: input.title,
        description: input.description,
        priority: input.priority ?? "medium",
        status: "todo",
        assigneeAgentId: input.assigneeAgentId,
        projectId: input.projectId,
        billingCode,
        createdByAgentId: input.agentId,
      });

      await logActivity(db, {
        companyId: input.companyId,
        actorType: "agent",
        actorId: input.agentId,
        agentId: input.agentId,
        action: "agent.chat.work_order.created",
        entityType: "issue",
        entityId: issue.id,
        details: {
          issueId: issue.id,
          identifier: issue.identifier,
          billingCode,
          chatMessageId: input.chatMessageId,
          runId: input.runId,
        },
      });

      return issue;
    },
  };
}
