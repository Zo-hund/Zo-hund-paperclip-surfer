import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

const ACTIONS = new Set(["ACTIVATE_CONTAINER", "UPDATE_LIMITS", "REMOVE_POLICY"]);
const safeId = (value) => String(value || "").replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 128);
const positive = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

function jsonMap(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error("OPNSENSE_ROOM_POLICIES_JSON must be valid JSON");
  }
}

export function adapterConfig(env = process.env) {
  return {
    host: String(env.AIR_HYBRID_HOST || "127.0.0.1"),
    port: positive(env.AIR_HYBRID_PORT, 9090),
    token: String(env.AIR_EDGE_ADAPTER_TOKEN || ""),
    enforcement: String(env.AIR_HYBRID_ENFORCEMENT || "opnsense").toLowerCase(),
    opnsense: {
      url: String(env.OPNSENSE_URL || "").replace(/\/$/, ""),
      key: String(env.OPNSENSE_API_KEY || ""),
      secret: String(env.OPNSENSE_API_SECRET || ""),
      roomPolicies: jsonMap(env.OPNSENSE_ROOM_POLICIES_JSON),
    },
    unifi: {
      url: String(env.UNIFI_NETWORK_URL || "").replace(/\/$/, ""),
      apiKey: String(env.UNIFI_API_KEY || ""),
      siteId: safeId(env.UNIFI_SITE_ID),
    },
    openwrt: {
      url: String(env.OPENWRT_ADAPTER_URL || "").replace(/\/$/, ""),
      token: String(env.OPENWRT_ADAPTER_TOKEN || ""),
    },
    upstream: {
      tmobileUrl: String(env.TMOBILE_GATEWAY_URL || "http://192.168.12.1").replace(/\/$/, ""),
    },
    runtimePolicies: new Map(),
  };
}

function bearerMatches(request, expected) {
  if (!expected) return false;
  const provided = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function requestJson(url, init, fetchImpl) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `${new URL(url).hostname} returned ${response.status}`);
  return payload;
}

function opnPolicyFor(config, command) {
  const vlan = safeId(command.payload?.vlan);
  const current = config.runtimePolicies.get(command.runtimeId);
  const configuredPolicies = Object.entries(config.opnsense.roomPolicies);
  const solePolicy = configuredPolicies.length === 1 ? configuredPolicies[0] : null;
  const policy = config.opnsense.roomPolicies[vlan] || current?.opnsense || solePolicy?.[1];
  if (!policy?.downloadPipeUuid || !policy?.uploadPipeUuid) throw new Error(`No OPNsense pipe mapping is configured for VLAN ${vlan || "unknown"}`);
  return { ...policy, vlan: vlan || current?.vlan || solePolicy?.[0] };
}

async function opnPost(config, path, body, fetchImpl) {
  const auth = Buffer.from(`${config.opnsense.key}:${config.opnsense.secret}`).toString("base64");
  return requestJson(`${config.opnsense.url}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  }, fetchImpl);
}

async function applyOpnSense(command, config, fetchImpl) {
  if (!config.opnsense.url || !config.opnsense.key || !config.opnsense.secret) throw new Error("OPNsense enforcement is not configured");
  const policy = opnPolicyFor(config, command);
  const uuids = [safeId(policy.downloadPipeUuid), safeId(policy.uploadPipeUuid)];
  if (command.action === "REMOVE_POLICY") {
    for (const uuid of uuids) await opnPost(config, `/api/trafficshaper/settings/toggle_pipe/${uuid}/0`, {}, fetchImpl);
  } else {
    const download = positive(command.payload?.downloadLimitMbps);
    const upload = positive(command.payload?.uploadLimitMbps);
    if (!download || !upload) throw new Error("The room policy is missing download or upload limits");
    const descriptions = [`AMX ${safeId(command.runtimeId)} download`, `AMX ${safeId(command.runtimeId)} upload`];
    for (const [index, uuid] of uuids.entries()) {
      await opnPost(config, `/api/trafficshaper/settings/set_pipe/${uuid}`, { pipe: { enabled: "1", bandwidth: String(index ? upload : download), bandwidthMetric: "Mbit", description: descriptions[index] } }, fetchImpl);
      await opnPost(config, `/api/trafficshaper/settings/toggle_pipe/${uuid}/1`, {}, fetchImpl);
    }
  }
  await opnPost(config, "/api/trafficshaper/service/reconfigure", {}, fetchImpl);
  return { applied: true, driver: "opnsense", vlan: policy.vlan, pipeUuids: uuids };
}

export function buildUniFiAuthorization(policy, clientCount = 1) {
  const starts = Date.parse(policy.startsAt || "");
  const ends = Date.parse(policy.endsAt || "");
  const minutes = Number.isFinite(starts) && Number.isFinite(ends) && ends > starts ? Math.ceil((ends - starts) / 60_000) : positive(policy.timeLimitMinutes, 180);
  return {
    action: "AUTHORIZE_GUEST_ACCESS",
    timeLimitMinutes: Math.min(10_080, Math.max(1, minutes)),
    dataUsageLimitMBytes: Math.max(1, Math.floor(positive(policy.dataLimitMb, 1) / Math.max(1, clientCount))),
    rxRateLimitKbps: Math.max(1, Math.floor(positive(policy.downloadLimitMbps, 1) * 1_000 / Math.max(1, clientCount))),
    txRateLimitKbps: Math.max(1, Math.floor(positive(policy.uploadLimitMbps, 1) * 1_000 / Math.max(1, clientCount))),
  };
}

async function authorizeUniFi(command, config, fetchImpl) {
  const clients = Array.isArray(command.payload?.clients) ? command.payload.clients.map((item) => safeId(item?.clientId || item)).filter(Boolean) : [];
  if (!config.unifi.url || !config.unifi.apiKey || !config.unifi.siteId) return { status: "not-configured", authorized: 0 };
  if (command.action === "REMOVE_POLICY") return { status: "limits-expire", authorized: 0 };
  if (!clients.length) return { status: "awaiting-clients", authorized: 0 };
  const authorization = buildUniFiAuthorization(command.payload, clients.length);
  for (const clientId of clients) {
    await requestJson(`${config.unifi.url}/v1/sites/${encodeURIComponent(config.unifi.siteId)}/clients/${encodeURIComponent(clientId)}/actions`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": config.unifi.apiKey },
      body: JSON.stringify(authorization),
    }, fetchImpl);
  }
  return { status: "applied", authorized: clients.length, authorization };
}

async function applyOpenWrt(command, config, fetchImpl) {
  if (!config.openwrt.url || !config.openwrt.token) throw new Error("OpenWrt AIR Box enforcement is not configured");
  const result = await requestJson(`${config.openwrt.url}/commands`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${config.openwrt.token}` },
    body: JSON.stringify(command),
  }, fetchImpl);
  if (result.applied !== true) throw new Error(result.error || "OpenWrt AIR Box did not acknowledge the policy");
  return { applied: true, driver: "openwrt", evidence: result.evidence || {} };
}

export async function executeHybridCommand(command, config, { fetchImpl = fetch } = {}) {
  if (!ACTIONS.has(command.action)) throw new Error("Unsupported AIR edge action");
  const normalized = { ...command, runtimeId: safeId(command.runtimeId), payload: command.payload && typeof command.payload === "object" ? command.payload : {} };
  const enforcement = config.enforcement === "openwrt" ? await applyOpenWrt(normalized, config, fetchImpl) : await applyOpnSense(normalized, config, fetchImpl);
  const unifi = await authorizeUniFi(normalized, config, fetchImpl);
  if (normalized.action === "REMOVE_POLICY") config.runtimePolicies.delete(normalized.runtimeId);
  else if (config.enforcement === "opnsense") {
    const opnsense = opnPolicyFor(config, normalized);
    config.runtimePolicies.set(normalized.runtimeId, { vlan: opnsense.vlan, opnsense, payload: normalized.payload });
  } else config.runtimePolicies.set(normalized.runtimeId, { vlan: safeId(normalized.payload.vlan), payload: normalized.payload });
  return { applied: enforcement.applied === true, evidence: { enforcement, unifi } };
}

async function upstreamSignal(config, fetchImpl) {
  if (!config.upstream.tmobileUrl) return { status: "not-configured" };
  try {
    const payload = await requestJson(`${config.upstream.tmobileUrl}/TMI/v1/gateway?get=signal`, { headers: { Accept: "application/json" } }, fetchImpl);
    const radio = payload.signal?.["5g"] || payload.signal?.["4g"] || {};
    return { status: payload.signal?.generic?.registration || "reachable", bars: Number(radio.bars || 0), band: Array.isArray(radio.bands) ? radio.bands[0] : null, rsrp: Number(radio.rsrp || 0), rsrq: Number(radio.rsrq || 0), sinr: Number(radio.sinr || 0) };
  } catch (error) {
    return { status: "unreachable", error: error instanceof Error ? error.message : String(error) };
  }
}

async function usageFor(runtimeId, config, fetchImpl) {
  const active = config.runtimePolicies.get(runtimeId);
  return { runtimeId, metered: false, upstream: await upstreamSignal(config, fetchImpl), policy: active ? { vlan: active.vlan } : null };
}

export function createHybridHandler(config, { fetchImpl = fetch } = {}) {
  return async (request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const enforcementReady = config.enforcement === "openwrt" ? Boolean(config.openwrt.url && config.openwrt.token) : Boolean(config.opnsense.url && config.opnsense.key && config.opnsense.secret && Object.keys(config.opnsense.roomPolicies).length);
      return Response.json({ ready: Boolean(config.token && enforcementReady), enforcement: config.enforcement, drivers: { opnsense: Boolean(config.opnsense.url), unifi: Boolean(config.unifi.url), openwrt: Boolean(config.openwrt.url), tmobileTelemetry: Boolean(config.upstream.tmobileUrl) } }, { status: config.token && enforcementReady ? 200 : 503 });
    }
    if (!bearerMatches(request, config.token)) return Response.json({ error: "Adapter authorization failed" }, { status: 401 });
    if (request.method === "POST" && url.pathname === "/commands") {
      try {
        const command = await request.json();
        return Response.json(await executeHybridCommand(command, config, { fetchImpl }));
      } catch (error) {
        return Response.json({ applied: false, error: error instanceof Error ? error.message : String(error) }, { status: 409 });
      }
    }
    if (request.method === "GET" && url.pathname === "/usage") return Response.json(await usageFor(safeId(url.searchParams.get("runtimeId")), config, fetchImpl));
    if (request.method === "GET" && url.pathname === "/upstream") return Response.json(await upstreamSignal(config, fetchImpl));
    return Response.json({ error: "Not found" }, { status: 404 });
  };
}

export function startHybridAdapter(config = adapterConfig()) {
  if (!config.token) throw new Error("AIR_EDGE_ADAPTER_TOKEN is required");
  const handler = createHybridHandler(config);
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(`http://${incoming.headers.host || "127.0.0.1"}${incoming.url}`, { method: incoming.method, headers: incoming.headers, body: ["GET", "HEAD"].includes(incoming.method || "GET") ? undefined : Buffer.concat(chunks) });
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(config.port, config.host, () => console.log(`AMX hybrid adapter listening on http://${config.host}:${config.port}`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startHybridAdapter();
