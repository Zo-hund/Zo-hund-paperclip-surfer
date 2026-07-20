import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import worker from "../worker.js";

function assets(status = 404) {
  return { fetch: async () => new Response(status === 404 ? "missing" : "asset", { status }) };
}

function request(path, init) {
  return new Request(`https://amx.example${path}`, init);
}

function jsonRequest(path, body, method = "POST") {
  return request(path, { method, headers: { "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() }, body: JSON.stringify(body) });
}

function memoryBucket() {
  const objects = new Map();
  return {
    async put(id, body, options) { objects.set(id, { body, ...options }); },
    async get(id) {
      const object = objects.get(id);
      if (!object) return null;
      return {
        body: object.body,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
        httpEtag: `"${id}"`,
        async arrayBuffer() { return object.body instanceof ArrayBuffer ? object.body : object.body.buffer.slice(object.body.byteOffset, object.body.byteOffset + object.body.byteLength); },
        writeHttpMetadata(headers) { if (object.httpMetadata?.contentType) headers.set("Content-Type", object.httpMetadata.contentType); },
      };
    },
    async delete(id) { objects.delete(id); },
  };
}

function memoryDatabase() {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() { writes.push({ sql, values }); return { success: true }; },
            async all() { return { results: [] }; },
            async first() { return { ok: 1 }; },
          };
        },
        async run() { return { success: true }; },
        async first() { return { ok: 1 }; },
      };
    },
    async batch(statements) {
      for (const statement of statements) if (typeof statement.run === "function") await statement.run();
      return [];
    },
  };
}

function podInviteDatabase(row) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() { writes.push({ sql, values }); return { success: true, meta: { changes: 1 } }; },
            async all() { return { results: [] }; },
            async first() { return sql.includes("SELECT * FROM pod_invites") ? row : { ok: 1 }; },
          };
        },
        async run() { return { success: true }; },
        async first() { return { ok: 1 }; },
      };
    },
    async batch(statements) {
      for (const statement of statements) if (typeof statement.run === "function") await statement.run();
      return [];
    },
  };
}

function stageWorkflowDatabase(initialRow = null) {
  let row = initialRow;
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              if (sql.includes("INSERT INTO stage_workflows")) {
                const [tenant_id, room_code, revision, payload, updated_at, updated_by] = values;
                if (!row || Number(revision) >= Number(row.revision)) row = { tenant_id, room_code, revision, payload, updated_at, updated_by };
              }
              return { success: true, meta: { changes: 1 } };
            },
            async all() { return { results: [] }; },
            async first() { return sql.includes("FROM stage_workflows") ? row : { ok: 1 }; },
          };
        },
        async run() { return { success: true }; },
        async first() { return { ok: 1 }; },
      };
    },
    async batch(statements) {
      for (const statement of statements) if (typeof statement.run === "function") await statement.run();
      return [];
    },
  };
}

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("AMX AIR Hubs Worker API", () => {
  let env;

  beforeEach(() => {
    env = { ASSETS: assets() };
  });

  test("returns liveness metadata, request tracing, and security headers", async () => {
    const response = await worker.fetch(request("/api/health", { headers: { "X-Request-ID": "test-request-123" } }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "amx-air-hubs");
    assert.equal(body.version, "1.1.0");
    assert.equal(body.requestId, "test-request-123");
    assert.equal(response.headers.get("X-Request-ID"), "test-request-123");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  });

  test("enforces required production services", async () => {
    env.REQUIRED_SERVICES = "database,media,livekit";
    const response = await worker.fetch(request("/api/ready"), env);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.ready, false);
    assert.equal(body.mode, "not-ready");
    assert.deepEqual(body.missingRequired, ["database", "media", "livekit"]);
  });

  test("requires a verified member session for private APIs", async () => {
    Object.assign(env, {
      MEMBER_AUTH_REQUIRED: "true",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
    const response = await worker.fetch(jsonRequest("/api/agents/respond", { text: "private request" }), env);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, "Member sign-in required");
  });

  test("uses the database membership role for operator authorization", async () => {
    Object.assign(env, {
      MEMBER_AUTH_REQUIRED: "true",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      LIVEKIT_OPERATOR_HOSTS: "amx.example",
      DB: stageWorkflowDatabase(),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return Response.json({ id: "00000000-0000-4000-8000-000000000001", email: "member@example.com" });
      return Response.json([{ id: "00000000-0000-4000-8000-000000000001", member_code: "AMX-00000000", membership_role: "member", membership_status: "active" }]);
    };
    try {
      const response = await worker.fetch(request("/api/stage/workflows/AMXSTAGE?tenantId=tech-at-nite", { headers: { Cookie: "amx_member_session=header.payload.signature" } }), env);
      const body = await response.json();
      assert.equal(response.status, 403);
      assert.equal(body.error, "This member role cannot access the requested operation");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("reports configured remote capabilities without exposing secrets", async () => {
    Object.assign(env, {
      AGENT_RUNTIME_URL: "https://agents.example.com",
      AGENT_RUNTIME_TOKEN: "secret-agent-token",
      MCP_GATEWAY_URL: "https://mcp.example.com",
      MCP_GATEWAY_TOKEN: "secret-mcp-token",
      PLUGIN_GATEWAY_URL: "https://plugins.example.com",
      LIVEKIT_URL: "wss://livekit.example.com",
      LIVEKIT_API_KEY: "key",
      LIVEKIT_API_SECRET: "secret",
    });
    const response = await worker.fetch(request("/api/agents/capabilities"), env);
    const text = await response.text();
    const body = JSON.parse(text);

    assert.equal(body.transport, "remote");
    assert.equal(body.agentRuntimeConfigured, true);
    assert.equal(body.mcpGatewayConfigured, true);
    assert.equal(body.pluginGatewayConfigured, true);
    assert.equal(body.livekitConfigured, true);
    assert.equal(text.includes("secret-agent-token"), false);
    assert.equal(text.includes("secret-mcp-token"), false);
  });

  test("reports the Runway preset catalog truthfully when no server key is configured", async () => {
    const response = await worker.fetch(request("/api/runway/avatars"), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.configured, false);
    assert.ok(body.presets.some((avatar) => avatar.id === "human-resource"));
    assert.deepEqual(body.avatars, []);
  });

  test("proxies a bounded Runway custom avatar catalog without exposing its key", async (context) => {
    env.RUNWAYML_API_SECRET = "secret-runway-key";
    context.mock.method(globalThis, "fetch", async (url, init) => {
      assert.match(String(url), /\/v1\/avatars\?limit=50$/);
      assert.equal(init.headers.Authorization, "Bearer secret-runway-key");
      return new Response(JSON.stringify({ data: [{ id: "avatar-1", name: "JAZ Live", status: "READY", processedImageUri: "https://cdn.example.com/jaz.jpg", personality: "private" }] }), { headers: { "Content-Type": "application/json" } });
    });
    const response = await worker.fetch(request("/api/runway/avatars"), env);
    const text = await response.text();
    const body = JSON.parse(text);

    assert.equal(response.status, 200);
    assert.equal(body.configured, true);
    assert.deepEqual(body.avatars[0], { id: "avatar-1", name: "JAZ Live", type: "custom", status: "READY", imageUrl: "https://cdn.example.com/jaz.jpg" });
    assert.equal(text.includes("secret-runway-key"), false);
    assert.equal(text.includes("private"), false);
  });

  test("creates and consumes a Runway realtime avatar session with the AMX client toolbelt", async (context) => {
    env.RUNWAYML_API_SECRET = "secret-runway-key";
    const calls = [];
    context.mock.method(globalThis, "fetch", async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/v1/realtime_sessions") && init.method === "POST") return new Response(JSON.stringify({ id: "session-1" }), { headers: { "Content-Type": "application/json" } });
      if (String(url).endsWith("/v1/realtime_sessions/session-1/consume")) {
        assert.equal(init.headers.Authorization, "Bearer session-key-1");
        return new Response(JSON.stringify({ url: "wss://runway-live.example.com", token: "participant-token", roomName: "runway-room-1" }), { headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ id: "session-1", status: "READY", sessionKey: "session-key-1" }), { headers: { "Content-Type": "application/json" } });
    });
    const response = await worker.fetch(jsonRequest("/api/runway/sessions", {
      avatarId: "human-resource", avatarType: "preset", roomCode: "NEXUS1", personality: "Training guide", startScript: "Welcome",
    }), env);
    const body = await response.json();
    const createPayload = JSON.parse(calls[0].init.body);

    assert.equal(response.status, 201);
    assert.equal(body.sessionId, "session-1");
    assert.equal(body.serverUrl, "wss://runway-live.example.com");
    assert.equal(body.token, "participant-token");
    assert.equal(createPayload.model, "gwm1_avatars");
    assert.deepEqual(createPayload.avatar, { type: "runway-preset", presetId: "human-resource" });
    assert.ok(createPayload.tools.some((tool) => tool.name === "invoke_amx_tool"));
    assert.ok(createPayload.tools.some((tool) => tool.name === "move_room_avatar"));
  });

  test("requires server-side Runway configuration before creating a billable session", async () => {
    const response = await worker.fetch(jsonRequest("/api/runway/sessions", { avatarId: "human-resource", avatarType: "preset" }), env);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.match(body.error, /Runway Characters is not configured/);
  });

  test("rejects malformed JSON with a bounded client error", async () => {
    const response = await worker.fetch(request("/api/agents/respond", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() }, body: "{" }), env);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, "Request body must contain valid JSON");
    assert.ok(body.requestId);
  });

  test("provides a truthful local agent fallback and tool trace", async () => {
    const response = await worker.fetch(jsonRequest("/api/agents/respond", { agentId: "naz", agentName: "NAZ", text: "Review this scene", contentKind: "code", attachments: [] }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.transport, "local");
    assert.match(body.text, /NAZ accepted/);
    assert.ok(body.tools.some((tool) => tool.name === "mission.context"));
  });

  test("hydrates stored R2 media into a remote agent request", async (context) => {
    const bucket = memoryBucket();
    await bucket.put("stored-1234", new Uint8Array([1, 2, 3, 4]), { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: {} });
    env.MEDIA = bucket;
    env.AGENT_RUNTIME_URL = "https://agents.example.com";
    let forwarded;
    context.mock.method(globalThis, "fetch", async (_url, init) => {
      forwarded = JSON.parse(init.body);
      return new Response(JSON.stringify({ text: "Remote media reviewed", tools: [] }), { headers: { "Content-Type": "application/json" } });
    });
    const response = await worker.fetch(jsonRequest("/api/agents/respond", {
      agentId: "naz",
      agentName: "NAZ",
      text: "Review stored media",
      contentKind: "document",
      attachments: [{ id: "attachment-1", kind: "document", name: "scene.glb", mimeType: "application/octet-stream", size: 4, transfer: "stored", storageUrl: "/api/media/stored-1234" }],
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.transport, "remote");
    assert.equal(forwarded.attachments[0].transfer, "inline");
    assert.equal(forwarded.attachments[0].dataUrl, "data:application/octet-stream;base64,AQIDBA==");
  });

  test("uses the OpenAI Responses API when its server-side key is configured", async (context) => {
    env.OPENAI_API_KEY = "test-openai-key";
    env.OPENAI_MODEL = "gpt-5-mini";
    let requestBody;
    context.mock.method(globalThis, "fetch", async (url, init) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      assert.equal(init.headers.Authorization, "Bearer test-openai-key");
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ output_text: "The cooling trend is stable." }), { headers: { "Content-Type": "application/json" } });
    });
    const response = await worker.fetch(jsonRequest("/api/agents/respond", {
      agentId: "twin-operator",
      agentName: "Twin Operator",
      text: "Explain the cooling forecast",
      contentKind: "image",
      attachments: [{ id: "vision-frame", kind: "image", name: "rack.jpg", mimeType: "image/jpeg", size: 4, transfer: "inline", dataUrl: "data:image/jpeg;base64,AQIDBA==" }],
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.transport, "remote");
    assert.equal(body.text, "The cooling trend is stable.");
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.model, "gpt-5-mini");
    assert.equal(requestBody.input[0].role, "user");
    assert.equal(requestBody.input[0].content[0].type, "input_text");
    assert.deepEqual(requestBody.input[0].content[1], { type: "input_image", image_url: "data:image/jpeg;base64,AQIDBA==" });
    assert.ok(body.tools.some((tool) => tool.name === "openai.responses"));
  });

  test("blocks unknown tools without crashing the runtime", async () => {
    const response = await worker.fetch(jsonRequest("/api/agents/tools/invoke", { toolName: "unknown.tool", agentId: "naz" }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.trace.status, "blocked");
    assert.match(body.output, /Unknown built-in tool/);
  });

  test("returns browser-public Google Maps configuration without inventing readiness", async () => {
    let response = await worker.fetch(request("/api/maps/config"), env);
    let body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.configured, false);
    assert.equal("apiKey" in body, false);

    env.GOOGLE_MAPS_BROWSER_KEY = "restricted-browser-key";
    response = await worker.fetch(request("/api/maps/config"), env);
    body = await response.json();
    assert.equal(body.configured, true);
    assert.equal(body.apiKey, "restricted-browser-key");
  });

  test("persists and resolves a tenant-scoped Stage production workflow", async () => {
    env.DB = stageWorkflowDatabase();
    env.STAGE_OPERATOR_HOSTS = "amx.example";
    const workflow = { productionId: "production-amxstage", revision: 200, phase: "pre", status: "planning", activity: [] };
    const saved = await worker.fetch(jsonRequest("/api/stage/workflows/AMXSTAGE", {
      tenantId: "tech-at-nite", revision: 200, updatedBy: "director-1", workflow,
    }, "PUT"), env);
    const savedBody = await saved.json();

    assert.equal(saved.status, 200);
    assert.equal(savedBody.persisted, true);
    assert.equal(savedBody.room, "AMXSTAGE");

    const loaded = await worker.fetch(request("/api/stage/workflows/AMXSTAGE?tenantId=tech-at-nite"), env);
    const loadedBody = await loaded.json();
    assert.equal(loaded.status, 200);
    assert.equal(loadedBody.workflow.productionId, "production-amxstage");
    assert.equal(loadedBody.updatedBy, "director-1");
  });

  test("restricts durable Stage workflows to an explicitly allowed operator host", async () => {
    env.DB = stageWorkflowDatabase();
    env.STAGE_OPERATOR_HOSTS = "private.example";
    const response = await worker.fetch(request("/api/stage/workflows/AMXSTAGE?tenantId=tech-at-nite"), env);
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.match(body.error, /private operator host/);
  });

  test("creates a durable pod showcase invite with a separate owner capability", async () => {
    const database = memoryDatabase();
    env.DB = database;
    const response = await worker.fetch(jsonRequest("/api/pod-invites", {
      tenantId: "tech-at-nite", tenantName: "Tech At Nite", tenantColor: "#55e6ff",
      podId: "pod-showcase", roomCode: "AIR123", missionId: "webxr-creator",
      title: "WebXR Creator showcase", description: "Join the room", hostName: "AMX Host",
      role: "presenter", maxUses: 8, expiresInHours: 24,
    }), env);
    const body = await response.json();
    const insert = database.writes.find((write) => write.sql.includes("INSERT INTO pod_invites"));

    assert.equal(response.status, 201);
    assert.equal(body.invite.role, "presenter");
    assert.equal(body.invite.maxUses, 8);
    assert.match(body.invite.joinPath, /^\/join\/[A-Za-z0-9_-]+$/);
    assert.ok(body.ownerToken.length > 60);
    assert.equal(JSON.stringify(body.invite).includes("ownerToken"), false);
    assert.ok(insert);
    assert.notEqual(insert.values[2], body.ownerToken);
  });

  test("accepts an active pod invite once and reports capacity truthfully", async () => {
    const row = {
      id: "invite-1", token: "invite-token", owner_token_hash: "unused", tenant_id: "tech-at-nite",
      tenant_name: "Tech At Nite", tenant_color: "#55e6ff", pod_id: "pod-1", room_code: "AIR123",
      mission_id: "webxr-creator", title: "Creator showcase", description: "Join us", host_name: "AMX Host",
      guest_role: "participant", max_uses: 1, use_count: 0, status: "active",
      expires_at: new Date(Date.now() + 60_000).toISOString(), created_at: new Date().toISOString(),
    };
    env.DB = podInviteDatabase(row);
    const response = await worker.fetch(jsonRequest("/api/pod-invites/invite-token/accept", {}), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.invite.useCount, 1);
    assert.equal(body.invite.status, "full");
    assert.ok(env.DB.writes.some((write) => write.sql.includes("use_count = use_count + 1")));
  });

  test("requires the private owner capability to revoke a pod invite", async () => {
    const ownerToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
    const row = {
      id: "invite-2", token: "owner-invite", owner_token_hash: await hash(ownerToken), tenant_id: "tech-at-nite",
      tenant_name: "Tech At Nite", tenant_color: "#55e6ff", pod_id: "pod-2", room_code: "AIR456",
      mission_id: "xrt-green-mode", title: "Team showcase", description: "Join us", host_name: "AMX Host",
      guest_role: "viewer", max_uses: 10, use_count: 0, status: "active",
      expires_at: new Date(Date.now() + 60_000).toISOString(), created_at: new Date().toISOString(),
    };
    env.DB = podInviteDatabase(row);
    let response = await worker.fetch(request("/api/pod-invites/owner-invite", { method: "DELETE", headers: { Authorization: "Bearer wrong" } }), env);
    assert.equal(response.status, 403);

    response = await worker.fetch(request("/api/pod-invites/owner-invite", { method: "DELETE", headers: { Authorization: `Bearer ${ownerToken}` } }), env);
    assert.equal(response.status, 204);
    assert.ok(env.DB.writes.some((write) => write.sql.includes("status = 'revoked'")));
  });

  test("runs a tenant-scoped DCIM inspection tool", async () => {
    const response = await worker.fetch(jsonRequest("/api/agents/tools/invoke", {
      toolName: "dcim.inspect",
      agentId: "naz",
      context: {
        tenant: { id: "northstar-ai", name: "Northstar AI" },
        provenance: "training simulation",
        scenario: "tenant-burst",
        pod: { itLoadKw: 73.4, pue: 1.31, networkGbps: 24.6, availabilityPercent: 99.98 },
        alarms: ["R03 capacity exceeds reserved envelope"],
      },
    }), env);
    const body = await response.json();
    const output = JSON.parse(body.output);

    assert.equal(response.status, 200);
    assert.equal(body.trace.status, "complete");
    assert.equal(output.tenant, "Northstar AI");
    assert.equal(output.itLoadKw, 73.4);
    assert.deepEqual(output.alarms, ["R03 capacity exceeds reserved envelope"]);
  });

  test("requires a configured bearer token for data center telemetry", async () => {
    const response = await worker.fetch(jsonRequest("/api/telemetry/data-center", { id: "feed-1" }), env);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.error, "Telemetry ingestion is not configured");
  });

  test("normalizes and persists tenant data center telemetry", async () => {
    const database = memoryDatabase();
    env.DB = database;
    env.DCIM_INGEST_TOKEN = "test-ingest-token";
    const payload = {
      id: "northstar-feed-1",
      tenantId: "northstar-ai",
      adapter: "redfish",
      sourceSystem: "lab-bmc-gateway",
      timestamp: new Date().toISOString(),
      pod: { itLoadKw: 61.4, facilityKw: 78.2, pue: 1.27, coolingKw: 16.8, networkGbps: 24.2, storageTb: 448, availabilityPercent: 99.99, carbonGramsPerKwh: 281 },
      racks: [{ id: "r01", label: "R01", workload: "GPU inference", powerKw: 15.2, inletC: 32.1, capacityPercent: 74, networkGbps: 6.1 }],
      alarms: ["R01 inlet temperature 32.1 C"],
    };
    const response = await worker.fetch(request("/api/telemetry/data-center", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-ingest-token", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify(payload),
    }), env);
    const body = await response.json();
    const insert = database.writes.find((write) => write.sql.includes("INSERT OR REPLACE INTO data_center_telemetry"));
    const persisted = JSON.parse(insert.values[6]);

    assert.equal(response.status, 201);
    assert.equal(body.item.adapter, "redfish");
    assert.equal(body.item.racks[0].health, "critical");
    assert.equal(persisted.tenantId, "northstar-ai");
    assert.ok(insert);
  });

  test("rejects unsafe telemetry ranges", async () => {
    env.DB = memoryDatabase();
    env.DCIM_INGEST_TOKEN = "test-ingest-token";
    const response = await worker.fetch(request("/api/telemetry/data-center", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-ingest-token", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify({
        id: "bad-feed", tenantId: "northstar-ai", adapter: "modbus", sourceSystem: "lab-plc", timestamp: new Date().toISOString(),
        pod: { itLoadKw: 10, facilityKw: 12, pue: 0.4, coolingKw: 2, networkGbps: 1, storageTb: 1, availabilityPercent: 99, carbonGramsPerKwh: 200 },
        racks: [{ label: "R01", powerKw: 5, inletC: 20, capacityPercent: 40, networkGbps: 2 }],
      }),
    }), env);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /pod.pue/);
  });

  test("persists Know Do Be project state from completed tool evidence", async () => {
    const database = memoryDatabase();
    env.DB = database;
    const timestamp = new Date().toISOString();
    const toolRuns = ["dcim.inspect", "rack.thermal-map", "incident.runbook"].map((name) => ({
      id: crypto.randomUUID(), name, source: "skill", status: "complete", detail: "Evidence captured", timestamp,
    }));
    const response = await worker.fetch(jsonRequest("/api/learning/projects/state", {
      version: 1,
      projectId: "mini-dc-thermal-response",
      tenantId: "northstar-ai",
      learnerId: "learner-1",
      stage: "be",
      knowledgeConfirmed: true,
      toolRuns,
      reflection: "I verify provenance and require human approval before any physical action.",
      status: "complete",
      updatedAt: timestamp,
    }, "PUT"), env);
    const body = await response.json();
    const insert = database.writes.find((write) => write.sql.includes("INSERT OR REPLACE INTO project_learning_state"));

    assert.equal(response.status, 200);
    assert.equal(body.item.status, "complete");
    assert.equal(body.item.toolRuns.length, 3);
    assert.ok(insert);
  });

  test("does not accept project completion without required evidence", async () => {
    env.DB = memoryDatabase();
    const response = await worker.fetch(jsonRequest("/api/learning/projects/state", {
      projectId: "mini-dc-thermal-response", tenantId: "northstar-ai", learnerId: "learner-1", stage: "be",
      knowledgeConfirmed: true, toolRuns: [], reflection: "I completed the project without running tools.", status: "complete",
    }, "PUT"), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.item.status, "in_progress");
  });

  test("validates and accepts analytics in stateless mode", async () => {
    const response = await worker.fetch(jsonRequest("/api/analytics/events", { id: "event-1", eventName: "mission_completed", tenantId: "tenant-1", timestamp: new Date().toISOString() }), env);
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.persisted, false);
    assert.equal(body.id, "event-1");
  });

  test("attests and persists the complete proof payload", async () => {
    const database = memoryDatabase();
    env.DB = database;
    env.PROOF_SIGNING_SECRET = "production-proof-signing-secret-32-bytes";
    const response = await worker.fetch(jsonRequest("/api/sync", {
      id: "queue-1",
      type: "proof:complete",
      payload: { id: "proof-1", tenantId: "tenant-1", learnerId: "learner-1", missionId: "mission-1", status: "complete", timestamp: new Date().toISOString(), report: { score: 92 } },
    }), env);
    const body = await response.json();
    const insert = database.writes.find((write) => write.sql.includes("INSERT OR REPLACE INTO proof_records"));
    const persisted = JSON.parse(insert.values[5]);

    assert.equal(response.status, 202);
    assert.equal(body.persisted, true);
    assert.equal(persisted.report.score, 92);
    assert.equal(persisted.serverAttestation.algorithm, "HMAC-SHA256");
    assert.ok(persisted.serverAttestation.signature.length > 30);
  });

  test("stores, retrieves, and deletes media through the R2 contract", async () => {
    env.MEDIA = memoryBucket();
    const upload = await worker.fetch(request("/api/media", {
      method: "POST",
      headers: { "Content-Type": "image/png", "X-AMX-Filename": "scene.png", "X-AMX-Tenant": "tenant-1", "CF-Connecting-IP": crypto.randomUUID() },
      body: new Uint8Array([1, 2, 3, 4]),
    }), env);
    const stored = await upload.json();
    const download = await worker.fetch(request(stored.url), env);
    const bytes = Array.from(new Uint8Array(await download.arrayBuffer()));
    const removal = await worker.fetch(request(stored.url, { method: "DELETE", headers: { "CF-Connecting-IP": crypto.randomUUID() } }), env);
    const missing = await worker.fetch(request(stored.url), env);

    assert.equal(upload.status, 201);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("Content-Type"), "image/png");
    assert.deepEqual(bytes, [1, 2, 3, 4]);
    assert.equal(removal.status, 204);
    assert.equal(missing.status, 404);
  });

  test("serves public identity images without exposing private media", async () => {
    Object.assign(env, {
      MEMBER_AUTH_REQUIRED: "true",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      MEDIA: memoryBucket(),
    });
    const uploadEnv = { ...env, MEMBER_AUTH_REQUIRED: "false" };
    const publicUpload = await worker.fetch(request("/api/media", {
      method: "POST",
      headers: { "Content-Type": "image/webp", "X-AMX-Filename": "member.webp", "X-AMX-Tenant": "member-1", "X-AMX-Media-Purpose": "profile-avatar", "X-AMX-Visibility": "public" },
      body: new Uint8Array([1, 2, 3]),
    }), uploadEnv);
    const publicMedia = await publicUpload.json();
    const publicDownload = await worker.fetch(request(publicMedia.url), env);

    const privateUpload = await worker.fetch(request("/api/media", {
      method: "POST",
      headers: { "Content-Type": "image/webp", "X-AMX-Filename": "private.webp" },
      body: new Uint8Array([4, 5, 6]),
    }), uploadEnv);
    const privateMedia = await privateUpload.json();
    const privateDownload = await worker.fetch(request(privateMedia.url), env);

    assert.equal(publicDownload.status, 200);
    assert.match(publicDownload.headers.get("Cache-Control"), /^public/);
    assert.equal(privateDownload.status, 401);
  });

  test("stores Stage audio with its playable content type", async () => {
    env.MEDIA = memoryBucket();
    const upload = await worker.fetch(request("/api/media", {
      method: "POST",
      headers: { "Content-Type": "audio/wav", "X-AMX-Filename": "stage-theme.wav", "X-AMX-Tenant": "tech-at-nite", "CF-Connecting-IP": crypto.randomUUID() },
      body: new Uint8Array([82, 73, 70, 70]),
    }), env);
    const stored = await upload.json();
    const playback = await worker.fetch(request(stored.url), env);

    assert.equal(upload.status, 201);
    assert.equal(stored.contentType, "audio/wav");
    assert.equal(playback.headers.get("Content-Type"), "audio/wav");
    assert.match(playback.headers.get("Content-Disposition"), /stage-theme\.wav/);
  });

  test("issues a room token and explicitly dispatches the configured LiveKit agent", async (context) => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
      LIVEKIT_AGENT_NAME: "amx-voice-agent",
      LIVEKIT_OPERATOR_HOSTS: "amx.example",
    });
    const calls = [];
    context.mock.method(globalThis, "fetch", async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      if (String(url).includes("ListDispatch")) return new Response(JSON.stringify({ code: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ id: "dispatch-1", agent_name: "amx-voice-agent", room: "NEXUS1" }), { headers: { "Content-Type": "application/json" } });
    });
    const response = await worker.fetch(jsonRequest("/api/livekit/token", { room: "NEXUS1", identity: "participant-1", name: "AMX Explorer" }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.room, "NEXUS1");
    assert.equal(body.participantToken.split(".").length, 3);
    const tokenPayload = JSON.parse(Buffer.from(body.participantToken.split(".")[1], "base64url").toString("utf8"));
    assert.equal(tokenPayload.identity, "participant-1");
    assert.equal(tokenPayload.name, "AMX Explorer");
    assert.equal(typeof tokenPayload.iat, "number");
    assert.equal(body.agentDispatch.dispatched, true);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /CreateDispatch/);
  });

  test("issues subscribe-only LiveKit credentials for a public stage viewer", async (context) => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
      LIVEKIT_AGENT_NAME: "amx-voice-agent",
      PUBLIC_LIVEKIT_ROOMS: "AMXSTAGE",
    });
    const calls = [];
    context.mock.method(globalThis, "fetch", async (...args) => {
      calls.push(args);
      return new Response(null, { status: 500 });
    });
    const response = await worker.fetch(jsonRequest("/api/livekit/viewer-token", { room: "AMXSTAGE", identity: "forced-identity", name: "Stage Viewer", role: "participant", clientType: "stage-monitor" }), env);
    const body = await response.json();
    const tokenPayload = JSON.parse(Buffer.from(body.participantToken.split(".")[1], "base64url").toString("utf8"));

    assert.equal(response.status, 200);
    assert.equal(body.role, "viewer");
    assert.match(tokenPayload.identity, /^viewer-/);
    assert.notEqual(tokenPayload.identity, "forced-identity");
    assert.equal(tokenPayload.video.roomJoin, true);
    assert.equal(tokenPayload.video.canSubscribe, true);
    assert.equal(tokenPayload.video.canPublish, false);
    assert.equal(tokenPayload.video.canPublishData, false);
    assert.equal(JSON.parse(tokenPayload.metadata).role, "viewer");
    assert.equal(JSON.parse(tokenPayload.metadata).clientType, "audience");
    assert.equal(body.agentDispatch.dispatched, false);
    assert.equal(calls.length, 0);
  });

  test("rejects viewer tokens for rooms outside the public allowlist", async () => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
      PUBLIC_LIVEKIT_ROOMS: "AMXSTAGE",
    });
    const response = await worker.fetch(jsonRequest("/api/livekit/viewer-token", { room: "PRIVATE-POD" }), env);

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "This room is not available on the public viewer");
  });

  test("issues a stage-monitor identity only on an allowed operator host", async () => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
      PUBLIC_LIVEKIT_ROOMS: "AMXSTAGE",
      LIVEKIT_OPERATOR_HOSTS: "amx.example",
    });
    const response = await worker.fetch(jsonRequest("/api/livekit/viewer-token", { room: "AMXSTAGE", clientType: "stage-monitor" }), env);
    const body = await response.json();
    const tokenPayload = JSON.parse(Buffer.from(body.participantToken.split(".")[1], "base64url").toString("utf8"));

    assert.equal(response.status, 200);
    assert.match(tokenPayload.identity, /^stage-monitor-/);
    assert.equal(JSON.parse(tokenPayload.metadata).clientType, "stage-monitor");
  });

  test("rejects publisher tokens outside the private operator host allowlist", async () => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
      LIVEKIT_OPERATOR_HOSTS: "operators.example",
    });
    const response = await worker.fetch(jsonRequest("/api/livekit/token", { room: "AMXSTAGE", identity: "publisher-1" }), env);

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "LiveKit participant tokens are restricted to the private operator host");
  });

  test("keeps DJ stream destinations server-only and requires complete broadcast configuration", async () => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
    });
    const response = await worker.fetch(jsonRequest("/api/livekit/egress/dj/status", { room: "AMXSTAGE" }), env);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.configured, false);
    assert.equal(body.error, "DJ stream destinations are not configured");
  });

  test("rejects an invalid DJ broadcast control token", async () => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
      DJ_RTMP_URLS: "rtmps://stream.example.com/live/private-stream-key",
      DJ_STREAM_CONTROL_TOKEN: "correct-control-token",
    });
    const response = await worker.fetch(request("/api/livekit/egress/dj/status", {
      method: "POST",
      headers: { "Authorization": "Bearer wrong-token", "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify({ room: "AMXSTAGE" }),
    }), env);

    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "DJ broadcast control token is invalid");
  });

  test("starts, reports, and stops a protected LiveKit DJ egress without returning stream keys", async (context) => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
      DJ_RTMP_URLS: "rtmps://stream.example.com/live/private-stream-key,rtmp://backup.example.com/live/backup-key",
      DJ_STREAM_CONTROL_TOKEN: "correct-control-token",
    });
    const calls = [];
    context.mock.method(globalThis, "fetch", async (url, init) => {
      const payload = JSON.parse(init.body);
      calls.push({ url: String(url), authorization: init.headers.Authorization, payload });
      if (String(url).endsWith("/ListEgress")) return Response.json({ items: calls.filter((call) => call.url.endsWith("/StartRoomCompositeEgress")).length ? [{ egress_id: "EG_DJ123", room_name: "AMXSTAGE", status: "EGRESS_ACTIVE" }] : [] });
      if (String(url).endsWith("/StartRoomCompositeEgress")) return Response.json({ egress_id: "EG_DJ123", room_name: "AMXSTAGE", status: "EGRESS_STARTING" });
      if (String(url).endsWith("/StopEgress")) return Response.json({ egress_id: "EG_DJ123", room_name: "AMXSTAGE", status: "EGRESS_COMPLETE" });
      return Response.json({ msg: "Unexpected egress method" }, { status: 404 });
    });
    const controlledRequest = (path, body) => request(path, {
      method: "POST",
      headers: { "Authorization": "Bearer correct-control-token", "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
      body: JSON.stringify(body),
    });

    const startResponse = await worker.fetch(controlledRequest("/api/livekit/egress/dj/start", { room: "AMXSTAGE", videoProfile: "1080p60" }), env);
    const startText = await startResponse.text();
    const start = JSON.parse(startText);
    const stopResponse = await worker.fetch(controlledRequest("/api/livekit/egress/dj/stop", { room: "AMXSTAGE", egressId: "EG_DJ123" }), env);
    const stop = await stopResponse.json();

    assert.equal(startResponse.status, 201);
    assert.equal(start.active.id, "EG_DJ123");
    assert.equal(start.destinationCount, 2);
    assert.equal(start.videoProfile, "1080p60");
    assert.equal(start.width, 1920);
    assert.equal(start.height, 1080);
    assert.equal(start.frameRate, 60);
    assert.equal(startText.includes("private-stream-key"), false);
    assert.equal(startText.includes("backup-key"), false);
    assert.equal(stopResponse.status, 200);
    assert.equal(stop.active, null);
    assert.equal(calls.length, 4);
    assert.match(calls[0].url, /ListEgress$/);
    assert.match(calls[1].url, /StartRoomCompositeEgress$/);
    assert.deepEqual(calls[1].payload, {
      room_name: "AMXSTAGE",
      layout: "speaker",
      stream_outputs: [{ protocol: 1, urls: ["rtmps://stream.example.com/live/private-stream-key", "rtmp://backup.example.com/live/backup-key"] }],
      preset: 3,
    });
    assert.match(calls[1].authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/);
    const tokenPayload = JSON.parse(Buffer.from(calls[1].authorization.slice(7).split(".")[1], "base64url").toString("utf8"));
    assert.equal(tokenPayload.video.roomRecord, true);
    assert.match(calls[2].url, /ListEgress$/);
    assert.match(calls[3].url, /StopEgress$/);
    assert.deepEqual(calls[3].payload, { egress_id: "EG_DJ123" });
  });
  test("persists validated geospatial anchors", async () => {
    const database = memoryDatabase();
    env.DB = database;
    const response = await worker.fetch(jsonRequest("/api/anchors", {
      id: "anchor-1",
      tenantId: "tenant-1",
      roomCode: "nexus1",
      label: "Cooling station",
      ownerId: "participant-1",
      latitude: 41.88,
      longitude: -87.63,
      altitude: 181,
      accuracy: 4.2,
      localPosition: [1, 0, -2],
      orientation: [0, 0, 0, 1],
      source: "webxr",
      createdAt: new Date().toISOString(),
    }), env);
    const body = await response.json();
    const insert = database.writes.find((write) => write.sql.includes("INSERT OR REPLACE INTO geo_anchors"));

    assert.equal(response.status, 201);
    assert.equal(body.persisted, true);
    assert.equal(body.item.roomCode, "NEXUS1");
    assert.equal(body.item.source, "webxr");
    assert.ok(insert);
  });

  test("records governed digital twin scenario events", async () => {
    const database = memoryDatabase();
    env.DB = database;
    const response = await worker.fetch(jsonRequest("/api/twins/events", {
      id: "twin-event-1",
      tenantId: "tenant-1",
      twinId: "facility-cell-01",
      roomCode: "NEXUS1",
      eventType: "scenario",
      payload: { scenario: "cooling-loss", approved: false },
      createdAt: new Date().toISOString(),
    }), env);
    const body = await response.json();
    const insert = database.writes.find((write) => write.sql.includes("INSERT OR REPLACE INTO digital_twin_events"));

    assert.equal(response.status, 201);
    assert.equal(body.persisted, true);
    assert.equal(body.item.eventType, "scenario");
    assert.ok(insert);
  });
  test("records reality reconstruction skill provenance", async () => {
    const database = memoryDatabase();
    env.DB = database;
    const response = await worker.fetch(jsonRequest("/api/twins/events", {
      id: "skill-run-1",
      tenantId: "tenant-1",
      twinId: "facility-cell-01",
      roomCode: "NEXUS1",
      eventType: "skill",
      payload: { skillId: "materials", confidence: 94, artifacts: ["basecolor.png", "normal.png", "roughness.png"] },
      createdAt: new Date().toISOString(),
    }), env);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.persisted, true);
    assert.equal(body.item.eventType, "skill");
  });
  test("adds a nonce-based content security policy to SPA fallbacks", async () => {
    const response = await worker.fetch(request("/agents/naz/workspace"), env);
    const csp = response.headers.get("Content-Security-Policy") || "";

    assert.equal(response.status, 200);
    assert.match(csp, /script-src 'self' 'nonce-/);
    assert.match(csp, /'wasm-unsafe-eval'/);
    assert.match(csp, /https:\/\/maps\.googleapis\.com/);
    assert.match(csp, /media-src 'self' blob: https:/);
    assert.match(csp, /frame-src https:\/\/\*\.readyplayer\.me/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(response.headers.get("Permissions-Policy") || "", /display-capture=\(self\)/);
  });
});
