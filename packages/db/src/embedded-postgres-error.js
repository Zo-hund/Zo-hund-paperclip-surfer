const DEFAULT_RECENT_LOG_LIMIT = 40;
const RECENT_LOG_SUMMARY_LINES = 8;
function toError(error, fallbackMessage) {
    if (error instanceof Error)
        return error;
    if (error === undefined)
        return new Error(fallbackMessage);
    if (typeof error === "string")
        return new Error(`${fallbackMessage}: ${error}`);
    try {
        return new Error(`${fallbackMessage}: ${JSON.stringify(error)}`);
    }
    catch {
        return new Error(`${fallbackMessage}: ${String(error)}`);
    }
}
function summarizeRecentLogs(recentLogs) {
    if (recentLogs.length === 0)
        return null;
    return recentLogs
        .slice(-RECENT_LOG_SUMMARY_LINES)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join(" | ");
}
function detectEmbeddedPostgresHint(recentLogs) {
    const haystack = recentLogs.join("\n").toLowerCase();
    if (!haystack.includes("could not create shared memory segment")) {
        return null;
    }
    return ("Embedded PostgreSQL bootstrap could not allocate shared memory. " +
        "On macOS, this usually means the host's kern.sysv.shm* limits are too low for another local PostgreSQL cluster. " +
        "Stop other local PostgreSQL servers or raise the shared-memory sysctls, then retry.");
}
export function createEmbeddedPostgresLogBuffer(limit = DEFAULT_RECENT_LOG_LIMIT) {
    const recentLogs = [];
    return {
        append(message) {
            const text = typeof message === "string"
                ? message
                : message instanceof Error
                    ? message.message
                    : String(message ?? "");
            for (const rawLine of text.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line)
                    continue;
                recentLogs.push(line);
                if (recentLogs.length > limit) {
                    recentLogs.splice(0, recentLogs.length - limit);
                }
            }
        },
        getRecentLogs() {
            return [...recentLogs];
        },
    };
}
export function formatEmbeddedPostgresError(error, input) {
    const baseError = toError(error, input.fallbackMessage);
    const recentLogs = input.recentLogs ?? [];
    const parts = [baseError.message];
    const hint = detectEmbeddedPostgresHint(recentLogs);
    const recentSummary = summarizeRecentLogs(recentLogs);
    if (hint) {
        parts.push(hint);
    }
    if (recentSummary) {
        parts.push(`Recent embedded Postgres logs: ${recentSummary}`);
    }
    return new Error(parts.join(" "));
}
//# sourceMappingURL=embedded-postgres-error.js.map