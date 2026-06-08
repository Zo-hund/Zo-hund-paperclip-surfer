import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  companies,
  companySecrets,
  companySecretVersions,
  companyMcpServers,
  createDb,
  approvals,
  activityLog,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { mcpServerRoutes } from "../routes/mcp-servers.js";
import { approvalRoutes } from "../routes/approvals.js";
import { secretService } from "../services/secrets.js";
import { approvalService } from "../services/approvals.js";
import { errorHandler } from "../middleware/index.js";
import { eq } from "drizzle-orm";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres Google OAuth route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("Google Workspace Integration and Security Invariants", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let oldEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    oldEnv = { ...process.env };
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.PAPERCLIP_PUBLIC_URL = "http://localhost:3100";

    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-google-oauth-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(approvals);
    await db.delete(companySecrets);
    await db.delete(companySecretVersions);
    await db.delete(companyMcpServers);
    await db.delete(companies);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    process.env = oldEnv;
    await tempDb?.cleanup();
  });

  function createApp(actor = { userId: "board-user", type: "user" }) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = actor;
      next();
    });
    app.use("/api", mcpServerRoutes(db));
    app.use("/api", approvalRoutes(db));
    app.use(errorHandler);
    return app;
  }

  describe("Google OAuth Routes", () => {
    it("returns google oauth URL on GET /api/auth/google-oauth-url", async () => {
      const companyId = randomUUID();
      const app = createApp();

      const res = await request(app)
        .get(`/api/auth/google-oauth-url?companyId=${companyId}`)
        .expect(200);

      expect(res.body.url).toContain("accounts.google.com");
      expect(res.body.url).toContain("client_id=test-client-id");
      expect(res.body.url).toContain(`state=${encodeURIComponent(companyId + ":")}`);
    });

    it("exchanges authorization code and updates secrets and Google MCP servers on callback redirect", async () => {
      const companyId = randomUUID();
      const mcpServerId = randomUUID();
      const issuePrefix = `C${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

      // Seed data
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix,
        requireBoardApprovalForNewAgents: false,
      });

      await db.insert(companyMcpServers).values({
        id: mcpServerId,
        companyId,
        name: "Google Calendar MCP",
        command: "npx",
        args: ["@modelcontextprotocol/server-gcal"],
        env: {},
        transportType: "stdio",
        source: "manual",
        scope: "company",
        enabled: true,
      });

      // Mock fetch token exchange API
      const mockTokenExchange = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            expires_in: 3600,
          }),
        });
      });
      vi.stubGlobal("fetch", mockTokenExchange);

      const app = createApp();

      // Trigger OAuth Callback redirect
      const res = await request(app)
        .get(`/api/auth/google-oauth-callback?code=mock-auth-code&state=${companyId}:${mcpServerId}`)
        .expect(302);

      expect(res.header.location).toBe(`http://localhost:3100/${issuePrefix}/mcp-servers?linked=google`);
      expect(mockTokenExchange).toHaveBeenCalled();

      // Verify token was stored in Drizzle Company Secrets
      const [storedSecret] = await db.select().from(companySecrets).where(eq(companySecrets.companyId, companyId));
      expect(storedSecret).toBeDefined();
      expect(storedSecret.name).toBe("GOOGLE_WORKSPACE_REFRESH_TOKEN");

      // Verify Google Calendar MCP server env was updated to bind to client id/secret and secret_ref
      const [updatedMcp] = await db.select().from(companyMcpServers).where(eq(companyMcpServers.id, mcpServerId));
      expect(updatedMcp).toBeDefined();
      const env = updatedMcp.env as Record<string, any>;
      expect(env.GOOGLE_CLIENT_ID).toBe("test-client-id");
      expect(env.GOOGLE_CLIENT_SECRET).toBe("test-client-secret");
      expect(env.GOOGLE_REFRESH_TOKEN).toBe(`secret_ref(${storedSecret.id})`);
    });
  });

  describe("Security Invariants", () => {
    it("enforces scope isolation: prevents resolving secrets of another company", async () => {
      const companyAId = randomUUID();
      const companyBId = randomUUID();

      await db.insert(companies).values([
        { id: companyAId, name: "Company A", issuePrefix: "COA" },
        { id: companyBId, name: "Company B", issuePrefix: "COB" },
      ]);

      const secretsSvc = secretService(db);
      
      // Create a secret in Company B
      const secretB = await secretsSvc.create(companyBId, {
        name: "SECRET_B",
        provider: "local_encrypted",
        value: "confidential-token",
      });

      // Attempting to resolve Company B's secret using Company A's context should throw an error
      await expect(
        secretsSvc.resolveSecretValue(companyAId, secretB.id, "latest")
      ).rejects.toThrow("Secret must belong to same company");
    });

    it("resolves encrypted secrets correctly using resolveAdapterConfigForRuntime in both environments", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      const secretsSvc = secretService(db);
      const secret = await secretsSvc.create(companyId, {
        name: "GOOGLE_WORKSPACE_REFRESH_TOKEN",
        provider: "local_encrypted",
        value: "refresh-token-value-123",
      });

      const adapterConfig = {
        env: {
          GOOGLE_REFRESH_TOKEN: {
            type: "secret_ref" as const,
            secretId: secret.id,
            version: "latest" as const,
          },
          GOOGLE_CLIENT_ID: "client-id-xyz",
        },
      };

      // Resolve the config for agent run execution
      const { config, secretKeys } = await secretsSvc.resolveAdapterConfigForRuntime(companyId, adapterConfig);
      
      expect(secretKeys.has("GOOGLE_REFRESH_TOKEN")).toBe(true);
      expect(secretKeys.has("GOOGLE_CLIENT_ID")).toBe(false);

      const resolvedEnv = config.env as Record<string, string>;
      expect(resolvedEnv.GOOGLE_REFRESH_TOKEN).toBe("refresh-token-value-123");
      expect(resolvedEnv.GOOGLE_CLIENT_ID).toBe("client-id-xyz");
    });

    it("human-approval gates: registers and validates email approval requests", async () => {
      const companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "AMX Air Hubs",
        issuePrefix: "AMX",
      });

      const app = createApp();

      // Submit a governed action approval request for sending an email
      const res = await request(app)
        .post(`/api/companies/${companyId}/approvals`)
        .send({
          type: "approve_ceo_strategy",
          payload: {
            recipient: "client@example.com",
            subject: "Weekly Status Update",
            body: "Hi, here is the report.",
          },
          issueIds: [],
        })
        .expect(201);

      expect(res.body.type).toBe("approve_ceo_strategy");
      expect(res.body.status).toBe("pending");
      expect(res.body.payload.recipient).toBe("client@example.com");

      // Verify it was correctly stored in the Drizzle DB
      const approvalsSvc = approvalService(db);
      const retrieved = await approvalsSvc.getById(res.body.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.status).toBe("pending");
      expect(retrieved?.type).toBe("approve_ceo_strategy");
    });
  });
});
