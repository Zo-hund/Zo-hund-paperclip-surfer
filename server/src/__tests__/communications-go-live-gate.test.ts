import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  activityLog,
  agents,
  amxTransactions,
  authUsers,
  companies,
  companySkills,
  createDb,
  issueWorkProducts,
  issues,
  heartbeatRuns,
  heartbeatRunEvents,
  agentChatMessages,
  agentWakeupRequests,
  agentTaskSessions,
  agentRuntimeState,
  agentMemories,
  marketplaceListings,
  marketplaceProfiles,
  meetingOutcomes,
  meetingParticipants,
  meetingTranscripts,
  meetings,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { marketplaceRoutes } from "../routes/marketplace.js";
import { issueRoutes } from "../routes/issues.js";
import { meetingsRouter } from "../routes/meetings.js";
import { agentChatRoutes } from "../routes/agent-chat.js";
import { mcpServerRoutes } from "../routes/mcp-servers.js";
import { marketplaceService } from "../services/marketplace.js";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: sendMock,
    },
  })),
}));

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

const REQUIRED_MICROSERVICE_SKILLS = [
  "image-microservice-router",
  "video-microservice-router",
  "audio-microservice-router",
  "ondemand-webhook-intake",
  "livekit-tools-router",
] as const;

type WakeupCall = {
  agentId: string;
  opts: Record<string, unknown> | undefined;
};

describeEmbeddedPostgres("communications go-live gate", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const wakeups: WakeupCall[] = [];

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-communications-gate-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  beforeEach(() => {
    wakeups.length = 0;
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: `email-${Date.now()}` }, error: null });
    process.env.RESEND_API_KEY = "re_test";
    process.env.PAPERCLIP_EMAIL_FROM = "onboarding@amx-air-hubs.cc";
    process.env.PAPERCLIP_EMAIL_REPLY_TO = "support@amx-air-hubs.cc";
  });

  afterEach(async () => {
    await db.delete(meetingOutcomes);
    await db.delete(meetingTranscripts);
    await db.delete(meetingParticipants);
    await db.delete(meetings);
    await db.delete(agentChatMessages);
    await db.delete(agentTaskSessions);
    await db.delete(agentMemories);
    await db.delete(agentRuntimeState);
    await db.delete(issueWorkProducts);
    await db.delete(issues);
    await db.delete(heartbeatRunEvents);
    await db.delete(heartbeatRuns);
    await db.delete(agentWakeupRequests);
    await db.delete(amxTransactions);
    await db.delete(activityLog);
    await db.delete(agents);
    await db.delete(marketplaceListings);
    await db.delete(marketplaceProfiles);
    await db.delete(companySkills);
    await db.delete(authUsers);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  function createApp(userId: string, companyId: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        userId,
        source: "local_implicit",
        companyIds: [companyId],
        isInstanceAdmin: true,
      };
      next();
    });

    app.use("/api", marketplaceRoutes(db));
    app.use("/api", issueRoutes(db, {} as any));
    app.use("/api/meetings", meetingsRouter(db, {
      wakeup: async (agentId: string, opts?: Record<string, unknown>) => {
        wakeups.push({ agentId, opts });
      },
    }));
    app.use("/api/agents/:agentId/chat", agentChatRoutes(db));
    app.use("/api", mcpServerRoutes(db));
    app.use(errorHandler);
    return app;
  }

  async function seedFixture() {
    const companyId = randomUUID();
    const userId = randomUUID();
    const svc = marketplaceService(db);

    await db.insert(companies).values({
      id: companyId,
      name: "AMX Communications Gate",
      issuePrefix: "AMXGATE",
      issueCounter: 0,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(authUsers).values({
      id: userId,
      name: "Board User",
      email: "board@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await svc.ensureProfile(userId, { displayName: "Board User" });
    await svc.ensureAmxMicroservicesProviderListing(companyId);

    const seededAgents = [
      { id: randomUUID(), name: "CEO", role: "ceo" },
      { id: randomUUID(), name: "CMO", role: "cmo" },
      { id: randomUUID(), name: "COO", role: "coo" },
      { id: randomUUID(), name: "CTO", role: "cto" },
      { id: randomUUID(), name: "Designer-One", role: "designer" },
      { id: randomUUID(), name: "Auditor-One", role: "auditor" },
      { id: randomUUID(), name: "Sales-Lead", role: "general" },
      { id: randomUUID(), name: "Ops-Lead", role: "general" },
      { id: randomUUID(), name: "Product-Lead", role: "general" },
      { id: randomUUID(), name: "Support-Lead", role: "general" },
    ] as const;

    await db.insert(agents).values(
      seededAgents.map((agent, index) => ({
        id: agent.id,
        companyId,
        name: agent.name,
        role: agent.role,
        status: "active",
        adapterType: "opencode_local",
        adapterConfig: {
          cwd: process.cwd(),
          model: "google/gemini-2.5-flash",
          paperclipSkillSync: {
            desiredSkills: [
              "paperclipai/paperclip/firecrawl",
              ...REQUIRED_MICROSERVICE_SKILLS.map((slug) => `company/${companyId}/${slug}`),
            ],
          },
        },
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            wakeOnDemand: true,
            intervalSec: 3600,
            cooldownSec: 10,
            maxConcurrentRuns: 1,
          },
        },
        permissions: {},
        reportsTo: index === 0 ? null : seededAgents[0]!.id,
      })),
    );

    const listing = await db
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.companyId, companyId),
          eq(marketplaceListings.providerUserId, "amx-microservices-provider"),
          eq(marketplaceListings.name, "amx-microservices-provider"),
        ),
      )
      .then((rows) => rows[0]!);

    return { companyId, userId, agents: seededAgents, listingId: listing.id };
  }

  it("validates communications orchestration and emits a strict go-live checklist", async () => {
    const fixture = await seedFixture();
    const app = createApp(fixture.userId, fixture.companyId);

    const coreCohort = fixture.agents.filter((agent) =>
      ["ceo", "cmo", "coo", "cto", "designer", "auditor"].includes(agent.role),
    );
    const smokeAgents = fixture.agents.filter((agent) => !coreCohort.some((core) => core.id === agent.id));

    const checklist: Array<{ item: string; pass: boolean; details: string }> = [];

    for (const agent of coreCohort) {
      const postMessage = await request(app)
        .post(`/api/agents/${agent.id}/chat/messages`)
        .send({ content: `Internal comm check for ${agent.name}` });
      checklist.push({
        item: `chat.message.${agent.name}`,
        pass: postMessage.status === 201,
        details: `status=${postMessage.status}`,
      });
      expect(postMessage.status, JSON.stringify(postMessage.body)).toBe(201);

      const createWorkOrder = await request(app)
        .post(`/api/agents/${agent.id}/chat/work-orders`)
        .send({
          title: `[COMM] ${agent.name} action`,
          description: "Validate actionable work-order creation from dashboard chat.",
          priority: "high",
          assigneeAgentId: agent.id,
          chatMessageId: postMessage.body.id,
        });
      checklist.push({
        item: `chat.workOrder.${agent.name}`,
        pass: createWorkOrder.status === 201,
        details: `status=${createWorkOrder.status}`,
      });
      expect(createWorkOrder.status, JSON.stringify(createWorkOrder.body)).toBe(201);
    }

    const meetingCreate = await request(app).post("/api/meetings").send({
      companyId: fixture.companyId,
      title: "Comms Cockpit Validation Session",
      type: "board_meet",
    });
    checklist.push({
      item: "meeting.create",
      pass: meetingCreate.status === 200,
      details: `status=${meetingCreate.status}`,
    });
    expect(meetingCreate.status, JSON.stringify(meetingCreate.body)).toBe(200);
    const meetingId = meetingCreate.body.id as string;

    const inviteRes = await request(app)
      .post(`/api/meetings/${meetingId}/invite`)
      .send({ agentId: coreCohort[1]!.id });
    checklist.push({
      item: "meeting.invite",
      pass: inviteRes.status === 200,
      details: `status=${inviteRes.status}`,
    });
    expect(inviteRes.status, JSON.stringify(inviteRes.body)).toBe(200);

    const transcriptCommand = await request(app)
      .post(`/api/meetings/${meetingId}/transcript`)
      .send({
        actorType: "user",
        actorId: fixture.userId,
        text: "/task Publish internal/external communication brief",
      });
    checklist.push({
      item: "meeting.transcript.command",
      pass: transcriptCommand.status === 200,
      details: `status=${transcriptCommand.status}`,
    });
    expect(transcriptCommand.status, JSON.stringify(transcriptCommand.body)).toBe(200);

    const transcriptMention = await request(app)
      .post(`/api/meetings/${meetingId}/transcript`)
      .send({
        actorType: "user",
        actorId: fixture.userId,
        text: "@CMO prepare executive communication package",
      });
    checklist.push({
      item: "meeting.transcript.mention",
      pass: transcriptMention.status === 200,
      details: `status=${transcriptMention.status}`,
    });
    expect(transcriptMention.status, JSON.stringify(transcriptMention.body)).toBe(200);

    const outcomesRes = await request(app).get(`/api/meetings/${meetingId}/outcomes`);
    checklist.push({
      item: "meeting.outcomes.persisted",
      pass: outcomesRes.status === 200 && Array.isArray(outcomesRes.body) && outcomesRes.body.length > 0,
      details: `status=${outcomesRes.status}; count=${Array.isArray(outcomesRes.body) ? outcomesRes.body.length : 0}`,
    });
    expect(outcomesRes.status).toBe(200);
    expect(Array.isArray(outcomesRes.body)).toBe(true);
    expect(outcomesRes.body.some((row: { type?: string }) => row.type === "action_item")).toBe(true);

    checklist.push({
      item: "heartbeat.wakeup.from.meeting.mention",
      pass: wakeups.some((wake) => wake.agentId === coreCohort[1]!.id),
      details: `wakeups=${wakeups.length}`,
    });
    expect(wakeups.some((wake) => wake.agentId === coreCohort[1]!.id)).toBe(true);

    const createMcpServer = await request(app)
      .post(`/api/companies/${fixture.companyId}/mcp-servers`)
      .send({
        name: "test-stdio-mcp",
        description: "Communication tool server",
        transportType: "stdio",
        command: "node",
        args: ["-e", "process.stdout.write('ok')"],
      });
    checklist.push({
      item: "mcp.create",
      pass: createMcpServer.status === 201,
      details: `status=${createMcpServer.status}`,
    });
    expect(createMcpServer.status, JSON.stringify(createMcpServer.body)).toBe(201);
    const mcpServerId = createMcpServer.body.id as string;

    const listMcpServer = await request(app).get(`/api/companies/${fixture.companyId}/mcp-servers`);
    checklist.push({
      item: "mcp.list",
      pass: listMcpServer.status === 200 && Array.isArray(listMcpServer.body),
      details: `status=${listMcpServer.status}`,
    });
    expect(listMcpServer.status).toBe(200);
    expect(Array.isArray(listMcpServer.body)).toBe(true);

    const addExclusion = await request(app)
      .post(`/api/agents/${coreCohort[0]!.id}/mcp-exclusions`)
      .send({ mcpServerId });
    checklist.push({
      item: "mcp.exclusion.add",
      pass: addExclusion.status === 201,
      details: `status=${addExclusion.status}`,
    });
    expect(addExclusion.status, JSON.stringify(addExclusion.body)).toBe(201);

    const removeExclusion = await request(app)
      .delete(`/api/agents/${coreCohort[0]!.id}/mcp-exclusions/${mcpServerId}`);
    checklist.push({
      item: "mcp.exclusion.remove",
      pass: removeExclusion.status === 200,
      details: `status=${removeExclusion.status}`,
    });
    expect(removeExclusion.status, JSON.stringify(removeExclusion.body)).toBe(200);

    const syncMcp = await request(app).post(`/api/companies/${fixture.companyId}/mcp-servers/sync`).send({});
    checklist.push({
      item: "mcp.sync",
      pass: syncMcp.status === 200,
      details: `status=${syncMcp.status}`,
    });
    expect(syncMcp.status, JSON.stringify(syncMcp.body)).toBe(200);

    const patchMcp = await request(app)
      .patch(`/api/companies/${fixture.companyId}/mcp-servers/${mcpServerId}`)
      .send({ description: "patched comms server", enabled: true });
    checklist.push({
      item: "mcp.patch",
      pass: patchMcp.status === 200,
      details: `status=${patchMcp.status}`,
    });
    expect(patchMcp.status, JSON.stringify(patchMcp.body)).toBe(200);

    const deleteMcp = await request(app)
      .delete(`/api/companies/${fixture.companyId}/mcp-servers/${mcpServerId}`);
    checklist.push({
      item: "mcp.delete",
      pass: deleteMcp.status === 200,
      details: `status=${deleteMcp.status}`,
    });
    expect(deleteMcp.status, JSON.stringify(deleteMcp.body)).toBe(200);

    const bookingRes = await request(app)
      .post(`/api/companies/${fixture.companyId}/amx/microservice-bookings`)
      .send({
        listingId: fixture.listingId,
        hours: 1,
        runPhase: "simulation",
        taskType: "image_generate",
        title: "Comms media run",
        instructions: "Generate controlled communications visuals.",
        assignedAgentId: coreCohort[1]!.id,
        clientName: "Internal Comms",
        clientEmail: "community@amx-air-hubs.cc",
        clientCompany: "AMX Community",
      });
    checklist.push({
      item: "microservice.booking",
      pass: bookingRes.status === 201,
      details: `status=${bookingRes.status}`,
    });
    expect(bookingRes.status, JSON.stringify(bookingRes.body)).toBe(201);
    const issueId = bookingRes.body.issue.id as string;

    const updateWorkOrder = await request(app)
      .put(`/api/issues/${issueId}/microservice-work-order`)
      .send({
        currentStage: "production",
        preProductionNotes: "Pre-production alignment complete.",
        productionNotes: "Production comms render executing.",
      });
    checklist.push({
      item: "microservice.stage.production",
      pass: updateWorkOrder.status === 200,
      details: `status=${updateWorkOrder.status}`,
    });
    expect(updateWorkOrder.status, JSON.stringify(updateWorkOrder.body)).toBe(200);

    const postTimeCard = await request(app)
      .post(`/api/issues/${issueId}/microservice-work-order/time-cards`)
      .send({
        phase: "post_generation",
        title: "Post QA",
        hours: 0.5,
        notes: "Post-generation review and delivery prep.",
      });
    checklist.push({
      item: "microservice.timecard.post_generation",
      pass: postTimeCard.status === 201,
      details: `status=${postTimeCard.status}`,
    });
    expect(postTimeCard.status, JSON.stringify(postTimeCard.body)).toBe(201);

    const sendClientUpdate = await request(app)
      .post(`/api/issues/${issueId}/microservice-client-update`)
      .send({
        stage: "post_generation",
        intro: "Controlled-mode update for communications validation.",
        nextStep: "Awaiting internal board sign-off only.",
      });
    checklist.push({
      item: "microservice.client_update",
      pass: sendClientUpdate.status === 201,
      details: `status=${sendClientUpdate.status}`,
    });
    expect(sendClientUpdate.status, JSON.stringify(sendClientUpdate.body)).toBe(201);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const getWorkOrder = await request(app).get(`/api/issues/${issueId}/microservice-work-order`);
    checklist.push({
      item: "microservice.lineage.persisted",
      pass: getWorkOrder.status === 200,
      details: `status=${getWorkOrder.status}`,
    });
    expect(getWorkOrder.status).toBe(200);
    const metadata = getWorkOrder.body.metadata as Record<string, unknown>;
    expect(metadata?.task).toBeTruthy();
    expect((metadata?.tracking as Record<string, unknown>)?.currentStage).toBe("post_generation");
    expect(Array.isArray((metadata?.timeCards as unknown[]))).toBe(true);
    expect(Array.isArray((metadata?.emailLog as unknown[]))).toBe(true);

    for (const agent of smokeAgents) {
      const detail = await db.select().from(agents).where(eq(agents.id, agent.id)).then((rows) => rows[0]!);
      const desiredSkills = (
        ((detail.adapterConfig as any)?.paperclipSkillSync?.desiredSkills ?? []) as string[]
      );
      const hasSkillBundle = REQUIRED_MICROSERVICE_SKILLS.every((slug) =>
        desiredSkills.some((skill) => skill.endsWith(`/${slug}`)),
      );
      checklist.push({
        item: `smoke.skills.${agent.name}`,
        pass: hasSkillBundle,
        details: `skills=${desiredSkills.length}`,
      });
      expect(hasSkillBundle).toBe(true);

      const hb = ((detail.runtimeConfig as any)?.heartbeat ?? {}) as Record<string, unknown>;
      const wakeReady = hb.enabled === true && hb.wakeOnDemand === true;
      checklist.push({
        item: `smoke.heartbeat.${agent.name}`,
        pass: wakeReady,
        details: `enabled=${String(hb.enabled)}; wakeOnDemand=${String(hb.wakeOnDemand)}`,
      });
      expect(wakeReady).toBe(true);

      const chatAccess = await request(app).get(`/api/agents/${agent.id}/chat/messages?limit=5`);
      checklist.push({
        item: `smoke.chat_access.${agent.name}`,
        pass: chatAccess.status === 200,
        details: `status=${chatAccess.status}`,
      });
      expect(chatAccess.status).toBe(200);
    }

    const failed = checklist.filter((item) => !item.pass);
    const gate = failed.length === 0 ? "GO" : "BLOCKED";
    const report = [
      "# Communications Go-Live Gate Report",
      "",
      `- Gate Decision: **${gate}**`,
      `- Company: \`${fixture.companyId}\``,
      `- Core Cohort: ${coreCohort.map((a) => a.name).join(", ")}`,
      `- Smoke Agents: ${smokeAgents.map((a) => a.name).join(", ")}`,
      "",
      "## Checklist",
      ...checklist.map((item) => `- [${item.pass ? "x" : " "}] ${item.item} (${item.details})`),
      "",
      failed.length === 0
        ? "## Blockers\n- None"
        : `## Blockers\n${failed.map((item) => `- ${item.item}: ${item.details}`).join("\n")}`,
    ].join("\n");

    const outDir = path.resolve(process.cwd(), "test-results");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "communications-go-live-checklist.md"), report, "utf8");

    expect(failed).toHaveLength(0);
  });
});
