import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agentWakeupRequests,
  agents,
  companies,
  createDb,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { heartbeatService } from "../services/heartbeat.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres wakeup suppression tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat wakeup suppression", () => {
  let db!: ReturnType<typeof createDb>;
  let heartbeat!: ReturnType<typeof heartbeatService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-heartbeat-wakeup-suppression-");
    db = createDb(tempDb.connectionString);
    heartbeat = heartbeatService(db);
  }, 20_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedAgent() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CMO",
      role: "cmo",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    return { companyId, agentId };
  }

  it("skips non-timer wakeups when the agent has no actionable assigned work", async () => {
    const { companyId, agentId } = await seedAgent();

    const run = await heartbeat.wakeup(agentId, {
      source: "on_demand",
      triggerDetail: "system",
      reason: "status_check",
    });

    expect(run).toBeNull();

    const wakeups = await db
      .select()
      .from(agentWakeupRequests)
      .where(eq(agentWakeupRequests.companyId, companyId));
    expect(wakeups).toHaveLength(1);
    expect(wakeups[0]?.status).toBe("skipped");
    expect(wakeups[0]?.reason).toBe("no_actionable_work");

    const runs = await db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.companyId, companyId));
    expect(runs).toHaveLength(0);
  });

  it("suppresses repeated non-timer no-op wakeups during cooldown", async () => {
    const { companyId, agentId } = await seedAgent();
    const priorRunId = randomUUID();

    await db.insert(issues).values({
      id: randomUUID(),
      companyId,
      title: "Follow up on campaign",
      status: "todo",
      priority: "medium",
      assigneeAgentId: agentId,
      issueNumber: 1,
      identifier: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}-1`,
    });

    await db.insert(heartbeatRuns).values({
      id: priorRunId,
      companyId,
      agentId,
      invocationSource: "on_demand",
      triggerDetail: "manual",
      status: "succeeded",
      usageJson: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      contextSnapshot: { runtimeOutcome: "zero_token_noop" },
      startedAt: new Date(Date.now() - 90_000),
      finishedAt: new Date(Date.now() - 60_000),
    });

    const run = await heartbeat.wakeup(agentId, {
      source: "on_demand",
      triggerDetail: "system",
      reason: "follow_up",
    });

    expect(run).toBeNull();

    const wakeups = await db
      .select()
      .from(agentWakeupRequests)
      .where(eq(agentWakeupRequests.companyId, companyId))
      .orderBy(agentWakeupRequests.createdAt);
    expect(wakeups).toHaveLength(1);
    expect(wakeups[0]?.status).toBe("skipped");
    expect(wakeups[0]?.reason).toBe("noop_cooldown_active");
    expect((wakeups[0]?.payload as Record<string, unknown>)?.previousRunId).toBe(priorRunId);
  });

  it("still allows manual wakeups without issue context", async () => {
    const { companyId, agentId } = await seedAgent();

    const run = await heartbeat.wakeup(agentId, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "manual_check",
    });

    expect(run?.status).toBe("queued");

    const wakeups = await db
      .select()
      .from(agentWakeupRequests)
      .where(eq(agentWakeupRequests.companyId, companyId));
    expect(wakeups).toHaveLength(1);
    expect(["queued", "claimed"]).toContain(wakeups[0]?.status);
    expect(wakeups[0]?.reason).toBe("manual_check");
  });
});
