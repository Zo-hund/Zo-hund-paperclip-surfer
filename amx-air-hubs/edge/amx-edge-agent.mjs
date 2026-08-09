import { createHmac, timingSafeEqual } from "node:crypto";

const config = {
  baseUrl: String(process.env.AMX_HUBS_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, ""),
  tenantId: String(process.env.AIR_EDGE_TENANT_ID || ""),
  nodeId: String(process.env.AIR_EDGE_NODE_ID || ""),
  token: String(process.env.AIR_EDGE_NODE_TOKEN || ""),
  signingKey: String(process.env.AIR_EDGE_COMMAND_SIGNING_KEY || ""),
  adapterUrl: String(process.env.AIR_EDGE_ADAPTER_URL || "").replace(/\/$/, ""),
  adapterToken: String(process.env.AIR_EDGE_ADAPTER_TOKEN || ""),
  simulation: String(process.env.AIR_EDGE_SIMULATION || "").toLowerCase() === "true",
};

for (const [name, value] of Object.entries({ AIR_EDGE_TENANT_ID: config.tenantId, AIR_EDGE_NODE_ID: config.nodeId, AIR_EDGE_NODE_TOKEN: config.token, AIR_EDGE_COMMAND_SIGNING_KEY: config.signingKey })) {
  if (!value) throw new Error(`${name} is required`);
}
if (!config.adapterUrl && !config.simulation) throw new Error("AIR_EDGE_ADAPTER_URL is required unless AIR_EDGE_SIMULATION=true");

const activeRuntimes = new Map();
const sourceFor = (command) => JSON.stringify({ id: command.id, nodeId: command.nodeId, runtimeId: command.runtimeId, policyId: command.policyId, action: command.action, issuedAt: command.issuedAt, expiresAt: command.expiresAt, nonce: command.nonce, payload: command.payload });
const signatureFor = (command) => createHmac("sha256", config.signingKey).update(sourceFor(command)).digest("base64url");

function verified(command) {
  if (command.signatureAlgorithm !== "HMAC-SHA256" || Date.parse(command.expiresAt) <= Date.now()) return false;
  const provided = Buffer.from(String(command.signature));
  const expected = Buffer.from(signatureFor(command));
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function api(path, init = {}) {
  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers: { Accept: "application/json", Authorization: `Bearer ${config.token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `AIR edge API failed (${response.status})`);
  return payload;
}

async function applyCommand(command) {
  if (!verified(command)) throw new Error("Command signature is invalid or expired");
  if (config.simulation) return { applied: true, adapter: "simulation", evidence: { action: command.action, policyId: command.policyId } };
  const response = await fetch(`${config.adapterUrl}/commands`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", ...(config.adapterToken ? { Authorization: `Bearer ${config.adapterToken}` } : {}) }, body: JSON.stringify({ commandId: command.id, action: command.action, runtimeId: command.runtimeId, policyId: command.policyId, payload: command.payload }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.applied !== true) throw new Error(payload.error || "Network adapter did not confirm the change");
  return { applied: true, adapter: "generic-http", evidence: payload.evidence || {} };
}

async function verifyAdapter() {
  if (config.simulation) return;
  const response = await fetch(`${config.adapterUrl}/health`, { headers: { Accept: "application/json", ...(config.adapterToken ? { Authorization: `Bearer ${config.adapterToken}` } : {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ready !== true) throw new Error(payload.error || `AIR edge adapter preflight failed (${response.status})`);
}

async function pollCommands() {
  const query = new URLSearchParams({ tenantId: config.tenantId, nodeId: config.nodeId });
  const { commands = [] } = await api(`/api/air-connect/edge/commands?${query}`, { method: "GET" });
  for (const command of commands) {
    let result;
    try {
      result = await applyCommand(command);
      if (command.action === "REMOVE_POLICY") activeRuntimes.delete(command.runtimeId);
      else if (command.runtimeId) activeRuntimes.set(command.runtimeId, command.payload);
    } catch (error) {
      result = { applied: false, adapter: config.simulation ? "simulation" : "generic-http", error: error instanceof Error ? error.message : String(error) };
    }
    await api(`/api/air-connect/edge/commands/${encodeURIComponent(command.id)}/ack`, { method: "POST", body: JSON.stringify({ tenantId: config.tenantId, nodeId: config.nodeId, applied: result.applied, acknowledgement: result }) });
  }
}

async function heartbeat() {
  await api("/api/air-connect/edge/heartbeat", { method: "POST", body: JSON.stringify({ tenantId: config.tenantId, nodeId: config.nodeId }) });
}

async function meter() {
  if (config.simulation || !config.adapterUrl) return;
  for (const runtimeId of activeRuntimes.keys()) {
    const response = await fetch(`${config.adapterUrl}/usage?runtimeId=${encodeURIComponent(runtimeId)}`, { headers: { Accept: "application/json", ...(config.adapterToken ? { Authorization: `Bearer ${config.adapterToken}` } : {}) } });
    if (!response.ok) continue;
    const sample = await response.json();
    if (!Number.isFinite(Number(sample.consumedUnits))) continue;
    await api("/api/air-connect/edge/usage", { method: "POST", body: JSON.stringify({ tenantId: config.tenantId, nodeId: config.nodeId, runtimeId, consumedUnits: Number(sample.consumedUnits), deviceId: String(sample.deviceId || config.nodeId), bytesDown: Number(sample.bytesDown || 0), bytesUp: Number(sample.bytesUp || 0), downloadMbps: Number(sample.downloadMbps || 0), uploadMbps: Number(sample.uploadMbps || 0), latencyMs: Number(sample.latencyMs || 0), jitterMs: Number(sample.jitterMs || 0), packetLoss: Number(sample.packetLoss || 0) }) });
  }
}

async function cycle() {
  await verifyAdapter();
  await heartbeat();
  await pollCommands();
  await meter();
}

if (process.argv.includes("--once")) await cycle();
else {
  await cycle();
  setInterval(() => void pollCommands().catch((error) => console.error(error.message)), 5_000);
  setInterval(() => void heartbeat().catch((error) => console.error(error.message)), 30_000);
  setInterval(() => void meter().catch((error) => console.error(error.message)), 60_000);
}
