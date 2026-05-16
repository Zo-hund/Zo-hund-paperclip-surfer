export declare const PROJECT_MENTION_SCHEME = "project://";
export declare const AGENT_MENTION_SCHEME = "agent://";
export interface ParsedProjectMention {
    projectId: string;
    color: string | null;
}
export interface ParsedAgentMention {
    agentId: string;
    icon: string | null;
}
export declare function buildProjectMentionHref(projectId: string, color?: string | null): string;
export declare function parseProjectMentionHref(href: string): ParsedProjectMention | null;
export declare function buildAgentMentionHref(agentId: string, icon?: string | null): string;
export declare function parseAgentMentionHref(href: string): ParsedAgentMention | null;
export declare function extractProjectMentionIds(markdown: string): string[];
export declare function extractAgentMentionIds(markdown: string): string[];
//# sourceMappingURL=project-mentions.d.ts.map