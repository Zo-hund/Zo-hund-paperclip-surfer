import { z } from "zod";
export const sendChatMessageSchema = z.object({
    content: z.string().min(1).max(16_000),
});
export const createChatWorkOrderSchema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    assigneeAgentId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    chatMessageId: z.string().uuid().optional(),
});
//# sourceMappingURL=agent-chat.js.map