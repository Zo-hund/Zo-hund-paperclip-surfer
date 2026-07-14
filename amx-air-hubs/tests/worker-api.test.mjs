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
      contentKind: "text",
      attachments: [],
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.transport, "remote");
    assert.equal(body.text, "The cooling trend is stable.");
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.model, "gpt-5-mini");
    assert.ok(body.tools.some((tool) => tool.name === "openai.responses"));
  });

  test("blocks unknown tools without crashing the runtime", async () => {
    const response = await worker.fetch(jsonRequest("/api/agents/tools/invoke", { toolName: "unknown.tool", agentId: "naz" }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.trace.status, "blocked");
    assert.match(body.output, /Unknown built-in tool/);
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

  test("issues a room token and explicitly dispatches the configured LiveKit agent", async (context) => {
    Object.assign(env, {
      LIVEKIT_URL: "wss://zohund-amx.livekit.cloud",
      LIVEKIT_API_KEY: "livekit-key",
      LIVEKIT_API_SECRET: "livekit-secret",
      LIVEKIT_AGENT_NAME: "amx-voice-agent",
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
    assert.match(csp, /frame-ancestors 'none'/);
  });
});
