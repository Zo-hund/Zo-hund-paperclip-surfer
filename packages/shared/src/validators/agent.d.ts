import { z } from "zod";
export declare const agentPermissionsSchema: z.ZodObject<{
    canCreateAgents: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    canCreateAgents: boolean;
}, {
    canCreateAgents?: boolean | undefined;
}>;
export declare const agentInstructionsBundleModeSchema: z.ZodEnum<["managed", "external"]>;
export declare const updateAgentInstructionsBundleSchema: z.ZodObject<{
    mode: z.ZodOptional<z.ZodEnum<["managed", "external"]>>;
    rootPath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    entryFile: z.ZodOptional<z.ZodString>;
    clearLegacyPromptTemplate: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    clearLegacyPromptTemplate: boolean;
    mode?: "external" | "managed" | undefined;
    rootPath?: string | null | undefined;
    entryFile?: string | undefined;
}, {
    mode?: "external" | "managed" | undefined;
    rootPath?: string | null | undefined;
    entryFile?: string | undefined;
    clearLegacyPromptTemplate?: boolean | undefined;
}>;
export type UpdateAgentInstructionsBundle = z.infer<typeof updateAgentInstructionsBundleSchema>;
export declare const upsertAgentInstructionsFileSchema: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
    clearLegacyPromptTemplate: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    content: string;
    clearLegacyPromptTemplate: boolean;
}, {
    path: string;
    content: string;
    clearLegacyPromptTemplate?: boolean | undefined;
}>;
export type UpsertAgentInstructionsFile = z.infer<typeof upsertAgentInstructionsFileSchema>;
export declare const createAgentSchema: z.ZodObject<{
    name: z.ZodString;
    environment: z.ZodDefault<z.ZodOptional<z.ZodEnum<["simulation", "live"]>>>;
    role: z.ZodDefault<z.ZodOptional<z.ZodEnum<["ceo", "cto", "cmo", "cfo", "engineer", "designer", "pm", "qa", "devops", "researcher", "auditor", "general"]>>>;
    title: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    icon: z.ZodNullable<z.ZodOptional<z.ZodEnum<["bot", "cpu", "brain", "zap", "rocket", "code", "terminal", "shield", "eye", "search", "wrench", "hammer", "lightbulb", "sparkles", "star", "heart", "flame", "bug", "cog", "database", "globe", "lock", "mail", "message-square", "file-code", "git-branch", "package", "puzzle", "target", "wand", "atom", "circuit-board", "radar", "swords", "telescope", "microscope", "crown", "gem", "hexagon", "pentagon", "fingerprint"]>>>;
    reportsTo: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    capabilities: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    desiredSkills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    adapterType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["process", "http", "claude_local", "codex_local", "opencode_local", "pi_local", "cursor", "openclaw_gateway", "hermes_local", "hermes_advanced"]>>>;
    adapterConfig: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>>>;
    runtimeConfig: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    budgetMonthlyCents: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    permissions: z.ZodOptional<z.ZodObject<{
        canCreateAgents: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        canCreateAgents: boolean;
    }, {
        canCreateAgents?: boolean | undefined;
    }>>;
    metadata: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    scheduleEnabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cronExpression: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    scheduleTimezone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    budgetMonthlyCents: number;
    environment: "live" | "simulation";
    role: "general" | "ceo" | "cto" | "cmo" | "cfo" | "engineer" | "designer" | "pm" | "qa" | "devops" | "researcher" | "auditor";
    adapterType: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced";
    adapterConfig: Record<string, unknown>;
    runtimeConfig: Record<string, unknown>;
    scheduleEnabled: boolean;
    title?: string | null | undefined;
    icon?: "database" | "search" | "bot" | "cpu" | "brain" | "zap" | "rocket" | "code" | "terminal" | "shield" | "eye" | "wrench" | "hammer" | "lightbulb" | "sparkles" | "star" | "heart" | "flame" | "bug" | "cog" | "globe" | "lock" | "mail" | "message-square" | "file-code" | "git-branch" | "package" | "puzzle" | "target" | "wand" | "atom" | "circuit-board" | "radar" | "swords" | "telescope" | "microscope" | "crown" | "gem" | "hexagon" | "pentagon" | "fingerprint" | null | undefined;
    reportsTo?: string | null | undefined;
    capabilities?: string | null | undefined;
    permissions?: {
        canCreateAgents: boolean;
    } | undefined;
    cronExpression?: string | null | undefined;
    scheduleTimezone?: string | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    desiredSkills?: string[] | undefined;
}, {
    name: string;
    budgetMonthlyCents?: number | undefined;
    environment?: "live" | "simulation" | undefined;
    role?: "general" | "ceo" | "cto" | "cmo" | "cfo" | "engineer" | "designer" | "pm" | "qa" | "devops" | "researcher" | "auditor" | undefined;
    title?: string | null | undefined;
    icon?: "database" | "search" | "bot" | "cpu" | "brain" | "zap" | "rocket" | "code" | "terminal" | "shield" | "eye" | "wrench" | "hammer" | "lightbulb" | "sparkles" | "star" | "heart" | "flame" | "bug" | "cog" | "globe" | "lock" | "mail" | "message-square" | "file-code" | "git-branch" | "package" | "puzzle" | "target" | "wand" | "atom" | "circuit-board" | "radar" | "swords" | "telescope" | "microscope" | "crown" | "gem" | "hexagon" | "pentagon" | "fingerprint" | null | undefined;
    reportsTo?: string | null | undefined;
    capabilities?: string | null | undefined;
    adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | undefined;
    adapterConfig?: Record<string, unknown> | undefined;
    runtimeConfig?: Record<string, unknown> | undefined;
    permissions?: {
        canCreateAgents?: boolean | undefined;
    } | undefined;
    scheduleEnabled?: boolean | undefined;
    cronExpression?: string | null | undefined;
    scheduleTimezone?: string | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    desiredSkills?: string[] | undefined;
}>;
export type CreateAgent = z.infer<typeof createAgentSchema>;
export declare const createAgentHireSchema: z.ZodObject<{
    name: z.ZodString;
    environment: z.ZodDefault<z.ZodOptional<z.ZodEnum<["simulation", "live"]>>>;
    role: z.ZodDefault<z.ZodOptional<z.ZodEnum<["ceo", "cto", "cmo", "cfo", "engineer", "designer", "pm", "qa", "devops", "researcher", "auditor", "general"]>>>;
    title: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    icon: z.ZodNullable<z.ZodOptional<z.ZodEnum<["bot", "cpu", "brain", "zap", "rocket", "code", "terminal", "shield", "eye", "search", "wrench", "hammer", "lightbulb", "sparkles", "star", "heart", "flame", "bug", "cog", "database", "globe", "lock", "mail", "message-square", "file-code", "git-branch", "package", "puzzle", "target", "wand", "atom", "circuit-board", "radar", "swords", "telescope", "microscope", "crown", "gem", "hexagon", "pentagon", "fingerprint"]>>>;
    reportsTo: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    capabilities: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    desiredSkills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    adapterType: z.ZodDefault<z.ZodOptional<z.ZodEnum<["process", "http", "claude_local", "codex_local", "opencode_local", "pi_local", "cursor", "openclaw_gateway", "hermes_local", "hermes_advanced"]>>>;
    adapterConfig: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>>>;
    runtimeConfig: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    budgetMonthlyCents: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    permissions: z.ZodOptional<z.ZodObject<{
        canCreateAgents: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        canCreateAgents: boolean;
    }, {
        canCreateAgents?: boolean | undefined;
    }>>;
    metadata: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    scheduleEnabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    cronExpression: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    scheduleTimezone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
} & {
    sourceIssueId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    sourceIssueIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    budgetMonthlyCents: number;
    environment: "live" | "simulation";
    role: "general" | "ceo" | "cto" | "cmo" | "cfo" | "engineer" | "designer" | "pm" | "qa" | "devops" | "researcher" | "auditor";
    adapterType: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced";
    adapterConfig: Record<string, unknown>;
    runtimeConfig: Record<string, unknown>;
    scheduleEnabled: boolean;
    title?: string | null | undefined;
    icon?: "database" | "search" | "bot" | "cpu" | "brain" | "zap" | "rocket" | "code" | "terminal" | "shield" | "eye" | "wrench" | "hammer" | "lightbulb" | "sparkles" | "star" | "heart" | "flame" | "bug" | "cog" | "globe" | "lock" | "mail" | "message-square" | "file-code" | "git-branch" | "package" | "puzzle" | "target" | "wand" | "atom" | "circuit-board" | "radar" | "swords" | "telescope" | "microscope" | "crown" | "gem" | "hexagon" | "pentagon" | "fingerprint" | null | undefined;
    reportsTo?: string | null | undefined;
    capabilities?: string | null | undefined;
    permissions?: {
        canCreateAgents: boolean;
    } | undefined;
    cronExpression?: string | null | undefined;
    scheduleTimezone?: string | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    sourceIssueId?: string | null | undefined;
    desiredSkills?: string[] | undefined;
    sourceIssueIds?: string[] | undefined;
}, {
    name: string;
    budgetMonthlyCents?: number | undefined;
    environment?: "live" | "simulation" | undefined;
    role?: "general" | "ceo" | "cto" | "cmo" | "cfo" | "engineer" | "designer" | "pm" | "qa" | "devops" | "researcher" | "auditor" | undefined;
    title?: string | null | undefined;
    icon?: "database" | "search" | "bot" | "cpu" | "brain" | "zap" | "rocket" | "code" | "terminal" | "shield" | "eye" | "wrench" | "hammer" | "lightbulb" | "sparkles" | "star" | "heart" | "flame" | "bug" | "cog" | "globe" | "lock" | "mail" | "message-square" | "file-code" | "git-branch" | "package" | "puzzle" | "target" | "wand" | "atom" | "circuit-board" | "radar" | "swords" | "telescope" | "microscope" | "crown" | "gem" | "hexagon" | "pentagon" | "fingerprint" | null | undefined;
    reportsTo?: string | null | undefined;
    capabilities?: string | null | undefined;
    adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | undefined;
    adapterConfig?: Record<string, unknown> | undefined;
    runtimeConfig?: Record<string, unknown> | undefined;
    permissions?: {
        canCreateAgents?: boolean | undefined;
    } | undefined;
    scheduleEnabled?: boolean | undefined;
    cronExpression?: string | null | undefined;
    scheduleTimezone?: string | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    sourceIssueId?: string | null | undefined;
    desiredSkills?: string[] | undefined;
    sourceIssueIds?: string[] | undefined;
}>;
export type CreateAgentHire = z.infer<typeof createAgentHireSchema>;
export declare const updateAgentSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    budgetMonthlyCents: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodNumber>>>;
    environment: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["simulation", "live"]>>>>;
    role: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["ceo", "cto", "cmo", "cfo", "engineer", "designer", "pm", "qa", "devops", "researcher", "auditor", "general"]>>>>;
    title: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodEnum<["bot", "cpu", "brain", "zap", "rocket", "code", "terminal", "shield", "eye", "search", "wrench", "hammer", "lightbulb", "sparkles", "star", "heart", "flame", "bug", "cog", "database", "globe", "lock", "mail", "message-square", "file-code", "git-branch", "package", "puzzle", "target", "wand", "atom", "circuit-board", "radar", "swords", "telescope", "microscope", "crown", "gem", "hexagon", "pentagon", "fingerprint"]>>>>;
    reportsTo: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    capabilities: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    adapterType: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["process", "http", "claude_local", "codex_local", "opencode_local", "pi_local", "cursor", "openclaw_gateway", "hermes_local", "hermes_advanced"]>>>>;
    adapterConfig: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>>>>;
    runtimeConfig: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>>;
    scheduleEnabled: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>>;
    cronExpression: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    scheduleTimezone: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>>;
    desiredSkills: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
} & {
    permissions: z.ZodOptional<z.ZodNever>;
    replaceAdapterConfig: z.ZodOptional<z.ZodBoolean>;
    status: z.ZodOptional<z.ZodEnum<["active", "paused", "idle", "running", "error", "pending_approval", "terminated"]>>;
    spentMonthlyCents: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    status?: "active" | "idle" | "pending_approval" | "error" | "running" | "paused" | "terminated" | undefined;
    budgetMonthlyCents?: number | undefined;
    spentMonthlyCents?: number | undefined;
    environment?: "live" | "simulation" | undefined;
    role?: "general" | "ceo" | "cto" | "cmo" | "cfo" | "engineer" | "designer" | "pm" | "qa" | "devops" | "researcher" | "auditor" | undefined;
    title?: string | null | undefined;
    icon?: "database" | "search" | "bot" | "cpu" | "brain" | "zap" | "rocket" | "code" | "terminal" | "shield" | "eye" | "wrench" | "hammer" | "lightbulb" | "sparkles" | "star" | "heart" | "flame" | "bug" | "cog" | "globe" | "lock" | "mail" | "message-square" | "file-code" | "git-branch" | "package" | "puzzle" | "target" | "wand" | "atom" | "circuit-board" | "radar" | "swords" | "telescope" | "microscope" | "crown" | "gem" | "hexagon" | "pentagon" | "fingerprint" | null | undefined;
    reportsTo?: string | null | undefined;
    capabilities?: string | null | undefined;
    adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | undefined;
    adapterConfig?: Record<string, unknown> | undefined;
    runtimeConfig?: Record<string, unknown> | undefined;
    permissions?: undefined;
    scheduleEnabled?: boolean | undefined;
    cronExpression?: string | null | undefined;
    scheduleTimezone?: string | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    desiredSkills?: string[] | undefined;
    replaceAdapterConfig?: boolean | undefined;
}, {
    name?: string | undefined;
    status?: "active" | "idle" | "pending_approval" | "error" | "running" | "paused" | "terminated" | undefined;
    budgetMonthlyCents?: number | undefined;
    spentMonthlyCents?: number | undefined;
    environment?: "live" | "simulation" | undefined;
    role?: "general" | "ceo" | "cto" | "cmo" | "cfo" | "engineer" | "designer" | "pm" | "qa" | "devops" | "researcher" | "auditor" | undefined;
    title?: string | null | undefined;
    icon?: "database" | "search" | "bot" | "cpu" | "brain" | "zap" | "rocket" | "code" | "terminal" | "shield" | "eye" | "wrench" | "hammer" | "lightbulb" | "sparkles" | "star" | "heart" | "flame" | "bug" | "cog" | "globe" | "lock" | "mail" | "message-square" | "file-code" | "git-branch" | "package" | "puzzle" | "target" | "wand" | "atom" | "circuit-board" | "radar" | "swords" | "telescope" | "microscope" | "crown" | "gem" | "hexagon" | "pentagon" | "fingerprint" | null | undefined;
    reportsTo?: string | null | undefined;
    capabilities?: string | null | undefined;
    adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | undefined;
    adapterConfig?: Record<string, unknown> | undefined;
    runtimeConfig?: Record<string, unknown> | undefined;
    permissions?: undefined;
    scheduleEnabled?: boolean | undefined;
    cronExpression?: string | null | undefined;
    scheduleTimezone?: string | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    desiredSkills?: string[] | undefined;
    replaceAdapterConfig?: boolean | undefined;
}>;
export type UpdateAgent = z.infer<typeof updateAgentSchema>;
export declare const updateAgentInstructionsPathSchema: z.ZodObject<{
    path: z.ZodNullable<z.ZodString>;
    adapterConfigKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path: string | null;
    adapterConfigKey?: string | undefined;
}, {
    path: string | null;
    adapterConfigKey?: string | undefined;
}>;
export type UpdateAgentInstructionsPath = z.infer<typeof updateAgentInstructionsPathSchema>;
export declare const createAgentKeySchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name?: string | undefined;
}>;
export type CreateAgentKey = z.infer<typeof createAgentKeySchema>;
export declare const wakeAgentSchema: z.ZodObject<{
    source: z.ZodDefault<z.ZodOptional<z.ZodEnum<["timer", "assignment", "on_demand", "automation"]>>>;
    triggerDetail: z.ZodOptional<z.ZodEnum<["manual", "ping", "callback", "system"]>>;
    reason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    payload: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    idempotencyKey: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    forceFreshSession: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>, boolean, unknown>;
    runMode: z.ZodDefault<z.ZodOptional<z.ZodEnum<["sim", "live"]>>>;
    runtimeRequirements: z.ZodNullable<z.ZodOptional<z.ZodObject<{
        objectiveClass: z.ZodNullable<z.ZodOptional<z.ZodEnum<["creative", "technical", "research", "ops", "mixed"]>>>;
        qualityTier: z.ZodNullable<z.ZodOptional<z.ZodEnum<["economy", "standard", "premium"]>>>;
        latencyTier: z.ZodNullable<z.ZodOptional<z.ZodEnum<["background", "interactive", "urgent"]>>>;
        budgetMode: z.ZodNullable<z.ZodOptional<z.ZodEnum<["min_cost", "balanced", "best_effort"]>>>;
        deploymentPreference: z.ZodNullable<z.ZodOptional<z.ZodEnum<["local_only", "cloud_only", "local_then_cloud", "cloud_then_local"]>>>;
        dataSensitivity: z.ZodNullable<z.ZodOptional<z.ZodEnum<["local_preferred", "cloud_allowed"]>>>;
        requiredCapabilities: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodEnum<["web", "files", "code", "image", "audio", "video"]>, "many">>>;
        manualOverride: z.ZodNullable<z.ZodOptional<z.ZodObject<{
            adapterType: z.ZodNullable<z.ZodOptional<z.ZodEnum<["process", "http", "claude_local", "codex_local", "opencode_local", "pi_local", "cursor", "openclaw_gateway", "hermes_local", "hermes_advanced"]>>>;
            provider: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            model: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            variant: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            cwd: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            deploymentTarget: z.ZodNullable<z.ZodOptional<z.ZodEnum<["local", "cloud"]>>>;
            contextTier: z.ZodNullable<z.ZodOptional<z.ZodEnum<["minimal", "role_aware", "project_aware", "engineering_full"]>>>;
            reasoningTier: z.ZodNullable<z.ZodOptional<z.ZodEnum<["low", "standard", "high"]>>>;
            workspaceMode: z.ZodNullable<z.ZodOptional<z.ZodEnum<["agent_home", "project_workspace"]>>>;
        }, "strict", z.ZodTypeAny, {
            adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | null | undefined;
            provider?: string | null | undefined;
            cwd?: string | null | undefined;
            model?: string | null | undefined;
            variant?: string | null | undefined;
            deploymentTarget?: "local" | "cloud" | null | undefined;
            contextTier?: "minimal" | "role_aware" | "project_aware" | "engineering_full" | null | undefined;
            reasoningTier?: "high" | "low" | "standard" | null | undefined;
            workspaceMode?: "project_workspace" | "agent_home" | null | undefined;
        }, {
            adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | null | undefined;
            provider?: string | null | undefined;
            cwd?: string | null | undefined;
            model?: string | null | undefined;
            variant?: string | null | undefined;
            deploymentTarget?: "local" | "cloud" | null | undefined;
            contextTier?: "minimal" | "role_aware" | "project_aware" | "engineering_full" | null | undefined;
            reasoningTier?: "high" | "low" | "standard" | null | undefined;
            workspaceMode?: "project_workspace" | "agent_home" | null | undefined;
        }>>>;
    }, "strict", z.ZodTypeAny, {
        objectiveClass?: "creative" | "technical" | "research" | "ops" | "mixed" | null | undefined;
        qualityTier?: "economy" | "standard" | "premium" | null | undefined;
        latencyTier?: "background" | "interactive" | "urgent" | null | undefined;
        budgetMode?: "min_cost" | "balanced" | "best_effort" | null | undefined;
        deploymentPreference?: "local_only" | "cloud_only" | "local_then_cloud" | "cloud_then_local" | null | undefined;
        dataSensitivity?: "local_preferred" | "cloud_allowed" | null | undefined;
        requiredCapabilities?: ("image" | "code" | "web" | "files" | "audio" | "video")[] | null | undefined;
        manualOverride?: {
            adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | null | undefined;
            provider?: string | null | undefined;
            cwd?: string | null | undefined;
            model?: string | null | undefined;
            variant?: string | null | undefined;
            deploymentTarget?: "local" | "cloud" | null | undefined;
            contextTier?: "minimal" | "role_aware" | "project_aware" | "engineering_full" | null | undefined;
            reasoningTier?: "high" | "low" | "standard" | null | undefined;
            workspaceMode?: "project_workspace" | "agent_home" | null | undefined;
        } | null | undefined;
    }, {
        objectiveClass?: "creative" | "technical" | "research" | "ops" | "mixed" | null | undefined;
        qualityTier?: "economy" | "standard" | "premium" | null | undefined;
        latencyTier?: "background" | "interactive" | "urgent" | null | undefined;
        budgetMode?: "min_cost" | "balanced" | "best_effort" | null | undefined;
        deploymentPreference?: "local_only" | "cloud_only" | "local_then_cloud" | "cloud_then_local" | null | undefined;
        dataSensitivity?: "local_preferred" | "cloud_allowed" | null | undefined;
        requiredCapabilities?: ("image" | "code" | "web" | "files" | "audio" | "video")[] | null | undefined;
        manualOverride?: {
            adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | null | undefined;
            provider?: string | null | undefined;
            cwd?: string | null | undefined;
            model?: string | null | undefined;
            variant?: string | null | undefined;
            deploymentTarget?: "local" | "cloud" | null | undefined;
            contextTier?: "minimal" | "role_aware" | "project_aware" | "engineering_full" | null | undefined;
            reasoningTier?: "high" | "low" | "standard" | null | undefined;
            workspaceMode?: "project_workspace" | "agent_home" | null | undefined;
        } | null | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    source: "on_demand" | "timer" | "assignment" | "automation";
    runMode: "live" | "sim";
    forceFreshSession: boolean;
    payload?: Record<string, unknown> | null | undefined;
    triggerDetail?: "manual" | "system" | "ping" | "callback" | undefined;
    reason?: string | null | undefined;
    idempotencyKey?: string | null | undefined;
    runtimeRequirements?: {
        objectiveClass?: "creative" | "technical" | "research" | "ops" | "mixed" | null | undefined;
        qualityTier?: "economy" | "standard" | "premium" | null | undefined;
        latencyTier?: "background" | "interactive" | "urgent" | null | undefined;
        budgetMode?: "min_cost" | "balanced" | "best_effort" | null | undefined;
        deploymentPreference?: "local_only" | "cloud_only" | "local_then_cloud" | "cloud_then_local" | null | undefined;
        dataSensitivity?: "local_preferred" | "cloud_allowed" | null | undefined;
        requiredCapabilities?: ("image" | "code" | "web" | "files" | "audio" | "video")[] | null | undefined;
        manualOverride?: {
            adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | null | undefined;
            provider?: string | null | undefined;
            cwd?: string | null | undefined;
            model?: string | null | undefined;
            variant?: string | null | undefined;
            deploymentTarget?: "local" | "cloud" | null | undefined;
            contextTier?: "minimal" | "role_aware" | "project_aware" | "engineering_full" | null | undefined;
            reasoningTier?: "high" | "low" | "standard" | null | undefined;
            workspaceMode?: "project_workspace" | "agent_home" | null | undefined;
        } | null | undefined;
    } | null | undefined;
}, {
    payload?: Record<string, unknown> | null | undefined;
    source?: "on_demand" | "timer" | "assignment" | "automation" | undefined;
    triggerDetail?: "manual" | "system" | "ping" | "callback" | undefined;
    reason?: string | null | undefined;
    idempotencyKey?: string | null | undefined;
    runMode?: "live" | "sim" | undefined;
    runtimeRequirements?: {
        objectiveClass?: "creative" | "technical" | "research" | "ops" | "mixed" | null | undefined;
        qualityTier?: "economy" | "standard" | "premium" | null | undefined;
        latencyTier?: "background" | "interactive" | "urgent" | null | undefined;
        budgetMode?: "min_cost" | "balanced" | "best_effort" | null | undefined;
        deploymentPreference?: "local_only" | "cloud_only" | "local_then_cloud" | "cloud_then_local" | null | undefined;
        dataSensitivity?: "local_preferred" | "cloud_allowed" | null | undefined;
        requiredCapabilities?: ("image" | "code" | "web" | "files" | "audio" | "video")[] | null | undefined;
        manualOverride?: {
            adapterType?: "process" | "http" | "claude_local" | "codex_local" | "opencode_local" | "pi_local" | "cursor" | "openclaw_gateway" | "hermes_local" | "hermes_advanced" | null | undefined;
            provider?: string | null | undefined;
            cwd?: string | null | undefined;
            model?: string | null | undefined;
            variant?: string | null | undefined;
            deploymentTarget?: "local" | "cloud" | null | undefined;
            contextTier?: "minimal" | "role_aware" | "project_aware" | "engineering_full" | null | undefined;
            reasoningTier?: "high" | "low" | "standard" | null | undefined;
            workspaceMode?: "project_workspace" | "agent_home" | null | undefined;
        } | null | undefined;
    } | null | undefined;
    forceFreshSession?: unknown;
}>;
export type WakeAgent = z.infer<typeof wakeAgentSchema>;
export declare const resetAgentSessionSchema: z.ZodObject<{
    taskKey: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    taskKey?: string | null | undefined;
}, {
    taskKey?: string | null | undefined;
}>;
export type ResetAgentSession = z.infer<typeof resetAgentSessionSchema>;
export declare const testAdapterEnvironmentSchema: z.ZodObject<{
    adapterConfig: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodRecord<z.ZodString, z.ZodUnknown>, Record<string, unknown>, Record<string, unknown>>>>;
}, "strip", z.ZodTypeAny, {
    adapterConfig: Record<string, unknown>;
}, {
    adapterConfig?: Record<string, unknown> | undefined;
}>;
export type TestAdapterEnvironment = z.infer<typeof testAdapterEnvironmentSchema>;
export declare const updateAgentPermissionsSchema: z.ZodObject<{
    canCreateAgents: z.ZodBoolean;
    canAssignTasks: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    canCreateAgents: boolean;
    canAssignTasks: boolean;
}, {
    canCreateAgents: boolean;
    canAssignTasks: boolean;
}>;
export type UpdateAgentPermissions = z.infer<typeof updateAgentPermissionsSchema>;
//# sourceMappingURL=agent.d.ts.map