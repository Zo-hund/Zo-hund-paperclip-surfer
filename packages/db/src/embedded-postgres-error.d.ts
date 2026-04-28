export declare function createEmbeddedPostgresLogBuffer(limit?: number): {
    append(message: unknown): void;
    getRecentLogs(): string[];
};
export declare function formatEmbeddedPostgresError(error: unknown, input: {
    fallbackMessage: string;
    recentLogs?: string[];
}): Error;
//# sourceMappingURL=embedded-postgres-error.d.ts.map