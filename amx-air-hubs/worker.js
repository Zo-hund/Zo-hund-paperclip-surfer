const rateBuckets = new Map();
const ephemeralRooms = new Map();
const APP_HTML = "__AMX_APP_HTML__";
const CAPABILITY_POLICY = "camera=(self), microphone=(self), geolocation=(self), fullscreen=(self), xr-spatial-tracking=(self)";

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
