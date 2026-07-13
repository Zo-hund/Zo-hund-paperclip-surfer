const rateBuckets = new Map();
const ephemeralRooms = new Map();
const APP_HTML = "__AMX_APP_HTML__";
const CAPABILITY_POLICY = "camera=(self), microphone=(self), geolocation=(self), fullscreen=(self), xr-spatial-tracking=(self)";
const AGENT_TOOLS = [
  { name: "system.health", description: "Inspect AMX runtime health", source: "runtime", available: true },
  { name: "mission.context", description: "Read the active mission context", source: "skill", available: true },
  { name: "proof.latest", description: "Read the latest proof record", source: "runtime", available: true },
  { name: "spatial.capabilities", description: "Inspect browser XR and GPU support", source: "runtime", available: true },
];

function capabilityHeaders(headers = {}) {
  return { ...headers, "Permissions-Policy": CAPABILITY_POLICY, "Referrer-Policy": "strict-origin-when-cross-origin", "X-Content-Type-Options": "nosniff" };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: capabilityHeaders({ "Content-Type": "application/json", "Cache-Control": "no-store" }) });
}

function base64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createLiveKitToken(env, room, identity, name) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify({
    iss: env.LIVEKIT_API_KEY,
    sub: identity,
    name,
    nbf: now - 5,
    exp: now + 60 * 15,
    jti: crypto.randomUUID(),
    metadata: JSON.stringify({ app: "amx-air-hubs", room }),
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  }));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.LIVEKIT_API_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

function allowRequest(request) {
  const key = request.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= 120;
}

function gatewayUrl(base, path) {
  const parsed = new URL(base);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Gateway URL must use HTTPS");
  return new URL(path.replace(/^\//, ""), parsed.toString().endsWith("/") ? parsed : `${parsed}/`);
}

async function gatewayRequest(base, token, path, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(gatewayUrl(base, path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function agentCapabilities(env) {
  const mcpGatewayConfigured = Boolean(env.MCP_GATEWAY_URL);
  const pluginGatewayConfigured = Boolean(env.PLUGIN_GATEWAY_URL);
  return {
    transport: env.AGENT_RUNTIME_URL ? "remote" : "local",
    agentRuntimeConfigured: Boolean(env.AGENT_RUNTIME_URL),
    mcpGatewayConfigured,
    pluginGatewayConfigured,
    livekitConfigured: Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET),
    tools: [
      ...AGENT_TOOLS,
      { name: "plugin.catalog", description: "List tools from the configured Plugin gateway", source: "plugin", available: pluginGatewayConfigured },
      { name: "mcp.tools", description: "List tools from the configured MCP gateway", source: "mcp", available: mcpGatewayConfigured },
    ],
  };
}

function sanitizeAgentPayload(body) {
  const allowedKinds = new Set(["text", "audio", "image", "video", "code", "document"]);
  return {
    agentId: String(body.agentId || "agent").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64),
    agentName: String(body.agentName || "AMX Agent").replace(/[<>]/g, "").slice(0, 80),
    text: String(body.text || "").slice(0, 12_000),
    contentKind: allowedKinds.has(body.contentKind) ? body.contentKind : "text",
    attachments: (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 12).map((attachment) => ({
      id: String(attachment.id || crypto.randomUUID()).slice(0, 80),
      kind: allowedKinds.has(attachment.kind) ? attachment.kind : "document",
      name: String(attachment.name || "attachment").replace(/[<>]/g, "").slice(0, 180),
      mimeType: String(attachment.mimeType || "application/octet-stream").slice(0, 120),
      size: Math.max(0, Math.min(Number(attachment.size) || 0, 100_000_000)),
      transfer: attachment.transfer === "inline" ? "inline" : "metadata",
      content: typeof attachment.content === "string" ? attachment.content.slice(0, 60_000) : undefined,
      dataUrl: typeof attachment.dataUrl === "string" && attachment.dataUrl.length <= 5_800_000 ? attachment.dataUrl : undefined,
    })),
  };
}

function localAgentResult(payload) {
  const kinds = [...new Set(payload.attachments.map((attachment) => attachment.kind))];
  const timestamp = new Date().toISOString();
  const tools = [
    { id: crypto.randomUUID(), name: "mission.context", source: "skill", status: "complete", detail: "Local mission context loaded.", timestamp },
  ];
  if (kinds.includes("code")) tools.push({ id: crypto.randomUUID(), name: "scene-code.review", source: "skill", status: "complete", detail: "Code content registered for local review.", timestamp });
  if (kinds.some((kind) => ["audio", "image", "video"].includes(kind))) tools.push({ id: crypto.randomUUID(), name: "media.intake", source: "runtime", status: "complete", detail: "Media registered; inference requires the remote agent runtime.", timestamp });
  const subject = payload.text || (kinds.length ? `${kinds.join(" + ")} content` : "task");
  return {
    text: `${payload.agentName} accepted: "${subject.slice(0, 180)}" for local orchestration.${kinds.length ? ` ${payload.attachments.length} attachment${payload.attachments.length === 1 ? "" : "s"} registered.` : ""}`,
    transport: "local",
    tools,
  };
}

function normalizeRemoteTools(tools) {
  const validSources = new Set(["skill", "plugin", "mcp", "runtime"]);
  const validStatuses = new Set(["running", "complete", "blocked"]);
  if (!Array.isArray(tools)) return [];
  return tools.filter((tool) => tool && typeof tool === "object").slice(0, 30).map((tool) => ({
    id: String(tool.id || crypto.randomUUID()).slice(0, 120),
    name: String(tool.name || "remote.tool").slice(0, 160),
    source: validSources.has(tool.source) ? tool.source : "runtime",
    status: validStatuses.has(tool.status) ? tool.status : "complete",
    detail: String(tool.detail || "Remote tool completed.").slice(0, 1000),
    timestamp: typeof tool.timestamp === "string" && !Number.isNaN(Date.parse(tool.timestamp)) ? tool.timestamp : new Date().toISOString(),
  }));
}

async function invokeBuiltInTool(toolName, context, env) {
  if (toolName === "system.health") return { service: "amx-air-hubs", online: true, timestamp: new Date().toISOString() };
  if (toolName === "mission.context") return { agentId: context.agentId || "agent", missionId: context.missionId || "webxr-creator", source: "client-context" };
  if (toolName === "spatial.capabilities") return context.browser || { webgpu: false, webxr: false, camera: false };
  if (toolName === "proof.latest") {
    await initialize(env.DB);
    if (!env.DB) return context.latestProof || { status: "No proof database is connected" };
    const result = await env.DB.prepare("SELECT payload FROM proof_records ORDER BY created_at DESC LIMIT 1").first();
    return result?.payload ? JSON.parse(result.payload) : { status: "No proof records" };
  }
  throw new Error("Unknown built-in tool");
}

function openEphemeralRoom(request, roomCode) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  const participant = new URL(request.url).searchParams.get("participant") || crypto.randomUUID().slice(0, 8);
  const room = ephemeralRooms.get(roomCode) || new Set();
  room.add(server);
  ephemeralRooms.set(roomCode, room);
  server.accept();
  const relay = (message, except) => {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    for (const socket of room) {
      if (socket === except) continue;
      try { socket.send(payload); } catch { room.delete(socket); }
    }
  };
  relay({ id: crypto.randomUUID(), sender: participant, text: "joined the room", timestamp: new Date().toISOString(), kind: "presence" }, server);
  server.addEventListener("message", (event) => relay(event.data, server));
  server.addEventListener("close", () => {
    room.delete(server);
    relay({ id: crypto.randomUUID(), sender: participant, text: "left the room", timestamp: new Date().toISOString(), kind: "presence" }, server);
    if (!room.size) ephemeralRooms.delete(roomCode);
  });
  return new Response(null, { status: 101, webSocket: client });
}

async function initialize(db) {
  if (!db) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS proof_records (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, mission_id TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS proof_tenant_idx ON proof_records (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS analytics_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, event_name TEXT NOT NULL, mission_id TEXT, campaign_id TEXT, location_tag TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS analytics_tenant_idx ON analytics_events (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skill_pods (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
  ]);
}

async function handleApi(request, env, url) {
  if (!allowRequest(request)) return json({ error: "Rate limit exceeded" }, 429);
  if (url.pathname === "/api/health") return json({ ok: true, service: "amx-air-hubs", livekit: Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET) });
  if (request.method === "GET" && url.pathname === "/api/agents/capabilities") return json(agentCapabilities(env));
  if (request.method === "POST" && url.pathname === "/api/agents/respond") {
    const payload = sanitizeAgentPayload(await request.json().catch(() => ({})));
    if (!payload.text && !payload.attachments.length) return json({ error: "Text or an attachment is required" }, 400);
    if (!env.AGENT_RUNTIME_URL) return json(localAgentResult(payload));
    try {
      const result = await gatewayRequest(env.AGENT_RUNTIME_URL, env.AGENT_RUNTIME_TOKEN, "respond", payload);
      return json({
        text: String(result.text || result.output || "Remote agent completed the request.").slice(0, 30_000),
        transport: "remote",
        tools: normalizeRemoteTools(result.tools),
      });
    } catch (error) {
      const fallback = localAgentResult(payload);
      return json({ ...fallback, warning: error instanceof Error ? error.message : "Remote runtime unavailable" });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/agents/tools/invoke") {
    const body = await request.json().catch(() => ({}));
    const toolName = String(body.toolName || "").slice(0, 160);
    const source = toolName.startsWith("mcp.") ? "mcp" : toolName.startsWith("plugin.") ? "plugin" : AGENT_TOOLS.find((tool) => tool.name === toolName)?.source || "runtime";
    const timestamp = new Date().toISOString();
    try {
      let output;
      if (source === "mcp") {
        if (!env.MCP_GATEWAY_URL) throw new Error("MCP gateway is not configured");
        output = await gatewayRequest(env.MCP_GATEWAY_URL, env.MCP_GATEWAY_TOKEN, "invoke", { toolName, agentId: body.agentId, context: body.context || {} });
      } else if (toolName.startsWith("plugin.")) {
        if (!env.PLUGIN_GATEWAY_URL) throw new Error("Plugin gateway is not configured");
        output = await gatewayRequest(env.PLUGIN_GATEWAY_URL, env.PLUGIN_GATEWAY_TOKEN, "invoke", { toolName, agentId: body.agentId, context: body.context || {} });
      } else {
        output = await invokeBuiltInTool(toolName, { ...(body.context || {}), agentId: body.agentId }, env);
      }
      return json({
        trace: { id: crypto.randomUUID(), name: toolName, source, status: "complete", detail: "Tool execution completed.", timestamp },
        output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
      });
    } catch (error) {
      return json({
        trace: { id: crypto.randomUUID(), name: toolName, source, status: "blocked", detail: error instanceof Error ? error.message : "Tool execution failed", timestamp },
        output: error instanceof Error ? error.message : "Tool execution failed",
      });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/livekit/token") {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return json({ error: "LiveKit is not configured on this stage", configured: false }, 503);
    }
    let serverUrl;
    try {
      const parsed = new URL(env.LIVEKIT_URL);
      if (!["wss:", "ws:"].includes(parsed.protocol)) throw new Error("LiveKit URL must use WebSocket transport");
      serverUrl = parsed.toString().replace(/\/$/, "");
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid LiveKit URL" }, 500);
    }
    const body = await request.json().catch(() => ({}));
    const room = String(body.room || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64);
    const identity = String(body.identity || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const name = String(body.name || identity || "AMX Explorer").replace(/[<>]/g, "").slice(0, 80);
    if (!room || !identity) return json({ error: "Room and identity are required" }, 400);
    const participantToken = await createLiveKitToken(env, room, identity, name);
    return json({ serverUrl, participantToken, room, expiresIn: 900 });
  }
  if (url.pathname.startsWith("/api/rooms/")) {
    if (request.headers.get("Upgrade") !== "websocket") return json({ error: "WebSocket upgrade required" }, 426);
    const roomCode = url.pathname.split("/").pop();
    if (!env.ROOMS) {
      try { return openEphemeralRoom(request, roomCode); }
      catch (error) { return json({ error: error?.message || "WebSocket runtime error", runtime: typeof WebSocketPair }, 500); }
    }
    const room = env.ROOMS.get(env.ROOMS.idFromName(roomCode));
    return room.fetch(request);
  }
  if (request.method === "POST" && url.pathname === "/api/analytics/events") {
    const event = await request.json();
    await initialize(env.DB);
    if (env.DB) await env.DB.prepare("INSERT OR REPLACE INTO analytics_events (id, tenant_id, event_name, mission_id, campaign_id, location_tag, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(event.id, event.tenantId || "tech-at-nite", event.eventName, event.missionId || null, event.campaignId || null, event.locationTag || null, JSON.stringify(event), event.timestamp).run();
    return json({ accepted: true }, 202);
  }
  if (request.method === "POST" && url.pathname === "/api/sync") {
    const item = await request.json();
    const payload = item.payload || {};
    await initialize(env.DB);
    if (env.DB && item.type?.startsWith("proof:")) {
      await env.DB.prepare("INSERT OR REPLACE INTO proof_records (id, tenant_id, learner_id, mission_id, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(payload.id, payload.tenantId, payload.learnerId, payload.missionId, payload.status, JSON.stringify(payload), payload.timestamp, new Date().toISOString()).run();
    }
    return json({ synced: true, id: item.id }, 202);
  }
  if (request.method === "GET" && url.pathname === "/api/proofs") {
    if (!env.DB) return json({ items: [] });
    await initialize(env.DB);
    const tenantId = url.searchParams.get("tenantId") || "tech-at-nite";
    const result = await env.DB.prepare("SELECT payload FROM proof_records WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100").bind(tenantId).all();
    return json({ items: result.results.map((row) => JSON.parse(row.payload)) });
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || url.pathname.includes(".")) {
      const headers = new Headers(response.headers);
      Object.entries(capabilityHeaders()).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    const runtimeConfig = JSON.stringify({
      supabaseUrl: env.SUPABASE_URL || "",
      supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY || "",
      livekitConfigured: Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET),
    }).replace(/</g, "\\u003c");
    const html = APP_HTML.replace("</head>", `<script>window.__AMX_CONFIG__=${runtimeConfig}</script></head>`);
    return new Response(html, { headers: capabilityHeaders({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }) });
  },
};

export class RoomHub {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const participant = new URL(request.url).searchParams.get("participant") || crypto.randomUUID().slice(0, 8);
    server.serializeAttachment({ participant });
    this.state.acceptWebSocket(server);
    this.broadcast({ id: crypto.randomUUID(), sender: participant, text: "joined the room", timestamp: new Date().toISOString(), kind: "presence" }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, payload) {
    try { this.broadcast(JSON.parse(payload), socket); }
    catch { socket.send(JSON.stringify({ error: "Invalid room message" })); }
  }

  webSocketClose(socket) {
    const participant = socket.deserializeAttachment()?.participant || "participant";
    this.broadcast({ id: crypto.randomUUID(), sender: participant, text: "left the room", timestamp: new Date().toISOString(), kind: "presence" }, socket);
  }

  broadcast(message, except) {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket !== except) socket.send(payload);
    }
  }
}
