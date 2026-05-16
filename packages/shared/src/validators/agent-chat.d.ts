import { z } from "zod";
export declare const sendChatMessageSchema: z.ZodObject<{
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
}, {
    content: string;
}>;
export type SendChatMessage = z.infer<typeof sendChatMessageSchema>;
export declare const createChatWorkOrderSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodEnum<["critical", "high", "medium", "low"]>>;
    assigneeAgentId: z.ZodOptional<z.ZodString>;
    projectId: z.ZodOptional<z.ZodString>;
    chatMessageId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description?: string | undefined;
    projectId?: string | undefined;
    priority?: "medium" | "critical" | "high" | "low" | undefined;
    assigneeAgentId?: string | undefined;
    chatMessageId?: string | undefined;
}, {
    title: string;
    description?: string | undefined;
    projectId?: string | undefined;
    priority?: "medium" | "critical" | "high" | "low" | undefined;
    assigneeAgentId?: string | undefined;
    chatMessageId?: string | undefined;
}>;
export type CreateChatWorkOrder = z.infer<typeof createChatWorkOrderSchema>;
//# sourceMappingURL=agent-chat.d.ts.map