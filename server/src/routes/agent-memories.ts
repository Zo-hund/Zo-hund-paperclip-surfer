import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createAgentMemorySchema, updateAgentMemorySchema, agentMemoryQuerySchema } from "@paperclipai/shared";
import { memoryLoaderService, type AgentMemoryOwner } from "../services/agent-runtime/memory-loader.js";
import { logActivity } from "../services/activity-log.js";
import { forbidden, unauthorized } from "../errors.js";
import { getAccessibleResource, getActorInfo } from "./authz.js";

export function agentMemoryRoutes(db: Db) {
  const router = Router();
  const svc = memoryLoaderService(db);
  async function ownerFor(req: Request, res: Response): Promise<AgentMemoryOwner | null> {
    const requestedId = String(req.params.agentId);
    if (requestedId === "me" && (req.actor.type !== "agent" || !req.actor.agentId)) {
      throw unauthorized("Agent authentication required");
    }
    const agentId = z.string().guid().parse(requestedId === "me" ? req.actor.agentId : requestedId);
    const [row] = await db.select({ companyId: agents.companyId, agentId: agents.id }).from(agents)
      .where(eq(agents.id, agentId)).limit(1);
    const owner = await getAccessibleResource(req, res, row, "Agent not found");
    if (!owner) return null;
    if (req.actor.type === "agent" && req.actor.agentId !== owner.agentId) {
      throw forbidden("Agents can access only their own memory");
    }
    return owner;
  }
  async function audit(req: Request, owner: AgentMemoryOwner, id: string, action: string) {
    const actor = getActorInfo(req);
    await logActivity(db, { companyId: owner.companyId, actorType: actor.actorType,
      actorId: actor.actorId, agentId: actor.agentId, runId: actor.runId,
      agentApiKeyId: actor.agentApiKeyId, action, entityType: "agent_memory", entityId: id,
      details: { agentId: owner.agentId } });
  }
  router.get("/agents/:agentId/memories", async (req, res) => {
    const owner = await ownerFor(req, res);
    if (!owner) return;
    const query = agentMemoryQuerySchema.parse(req.query);
    res.json(await svc.loadMemories(owner, query.projectId, { ...query, includeAllProjects: true }));
  });
  router.post("/agents/:agentId/memories", async (req, res) => {
    const owner = await ownerFor(req, res);
    if (!owner) return;
    const body = createAgentMemorySchema.parse(req.body);
    if (req.actor.type === "agent" && body.source && body.source !== "self") {
      throw forbidden("Agents cannot attribute memories to a human");
    }
    const memory = await svc.saveMemory({ ...body, ...owner,
      source: req.actor.type === "agent" ? "self" : (body.source ?? "board") });
    await audit(req, owner, memory.id, "agent.memory.created");
    res.status(201).json(memory);
  });
  router.patch("/agents/:agentId/memories/:memoryId", async (req, res) => {
    const owner = await ownerFor(req, res);
    if (!owner) return;
    const id = z.string().guid().parse(req.params.memoryId);
    const memory = await svc.updateMemory(owner, id, updateAgentMemorySchema.parse(req.body));
    if (!memory) { res.status(404).json({ error: "Memory not found" }); return; }
    await audit(req, owner, id, "agent.memory.updated");
    res.json(memory);
  });
  router.delete("/agents/:agentId/memories/:memoryId", async (req, res) => {
    const owner = await ownerFor(req, res);
    if (!owner) return;
    const id = z.string().guid().parse(req.params.memoryId);
    const memory = await svc.deleteMemory(owner, id);
    if (!memory) { res.status(404).json({ error: "Memory not found" }); return; }
    await audit(req, owner, id, "agent.memory.deleted");
    res.json({ ok: true });
  });
  return router;
}
