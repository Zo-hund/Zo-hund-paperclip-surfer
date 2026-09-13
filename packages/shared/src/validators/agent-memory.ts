import { z } from "zod";
export const agentMemoryScopeSchema = z.enum(["global", "project"]);
export const agentMemoryCategorySchema = z.enum(["pattern", "preference", "decision", "learning", "feedback"]);
export const agentMemorySourceSchema = z.enum(["self", "ceo", "board", "human"]);
const memoryText = z.string().trim().min(1);
export const createAgentMemorySchema = z.object({
  scope: agentMemoryScopeSchema,
  projectId: z.string().guid().nullable().optional(),
  category: agentMemoryCategorySchema,
  title: memoryText.max(500),
  content: memoryText.max(100_000),
  source: agentMemorySourceSchema.optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.scope === "project") !== Boolean(value.projectId)) {
    ctx.addIssue({ code: "custom", path: ["projectId"], message: "Project scope requires a project; global scope must not specify one" });
  }
});
export const updateAgentMemorySchema = z.object({
  title: memoryText.max(500).optional(),
  content: memoryText.max(100_000).optional(),
  category: agentMemoryCategorySchema.optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one update is required");
export const agentMemoryQuerySchema = z.object({
  scope: agentMemoryScopeSchema.optional(),
  category: agentMemoryCategorySchema.optional(),
  projectId: z.string().guid().optional(),
}).strict();
export type CreateAgentMemory = z.infer<typeof createAgentMemorySchema>;
export type UpdateAgentMemory = z.infer<typeof updateAgentMemorySchema>;
