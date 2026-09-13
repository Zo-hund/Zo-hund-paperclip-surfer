import { and, desc, eq, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentMemories, agents, projects } from "@paperclipai/db";
import { createAgentMemorySchema, updateAgentMemorySchema, type CreateAgentMemory, type UpdateAgentMemory } from "@paperclipai/shared";
import { notFound } from "../../errors.js";

export interface AgentMemoryOwner { companyId: string; agentId: string }

export function memoryLoaderService(db: Db) {
  const ownerWhere = (owner: AgentMemoryOwner) => and(
    eq(agentMemories.companyId, owner.companyId), eq(agentMemories.agentId, owner.agentId),
  );
  async function assertOwner(owner: AgentMemoryOwner, projectId?: string | null) {
    const [agent] = await db.select({ id: agents.id }).from(agents)
      .where(and(eq(agents.id, owner.agentId), eq(agents.companyId, owner.companyId))).limit(1);
    if (!agent) throw notFound("Agent not found");
    if (projectId) {
      const [project] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.companyId, owner.companyId))).limit(1);
      if (!project) throw notFound("Project not found");
    }
  }
  return {
    async loadMemories(owner: AgentMemoryOwner, projectId?: string | null,
      opts?: { scope?: "global" | "project"; category?: string; includeAllProjects?: boolean }) {
      await assertOwner(owner, projectId);
      const conditions = [ownerWhere(owner)];
      if (opts?.scope) conditions.push(eq(agentMemories.scope, opts.scope));
      if (opts?.category) conditions.push(eq(agentMemories.category, opts.category as CreateAgentMemory["category"]));
      if (projectId) {
        conditions.push(opts?.scope === "project"
          ? eq(agentMemories.projectId, projectId)
          : or(eq(agentMemories.scope, "global"), eq(agentMemories.projectId, projectId)));
      } else if (!opts?.includeAllProjects) {
        // Runtime without a selected project must not ingest other project memories.
        conditions.push(eq(agentMemories.scope, "global"));
      }
      return db.select().from(agentMemories).where(and(...conditions)).orderBy(desc(agentMemories.createdAt));
    },
    async saveMemory(data: AgentMemoryOwner & CreateAgentMemory & { source: NonNullable<CreateAgentMemory["source"]> }) {
      const { companyId, agentId, ...body } = data;
      const parsed = createAgentMemorySchema.parse(body);
      await assertOwner({ companyId, agentId }, parsed.projectId);
      const [memory] = await db.insert(agentMemories).values({ ...parsed, companyId, agentId,
        source: data.source, projectId: parsed.projectId ?? null, confidence: parsed.confidence ?? 0.5 }).returning();
      return memory;
    },
    async updateMemory(owner: AgentMemoryOwner, id: string, data: UpdateAgentMemory) {
      const parsed = updateAgentMemorySchema.parse(data);
      const [updated] = await db.update(agentMemories).set({ ...parsed, updatedAt: new Date() })
        .where(and(ownerWhere(owner), eq(agentMemories.id, id))).returning();
      return updated ?? null;
    },
    async deleteMemory(owner: AgentMemoryOwner, id: string) {
      const [deleted] = await db.delete(agentMemories)
        .where(and(ownerWhere(owner), eq(agentMemories.id, id))).returning();
      return deleted ?? null;
    },
    async getMemory(owner: AgentMemoryOwner, id: string) {
      const [memory] = await db.select().from(agentMemories)
        .where(and(ownerWhere(owner), eq(agentMemories.id, id))).limit(1);
      return memory ?? null;
    },
  };
}
