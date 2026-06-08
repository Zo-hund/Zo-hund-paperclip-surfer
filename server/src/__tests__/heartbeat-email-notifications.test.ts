import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents,
  companies,
  createDb,
  heartbeatRuns,
  heartbeatRunEvents,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { heartbeatService } from "../services/heartbeat.ts";

const sendEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../auth/email-service.js", () => ({
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres heartbeat email notification tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat run email notifications", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-heartbeat-email-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    sendEmailMock.mockClear();
    await db.delete(heartbeatRunEvents);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedRunFixture() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const runId = randomUUID();
    const now = new Date("2026-06-08T12:00:00.000Z");
    const issuePrefix = `C${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "AMX Air Hubs",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Super Email Agent",
      role: "notifier",
      status: "idle",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      invocationSource: "on_demand",
      triggerDetail: "manual trigger",
      status: "running",
      startedAt: now,
      updatedAt: now,
    });

    return { companyId, agentId, runId };
  }

  it("sends an email when a run is cancelled via cancelRun", async () => {
    const { runId } = await seedRunFixture();
    const heartbeat = heartbeatService(db);

    // Cancel the run (which will transition status to cancelled)
    await heartbeat.cancelRun(runId);

    // Wait for the async triggerRunEmailUpdate to execute
    await vi.waitFor(() => {
      expect(sendEmailMock).toHaveBeenCalled();
    }, { timeout: 2000 });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmailMock.mock.calls[0][0];
    expect(emailArgs.to).toBe("MARIODUERSON34@GMAIL.COM");
    expect(emailArgs.subject).toContain("[AMX Air Hubs] Run CANCELLED");
    expect(emailArgs.subject).toContain("Super Email Agent");
    expect(emailArgs.text).toContain("Status: CANCELLED");
    expect(emailArgs.html).toContain("AMX Air Hubs");
  });

  it("sends an email when a run is reaped (failed) via reapOrphanedRuns", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const runId = randomUUID();
    const now = new Date("2026-06-08T12:00:00.000Z");
    const issuePrefix = `C${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "AMX Air Hubs",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Super Email Agent",
      role: "notifier",
      status: "idle",
      adapterType: "codex_local", // Set to codex_local to allow process-based check
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(heartbeatRuns).values({
      id: runId,
      companyId,
      agentId,
      invocationSource: "on_demand",
      triggerDetail: "manual trigger",
      status: "running",
      processPid: 999_999_999, // Dead pid
      processLossRetryCount: 1, // Avoid queuing retries, just fail it
      startedAt: now,
      updatedAt: now,
    });

    const heartbeat = heartbeatService(db);
    const reapResult = await heartbeat.reapOrphanedRuns();
    expect(reapResult.reaped).toBe(1);

    // Wait for the async triggerRunEmailUpdate to execute
    await vi.waitFor(() => {
      expect(sendEmailMock).toHaveBeenCalled();
    }, { timeout: 2000 });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmailMock.mock.calls[0][0];
    expect(emailArgs.to).toBe("MARIODUERSON34@GMAIL.COM");
    expect(emailArgs.subject).toContain("[AMX Air Hubs] Run FAILED");
    expect(emailArgs.text).toContain("Status: FAILED");
  });
});
