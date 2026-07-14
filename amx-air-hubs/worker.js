const rateBuckets = new Map();
const ephemeralRooms = new Map();
let databaseInitialization;
const APP_HTML = "__AMX_APP_HTML__";
const CAPABILITY_POLICY = "camera=(self), microphone=(self), geolocation=(self), fullscreen=(self), xr-spatial-tracking=(self)";
const SERVICE_VERSION = "1.1.0";
const MAX_AGENT_BODY_BYTES = 7 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_GATEWAY_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUIRED_SERVICE_NAMES = new Set(["database", "media", "realtime", "rooms", "agent", "mcp", "plugins", "livekit", "proof-signing", "telemetry"]);
const DATA_CENTER_ADAPTERS = new Set(["redfish", "snmp", "modbus", "dcim"]);
const MEDIA_TYPES = new Set([
  "application/json", "application/octet-stream", "application/pdf", "model/gltf+json", "model/gltf-binary",
  "text/css", "text/javascript", "text/markdown", "text/plain", "text/typescript",
]);
const AGENT_TOOLS = [
  { name: "system.health", description: "Inspect AMX runtime health", source: "runtime", available: true },
  { name: "mission.context", description: "Read the active mission context", source: "skill", available: true },
  { name: "proof.latest", description: "Read the latest proof record", source: "runtime", available: true },
  { name: "spatial.capabilities", description: "Inspect browser XR and GPU support", source: "runtime", available: true },
  { name: "dcim.inspect", description: "Inspect the active tenant pod telemetry", source: "skill", available: true },
  { name: "rack.thermal-map", description: "Diagnose rack inlet temperature and airflow risk", source: "skill", available: true },
  { name: "tenant.capacity-plan", description: "Calculate tenant power and compute headroom", source: "skill", available: true },
  { name: "incident.runbook", description: "Build a guarded response plan for the active scenario", source: "skill", available: true },
  { name: "workshop.brief", description: "Generate a facilitator brief from the twin state", source: "skill", available: true },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function capabilityHeaders(headers = {}) {
  return {
    ...headers,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": CAPABILITY_POLICY,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function htmlHeaders(nonce) {
  return capabilityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  });
}

function json(data, status = 200, requestId = crypto.randomUUID(), headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: capabilityHeaders({ "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-ID": requestId, ...headers }),
  });
}

function logEvent(level, event, fields = {}) {
  const output = JSON.stringify({ timestamp: new Date().toISOString(), level, event, service: "amx-air-hubs", version: SERVICE_VERSION, ...fields });
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) throw new HttpError(415, "Content-Type must be application/json");
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) throw new HttpError(413, "Request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, "Request body is too large");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new HttpError(400, "Request body must contain valid JSON"); }
  if (!isPlainObject(parsed)) throw new HttpError(400, "Request body must be a JSON object");
  return parsed;
}

function safeId(value, fallback = "") {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
}

function safeLabel(value, fallback = "") {
  return String(value || fallback).replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 180);
}

function validTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function serviceUrlConfigured(value, protocols) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const secure = parsed.protocol === "https:" || parsed.protocol === "wss:" || local;
    return protocols.includes(parsed.protocol) && secure && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch { return false; }
}

function runtimeReadiness(env) {
  const required = new Set(String(env.REQUIRED_SERVICES || "").split(",").map((item) => item.trim().toLowerCase()).filter((item) => REQUIRED_SERVICE_NAMES.has(item)));
  const configured = {
    database: Boolean(env.DB),
    media: Boolean(env.MEDIA),
    realtime: serviceUrlConfigured(env.SUPABASE_URL, ["https:"]) && Boolean(env.SUPABASE_PUBLISHABLE_KEY),
    rooms: Boolean(env.ROOMS) || (serviceUrlConfigured(env.SUPABASE_URL, ["https:"]) && Boolean(env.SUPABASE_PUBLISHABLE_KEY)),
    agent: serviceUrlConfigured(env.AGENT_RUNTIME_URL, ["https:", "http:"]) || Boolean(env.OPENAI_API_KEY),
    mcp: serviceUrlConfigured(env.MCP_GATEWAY_URL, ["https:", "http:"]),
    plugins: serviceUrlConfigured(env.PLUGIN_GATEWAY_URL, ["https:", "http:"]),
    livekit: serviceUrlConfigured(env.LIVEKIT_URL, ["wss:", "ws:"]) && Boolean(env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET),
    "proof-signing": Boolean(env.PROOF_SIGNING_SECRET),
    telemetry: Boolean(env.DB && env.DCIM_INGEST_TOKEN),
  };
  const missingRequired = [...required].filter((name) => !configured[name]);
  const optionalMissing = Object.entries(configured).filter(([, value]) => !value).map(([name]) => name);
  return {
    ready: missingRequired.length === 0 && Boolean(env.ASSETS),
    mode: missingRequired.length ? "not-ready" : optionalMissing.length ? "degraded" : "full",
    required: [...required],
    missingRequired,
    optionalMissing,
    components: configured,
    roomTransport: env.ROOMS ? "durable-object" : configured.realtime ? "supabase" : "local-only",
  };
}

async function probeReadiness(env) {
  const state = runtimeReadiness(env);
  if (state.components.database) {
    try {
      await initialize(env.DB);
      await env.DB.prepare("SELECT 1 AS ok").first();
    } catch { state.components.database = false; }
  }
  if (state.components.media) {
    try { await env.MEDIA.list({ limit: 1 }); }
    catch { state.components.media = false; }
  }
  state.missingRequired = state.required.filter((name) => !state.components[name]);
  state.optionalMissing = Object.entries(state.components).filter(([, value]) => !value).map(([name]) => name);
  state.ready = state.missingRequired.length === 0 && Boolean(env.ASSETS);
  state.mode = state.missingRequired.length ? "not-ready" : state.optionalMissing.length ? "degraded" : "full";
  return state;
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
    identity,
    name,
    iat: now,
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

async function createLiveKitAdminToken(env, room) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify({
    iss: env.LIVEKIT_API_KEY,
    sub: "amx-air-hubs-worker",
    identity: "amx-air-hubs-worker",
    name: "AMX AIR Hubs Worker",
    iat: now,
    nbf: now - 5,
    exp: now + 60,
    jti: crypto.randomUUID(),
    video: { room, roomAdmin: true },
  }));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LIVEKIT_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

async function ensureLiveKitAgentDispatch(env, room, requestId) {
  const agentName = safeId(env.LIVEKIT_AGENT_NAME);
  if (!agentName) return { configured: false, dispatched: false };
  const endpoint = new URL(env.LIVEKIT_URL);
  endpoint.protocol = endpoint.protocol === "wss:" ? "https:" : "http:";
  endpoint.pathname = "/twirp/livekit.AgentDispatchService/ListDispatch";
  endpoint.search = "";
  endpoint.hash = "";
  const token = await createLiveKitAdminToken(env, room);
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const listResponse = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ room }), signal: controller.signal });
    if (!listResponse.ok && listResponse.status !== 404) throw new Error(`Agent dispatch list returned ${listResponse.status}`);
    const list = listResponse.ok ? await listResponse.json() : {};
    const dispatches = list.agent_dispatches || list.agentDispatches || [];
    if (Array.isArray(dispatches) && dispatches.some((dispatch) => dispatch.agent_name === agentName || dispatch.agentName === agentName)) {
      return { configured: true, dispatched: true, existing: true, agentName };
    }
    endpoint.pathname = "/twirp/livekit.AgentDispatchService/CreateDispatch";
    const createResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ agent_name: agentName, room, metadata: JSON.stringify({ app: "amx-air-hubs", room }) }),
      signal: controller.signal,
    });
    if (!createResponse.ok) throw new Error(`Agent dispatch create returned ${createResponse.status}`);
    return { configured: true, dispatched: true, existing: false, agentName };
  } catch (error) {
    logEvent("warn", "livekit.agent_dispatch_failed", { requestId, room, agentName, error: error instanceof Error ? error.message : "Agent dispatch failed" });
    return { configured: true, dispatched: false, agentName };
  } finally {
    clearTimeout(timeout);
  }
}
function allowRequest(request) {
  const key = request.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now();
  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, value] of rateBuckets) if (now - value.start > 60_000) rateBuckets.delete(bucketKey);
  }
  const bucket = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= 120;
}

function gatewayUrl(base, path) {
  const parsed = new URL(base);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) throw new Error("Gateway URL must use HTTPS");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Gateway URL cannot include credentials, a query, or a fragment");
  return new URL(path.replace(/^\//, ""), parsed.toString().endsWith("/") ? parsed : `${parsed}/`);
}

async function gatewayRequest(base, token, path, payload, requestId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const startedAt = Date.now();
  const target = gatewayUrl(base, path);
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Request-ID": requestId, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) throw new Error("Gateway did not return JSON");
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_GATEWAY_RESPONSE_BYTES) throw new Error("Gateway response is too large");
    const result = JSON.parse(text);
    if (!isPlainObject(result)) throw new Error("Gateway response must be a JSON object");
    logEvent("info", "gateway.completed", { requestId, host: target.hostname, path: target.pathname, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    logEvent("warn", "gateway.failed", { requestId, host: target.hostname, path: target.pathname, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown gateway error" });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function openAIResponse(env, payload, requestId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const attachmentSummary = payload.attachments.length
    ? `\nAttachments: ${payload.attachments.map((attachment) => `${attachment.kind}:${attachment.name}`).join(", ")}`
    : "";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
      body: JSON.stringify({
        model: safeLabel(env.OPENAI_MODEL, "gpt-5-mini"),
        store: false,
        max_output_tokens: 700,
        instructions: "You are an AMX AIR Hubs digital-twin operator. Explain telemetry and simulations clearly. Never claim a physical action occurred. Treat approved actions as recorded intent until a verified physical adapter reports completion.",
        input: `${payload.text || "Review the supplied content."}${attachmentSummary}`,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI Responses API returned ${response.status}`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_GATEWAY_RESPONSE_BYTES) throw new Error("OpenAI response is too large");
    const result = JSON.parse(text);
    const output = typeof result.output_text === "string"
      ? result.output_text
      : (Array.isArray(result.output) ? result.output : []).flatMap((item) => Array.isArray(item?.content) ? item.content : []).map((item) => item?.text).filter(Boolean).join("\n");
    if (!output) throw new Error("OpenAI returned no text output");
    return {
      text: output.slice(0, 30_000),
      transport: "remote",
      tools: [{ id: crypto.randomUUID(), name: "openai.responses", source: "runtime", status: "complete", detail: `Response generated by ${safeLabel(env.OPENAI_MODEL, "gpt-5-mini")}.`, timestamp: new Date().toISOString() }],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function agentCapabilities(env) {
  const readiness = runtimeReadiness(env);
  const mcpGatewayConfigured = readiness.components.mcp;
  const pluginGatewayConfigured = readiness.components.plugins;
  return {
    transport: readiness.components.agent ? "remote" : "local",
    agentRuntimeConfigured: readiness.components.agent,
    mcpGatewayConfigured,
    pluginGatewayConfigured,
    livekitConfigured: readiness.components.livekit,
    persistenceConfigured: readiness.components.database,
    mediaStorageConfigured: readiness.components.media,
    roomTransport: readiness.roomTransport,
    deploymentMode: readiness.mode,
    tools: [
      ...AGENT_TOOLS,
      { name: "plugin.catalog", description: "List tools from the configured Plugin gateway", source: "plugin", available: pluginGatewayConfigured },
      { name: "mcp.tools", description: "List tools from the configured MCP gateway", source: "mcp", available: mcpGatewayConfigured },
    ],
  };
}

function sanitizeAgentPayload(body) {
  const allowedKinds = new Set(["text", "audio", "image", "video", "code", "document"]);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  return {
    agentId: safeId(body.agentId, "agent").slice(0, 64),
    agentName: safeLabel(body.agentName, "AMX Agent").slice(0, 80),
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    text: String(body.text || "").slice(0, 12_000),
    contentKind: allowedKinds.has(body.contentKind) ? body.contentKind : "text",
    attachments: attachments.filter(isPlainObject).slice(0, 12).map((attachment) => {
      const mimeType = String(attachment.mimeType || "application/octet-stream").toLowerCase().slice(0, 120);
      const dataUrl = typeof attachment.dataUrl === "string" && attachment.dataUrl.length <= 5_800_000 && attachment.dataUrl.startsWith(`data:${mimeType};base64,`)
        ? attachment.dataUrl
        : undefined;
      const storageUrl = typeof attachment.storageUrl === "string" && /^\/api\/media\/[a-zA-Z0-9_-]{8,120}$/.test(attachment.storageUrl)
        ? attachment.storageUrl
        : undefined;
      return {
      id: String(attachment.id || crypto.randomUUID()).slice(0, 80),
      kind: allowedKinds.has(attachment.kind) ? attachment.kind : "document",
      name: safeLabel(attachment.name, "attachment"),
      mimeType,
      size: Math.max(0, Math.min(Number(attachment.size) || 0, MAX_MEDIA_BYTES)),
      transfer: attachment.transfer === "inline" ? "inline" : attachment.transfer === "stored" && storageUrl ? "stored" : "metadata",
      content: typeof attachment.content === "string" ? attachment.content.slice(0, 60_000) : undefined,
      dataUrl,
      storageUrl,
    };
    }),
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

function allowedMediaType(value) {
  const mimeType = String(value || "application/octet-stream").toLowerCase().split(";")[0].trim();
  if (mimeType.startsWith("image/") || mimeType.startsWith("audio/") || mimeType.startsWith("video/") || MEDIA_TYPES.has(mimeType)) return mimeType;
  throw new HttpError(415, "Unsupported media type");
}

function validateAnalyticsEvent(body) {
  const id = safeId(body.id);
  const eventName = safeId(body.eventName);
  if (!id || !eventName) throw new HttpError(400, "Analytics id and eventName are required");
  return {
    ...body,
    id,
    eventName,
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    missionId: safeId(body.missionId) || undefined,
    campaignId: safeId(body.campaignId) || undefined,
    locationTag: safeLabel(body.locationTag) || undefined,
    timestamp: validTimestamp(body.timestamp) ? body.timestamp : new Date().toISOString(),
  };
}

function safeNumber(value, fallback = 0, minimum = -1_000_000, maximum = 1_000_000) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function validateAnchorPayload(body) {
  const id = safeId(body.id);
  const roomCode = safeId(body.roomCode).toUpperCase().slice(0, 64);
  const source = ["webxr", "camera", "map"].includes(body.source) ? body.source : "map";
  const localPosition = Array.isArray(body.localPosition) && body.localPosition.length === 3
    ? body.localPosition.map((value) => safeNumber(value, 0, -10_000, 10_000))
    : [0, 0, 0];
  const orientation = Array.isArray(body.orientation) && body.orientation.length === 4
    ? body.orientation.map((value, index) => safeNumber(value, index === 3 ? 1 : 0, -1, 1))
    : [0, 0, 0, 1];
  if (!id || !roomCode) throw new HttpError(400, "Anchor id and roomCode are required");
  return {
    id,
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    roomCode,
    label: safeLabel(body.label, "Spatial anchor").slice(0, 80),
    ownerId: safeId(body.ownerId, "participant"),
    latitude: body.latitude === null || body.latitude === undefined ? null : safeNumber(body.latitude, 0, -90, 90),
    longitude: body.longitude === null || body.longitude === undefined ? null : safeNumber(body.longitude, 0, -180, 180),
    altitude: body.altitude === null || body.altitude === undefined ? null : safeNumber(body.altitude, 0, -20_000, 100_000),
    accuracy: body.accuracy === null || body.accuracy === undefined ? null : safeNumber(body.accuracy, 0, 0, 100_000),
    localPosition,
    orientation,
    source,
    persistentHandle: typeof body.persistentHandle === "string" ? safeLabel(body.persistentHandle).slice(0, 240) : undefined,
    createdAt: validTimestamp(body.createdAt) ? body.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function validateTwinEvent(body) {
  const id = safeId(body.id);
  const twinId = safeId(body.twinId);
  const roomCode = safeId(body.roomCode).toUpperCase().slice(0, 64);
  const eventType = ["scenario", "approval", "telemetry", "skill"].includes(body.eventType) ? body.eventType : "";
  if (!id || !twinId || !roomCode || !eventType) throw new HttpError(400, "Twin id, roomCode, and supported eventType are required");
  return {
    id,
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    twinId,
    roomCode,
    eventType,
    payload: isPlainObject(body.payload) ? body.payload : {},
    createdAt: validTimestamp(body.createdAt) ? body.createdAt : new Date().toISOString(),
  };
}

function requireMetric(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new HttpError(400, `${label} is outside the supported range`);
  return number;
}

function validateDataCenterTelemetry(body) {
  const id = safeId(body.id);
  const tenantId = safeId(body.tenantId);
  const adapter = DATA_CENTER_ADAPTERS.has(body.adapter) ? body.adapter : "";
  const sourceSystem = safeLabel(body.sourceSystem).slice(0, 120);
  if (!id || !tenantId || !adapter || !sourceSystem || !validTimestamp(body.timestamp)) throw new HttpError(400, "Telemetry id, tenantId, adapter, sourceSystem, and timestamp are required");
  if (!isPlainObject(body.pod)) throw new HttpError(400, "Telemetry pod metrics are required");
  if (!Array.isArray(body.racks) || !body.racks.length || body.racks.length > 64) throw new HttpError(400, "Telemetry requires 1 to 64 racks");
  const racks = body.racks.map((rack, index) => {
    if (!isPlainObject(rack)) throw new HttpError(400, "Each rack telemetry entry must be an object");
    const label = safeLabel(rack.label, `R${index + 1}`).slice(0, 24);
    const inletC = requireMetric(rack.inletC, `${label} inletC`, -20, 90);
    const capacityPercent = requireMetric(rack.capacityPercent, `${label} capacityPercent`, 0, 150);
    const networkGbps = requireMetric(rack.networkGbps, `${label} networkGbps`, 0, 10_000);
    const health = inletC >= 31 || capacityPercent >= 102 || networkGbps < 1.5 ? "critical" : inletC >= 27 || capacityPercent >= 88 ? "watch" : "nominal";
    return {
      id: safeId(rack.id, `${tenantId}-r${index + 1}`),
      label,
      workload: safeLabel(rack.workload, "mapped workload").slice(0, 80),
      powerKw: requireMetric(rack.powerKw, `${label} powerKw`, 0, 5_000),
      inletC,
      capacityPercent: Math.round(capacityPercent),
      networkGbps,
      health,
    };
  });
  const pod = {
    itLoadKw: requireMetric(body.pod.itLoadKw, "pod.itLoadKw", 0, 100_000),
    facilityKw: requireMetric(body.pod.facilityKw, "pod.facilityKw", 0, 150_000),
    pue: requireMetric(body.pod.pue, "pod.pue", 1, 5),
    coolingKw: requireMetric(body.pod.coolingKw, "pod.coolingKw", 0, 100_000),
    networkGbps: requireMetric(body.pod.networkGbps, "pod.networkGbps", 0, 100_000),
    storageTb: requireMetric(body.pod.storageTb, "pod.storageTb", 0, 10_000_000),
    availabilityPercent: requireMetric(body.pod.availabilityPercent, "pod.availabilityPercent", 0, 100),
    carbonGramsPerKwh: requireMetric(body.pod.carbonGramsPerKwh, "pod.carbonGramsPerKwh", 0, 5_000),
  };
  return {
    id, tenantId, adapter, sourceSystem, timestamp: body.timestamp, receivedAt: new Date().toISOString(), pod, racks,
    alarms: Array.isArray(body.alarms) ? body.alarms.map((alarm) => safeLabel(alarm)).filter(Boolean).slice(0, 64) : [],
  };
}

function authorizedTelemetryIngest(request, env) {
  const supplied = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.DCIM_INGEST_TOKEN}`;
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

function validateProofPayload(body) {
  if (!isPlainObject(body)) throw new HttpError(400, "Proof payload is required");
  const proof = {
    ...body,
    id: safeId(body.id),
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    learnerId: safeId(body.learnerId, "guest-user"),
    missionId: safeId(body.missionId),
    status: body.status === "complete" ? "complete" : "in_progress",
    timestamp: validTimestamp(body.timestamp) ? body.timestamp : new Date().toISOString(),
  };
  if (!proof.id || !proof.missionId) throw new HttpError(400, "Proof id and missionId are required");
  return proof;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).filter((key) => key !== "serverAttestation").sort().map((key) => [key, canonicalValue(value[key])]));
}

async function attestProof(proof, env) {
  if (!env.PROOF_SIGNING_SECRET) return proof;
  const signedAt = new Date().toISOString();
  const source = JSON.stringify(canonicalValue(proof));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.PROOF_SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(source)));
  return { ...proof, serverAttestation: { algorithm: "HMAC-SHA256", signature, signedAt } };
}

async function recordAgentRun(env, input) {
  if (!env.DB) return;
  try {
    await initialize(env.DB);
    await env.DB.prepare("INSERT INTO agent_runs (id, tenant_id, agent_id, transport, content_kind, attachment_count, status, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), safeId(input.tenantId, "tech-at-nite"), safeId(input.agentId, "agent"), input.transport, input.contentKind, input.attachmentCount, input.status, input.requestId, new Date().toISOString()).run();
  } catch (error) {
    logEvent("warn", "agent.telemetry_failed", { requestId: input.requestId, error: error instanceof Error ? error.message : "Agent telemetry persistence failed" });
  }
}

async function persistAnalytics(env, event) {
  if (!env.DB) return;
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO analytics_events (id, tenant_id, event_name, mission_id, campaign_id, location_tag, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(event.id, event.tenantId, event.eventName, event.missionId || null, event.campaignId || null, event.locationTag || null, JSON.stringify(event), event.timestamp).run();
}

async function persistAnchor(env, anchor) {
  if (!env.DB) return;
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO geo_anchors (id, tenant_id, room_code, payload, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(anchor.id, anchor.tenantId, anchor.roomCode, JSON.stringify(anchor), anchor.updatedAt).run();
}

async function persistTwinEvent(env, event) {
  if (!env.DB) return;
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO digital_twin_events (id, tenant_id, twin_id, room_code, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(event.id, event.tenantId, event.twinId, event.roomCode, event.eventType, JSON.stringify(event.payload), event.createdAt).run();
}

async function persistDataCenterTelemetry(env, item) {
  if (!env.DB) throw new HttpError(503, "Telemetry database is not configured");
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO data_center_telemetry (id, tenant_id, adapter, source_system, observed_at, received_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(item.id, item.tenantId, item.adapter, item.sourceSystem, item.timestamp, item.receivedAt, JSON.stringify(item)).run();
}

async function persistProof(env, proof) {
  if (!env.DB) return;
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO proof_records (id, tenant_id, learner_id, mission_id, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(proof.id, proof.tenantId, proof.learnerId, proof.missionId, proof.status, JSON.stringify(proof), proof.timestamp, new Date().toISOString()).run();
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 32_768, bytes.length)));
  }
  return btoa(binary);
}

async function hydrateAttachmentsForGateway(payload, origin, env) {
  const attachments = await Promise.all(payload.attachments.map(async (attachment) => {
    if (!attachment.storageUrl || attachment.dataUrl || attachment.content || !env.MEDIA) {
      return { ...attachment, storageUrl: attachment.storageUrl ? new URL(attachment.storageUrl, origin).toString() : undefined };
    }
    const id = safeId(attachment.storageUrl.split("/").pop());
    try {
      const object = id ? await env.MEDIA.get(id) : null;
      if (!object) throw new Error("Stored attachment was not found");
      const buffer = await object.arrayBuffer();
      if (buffer.byteLength > MAX_MEDIA_BYTES) throw new Error("Stored attachment exceeds the gateway limit");
      const contentType = object.httpMetadata?.contentType || attachment.mimeType || "application/octet-stream";
      return { ...attachment, dataUrl: `data:${contentType};base64,${bytesToBase64(buffer)}`, transfer: "inline", storageUrl: new URL(attachment.storageUrl, origin).toString() };
    } catch {
      return { ...attachment, storageUrl: new URL(attachment.storageUrl, origin).toString() };
    }
  }));
  return { ...payload, attachments };
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
  const tenant = isPlainObject(context.tenant) ? context.tenant : {};
  const pod = isPlainObject(context.pod) ? context.pod : {};
  const racks = Array.isArray(context.racks) ? context.racks.filter(isPlainObject).slice(0, 24) : [];
  const alarms = Array.isArray(context.alarms) ? context.alarms.map((alarm) => safeLabel(alarm)).filter(Boolean).slice(0, 24) : [];
  if (toolName === "dcim.inspect") return {
    tenant: safeLabel(tenant.name, "Active tenant"), source: safeLabel(context.provenance, "unknown"), scenario: safeId(context.scenario, "normal-operations"),
    itLoadKw: safeNumber(pod.itLoadKw), pue: safeNumber(pod.pue), networkGbps: safeNumber(pod.networkGbps), availabilityPercent: safeNumber(pod.availabilityPercent), alarms,
  };
  if (toolName === "rack.thermal-map") return {
    tenant: safeLabel(tenant.name, "Active tenant"),
    racks: racks.map((rack) => ({ label: safeLabel(rack.label), inletC: safeNumber(rack.inletC), capacityPercent: safeNumber(rack.capacityPercent), health: ["nominal", "watch", "critical"].includes(rack.health) ? rack.health : "unknown" })),
    recommendation: alarms.length ? "Inspect the highest-temperature inlet, verify airflow containment, and simulate load movement before operator approval." : "Thermal envelope is nominal; preserve the current airflow configuration.",
  };
  if (toolName === "tenant.capacity-plan") return {
    tenant: safeLabel(tenant.name, "Active tenant"),
    rackHeadroom: racks.map((rack) => ({ label: safeLabel(rack.label), headroomPercent: Math.max(0, 100 - safeNumber(rack.capacityPercent)) })),
    guardrail: "Keep at least 15% rack headroom and validate power, cooling, and SLA impact before workload admission.",
  };
  if (toolName === "incident.runbook") return {
    scenario: safeId(context.scenario, "normal-operations"), alarms,
    steps: ["Confirm tenant and telemetry provenance", "Identify affected racks and SLA impact", "Simulate a reversible response", "Request authorized operator approval", "Execute through the approved control plane", "Verify recovery and record proof"],
    physicalActuation: "locked",
  };
  if (toolName === "workshop.brief") return {
    tenant: safeLabel(tenant.name, "Active tenant"), scenario: safeId(context.scenario, "normal-operations"),
    objective: "Use the twin to observe, diagnose, simulate, request approval, and explain the evidence behind the decision.",
    deliverables: ["risk statement", "rack evidence", "scenario comparison", "human approval decision", "post-action verification"],
  };
  throw new Error("Unknown built-in tool");
}

function sanitizeRoomMessage(value, senderFallback = "participant") {
  let input = value;
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).byteLength > 16_384) throw new Error("Room message is too large");
    input = JSON.parse(value);
  }
  if (!isPlainObject(input)) throw new Error("Room message must be an object");
  const kind = ["chat", "presence", "progress"].includes(input.kind) ? input.kind : "chat";
  const text = String(input.text || "").trim().slice(0, 2000);
  if (!text) throw new Error("Room message text is required");
  return {
    id: safeId(input.id, crypto.randomUUID()),
    sender: safeId(input.sender, senderFallback),
    text,
    timestamp: validTimestamp(input.timestamp) ? input.timestamp : new Date().toISOString(),
    kind,
  };
}

function openEphemeralRoom(request, roomCode) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  const participant = safeId(new URL(request.url).searchParams.get("participant"), crypto.randomUUID().slice(0, 8));
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
  server.addEventListener("message", (event) => {
    try { relay(sanitizeRoomMessage(event.data, participant), server); }
    catch (error) { server.send(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid room message" })); }
  });
  server.addEventListener("close", () => {
    room.delete(server);
    relay({ id: crypto.randomUUID(), sender: participant, text: "left the room", timestamp: new Date().toISOString(), kind: "presence" }, server);
    if (!room.size) ephemeralRooms.delete(roomCode);
  });
  return new Response(null, { status: 101, webSocket: client });
}

async function initialize(db) {
  if (!db) return;
  if (!databaseInitialization) databaseInitialization = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS proof_records (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, mission_id TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS proof_tenant_idx ON proof_records (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS analytics_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, event_name TEXT NOT NULL, mission_id TEXT, campaign_id TEXT, location_tag TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS analytics_tenant_idx ON analytics_events (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skill_pods (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS media_objects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, file_name TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, object_key TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS media_tenant_idx ON media_objects (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL, transport TEXT NOT NULL, content_kind TEXT NOT NULL, attachment_count INTEGER NOT NULL, status TEXT NOT NULL, request_id TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS agent_runs_tenant_idx ON agent_runs (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS geo_anchors (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, room_code TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS geo_anchors_room_idx ON geo_anchors (tenant_id, room_code, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS digital_twin_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, twin_id TEXT NOT NULL, room_code TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS digital_twin_room_idx ON digital_twin_events (tenant_id, room_code, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS data_center_telemetry (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, adapter TEXT NOT NULL, source_system TEXT NOT NULL, observed_at TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS data_center_telemetry_tenant_idx ON data_center_telemetry (tenant_id, observed_at)"),
  ]).catch((error) => {
    databaseInitialization = undefined;
    throw error;
  });
  await databaseInitialization;
}

async function handleApi(request, env, url, requestId) {
  const reply = (data, status = 200, headers = {}) => json(data, status, requestId, headers);
  if (!allowRequest(request)) return reply({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": "60" });
  if (request.method === "GET" && url.pathname === "/api/health") {
    return reply({ ok: true, service: "amx-air-hubs", version: SERVICE_VERSION, requestId, timestamp: new Date().toISOString() });
  }
  if (request.method === "GET" && url.pathname === "/api/ready") {
    const readiness = await probeReadiness(env);
    return reply({ ...readiness, service: "amx-air-hubs", version: SERVICE_VERSION, requestId, timestamp: new Date().toISOString() }, readiness.ready ? 200 : 503);
  }
  if (request.method === "GET" && url.pathname === "/api/agents/capabilities") return reply(agentCapabilities(env));
  if (request.method === "GET" && url.pathname === "/api/telemetry/data-center") {
    const tenantId = safeId(url.searchParams.get("tenantId"));
    if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
    if (!env.DB) return reply({ item: null, persisted: false, requestId });
    await initialize(env.DB);
    const row = await env.DB.prepare("SELECT payload FROM data_center_telemetry WHERE tenant_id = ? ORDER BY observed_at DESC LIMIT 1").bind(tenantId).first();
    if (!row?.payload) return reply({ item: null, persisted: true, requestId });
    const item = JSON.parse(row.payload);
    item.stale = Date.now() - Date.parse(item.timestamp) > 120_000;
    return reply({ item, persisted: true, requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/telemetry/data-center") {
    if (!env.DCIM_INGEST_TOKEN) return reply({ error: "Telemetry ingestion is not configured", requestId }, 503);
    if (!authorizedTelemetryIngest(request, env)) return reply({ error: "Telemetry ingest authorization failed", requestId }, 401);
    const item = validateDataCenterTelemetry(await readJson(request, 256 * 1024));
    await persistDataCenterTelemetry(env, item);
    logEvent("info", "telemetry.ingested", { requestId, tenantId: item.tenantId, adapter: item.adapter, rackCount: item.racks.length });
    return reply({ item: { ...item, stale: false }, persisted: true, requestId }, 201);
  }
  if (request.method === "POST" && url.pathname === "/api/agents/respond") {
    const payload = sanitizeAgentPayload(await readJson(request, MAX_AGENT_BODY_BYTES));
    if (!payload.text && !payload.attachments.length) return reply({ error: "Text or an attachment is required", requestId }, 400);
    if (!runtimeReadiness(env).components.agent) {
      const fallback = localAgentResult(payload);
      await recordAgentRun(env, { tenantId: payload.tenantId, agentId: payload.agentId, transport: "local", contentKind: payload.contentKind, attachmentCount: payload.attachments.length, status: "complete", requestId });
      return reply({ ...fallback, requestId });
    }
    try {
      const gatewayPayload = await hydrateAttachmentsForGateway(payload, url.origin, env);
      const result = env.AGENT_RUNTIME_URL
        ? await gatewayRequest(env.AGENT_RUNTIME_URL, env.AGENT_RUNTIME_TOKEN, "respond", gatewayPayload, requestId)
        : await openAIResponse(env, gatewayPayload, requestId);
      await recordAgentRun(env, { tenantId: payload.tenantId, agentId: payload.agentId, transport: "remote", contentKind: payload.contentKind, attachmentCount: payload.attachments.length, status: "complete", requestId });
      return reply({
        text: String(result.text || result.output || "Remote agent completed the request.").slice(0, 30_000),
        transport: "remote",
        tools: normalizeRemoteTools(result.tools),
        requestId,
      });
    } catch (error) {
      const fallback = localAgentResult(payload);
      await recordAgentRun(env, { tenantId: payload.tenantId, agentId: payload.agentId, transport: "local", contentKind: payload.contentKind, attachmentCount: payload.attachments.length, status: "fallback", requestId });
      return reply({ ...fallback, warning: error instanceof Error ? error.message : "Remote runtime unavailable", requestId });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/agents/tools/invoke") {
    const body = await readJson(request, 256 * 1024);
    const toolName = String(body.toolName || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 160);
    if (!toolName) return reply({ error: "toolName is required", requestId }, 400);
    const source = toolName.startsWith("mcp.") ? "mcp" : toolName.startsWith("plugin.") ? "plugin" : AGENT_TOOLS.find((tool) => tool.name === toolName)?.source || "runtime";
    const timestamp = new Date().toISOString();
    try {
      let output;
      if (source === "mcp") {
        if (!env.MCP_GATEWAY_URL) throw new Error("MCP gateway is not configured");
        output = await gatewayRequest(env.MCP_GATEWAY_URL, env.MCP_GATEWAY_TOKEN, "invoke", { toolName, agentId: safeId(body.agentId, "agent"), context: isPlainObject(body.context) ? body.context : {} }, requestId);
      } else if (toolName.startsWith("plugin.")) {
        if (!env.PLUGIN_GATEWAY_URL) throw new Error("Plugin gateway is not configured");
        output = await gatewayRequest(env.PLUGIN_GATEWAY_URL, env.PLUGIN_GATEWAY_TOKEN, "invoke", { toolName, agentId: safeId(body.agentId, "agent"), context: isPlainObject(body.context) ? body.context : {} }, requestId);
      } else {
        output = await invokeBuiltInTool(toolName, { ...(isPlainObject(body.context) ? body.context : {}), agentId: safeId(body.agentId, "agent") }, env);
      }
      return reply({
        trace: { id: crypto.randomUUID(), name: toolName, source, status: "complete", detail: "Tool execution completed.", timestamp },
        output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
        requestId,
      });
    } catch (error) {
      return reply({
        trace: { id: crypto.randomUUID(), name: toolName, source, status: "blocked", detail: error instanceof Error ? error.message : "Tool execution failed", timestamp },
        output: error instanceof Error ? error.message : "Tool execution failed",
        requestId,
      });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/media") {
    if (!env.MEDIA) return reply({ error: "Media storage is not configured", requestId }, 503);
    const declaredSize = Number(request.headers.get("Content-Length") || 0);
    if (declaredSize > MAX_MEDIA_BYTES) return reply({ error: "Media exceeds the 25 MB limit", requestId }, 413);
    const contentType = allowedMediaType(request.headers.get("Content-Type"));
    const body = await request.arrayBuffer();
    if (!body.byteLength) return reply({ error: "Media body is required", requestId }, 400);
    if (body.byteLength > MAX_MEDIA_BYTES) return reply({ error: "Media exceeds the 25 MB limit", requestId }, 413);
    const id = crypto.randomUUID();
    const fileName = safeLabel(request.headers.get("X-AMX-Filename"), `attachment-${id}`);
    const tenantId = safeId(request.headers.get("X-AMX-Tenant"), "tech-at-nite");
    const createdAt = new Date().toISOString();
    await env.MEDIA.put(id, body, { httpMetadata: { contentType }, customMetadata: { fileName, tenantId, createdAt } });
    let metadataPersisted = false;
    if (env.DB) {
      try {
        await initialize(env.DB);
        await env.DB.prepare("INSERT INTO media_objects (id, tenant_id, file_name, content_type, size_bytes, object_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(id, tenantId, fileName, contentType, body.byteLength, id, createdAt).run();
        metadataPersisted = true;
      } catch (error) {
        logEvent("warn", "media.metadata_failed", { requestId, id, error: error instanceof Error ? error.message : "Media metadata persistence failed" });
      }
    }
    logEvent("info", "media.stored", { requestId, id, tenantId, contentType, sizeBytes: body.byteLength });
    return reply({ id, url: `/api/media/${id}`, fileName, contentType, size: body.byteLength, metadataPersisted, requestId }, 201);
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/media/")) {
    if (!env.MEDIA) return reply({ error: "Media storage is not configured", requestId }, 503);
    const id = safeId(url.pathname.split("/").pop());
    if (!id) return reply({ error: "Media id is required", requestId }, 400);
    const object = await env.MEDIA.get(id);
    if (!object) return reply({ error: "Media not found", requestId }, 404);
    const headers = new Headers(capabilityHeaders({ "Cache-Control": "private, no-store", "X-Request-ID": requestId }));
    object.writeHttpMetadata?.(headers);
    headers.set("Content-Type", headers.get("Content-Type") || object.httpMetadata?.contentType || "application/octet-stream");
    headers.set("Content-Disposition", `inline; filename="${safeLabel(object.customMetadata?.fileName, id).replace(/"/g, "")}"`);
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/media/")) {
    if (!env.MEDIA) return reply({ error: "Media storage is not configured", requestId }, 503);
    const id = safeId(url.pathname.split("/").pop());
    if (!id) return reply({ error: "Media id is required", requestId }, 400);
    await env.MEDIA.delete(id);
    if (env.DB) {
      try {
        await initialize(env.DB);
        await env.DB.prepare("DELETE FROM media_objects WHERE id = ?").bind(id).run();
      } catch (error) {
        logEvent("warn", "media.metadata_delete_failed", { requestId, id, error: error instanceof Error ? error.message : "Media metadata deletion failed" });
      }
    }
    return new Response(null, { status: 204, headers: capabilityHeaders({ "Cache-Control": "no-store", "X-Request-ID": requestId }) });
  }
  if (request.method === "POST" && url.pathname === "/api/livekit/token") {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return reply({ error: "LiveKit is not configured on this stage", configured: false, requestId }, 503);
    }
    let serverUrl;
    try {
      const parsed = new URL(env.LIVEKIT_URL);
      if (!["wss:", "ws:"].includes(parsed.protocol)) throw new Error("LiveKit URL must use WebSocket transport");
      serverUrl = parsed.toString().replace(/\/$/, "");
    } catch (error) {
      return reply({ error: error instanceof Error ? error.message : "Invalid LiveKit URL", requestId }, 500);
    }
    const body = await readJson(request, 16 * 1024);
    const room = safeId(body.room).toUpperCase().slice(0, 64);
    const identity = safeId(body.identity).slice(0, 64);
    const name = safeLabel(body.name, identity || "AMX Explorer").slice(0, 80);
    if (!room || !identity) return reply({ error: "Room and identity are required", requestId }, 400);
    const participantToken = await createLiveKitToken(env, room, identity, name);
    const agentDispatch = await ensureLiveKitAgentDispatch(env, room, requestId);
    return reply({ serverUrl, participantToken, room, expiresIn: 900, agentDispatch, requestId });
  }
  if (url.pathname.startsWith("/api/rooms/")) {
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return reply({ error: "WebSocket upgrade required", requestId }, 426);
    const roomCode = safeId(url.pathname.split("/").pop()).toUpperCase().slice(0, 64);
    if (!roomCode) return reply({ error: "Room code is required", requestId }, 400);
    if (!env.ROOMS) {
      try { return openEphemeralRoom(request, roomCode); }
      catch (error) { return reply({ error: error?.message || "WebSocket runtime error", runtime: typeof WebSocketPair, requestId }, 500); }
    }
    const room = env.ROOMS.get(env.ROOMS.idFromName(roomCode));
    return room.fetch(request);
  }
  if (request.method === "GET" && url.pathname === "/api/anchors") {
    if (!env.DB) return reply({ items: [], persisted: false, requestId });
    await initialize(env.DB);
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    const roomCode = safeId(url.searchParams.get("room")).toUpperCase().slice(0, 64);
    if (!roomCode) return reply({ error: "Room code is required", requestId }, 400);
    const result = await env.DB.prepare("SELECT payload FROM geo_anchors WHERE tenant_id = ? AND room_code = ? ORDER BY updated_at ASC LIMIT 100").bind(tenantId, roomCode).all();
    const items = result.results.flatMap((row) => { try { return [JSON.parse(row.payload)]; } catch { return []; } });
    return reply({ items, persisted: true, requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/anchors") {
    const anchor = validateAnchorPayload(await readJson(request, 96 * 1024));
    await persistAnchor(env, anchor);
    return reply({ item: anchor, persisted: Boolean(env.DB), requestId }, 201);
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/anchors/")) {
    const id = safeId(url.pathname.split("/").pop());
    if (!id) return reply({ error: "Anchor id is required", requestId }, 400);
    if (env.DB) {
      await initialize(env.DB);
      const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
      await env.DB.prepare("DELETE FROM geo_anchors WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
    }
    return new Response(null, { status: 204, headers: capabilityHeaders({ "Cache-Control": "no-store", "X-Request-ID": requestId }) });
  }
  if (request.method === "GET" && url.pathname === "/api/twins/events") {
    if (!env.DB) return reply({ items: [], persisted: false, requestId });
    await initialize(env.DB);
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    const roomCode = safeId(url.searchParams.get("room")).toUpperCase().slice(0, 64);
    if (!roomCode) return reply({ error: "Room code is required", requestId }, 400);
    const result = await env.DB.prepare("SELECT id, twin_id, room_code, event_type, payload, created_at FROM digital_twin_events WHERE tenant_id = ? AND room_code = ? ORDER BY created_at DESC LIMIT 100").bind(tenantId, roomCode).all();
    const items = result.results.map((row) => ({ id: row.id, twinId: row.twin_id, roomCode: row.room_code, eventType: row.event_type, payload: JSON.parse(row.payload || "{}"), createdAt: row.created_at }));
    return reply({ items, persisted: true, requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/twins/events") {
    const event = validateTwinEvent(await readJson(request, 128 * 1024));
    await persistTwinEvent(env, event);
    return reply({ item: event, persisted: Boolean(env.DB), requestId }, 201);
  }
  if (request.method === "POST" && url.pathname === "/api/analytics/events") {
    const event = validateAnalyticsEvent(await readJson(request, 64 * 1024));
    await persistAnalytics(env, event);
    return reply({ accepted: true, persisted: Boolean(env.DB), id: event.id, requestId }, 202);
  }
  if (request.method === "POST" && url.pathname === "/api/sync") {
    const item = await readJson(request, MAX_JSON_BODY_BYTES);
    const id = safeId(item.id);
    const type = String(item.type || "").slice(0, 64);
    if (!id || !["proof:create", "proof:update", "proof:complete", "analytics:event"].includes(type)) return reply({ error: "Unsupported sync item", requestId }, 400);
    if (type.startsWith("proof:")) {
      const proof = await attestProof(validateProofPayload(item.payload), env);
      await persistProof(env, proof);
    } else {
      await persistAnalytics(env, validateAnalyticsEvent(item.payload));
    }
    return reply({ synced: true, persisted: Boolean(env.DB), id, requestId }, 202);
  }
  if (request.method === "GET" && url.pathname === "/api/proofs") {
    if (!env.DB) return reply({ items: [], persisted: false, requestId });
    await initialize(env.DB);
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    const result = await env.DB.prepare("SELECT payload FROM proof_records WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100").bind(tenantId).all();
    const items = result.results.flatMap((row) => {
      try { return [JSON.parse(row.payload)]; } catch { return []; }
    });
    return reply({ items, persisted: true, requestId });
  }
  return reply({ error: "Not found", requestId }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const incomingRequestId = request.headers.get("X-Request-ID");
    const requestId = incomingRequestId && /^[a-zA-Z0-9_-]{8,120}$/.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
    if (url.pathname.startsWith("/api/")) {
      const startedAt = Date.now();
      try {
        const response = await handleApi(request, env, url, requestId);
        logEvent("info", "api.request", { requestId, method: request.method, path: url.pathname, status: response.status, durationMs: Date.now() - startedAt });
        return response;
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        logEvent(status >= 500 ? "error" : "warn", "api.error", { requestId, method: request.method, path: url.pathname, status, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown API error" });
        return json({ error: status >= 500 ? "Internal service error" : error.message, requestId }, status, requestId);
      }
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || url.pathname.includes(".")) {
      const headers = new Headers(response.headers);
      Object.entries(capabilityHeaders()).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    const readiness = runtimeReadiness(env);
    const runtimeConfig = JSON.stringify({
      supabaseUrl: env.SUPABASE_URL || "",
      supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY || "",
      livekitConfigured: readiness.components.livekit,
      persistenceConfigured: readiness.components.database,
      mediaStorageConfigured: readiness.components.media,
      roomTransport: readiness.roomTransport,
      deploymentMode: readiness.mode,
      version: SERVICE_VERSION,
    }).replace(/</g, "\\u003c");
    const nonce = base64Url(crypto.getRandomValues(new Uint8Array(18)));
    const html = APP_HTML.replace("</head>", `<script nonce="${nonce}">window.__AMX_CONFIG__=${runtimeConfig}</script></head>`);
    return new Response(html, { headers: htmlHeaders(nonce) });
  },
};

export class RoomHub {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const participant = safeId(new URL(request.url).searchParams.get("participant"), crypto.randomUUID().slice(0, 8));
    server.serializeAttachment({ participant });
    this.state.acceptWebSocket(server);
    this.broadcast({ id: crypto.randomUUID(), sender: participant, text: "joined the room", timestamp: new Date().toISOString(), kind: "presence" }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, payload) {
    const participant = socket.deserializeAttachment()?.participant || "participant";
    try { this.broadcast(sanitizeRoomMessage(payload, participant), socket); }
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
