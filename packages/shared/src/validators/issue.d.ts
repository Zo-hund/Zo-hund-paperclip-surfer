import { z } from "zod";
export declare const issueExecutionWorkspaceSettingsSchema: z.ZodObject<{
    mode: z.ZodOptional<z.ZodEnum<["inherit", "shared_workspace", "isolated_workspace", "operator_branch", "reuse_existing", "agent_default"]>>;
    workspaceStrategy: z.ZodNullable<z.ZodOptional<z.ZodObject<{
        type: z.ZodOptional<z.ZodEnum<["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]>>;
        baseRef: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        branchTemplate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        worktreeParentDir: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        provisionCommand: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        teardownCommand: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strict", z.ZodTypeAny, {
        type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
        baseRef?: string | null | undefined;
        branchTemplate?: string | null | undefined;
        worktreeParentDir?: string | null | undefined;
        provisionCommand?: string | null | undefined;
        teardownCommand?: string | null | undefined;
    }, {
        type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
        baseRef?: string | null | undefined;
        branchTemplate?: string | null | undefined;
        worktreeParentDir?: string | null | undefined;
        provisionCommand?: string | null | undefined;
        teardownCommand?: string | null | undefined;
    }>>>;
    workspaceRuntime: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strict", z.ZodTypeAny, {
    mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
    workspaceStrategy?: {
        type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
        baseRef?: string | null | undefined;
        branchTemplate?: string | null | undefined;
        worktreeParentDir?: string | null | undefined;
        provisionCommand?: string | null | undefined;
        teardownCommand?: string | null | undefined;
    } | null | undefined;
    workspaceRuntime?: Record<string, unknown> | null | undefined;
}, {
    mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
    workspaceStrategy?: {
        type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
        baseRef?: string | null | undefined;
        branchTemplate?: string | null | undefined;
        worktreeParentDir?: string | null | undefined;
        provisionCommand?: string | null | undefined;
        teardownCommand?: string | null | undefined;
    } | null | undefined;
    workspaceRuntime?: Record<string, unknown> | null | undefined;
}>;
export declare const issueAssigneeAdapterOverridesSchema: z.ZodObject<{
    adapterConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    useProjectWorkspace: z.ZodOptional<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    adapterConfig?: Record<string, unknown> | undefined;
    useProjectWorkspace?: boolean | undefined;
}, {
    adapterConfig?: Record<string, unknown> | undefined;
    useProjectWorkspace?: boolean | undefined;
}>;
export declare const issueRuntimeObjectiveClassSchema: z.ZodEnum<["creative", "technical", "research", "ops", "mixed"]>;
export declare const issueRuntimeQualityTierSchema: z.ZodEnum<["economy", "standard", "premium"]>;
export declare const issueRuntimeLatencyTierSchema: z.ZodEnum<["background", "interactive", "urgent"]>;
export declare const issueRuntimeBudgetModeSchema: z.ZodEnum<["min_cost", "balanced", "best_effort"]>;
export declare const issueRuntimeDeploymentPreferenceSchema: z.ZodEnum<["local_only", "cloud_only", "local_then_cloud", "cloud_then_local"]>;
export declare const issueRuntimeDataSensitivitySchema: z.ZodEnum<["local_preferred", "cloud_allowed"]>;
export declare const issueRuntimeCapabilitySchema: z.ZodEnum<["web", "files", "code", "image", "audio", "video"]>;
export declare const issueRuntimeContextTierSchema: z.ZodEnum<["minimal", "role_aware", "project_aware", "engineering_full"]>;
export declare const issueRuntimeReasoningTierSchema: z.ZodEnum<["low", "standard", "high"]>;
export declare const issueRuntimeWorkspaceModeSchema: z.ZodEnum<["agent_home", "project_workspace"]>;
export declare const issueRuntimeDeploymentTargetSchema: z.ZodEnum<["local", "cloud"]>;
export declare const issueRuntimeManualOverrideSchema: z.ZodObject<{
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
}>;
export declare const issueRuntimeRequirementsSchema: z.ZodObject<{
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
}>;
export declare const createIssueSchema: z.ZodObject<{
    projectId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    projectWorkspaceId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    goalId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    parentId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    title: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    status: z.ZodDefault<z.ZodOptional<z.ZodEnum<["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]>>>;
    priority: z.ZodDefault<z.ZodOptional<z.ZodEnum<["critical", "high", "medium", "low"]>>>;
    assigneeAgentId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    assigneeUserId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    requestDepth: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    billingCode: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    assigneeAdapterOverrides: z.ZodNullable<z.ZodOptional<z.ZodObject<{
        adapterConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        useProjectWorkspace: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        adapterConfig?: Record<string, unknown> | undefined;
        useProjectWorkspace?: boolean | undefined;
    }, {
        adapterConfig?: Record<string, unknown> | undefined;
        useProjectWorkspace?: boolean | undefined;
    }>>>;
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
    executionWorkspaceId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    executionWorkspacePreference: z.ZodNullable<z.ZodOptional<z.ZodEnum<["inherit", "shared_workspace", "isolated_workspace", "operator_branch", "reuse_existing", "agent_default"]>>>;
    executionWorkspaceSettings: z.ZodNullable<z.ZodOptional<z.ZodObject<{
        mode: z.ZodOptional<z.ZodEnum<["inherit", "shared_workspace", "isolated_workspace", "operator_branch", "reuse_existing", "agent_default"]>>;
        workspaceStrategy: z.ZodNullable<z.ZodOptional<z.ZodObject<{
            type: z.ZodOptional<z.ZodEnum<["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]>>;
            baseRef: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            branchTemplate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            worktreeParentDir: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            provisionCommand: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            teardownCommand: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        }, "strict", z.ZodTypeAny, {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        }, {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        }>>>;
        workspaceRuntime: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, "strict", z.ZodTypeAny, {
        mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
        workspaceStrategy?: {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        } | null | undefined;
        workspaceRuntime?: Record<string, unknown> | null | undefined;
    }, {
        mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
        workspaceStrategy?: {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        } | null | undefined;
        workspaceRuntime?: Record<string, unknown> | null | undefined;
    }>>>;
    labelIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status: "done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled";
    title: string;
    priority: "medium" | "critical" | "high" | "low";
    requestDepth: number;
    description?: string | null | undefined;
    parentId?: string | null | undefined;
    goalId?: string | null | undefined;
    projectId?: string | null | undefined;
    projectWorkspaceId?: string | null | undefined;
    assigneeAgentId?: string | null | undefined;
    assigneeUserId?: string | null | undefined;
    billingCode?: string | null | undefined;
    assigneeAdapterOverrides?: {
        adapterConfig?: Record<string, unknown> | undefined;
        useProjectWorkspace?: boolean | undefined;
    } | null | undefined;
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
    executionWorkspaceId?: string | null | undefined;
    executionWorkspacePreference?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | null | undefined;
    executionWorkspaceSettings?: {
        mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
        workspaceStrategy?: {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        } | null | undefined;
        workspaceRuntime?: Record<string, unknown> | null | undefined;
    } | null | undefined;
    labelIds?: string[] | undefined;
}, {
    title: string;
    description?: string | null | undefined;
    status?: "done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled" | undefined;
    parentId?: string | null | undefined;
    goalId?: string | null | undefined;
    projectId?: string | null | undefined;
    projectWorkspaceId?: string | null | undefined;
    priority?: "medium" | "critical" | "high" | "low" | undefined;
    assigneeAgentId?: string | null | undefined;
    assigneeUserId?: string | null | undefined;
    requestDepth?: number | undefined;
    billingCode?: string | null | undefined;
    assigneeAdapterOverrides?: {
        adapterConfig?: Record<string, unknown> | undefined;
        useProjectWorkspace?: boolean | undefined;
    } | null | undefined;
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
    executionWorkspaceId?: string | null | undefined;
    executionWorkspacePreference?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | null | undefined;
    executionWorkspaceSettings?: {
        mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
        workspaceStrategy?: {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        } | null | undefined;
        workspaceRuntime?: Record<string, unknown> | null | undefined;
    } | null | undefined;
    labelIds?: string[] | undefined;
}>;
export type CreateIssue = z.infer<typeof createIssueSchema>;
export declare const createIssueLabelSchema: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    color: string;
}, {
    name: string;
    color: string;
}>;
export type CreateIssueLabel = z.infer<typeof createIssueLabelSchema>;
export declare const updateIssueSchema: z.ZodObject<{
    projectId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    projectWorkspaceId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    goalId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    parentId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]>>>>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodEnum<["critical", "high", "medium", "low"]>>>>;
    assigneeAgentId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    assigneeUserId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    requestDepth: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodNumber>>>;
    billingCode: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    assigneeAdapterOverrides: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodObject<{
        adapterConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        useProjectWorkspace: z.ZodOptional<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        adapterConfig?: Record<string, unknown> | undefined;
        useProjectWorkspace?: boolean | undefined;
    }, {
        adapterConfig?: Record<string, unknown> | undefined;
        useProjectWorkspace?: boolean | undefined;
    }>>>>;
    runtimeRequirements: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodObject<{
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
    }>>>>;
    executionWorkspaceId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    executionWorkspacePreference: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodEnum<["inherit", "shared_workspace", "isolated_workspace", "operator_branch", "reuse_existing", "agent_default"]>>>>;
    executionWorkspaceSettings: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodObject<{
        mode: z.ZodOptional<z.ZodEnum<["inherit", "shared_workspace", "isolated_workspace", "operator_branch", "reuse_existing", "agent_default"]>>;
        workspaceStrategy: z.ZodNullable<z.ZodOptional<z.ZodObject<{
            type: z.ZodOptional<z.ZodEnum<["project_primary", "git_worktree", "adapter_managed", "cloud_sandbox"]>>;
            baseRef: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            branchTemplate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            worktreeParentDir: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            provisionCommand: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            teardownCommand: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        }, "strict", z.ZodTypeAny, {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        }, {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        }>>>;
        workspaceRuntime: z.ZodNullable<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    }, "strict", z.ZodTypeAny, {
        mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
        workspaceStrategy?: {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        } | null | undefined;
        workspaceRuntime?: Record<string, unknown> | null | undefined;
    }, {
        mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
        workspaceStrategy?: {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        } | null | undefined;
        workspaceRuntime?: Record<string, unknown> | null | undefined;
    }>>>>;
    labelIds: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
} & {
    comment: z.ZodOptional<z.ZodString>;
    reopen: z.ZodOptional<z.ZodBoolean>;
    hiddenAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    description?: string | null | undefined;
    status?: "done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled" | undefined;
    title?: string | undefined;
    parentId?: string | null | undefined;
    goalId?: string | null | undefined;
    projectId?: string | null | undefined;
    projectWorkspaceId?: string | null | undefined;
    priority?: "medium" | "critical" | "high" | "low" | undefined;
    assigneeAgentId?: string | null | undefined;
    assigneeUserId?: string | null | undefined;
    requestDepth?: number | undefined;
    billingCode?: string | null | undefined;
    assigneeAdapterOverrides?: {
        adapterConfig?: Record<string, unknown> | undefined;
        useProjectWorkspace?: boolean | undefined;
    } | null | undefined;
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
    executionWorkspaceId?: string | null | undefined;
    executionWorkspacePreference?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | null | undefined;
    executionWorkspaceSettings?: {
        mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
        workspaceStrategy?: {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        } | null | undefined;
        workspaceRuntime?: Record<string, unknown> | null | undefined;
    } | null | undefined;
    hiddenAt?: string | null | undefined;
    comment?: string | undefined;
    labelIds?: string[] | undefined;
    reopen?: boolean | undefined;
}, {
    description?: string | null | undefined;
    status?: "done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled" | undefined;
    title?: string | undefined;
    parentId?: string | null | undefined;
    goalId?: string | null | undefined;
    projectId?: string | null | undefined;
    projectWorkspaceId?: string | null | undefined;
    priority?: "medium" | "critical" | "high" | "low" | undefined;
    assigneeAgentId?: string | null | undefined;
    assigneeUserId?: string | null | undefined;
    requestDepth?: number | undefined;
    billingCode?: string | null | undefined;
    assigneeAdapterOverrides?: {
        adapterConfig?: Record<string, unknown> | undefined;
        useProjectWorkspace?: boolean | undefined;
    } | null | undefined;
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
    executionWorkspaceId?: string | null | undefined;
    executionWorkspacePreference?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | null | undefined;
    executionWorkspaceSettings?: {
        mode?: "shared_workspace" | "isolated_workspace" | "operator_branch" | "inherit" | "reuse_existing" | "agent_default" | undefined;
        workspaceStrategy?: {
            type?: "project_primary" | "git_worktree" | "adapter_managed" | "cloud_sandbox" | undefined;
            baseRef?: string | null | undefined;
            branchTemplate?: string | null | undefined;
            worktreeParentDir?: string | null | undefined;
            provisionCommand?: string | null | undefined;
            teardownCommand?: string | null | undefined;
        } | null | undefined;
        workspaceRuntime?: Record<string, unknown> | null | undefined;
    } | null | undefined;
    hiddenAt?: string | null | undefined;
    comment?: string | undefined;
    labelIds?: string[] | undefined;
    reopen?: boolean | undefined;
}>;
export type UpdateIssue = z.infer<typeof updateIssueSchema>;
export type IssueExecutionWorkspaceSettings = z.infer<typeof issueExecutionWorkspaceSettingsSchema>;
export type IssueRuntimeManualOverride = z.infer<typeof issueRuntimeManualOverrideSchema>;
export type IssueRuntimeRequirements = z.infer<typeof issueRuntimeRequirementsSchema>;
export declare const checkoutIssueSchema: z.ZodObject<{
    agentId: z.ZodString;
    expectedStatuses: z.ZodArray<z.ZodEnum<["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]>, "atleastone">;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    expectedStatuses: ["done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled", ...("done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled")[]];
}, {
    agentId: string;
    expectedStatuses: ["done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled", ...("done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled")[]];
}>;
export type CheckoutIssue = z.infer<typeof checkoutIssueSchema>;
export declare const addIssueCommentSchema: z.ZodObject<{
    body: z.ZodString;
    reopen: z.ZodOptional<z.ZodBoolean>;
    interrupt: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    body: string;
    reopen?: boolean | undefined;
    interrupt?: boolean | undefined;
}, {
    body: string;
    reopen?: boolean | undefined;
    interrupt?: boolean | undefined;
}>;
export type AddIssueComment = z.infer<typeof addIssueCommentSchema>;
export declare const linkIssueApprovalSchema: z.ZodObject<{
    approvalId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    approvalId: string;
}, {
    approvalId: string;
}>;
export type LinkIssueApproval = z.infer<typeof linkIssueApprovalSchema>;
export declare const createIssueAttachmentMetadataSchema: z.ZodObject<{
    issueCommentId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    issueCommentId?: string | null | undefined;
}, {
    issueCommentId?: string | null | undefined;
}>;
export type CreateIssueAttachmentMetadata = z.infer<typeof createIssueAttachmentMetadataSchema>;
export declare const ISSUE_DOCUMENT_FORMATS: readonly ["markdown"];
export declare const issueDocumentFormatSchema: z.ZodEnum<["markdown"]>;
export declare const issueDocumentKeySchema: z.ZodString;
export declare const upsertIssueDocumentSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    format: z.ZodEnum<["markdown"]>;
    body: z.ZodString;
    changeSummary: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    baseRevisionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    body: string;
    format: "markdown";
    title?: string | null | undefined;
    changeSummary?: string | null | undefined;
    baseRevisionId?: string | null | undefined;
}, {
    body: string;
    format: "markdown";
    title?: string | null | undefined;
    changeSummary?: string | null | undefined;
    baseRevisionId?: string | null | undefined;
}>;
export type IssueDocumentFormat = z.infer<typeof issueDocumentFormatSchema>;
export type UpsertIssueDocument = z.infer<typeof upsertIssueDocumentSchema>;
export declare const bulkUpdateIssueSchema: z.ZodObject<{
    ids: z.ZodArray<z.ZodString, "many">;
    update: z.ZodObject<{
        status: z.ZodOptional<z.ZodEnum<["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]>>;
        assigneeAgentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        assigneeUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        status?: "done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled" | undefined;
        assigneeAgentId?: string | null | undefined;
        assigneeUserId?: string | null | undefined;
    }, {
        status?: "done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled" | undefined;
        assigneeAgentId?: string | null | undefined;
        assigneeUserId?: string | null | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    update: {
        status?: "done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled" | undefined;
        assigneeAgentId?: string | null | undefined;
        assigneeUserId?: string | null | undefined;
    };
    ids: string[];
}, {
    update: {
        status?: "done" | "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "cancelled" | undefined;
        assigneeAgentId?: string | null | undefined;
        assigneeUserId?: string | null | undefined;
    };
    ids: string[];
}>;
export type BulkUpdateIssue = z.infer<typeof bulkUpdateIssueSchema>;
//# sourceMappingURL=issue.d.ts.map