import { z } from "zod";
export declare const createCompanyInviteSchema: z.ZodObject<{
    allowedJoinTypes: z.ZodDefault<z.ZodEnum<["human", "agent", "both"]>>;
    targetEnvironment: z.ZodDefault<z.ZodEnum<["simulation", "live"]>>;
    defaultsPayload: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    agentMessage: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    inviteeEmail: z.ZodEffects<z.ZodNullable<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>>, string | null | undefined, unknown>;
}, "strip", z.ZodTypeAny, {
    allowedJoinTypes: "both" | "agent" | "human";
    targetEnvironment: "live" | "simulation";
    defaultsPayload?: Record<string, unknown> | null | undefined;
    agentMessage?: string | null | undefined;
    inviteeEmail?: string | null | undefined;
}, {
    allowedJoinTypes?: "both" | "agent" | "human" | undefined;
    defaultsPayload?: Record<string, unknown> | null | undefined;
    targetEnvironment?: "live" | "simulation" | undefined;
    agentMessage?: string | null | undefined;
    inviteeEmail?: unknown;
}>;
export type CreateCompanyInvite = z.infer<typeof createCompanyInviteSchema>;
export declare const createOpenClawInvitePromptSchema: z.ZodObject<{
    agentMessage: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    agentMessage?: string | null | undefined;
}, {
    agentMessage?: string | null | undefined;
}>;
export type CreateOpenClawInvitePrompt = z.infer<typeof createOpenClawInvitePromptSchema>;
export declare const acceptInviteSchema: z.ZodObject<{
    requestType: z.ZodEnum<["human", "agent"]>;
    agentName: z.ZodOptional<z.ZodString>;
    adapterType: z.ZodOptional<z.ZodEnum<["process", "http", "claude_local", "codex_local", "opencode_local", "pi_local", "cursor", "openclaw_gateway", "hermes_local", "hermes_advanced"]>>;
    capabilities: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    agentDefaultsPayload: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    responsesWebhookUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    responsesWebhookMethod: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    responsesWebhookHeaders: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    paperclipApiUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    webhookAuthHeader: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    requestType: "agent" | "human";
    capabilities?: string | null | undefined;
    adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | undefined;
    agentName?: string | undefined;
    agentDefaultsPayload?: Record<string, unknown> | null | undefined;
    responsesWebhookUrl?: string | null | undefined;
    responsesWebhookMethod?: string | null | undefined;
    responsesWebhookHeaders?: Record<string, unknown> | null | undefined;
    paperclipApiUrl?: string | null | undefined;
    webhookAuthHeader?: string | null | undefined;
}, {
    requestType: "agent" | "human";
    capabilities?: string | null | undefined;
    adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | undefined;
    agentName?: string | undefined;
    agentDefaultsPayload?: Record<string, unknown> | null | undefined;
    responsesWebhookUrl?: string | null | undefined;
    responsesWebhookMethod?: string | null | undefined;
    responsesWebhookHeaders?: Record<string, unknown> | null | undefined;
    paperclipApiUrl?: string | null | undefined;
    webhookAuthHeader?: string | null | undefined;
}>;
export type AcceptInvite = z.infer<typeof acceptInviteSchema>;
export declare const listJoinRequestsQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["pending_approval", "approved", "rejected"]>>;
    requestType: z.ZodOptional<z.ZodEnum<["human", "agent"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "pending_approval" | "approved" | "rejected" | undefined;
    requestType?: "agent" | "human" | undefined;
}, {
    status?: "pending_approval" | "approved" | "rejected" | undefined;
    requestType?: "agent" | "human" | undefined;
}>;
export type ListJoinRequestsQuery = z.infer<typeof listJoinRequestsQuerySchema>;
export declare const claimJoinRequestApiKeySchema: z.ZodObject<{
    claimSecret: z.ZodString;
}, "strip", z.ZodTypeAny, {
    claimSecret: string;
}, {
    claimSecret: string;
}>;
export type ClaimJoinRequestApiKey = z.infer<typeof claimJoinRequestApiKeySchema>;
export declare const boardCliAuthAccessLevelSchema: z.ZodEnum<["board", "instance_admin_required"]>;
export type BoardCliAuthAccessLevel = z.infer<typeof boardCliAuthAccessLevelSchema>;
export declare const createCliAuthChallengeSchema: z.ZodObject<{
    command: z.ZodString;
    clientName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    requestedAccess: z.ZodDefault<z.ZodEnum<["board", "instance_admin_required"]>>;
    requestedCompanyId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    command: string;
    requestedAccess: "board" | "instance_admin_required";
    clientName?: string | null | undefined;
    requestedCompanyId?: string | null | undefined;
}, {
    command: string;
    clientName?: string | null | undefined;
    requestedAccess?: "board" | "instance_admin_required" | undefined;
    requestedCompanyId?: string | null | undefined;
}>;
export type CreateCliAuthChallenge = z.infer<typeof createCliAuthChallengeSchema>;
export declare const resolveCliAuthChallengeSchema: z.ZodObject<{
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    token: string;
}, {
    token: string;
}>;
export type ResolveCliAuthChallenge = z.infer<typeof resolveCliAuthChallengeSchema>;
export declare const updateMemberPermissionsSchema: z.ZodObject<{
    grants: z.ZodArray<z.ZodObject<{
        permissionKey: z.ZodEnum<["agents:create", "users:invite", "users:manage_permissions", "tasks:assign", "tasks:assign_scope", "joins:approve"]>;
        scope: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, "strip", z.ZodTypeAny, {
        permissionKey: "agents:create" | "users:invite" | "users:manage_permissions" | "tasks:assign" | "tasks:assign_scope" | "joins:approve";
        scope?: Record<string, unknown> | null | undefined;
    }, {
        permissionKey: "agents:create" | "users:invite" | "users:manage_permissions" | "tasks:assign" | "tasks:assign_scope" | "joins:approve";
        scope?: Record<string, unknown> | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    grants: {
        permissionKey: "agents:create" | "users:invite" | "users:manage_permissions" | "tasks:assign" | "tasks:assign_scope" | "joins:approve";
        scope?: Record<string, unknown> | null | undefined;
    }[];
}, {
    grants: {
        permissionKey: "agents:create" | "users:invite" | "users:manage_permissions" | "tasks:assign" | "tasks:assign_scope" | "joins:approve";
        scope?: Record<string, unknown> | null | undefined;
    }[];
}>;
export type UpdateMemberPermissions = z.infer<typeof updateMemberPermissionsSchema>;
export declare const updateUserCompanyAccessSchema: z.ZodObject<{
    companyIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    companyIds: string[];
}, {
    companyIds?: string[] | undefined;
}>;
export type UpdateUserCompanyAccess = z.infer<typeof updateUserCompanyAccessSchema>;
//# sourceMappingURL=access.d.ts.map