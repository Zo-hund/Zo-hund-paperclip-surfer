import { z } from "zod";
export declare const portabilityIncludeSchema: z.ZodObject<{
    company: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    agents: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    projects: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    issues: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    skills: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    agents?: boolean | undefined;
    projects?: boolean | undefined;
    issues?: boolean | undefined;
    company?: boolean | undefined;
    skills?: boolean | undefined;
}, {
    agents?: boolean | undefined;
    projects?: boolean | undefined;
    issues?: boolean | undefined;
    company?: boolean | undefined;
    skills?: boolean | undefined;
}>;
export declare const portabilityEnvInputSchema: z.ZodObject<{
    key: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    agentSlug: z.ZodNullable<z.ZodString>;
    kind: z.ZodEnum<["secret", "plain"]>;
    requirement: z.ZodEnum<["required", "optional"]>;
    defaultValue: z.ZodNullable<z.ZodString>;
    portability: z.ZodEnum<["portable", "system_dependent"]>;
}, "strip", z.ZodTypeAny, {
    description: string | null;
    kind: "plain" | "secret";
    key: string;
    agentSlug: string | null;
    requirement: "required" | "optional";
    defaultValue: string | null;
    portability: "portable" | "system_dependent";
}, {
    description: string | null;
    kind: "plain" | "secret";
    key: string;
    agentSlug: string | null;
    requirement: "required" | "optional";
    defaultValue: string | null;
    portability: "portable" | "system_dependent";
}>;
export declare const portabilityFileEntrySchema: z.ZodUnion<[z.ZodString, z.ZodObject<{
    encoding: z.ZodLiteral<"base64">;
    data: z.ZodString;
    contentType: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    data: string;
    encoding: "base64";
    contentType?: string | null | undefined;
}, {
    data: string;
    encoding: "base64";
    contentType?: string | null | undefined;
}>]>;
export declare const portabilityCompanyManifestEntrySchema: z.ZodObject<{
    path: z.ZodString;
    name: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    brandColor: z.ZodNullable<z.ZodString>;
    logoPath: z.ZodNullable<z.ZodString>;
    requireBoardApprovalForNewAgents: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path: string;
    name: string;
    description: string | null;
    requireBoardApprovalForNewAgents: boolean;
    brandColor: string | null;
    logoPath: string | null;
}, {
    path: string;
    name: string;
    description: string | null;
    requireBoardApprovalForNewAgents: boolean;
    brandColor: string | null;
    logoPath: string | null;
}>;
export declare const portabilitySidebarOrderSchema: z.ZodObject<{
    agents: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    projects: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    agents: string[];
    projects: string[];
}, {
    agents?: string[] | undefined;
    projects?: string[] | undefined;
}>;
export declare const portabilityAgentManifestEntrySchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    skills: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    role: z.ZodString;
    title: z.ZodNullable<z.ZodString>;
    icon: z.ZodNullable<z.ZodString>;
    capabilities: z.ZodNullable<z.ZodString>;
    reportsToSlug: z.ZodNullable<z.ZodString>;
    adapterType: z.ZodString;
    adapterConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    runtimeConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    permissions: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    budgetMonthlyCents: z.ZodNumber;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    name: string;
    budgetMonthlyCents: number;
    role: string;
    title: string | null;
    icon: string | null;
    capabilities: string | null;
    adapterType: string;
    adapterConfig: Record<string, unknown>;
    runtimeConfig: Record<string, unknown>;
    permissions: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    slug: string;
    skills: string[];
    reportsToSlug: string | null;
}, {
    path: string;
    name: string;
    budgetMonthlyCents: number;
    role: string;
    title: string | null;
    icon: string | null;
    capabilities: string | null;
    adapterType: string;
    adapterConfig: Record<string, unknown>;
    runtimeConfig: Record<string, unknown>;
    permissions: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
    slug: string;
    reportsToSlug: string | null;
    skills?: string[] | undefined;
}>;
export declare const portabilitySkillManifestEntrySchema: z.ZodObject<{
    key: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    sourceType: z.ZodString;
    sourceLocator: z.ZodNullable<z.ZodString>;
    sourceRef: z.ZodNullable<z.ZodString>;
    trustLevel: z.ZodNullable<z.ZodString>;
    compatibility: z.ZodNullable<z.ZodString>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        kind: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
        kind: string;
    }, {
        path: string;
        kind: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    path: string;
    name: string;
    description: string | null;
    metadata: Record<string, unknown> | null;
    sourceType: string;
    key: string;
    slug: string;
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: string | null;
    compatibility: string | null;
    fileInventory: {
        path: string;
        kind: string;
    }[];
}, {
    path: string;
    name: string;
    description: string | null;
    metadata: Record<string, unknown> | null;
    sourceType: string;
    key: string;
    slug: string;
    sourceLocator: string | null;
    sourceRef: string | null;
    trustLevel: string | null;
    compatibility: string | null;
    fileInventory?: {
        path: string;
        kind: string;
    }[] | undefined;
}>;
export declare const portabilityProjectManifestEntrySchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    path: z.ZodString;
    description: z.ZodNullable<z.ZodString>;
    ownerAgentSlug: z.ZodNullable<z.ZodString>;
    leadAgentSlug: z.ZodNullable<z.ZodString>;
    targetDate: z.ZodNullable<z.ZodString>;
    color: z.ZodNullable<z.ZodString>;
    status: z.ZodNullable<z.ZodString>;
    executionWorkspacePolicy: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    workspaces: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        name: z.ZodString;
        sourceType: z.ZodNullable<z.ZodString>;
        repoUrl: z.ZodNullable<z.ZodString>;
        repoRef: z.ZodNullable<z.ZodString>;
        defaultRef: z.ZodNullable<z.ZodString>;
        visibility: z.ZodNullable<z.ZodString>;
        setupCommand: z.ZodNullable<z.ZodString>;
        cleanupCommand: z.ZodNullable<z.ZodString>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        isPrimary: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        name: string;
        metadata: Record<string, unknown> | null;
        sourceType: string | null;
        repoUrl: string | null;
        repoRef: string | null;
        defaultRef: string | null;
        visibility: string | null;
        setupCommand: string | null;
        cleanupCommand: string | null;
        isPrimary: boolean;
        key: string;
    }, {
        name: string;
        metadata: Record<string, unknown> | null;
        sourceType: string | null;
        repoUrl: string | null;
        repoRef: string | null;
        defaultRef: string | null;
        visibility: string | null;
        setupCommand: string | null;
        cleanupCommand: string | null;
        isPrimary: boolean;
        key: string;
    }>, "many">>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    name: string;
    description: string | null;
    status: string | null;
    metadata: Record<string, unknown> | null;
    targetDate: string | null;
    color: string | null;
    executionWorkspacePolicy: Record<string, unknown> | null;
    slug: string;
    ownerAgentSlug: string | null;
    leadAgentSlug: string | null;
    workspaces: {
        name: string;
        metadata: Record<string, unknown> | null;
        sourceType: string | null;
        repoUrl: string | null;
        repoRef: string | null;
        defaultRef: string | null;
        visibility: string | null;
        setupCommand: string | null;
        cleanupCommand: string | null;
        isPrimary: boolean;
        key: string;
    }[];
}, {
    path: string;
    name: string;
    description: string | null;
    status: string | null;
    metadata: Record<string, unknown> | null;
    targetDate: string | null;
    color: string | null;
    executionWorkspacePolicy: Record<string, unknown> | null;
    slug: string;
    ownerAgentSlug: string | null;
    leadAgentSlug: string | null;
    workspaces?: {
        name: string;
        metadata: Record<string, unknown> | null;
        sourceType: string | null;
        repoUrl: string | null;
        repoRef: string | null;
        defaultRef: string | null;
        visibility: string | null;
        setupCommand: string | null;
        cleanupCommand: string | null;
        isPrimary: boolean;
        key: string;
    }[] | undefined;
}>;
export declare const portabilityIssueRoutineTriggerManifestEntrySchema: z.ZodObject<{
    kind: z.ZodString;
    label: z.ZodNullable<z.ZodString>;
    enabled: z.ZodBoolean;
    cronExpression: z.ZodNullable<z.ZodString>;
    timezone: z.ZodNullable<z.ZodString>;
    signingMode: z.ZodNullable<z.ZodString>;
    replayWindowSec: z.ZodNullable<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    cronExpression: string | null;
    kind: string;
    label: string | null;
    enabled: boolean;
    timezone: string | null;
    signingMode: string | null;
    replayWindowSec: number | null;
}, {
    cronExpression: string | null;
    kind: string;
    label: string | null;
    enabled: boolean;
    timezone: string | null;
    signingMode: string | null;
    replayWindowSec: number | null;
}>;
export declare const portabilityIssueRoutineManifestEntrySchema: z.ZodObject<{
    concurrencyPolicy: z.ZodNullable<z.ZodString>;
    catchUpPolicy: z.ZodNullable<z.ZodString>;
    triggers: z.ZodDefault<z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        label: z.ZodNullable<z.ZodString>;
        enabled: z.ZodBoolean;
        cronExpression: z.ZodNullable<z.ZodString>;
        timezone: z.ZodNullable<z.ZodString>;
        signingMode: z.ZodNullable<z.ZodString>;
        replayWindowSec: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        cronExpression: string | null;
        kind: string;
        label: string | null;
        enabled: boolean;
        timezone: string | null;
        signingMode: string | null;
        replayWindowSec: number | null;
    }, {
        cronExpression: string | null;
        kind: string;
        label: string | null;
        enabled: boolean;
        timezone: string | null;
        signingMode: string | null;
        replayWindowSec: number | null;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    concurrencyPolicy: string | null;
    catchUpPolicy: string | null;
    triggers: {
        cronExpression: string | null;
        kind: string;
        label: string | null;
        enabled: boolean;
        timezone: string | null;
        signingMode: string | null;
        replayWindowSec: number | null;
    }[];
}, {
    concurrencyPolicy: string | null;
    catchUpPolicy: string | null;
    triggers?: {
        cronExpression: string | null;
        kind: string;
        label: string | null;
        enabled: boolean;
        timezone: string | null;
        signingMode: string | null;
        replayWindowSec: number | null;
    }[] | undefined;
}>;
export declare const portabilityIssueManifestEntrySchema: z.ZodObject<{
    slug: z.ZodString;
    identifier: z.ZodNullable<z.ZodString>;
    title: z.ZodString;
    path: z.ZodString;
    projectSlug: z.ZodNullable<z.ZodString>;
    projectWorkspaceKey: z.ZodNullable<z.ZodString>;
    assigneeAgentSlug: z.ZodNullable<z.ZodString>;
    description: z.ZodNullable<z.ZodString>;
    recurring: z.ZodDefault<z.ZodBoolean>;
    routine: z.ZodNullable<z.ZodObject<{
        concurrencyPolicy: z.ZodNullable<z.ZodString>;
        catchUpPolicy: z.ZodNullable<z.ZodString>;
        triggers: z.ZodDefault<z.ZodArray<z.ZodObject<{
            kind: z.ZodString;
            label: z.ZodNullable<z.ZodString>;
            enabled: z.ZodBoolean;
            cronExpression: z.ZodNullable<z.ZodString>;
            timezone: z.ZodNullable<z.ZodString>;
            signingMode: z.ZodNullable<z.ZodString>;
            replayWindowSec: z.ZodNullable<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            cronExpression: string | null;
            kind: string;
            label: string | null;
            enabled: boolean;
            timezone: string | null;
            signingMode: string | null;
            replayWindowSec: number | null;
        }, {
            cronExpression: string | null;
            kind: string;
            label: string | null;
            enabled: boolean;
            timezone: string | null;
            signingMode: string | null;
            replayWindowSec: number | null;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        concurrencyPolicy: string | null;
        catchUpPolicy: string | null;
        triggers: {
            cronExpression: string | null;
            kind: string;
            label: string | null;
            enabled: boolean;
            timezone: string | null;
            signingMode: string | null;
            replayWindowSec: number | null;
        }[];
    }, {
        concurrencyPolicy: string | null;
        catchUpPolicy: string | null;
        triggers?: {
            cronExpression: string | null;
            kind: string;
            label: string | null;
            enabled: boolean;
            timezone: string | null;
            signingMode: string | null;
            replayWindowSec: number | null;
        }[] | undefined;
    }>>;
    legacyRecurrence: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    status: z.ZodNullable<z.ZodString>;
    priority: z.ZodNullable<z.ZodString>;
    labelIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    billingCode: z.ZodNullable<z.ZodString>;
    executionWorkspaceSettings: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    assigneeAdapterOverrides: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    description: string | null;
    status: string | null;
    title: string;
    metadata: Record<string, unknown> | null;
    identifier: string | null;
    priority: string | null;
    billingCode: string | null;
    assigneeAdapterOverrides: Record<string, unknown> | null;
    executionWorkspaceSettings: Record<string, unknown> | null;
    slug: string;
    projectSlug: string | null;
    projectWorkspaceKey: string | null;
    assigneeAgentSlug: string | null;
    recurring: boolean;
    routine: {
        concurrencyPolicy: string | null;
        catchUpPolicy: string | null;
        triggers: {
            cronExpression: string | null;
            kind: string;
            label: string | null;
            enabled: boolean;
            timezone: string | null;
            signingMode: string | null;
            replayWindowSec: number | null;
        }[];
    } | null;
    legacyRecurrence: Record<string, unknown> | null;
    labelIds: string[];
}, {
    path: string;
    description: string | null;
    status: string | null;
    title: string;
    metadata: Record<string, unknown> | null;
    identifier: string | null;
    priority: string | null;
    billingCode: string | null;
    assigneeAdapterOverrides: Record<string, unknown> | null;
    executionWorkspaceSettings: Record<string, unknown> | null;
    slug: string;
    projectSlug: string | null;
    projectWorkspaceKey: string | null;
    assigneeAgentSlug: string | null;
    routine: {
        concurrencyPolicy: string | null;
        catchUpPolicy: string | null;
        triggers?: {
            cronExpression: string | null;
            kind: string;
            label: string | null;
            enabled: boolean;
            timezone: string | null;
            signingMode: string | null;
            replayWindowSec: number | null;
        }[] | undefined;
    } | null;
    legacyRecurrence: Record<string, unknown> | null;
    recurring?: boolean | undefined;
    labelIds?: string[] | undefined;
}>;
export declare const portabilityManifestSchema: z.ZodObject<{
    schemaVersion: z.ZodNumber;
    generatedAt: z.ZodString;
    source: z.ZodNullable<z.ZodObject<{
        companyId: z.ZodString;
        companyName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        companyId: string;
        companyName: string;
    }, {
        companyId: string;
        companyName: string;
    }>>;
    includes: z.ZodObject<{
        company: z.ZodBoolean;
        agents: z.ZodBoolean;
        projects: z.ZodBoolean;
        issues: z.ZodBoolean;
        skills: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        agents: boolean;
        projects: boolean;
        issues: boolean;
        company: boolean;
        skills: boolean;
    }, {
        agents: boolean;
        projects: boolean;
        issues: boolean;
        company: boolean;
        skills: boolean;
    }>;
    company: z.ZodNullable<z.ZodObject<{
        path: z.ZodString;
        name: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        brandColor: z.ZodNullable<z.ZodString>;
        logoPath: z.ZodNullable<z.ZodString>;
        requireBoardApprovalForNewAgents: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        path: string;
        name: string;
        description: string | null;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoPath: string | null;
    }, {
        path: string;
        name: string;
        description: string | null;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoPath: string | null;
    }>>;
    sidebar: z.ZodNullable<z.ZodObject<{
        agents: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        projects: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        agents: string[];
        projects: string[];
    }, {
        agents?: string[] | undefined;
        projects?: string[] | undefined;
    }>>;
    agents: z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        skills: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        role: z.ZodString;
        title: z.ZodNullable<z.ZodString>;
        icon: z.ZodNullable<z.ZodString>;
        capabilities: z.ZodNullable<z.ZodString>;
        reportsToSlug: z.ZodNullable<z.ZodString>;
        adapterType: z.ZodString;
        adapterConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        runtimeConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        permissions: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        budgetMonthlyCents: z.ZodNumber;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        name: string;
        budgetMonthlyCents: number;
        role: string;
        title: string | null;
        icon: string | null;
        capabilities: string | null;
        adapterType: string;
        adapterConfig: Record<string, unknown>;
        runtimeConfig: Record<string, unknown>;
        permissions: Record<string, unknown>;
        metadata: Record<string, unknown> | null;
        slug: string;
        skills: string[];
        reportsToSlug: string | null;
    }, {
        path: string;
        name: string;
        budgetMonthlyCents: number;
        role: string;
        title: string | null;
        icon: string | null;
        capabilities: string | null;
        adapterType: string;
        adapterConfig: Record<string, unknown>;
        runtimeConfig: Record<string, unknown>;
        permissions: Record<string, unknown>;
        metadata: Record<string, unknown> | null;
        slug: string;
        reportsToSlug: string | null;
        skills?: string[] | undefined;
    }>, "many">;
    skills: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        slug: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        sourceType: z.ZodString;
        sourceLocator: z.ZodNullable<z.ZodString>;
        sourceRef: z.ZodNullable<z.ZodString>;
        trustLevel: z.ZodNullable<z.ZodString>;
        compatibility: z.ZodNullable<z.ZodString>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        fileInventory: z.ZodDefault<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            kind: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: string;
            kind: string;
        }, {
            path: string;
            kind: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        name: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        sourceType: string;
        key: string;
        slug: string;
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: string | null;
        compatibility: string | null;
        fileInventory: {
            path: string;
            kind: string;
        }[];
    }, {
        path: string;
        name: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        sourceType: string;
        key: string;
        slug: string;
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: string | null;
        compatibility: string | null;
        fileInventory?: {
            path: string;
            kind: string;
        }[] | undefined;
    }>, "many">>;
    projects: z.ZodDefault<z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        path: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        ownerAgentSlug: z.ZodNullable<z.ZodString>;
        leadAgentSlug: z.ZodNullable<z.ZodString>;
        targetDate: z.ZodNullable<z.ZodString>;
        color: z.ZodNullable<z.ZodString>;
        status: z.ZodNullable<z.ZodString>;
        executionWorkspacePolicy: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        workspaces: z.ZodDefault<z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            name: z.ZodString;
            sourceType: z.ZodNullable<z.ZodString>;
            repoUrl: z.ZodNullable<z.ZodString>;
            repoRef: z.ZodNullable<z.ZodString>;
            defaultRef: z.ZodNullable<z.ZodString>;
            visibility: z.ZodNullable<z.ZodString>;
            setupCommand: z.ZodNullable<z.ZodString>;
            cleanupCommand: z.ZodNullable<z.ZodString>;
            metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            isPrimary: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            name: string;
            metadata: Record<string, unknown> | null;
            sourceType: string | null;
            repoUrl: string | null;
            repoRef: string | null;
            defaultRef: string | null;
            visibility: string | null;
            setupCommand: string | null;
            cleanupCommand: string | null;
            isPrimary: boolean;
            key: string;
        }, {
            name: string;
            metadata: Record<string, unknown> | null;
            sourceType: string | null;
            repoUrl: string | null;
            repoRef: string | null;
            defaultRef: string | null;
            visibility: string | null;
            setupCommand: string | null;
            cleanupCommand: string | null;
            isPrimary: boolean;
            key: string;
        }>, "many">>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        name: string;
        description: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        targetDate: string | null;
        color: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
        slug: string;
        ownerAgentSlug: string | null;
        leadAgentSlug: string | null;
        workspaces: {
            name: string;
            metadata: Record<string, unknown> | null;
            sourceType: string | null;
            repoUrl: string | null;
            repoRef: string | null;
            defaultRef: string | null;
            visibility: string | null;
            setupCommand: string | null;
            cleanupCommand: string | null;
            isPrimary: boolean;
            key: string;
        }[];
    }, {
        path: string;
        name: string;
        description: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        targetDate: string | null;
        color: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
        slug: string;
        ownerAgentSlug: string | null;
        leadAgentSlug: string | null;
        workspaces?: {
            name: string;
            metadata: Record<string, unknown> | null;
            sourceType: string | null;
            repoUrl: string | null;
            repoRef: string | null;
            defaultRef: string | null;
            visibility: string | null;
            setupCommand: string | null;
            cleanupCommand: string | null;
            isPrimary: boolean;
            key: string;
        }[] | undefined;
    }>, "many">>;
    issues: z.ZodDefault<z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        identifier: z.ZodNullable<z.ZodString>;
        title: z.ZodString;
        path: z.ZodString;
        projectSlug: z.ZodNullable<z.ZodString>;
        projectWorkspaceKey: z.ZodNullable<z.ZodString>;
        assigneeAgentSlug: z.ZodNullable<z.ZodString>;
        description: z.ZodNullable<z.ZodString>;
        recurring: z.ZodDefault<z.ZodBoolean>;
        routine: z.ZodNullable<z.ZodObject<{
            concurrencyPolicy: z.ZodNullable<z.ZodString>;
            catchUpPolicy: z.ZodNullable<z.ZodString>;
            triggers: z.ZodDefault<z.ZodArray<z.ZodObject<{
                kind: z.ZodString;
                label: z.ZodNullable<z.ZodString>;
                enabled: z.ZodBoolean;
                cronExpression: z.ZodNullable<z.ZodString>;
                timezone: z.ZodNullable<z.ZodString>;
                signingMode: z.ZodNullable<z.ZodString>;
                replayWindowSec: z.ZodNullable<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                cronExpression: string | null;
                kind: string;
                label: string | null;
                enabled: boolean;
                timezone: string | null;
                signingMode: string | null;
                replayWindowSec: number | null;
            }, {
                cronExpression: string | null;
                kind: string;
                label: string | null;
                enabled: boolean;
                timezone: string | null;
                signingMode: string | null;
                replayWindowSec: number | null;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            concurrencyPolicy: string | null;
            catchUpPolicy: string | null;
            triggers: {
                cronExpression: string | null;
                kind: string;
                label: string | null;
                enabled: boolean;
                timezone: string | null;
                signingMode: string | null;
                replayWindowSec: number | null;
            }[];
        }, {
            concurrencyPolicy: string | null;
            catchUpPolicy: string | null;
            triggers?: {
                cronExpression: string | null;
                kind: string;
                label: string | null;
                enabled: boolean;
                timezone: string | null;
                signingMode: string | null;
                replayWindowSec: number | null;
            }[] | undefined;
        }>>;
        legacyRecurrence: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        status: z.ZodNullable<z.ZodString>;
        priority: z.ZodNullable<z.ZodString>;
        labelIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        billingCode: z.ZodNullable<z.ZodString>;
        executionWorkspaceSettings: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        assigneeAdapterOverrides: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        description: string | null;
        status: string | null;
        title: string;
        metadata: Record<string, unknown> | null;
        identifier: string | null;
        priority: string | null;
        billingCode: string | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        slug: string;
        projectSlug: string | null;
        projectWorkspaceKey: string | null;
        assigneeAgentSlug: string | null;
        recurring: boolean;
        routine: {
            concurrencyPolicy: string | null;
            catchUpPolicy: string | null;
            triggers: {
                cronExpression: string | null;
                kind: string;
                label: string | null;
                enabled: boolean;
                timezone: string | null;
                signingMode: string | null;
                replayWindowSec: number | null;
            }[];
        } | null;
        legacyRecurrence: Record<string, unknown> | null;
        labelIds: string[];
    }, {
        path: string;
        description: string | null;
        status: string | null;
        title: string;
        metadata: Record<string, unknown> | null;
        identifier: string | null;
        priority: string | null;
        billingCode: string | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        slug: string;
        projectSlug: string | null;
        projectWorkspaceKey: string | null;
        assigneeAgentSlug: string | null;
        routine: {
            concurrencyPolicy: string | null;
            catchUpPolicy: string | null;
            triggers?: {
                cronExpression: string | null;
                kind: string;
                label: string | null;
                enabled: boolean;
                timezone: string | null;
                signingMode: string | null;
                replayWindowSec: number | null;
            }[] | undefined;
        } | null;
        legacyRecurrence: Record<string, unknown> | null;
        recurring?: boolean | undefined;
        labelIds?: string[] | undefined;
    }>, "many">>;
    envInputs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        description: z.ZodNullable<z.ZodString>;
        agentSlug: z.ZodNullable<z.ZodString>;
        kind: z.ZodEnum<["secret", "plain"]>;
        requirement: z.ZodEnum<["required", "optional"]>;
        defaultValue: z.ZodNullable<z.ZodString>;
        portability: z.ZodEnum<["portable", "system_dependent"]>;
    }, "strip", z.ZodTypeAny, {
        description: string | null;
        kind: "plain" | "secret";
        key: string;
        agentSlug: string | null;
        requirement: "required" | "optional";
        defaultValue: string | null;
        portability: "portable" | "system_dependent";
    }, {
        description: string | null;
        kind: "plain" | "secret";
        key: string;
        agentSlug: string | null;
        requirement: "required" | "optional";
        defaultValue: string | null;
        portability: "portable" | "system_dependent";
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    includes: {
        agents: boolean;
        projects: boolean;
        issues: boolean;
        company: boolean;
        skills: boolean;
    };
    agents: {
        path: string;
        name: string;
        budgetMonthlyCents: number;
        role: string;
        title: string | null;
        icon: string | null;
        capabilities: string | null;
        adapterType: string;
        adapterConfig: Record<string, unknown>;
        runtimeConfig: Record<string, unknown>;
        permissions: Record<string, unknown>;
        metadata: Record<string, unknown> | null;
        slug: string;
        skills: string[];
        reportsToSlug: string | null;
    }[];
    source: {
        companyId: string;
        companyName: string;
    } | null;
    projects: {
        path: string;
        name: string;
        description: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        targetDate: string | null;
        color: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
        slug: string;
        ownerAgentSlug: string | null;
        leadAgentSlug: string | null;
        workspaces: {
            name: string;
            metadata: Record<string, unknown> | null;
            sourceType: string | null;
            repoUrl: string | null;
            repoRef: string | null;
            defaultRef: string | null;
            visibility: string | null;
            setupCommand: string | null;
            cleanupCommand: string | null;
            isPrimary: boolean;
            key: string;
        }[];
    }[];
    issues: {
        path: string;
        description: string | null;
        status: string | null;
        title: string;
        metadata: Record<string, unknown> | null;
        identifier: string | null;
        priority: string | null;
        billingCode: string | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        slug: string;
        projectSlug: string | null;
        projectWorkspaceKey: string | null;
        assigneeAgentSlug: string | null;
        recurring: boolean;
        routine: {
            concurrencyPolicy: string | null;
            catchUpPolicy: string | null;
            triggers: {
                cronExpression: string | null;
                kind: string;
                label: string | null;
                enabled: boolean;
                timezone: string | null;
                signingMode: string | null;
                replayWindowSec: number | null;
            }[];
        } | null;
        legacyRecurrence: Record<string, unknown> | null;
        labelIds: string[];
    }[];
    company: {
        path: string;
        name: string;
        description: string | null;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoPath: string | null;
    } | null;
    sidebar: {
        agents: string[];
        projects: string[];
    } | null;
    skills: {
        path: string;
        name: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        sourceType: string;
        key: string;
        slug: string;
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: string | null;
        compatibility: string | null;
        fileInventory: {
            path: string;
            kind: string;
        }[];
    }[];
    schemaVersion: number;
    generatedAt: string;
    envInputs: {
        description: string | null;
        kind: "plain" | "secret";
        key: string;
        agentSlug: string | null;
        requirement: "required" | "optional";
        defaultValue: string | null;
        portability: "portable" | "system_dependent";
    }[];
}, {
    includes: {
        agents: boolean;
        projects: boolean;
        issues: boolean;
        company: boolean;
        skills: boolean;
    };
    agents: {
        path: string;
        name: string;
        budgetMonthlyCents: number;
        role: string;
        title: string | null;
        icon: string | null;
        capabilities: string | null;
        adapterType: string;
        adapterConfig: Record<string, unknown>;
        runtimeConfig: Record<string, unknown>;
        permissions: Record<string, unknown>;
        metadata: Record<string, unknown> | null;
        slug: string;
        reportsToSlug: string | null;
        skills?: string[] | undefined;
    }[];
    source: {
        companyId: string;
        companyName: string;
    } | null;
    company: {
        path: string;
        name: string;
        description: string | null;
        requireBoardApprovalForNewAgents: boolean;
        brandColor: string | null;
        logoPath: string | null;
    } | null;
    sidebar: {
        agents?: string[] | undefined;
        projects?: string[] | undefined;
    } | null;
    schemaVersion: number;
    generatedAt: string;
    projects?: {
        path: string;
        name: string;
        description: string | null;
        status: string | null;
        metadata: Record<string, unknown> | null;
        targetDate: string | null;
        color: string | null;
        executionWorkspacePolicy: Record<string, unknown> | null;
        slug: string;
        ownerAgentSlug: string | null;
        leadAgentSlug: string | null;
        workspaces?: {
            name: string;
            metadata: Record<string, unknown> | null;
            sourceType: string | null;
            repoUrl: string | null;
            repoRef: string | null;
            defaultRef: string | null;
            visibility: string | null;
            setupCommand: string | null;
            cleanupCommand: string | null;
            isPrimary: boolean;
            key: string;
        }[] | undefined;
    }[] | undefined;
    issues?: {
        path: string;
        description: string | null;
        status: string | null;
        title: string;
        metadata: Record<string, unknown> | null;
        identifier: string | null;
        priority: string | null;
        billingCode: string | null;
        assigneeAdapterOverrides: Record<string, unknown> | null;
        executionWorkspaceSettings: Record<string, unknown> | null;
        slug: string;
        projectSlug: string | null;
        projectWorkspaceKey: string | null;
        assigneeAgentSlug: string | null;
        routine: {
            concurrencyPolicy: string | null;
            catchUpPolicy: string | null;
            triggers?: {
                cronExpression: string | null;
                kind: string;
                label: string | null;
                enabled: boolean;
                timezone: string | null;
                signingMode: string | null;
                replayWindowSec: number | null;
            }[] | undefined;
        } | null;
        legacyRecurrence: Record<string, unknown> | null;
        recurring?: boolean | undefined;
        labelIds?: string[] | undefined;
    }[] | undefined;
    skills?: {
        path: string;
        name: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        sourceType: string;
        key: string;
        slug: string;
        sourceLocator: string | null;
        sourceRef: string | null;
        trustLevel: string | null;
        compatibility: string | null;
        fileInventory?: {
            path: string;
            kind: string;
        }[] | undefined;
    }[] | undefined;
    envInputs?: {
        description: string | null;
        kind: "plain" | "secret";
        key: string;
        agentSlug: string | null;
        requirement: "required" | "optional";
        defaultValue: string | null;
        portability: "portable" | "system_dependent";
    }[] | undefined;
}>;
export declare const portabilitySourceSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"inline">;
    rootPath: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    files: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
        encoding: z.ZodLiteral<"base64">;
        data: z.ZodString;
        contentType: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        data: string;
        encoding: "base64";
        contentType?: string | null | undefined;
    }, {
        data: string;
        encoding: "base64";
        contentType?: string | null | undefined;
    }>]>>;
}, "strip", z.ZodTypeAny, {
    type: "inline";
    files: Record<string, string | {
        data: string;
        encoding: "base64";
        contentType?: string | null | undefined;
    }>;
    rootPath?: string | null | undefined;
}, {
    type: "inline";
    files: Record<string, string | {
        data: string;
        encoding: "base64";
        contentType?: string | null | undefined;
    }>;
    rootPath?: string | null | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"github">;
    url: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "github";
    url: string;
}, {
    type: "github";
    url: string;
}>]>;
export declare const portabilityTargetSchema: z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{
    mode: z.ZodLiteral<"new_company">;
    newCompanyName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    mode: "new_company";
    newCompanyName?: string | null | undefined;
}, {
    mode: "new_company";
    newCompanyName?: string | null | undefined;
}>, z.ZodObject<{
    mode: z.ZodLiteral<"existing_company">;
    companyId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    mode: "existing_company";
    companyId: string;
}, {
    mode: "existing_company";
    companyId: string;
}>]>;
export declare const portabilityAgentSelectionSchema: z.ZodUnion<[z.ZodLiteral<"all">, z.ZodArray<z.ZodString, "many">]>;
export declare const portabilityCollisionStrategySchema: z.ZodEnum<["rename", "skip", "replace"]>;
export declare const companyPortabilityExportSchema: z.ZodObject<{
    include: z.ZodOptional<z.ZodObject<{
        company: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        agents: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        projects: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        issues: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        skills: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    }, {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    }>>;
    agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    projects: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    issues: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    projectIssues: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    selectedFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    expandReferencedSkills: z.ZodOptional<z.ZodBoolean>;
    sidebarOrder: z.ZodOptional<z.ZodObject<{
        agents: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
        projects: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    }, "strip", z.ZodTypeAny, {
        agents?: string[] | undefined;
        projects?: string[] | undefined;
    }, {
        agents?: string[] | undefined;
        projects?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    agents?: string[] | undefined;
    projects?: string[] | undefined;
    issues?: string[] | undefined;
    skills?: string[] | undefined;
    include?: {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    projectIssues?: string[] | undefined;
    selectedFiles?: string[] | undefined;
    expandReferencedSkills?: boolean | undefined;
    sidebarOrder?: {
        agents?: string[] | undefined;
        projects?: string[] | undefined;
    } | undefined;
}, {
    agents?: string[] | undefined;
    projects?: string[] | undefined;
    issues?: string[] | undefined;
    skills?: string[] | undefined;
    include?: {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    projectIssues?: string[] | undefined;
    selectedFiles?: string[] | undefined;
    expandReferencedSkills?: boolean | undefined;
    sidebarOrder?: {
        agents?: string[] | undefined;
        projects?: string[] | undefined;
    } | undefined;
}>;
export type CompanyPortabilityExport = z.infer<typeof companyPortabilityExportSchema>;
export declare const companyPortabilityPreviewSchema: z.ZodObject<{
    source: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"inline">;
        rootPath: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        files: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
            encoding: z.ZodLiteral<"base64">;
            data: z.ZodString;
            contentType: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }, {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>]>>;
    }, "strip", z.ZodTypeAny, {
        type: "inline";
        files: Record<string, string | {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    }, {
        type: "inline";
        files: Record<string, string | {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"github">;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "github";
        url: string;
    }, {
        type: "github";
        url: string;
    }>]>;
    include: z.ZodOptional<z.ZodObject<{
        company: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        agents: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        projects: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        issues: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        skills: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    }, {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    }>>;
    target: z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{
        mode: z.ZodLiteral<"new_company">;
        newCompanyName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    }, {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    }>, z.ZodObject<{
        mode: z.ZodLiteral<"existing_company">;
        companyId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        mode: "existing_company";
        companyId: string;
    }, {
        mode: "existing_company";
        companyId: string;
    }>]>;
    agents: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"all">, z.ZodArray<z.ZodString, "many">]>>;
    collisionStrategy: z.ZodOptional<z.ZodEnum<["rename", "skip", "replace"]>>;
    nameOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    selectedFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    source: {
        type: "inline";
        files: Record<string, string | {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    } | {
        type: "github";
        url: string;
    };
    target: {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    } | {
        mode: "existing_company";
        companyId: string;
    };
    agents?: string[] | "all" | undefined;
    include?: {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    selectedFiles?: string[] | undefined;
    collisionStrategy?: "replace" | "rename" | "skip" | undefined;
    nameOverrides?: Record<string, string> | undefined;
}, {
    source: {
        type: "inline";
        files: Record<string, string | {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    } | {
        type: "github";
        url: string;
    };
    target: {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    } | {
        mode: "existing_company";
        companyId: string;
    };
    agents?: string[] | "all" | undefined;
    include?: {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    selectedFiles?: string[] | undefined;
    collisionStrategy?: "replace" | "rename" | "skip" | undefined;
    nameOverrides?: Record<string, string> | undefined;
}>;
export type CompanyPortabilityPreview = z.infer<typeof companyPortabilityPreviewSchema>;
export declare const portabilityAdapterOverrideSchema: z.ZodObject<{
    adapterType: z.ZodString;
    adapterConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    adapterType: string;
    adapterConfig?: Record<string, unknown> | undefined;
}, {
    adapterType: string;
    adapterConfig?: Record<string, unknown> | undefined;
}>;
export declare const companyPortabilityImportSchema: z.ZodObject<{
    source: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        type: z.ZodLiteral<"inline">;
        rootPath: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        files: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodObject<{
            encoding: z.ZodLiteral<"base64">;
            data: z.ZodString;
            contentType: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }, {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>]>>;
    }, "strip", z.ZodTypeAny, {
        type: "inline";
        files: Record<string, string | {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    }, {
        type: "inline";
        files: Record<string, string | {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"github">;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "github";
        url: string;
    }, {
        type: "github";
        url: string;
    }>]>;
    include: z.ZodOptional<z.ZodObject<{
        company: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        agents: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        projects: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        issues: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
        skills: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    }, {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    }>>;
    target: z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{
        mode: z.ZodLiteral<"new_company">;
        newCompanyName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    }, {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    }>, z.ZodObject<{
        mode: z.ZodLiteral<"existing_company">;
        companyId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        mode: "existing_company";
        companyId: string;
    }, {
        mode: "existing_company";
        companyId: string;
    }>]>;
    agents: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"all">, z.ZodArray<z.ZodString, "many">]>>;
    collisionStrategy: z.ZodOptional<z.ZodEnum<["rename", "skip", "replace"]>>;
    nameOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    selectedFiles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    adapterOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        adapterType: z.ZodString;
        adapterConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        adapterType: string;
        adapterConfig?: Record<string, unknown> | undefined;
    }, {
        adapterType: string;
        adapterConfig?: Record<string, unknown> | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    source: {
        type: "inline";
        files: Record<string, string | {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    } | {
        type: "github";
        url: string;
    };
    target: {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    } | {
        mode: "existing_company";
        companyId: string;
    };
    agents?: string[] | "all" | undefined;
    include?: {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    selectedFiles?: string[] | undefined;
    collisionStrategy?: "replace" | "rename" | "skip" | undefined;
    nameOverrides?: Record<string, string> | undefined;
    adapterOverrides?: Record<string, {
        adapterType: string;
        adapterConfig?: Record<string, unknown> | undefined;
    }> | undefined;
}, {
    source: {
        type: "inline";
        files: Record<string, string | {
            data: string;
            encoding: "base64";
            contentType?: string | null | undefined;
        }>;
        rootPath?: string | null | undefined;
    } | {
        type: "github";
        url: string;
    };
    target: {
        mode: "new_company";
        newCompanyName?: string | null | undefined;
    } | {
        mode: "existing_company";
        companyId: string;
    };
    agents?: string[] | "all" | undefined;
    include?: {
        agents?: boolean | undefined;
        projects?: boolean | undefined;
        issues?: boolean | undefined;
        company?: boolean | undefined;
        skills?: boolean | undefined;
    } | undefined;
    selectedFiles?: string[] | undefined;
    collisionStrategy?: "replace" | "rename" | "skip" | undefined;
    nameOverrides?: Record<string, string> | undefined;
    adapterOverrides?: Record<string, {
        adapterType: string;
        adapterConfig?: Record<string, unknown> | undefined;
    }> | undefined;
}>;
export type CompanyPortabilityImport = z.infer<typeof companyPortabilityImportSchema>;
//# sourceMappingURL=company-portability.d.ts.map