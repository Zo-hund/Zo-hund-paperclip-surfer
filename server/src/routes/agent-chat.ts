import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { sendChatMessageSchema, createChatWorkOrderSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { notFound } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { agentChatService } from "../services/agent-chat.js";

type AgentChatRouteParams = { agentId: string };
type SendChatMessageBody = { content: string };
type CreateChatWorkOrderBody = {
  title: string;
  description?: string;
  priority?: "critical" | "high" | "medium" | "low";
  assigneeAgentId?: string;
  projectId?: string;
  chatMessageId?: string;
};

export function agentChatRoutes(db: Db) {
  const router = Router({ mergeParams: true });
  const chatSvc = agentChatService(db);

  async function resolveAgent(agentId: string) {
    const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
    return rows[0] ?? null;
  }

  // GET /agents/:agentId/chat/messages
  router.get("/messages", async (req, res) => {
    const { agentId } = req.params as AgentChatRouteParams;
    const agent = await resolveAgent(agentId);
    if (!agent) throw notFound("Agent not found");
    assertCompanyAccess(req, agent.companyId);

    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const messages = await chatSvc.listMessages(agentId, agent.companyId, limit);
    res.json(messages);
  });

  // POST /agents/:agentId/chat/messages
  router.post("/messages", validate(sendChatMessageSchema), async (req, res) => {
    const { agentId } = req.params as AgentChatRouteParams;
    const agent = await resolveAgent(agentId);
    if (!agent) throw notFound("Agent not found");
    assertCompanyAccess(req, agent.companyId);

    const actor = getActorInfo(req);
    const { content } = req.body as SendChatMessageBody;

    const result = await chatSvc.sendMessage({
      agentId,
      companyId: agent.companyId,
      content,
      actorType: actor.actorType,
      actorId: actor.actorId,
    });

    res.status(201).json(result);
  });

  // POST /agents/:agentId/chat/work-orders
  // Callable by the agent during a heartbeat run or by board users.
  // Creates a traceable work order (issue) linked to the chat session.
  router.post("/work-orders", validate(createChatWorkOrderSchema), async (req, res) => {
    const { agentId } = req.params as AgentChatRouteParams;
    const agent = await resolveAgent(agentId);
    if (!agent) throw notFound("Agent not found");
    assertCompanyAccess(req, agent.companyId);

    const actor = getActorInfo(req);
    const runId = (req.headers["x-paperclip-run-id"] as string) ?? null;
    const body = req.body as CreateChatWorkOrderBody;

    const issue = await chatSvc.createWorkOrder({
      agentId,
      companyId: agent.companyId,
      runId,
      title: body.title,
      description: body.description,
      priority: body.priority,
      assigneeAgentId: body.assigneeAgentId,
      projectId: body.projectId,
      chatMessageId: body.chatMessageId,
    });

    res.status(201).json(issue);
  });

  return router;
}
