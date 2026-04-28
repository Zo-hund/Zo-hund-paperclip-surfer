export type EmbeddedPostgresTestSupport = {
    supported: boolean;
    reason?: string;
};
export type EmbeddedPostgresTestDatabase = {
    connectionString: string;
    cleanup(): Promise<void>;
};
export declare function getEmbeddedPostgresTestSupport(): Promise<EmbeddedPostgresTestSupport>;
export declare function startEmbeddedPostgresTestDatabase(tempDirPrefix: string): Promise<EmbeddedPostgresTestDatabase>;
//# sourceMappingURL=test-embedded-postgres.d.ts.map