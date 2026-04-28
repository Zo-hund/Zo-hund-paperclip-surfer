import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { applyPendingMigrations, ensurePostgresDatabase } from "./client.js";
let embeddedPostgresSupportPromise = null;
async function getEmbeddedPostgresCtor() {
    const mod = await import("embedded-postgres");
    return mod.default;
}
async function getAvailablePort() {
    return await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                server.close(() => reject(new Error("Failed to allocate test port")));
                return;
            }
            const { port } = address;
            server.close((error) => {
                if (error)
                    reject(error);
                else
                    resolve(port);
            });
        });
    });
}
function formatEmbeddedPostgresError(error) {
    if (error instanceof Error && error.message.length > 0)
        return error.message;
    if (typeof error === "string" && error.length > 0)
        return error;
    return "embedded Postgres startup failed";
}
async function probeEmbeddedPostgresSupport() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-embedded-postgres-probe-"));
    const port = await getAvailablePort();
    const EmbeddedPostgres = await getEmbeddedPostgresCtor();
    const instance = new EmbeddedPostgres({
        databaseDir: dataDir,
        user: "paperclip",
        password: "paperclip",
        port,
        persistent: true,
        initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
        onLog: () => { },
        onError: () => { },
    });
    try {
        await instance.initialise();
        await instance.start();
        return { supported: true };
    }
    catch (error) {
        return {
            supported: false,
            reason: formatEmbeddedPostgresError(error),
        };
    }
    finally {
        await instance.stop().catch(() => { });
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
}
export async function getEmbeddedPostgresTestSupport() {
    if (!embeddedPostgresSupportPromise) {
        embeddedPostgresSupportPromise = probeEmbeddedPostgresSupport();
    }
    return await embeddedPostgresSupportPromise;
}
export async function startEmbeddedPostgresTestDatabase(tempDirPrefix) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
    const port = await getAvailablePort();
    const EmbeddedPostgres = await getEmbeddedPostgresCtor();
    const instance = new EmbeddedPostgres({
        databaseDir: dataDir,
        user: "paperclip",
        password: "paperclip",
        port,
        persistent: true,
        initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
        onLog: () => { },
        onError: () => { },
    });
    try {
        await instance.initialise();
        await instance.start();
        const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/postgres`;
        await ensurePostgresDatabase(adminConnectionString, "paperclip");
        const connectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
        await applyPendingMigrations(connectionString);
        return {
            connectionString,
            cleanup: async () => {
                await instance.stop().catch(() => { });
                fs.rmSync(dataDir, { recursive: true, force: true });
            },
        };
    }
    catch (error) {
        await instance.stop().catch(() => { });
        fs.rmSync(dataDir, { recursive: true, force: true });
        throw new Error(`Failed to start embedded PostgreSQL test database: ${formatEmbeddedPostgresError(error)}`);
    }
}
//# sourceMappingURL=test-embedded-postgres.js.map