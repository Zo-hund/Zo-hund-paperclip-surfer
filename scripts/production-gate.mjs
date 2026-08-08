import { readFile } from "node:fs/promises";

const baseUrl = String(process.env.AMX_BASE_URL || process.argv[2] || "https://amx-hubs.cc").replace(/\/$/, "");
const certificationPath = process.env.AMX_DEVICE_CERTIFICATION_PATH || "docs/device-certification.json";
const runtimeOnly = process.argv.includes("--runtime-only");
const failures = [];

async function request(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try { return await fetch(`${baseUrl}${path}`, { redirect: "manual", ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const health = await request("/api/health");
assert(health.status === 200, `Liveness returned ${health.status}`);
assert(health.headers.get("strict-transport-security")?.includes("max-age="), "HSTS is missing");
assert(health.headers.get("x-content-type-options") === "nosniff", "nosniff header is missing");

const readyResponse = await request("/api/ready");
const readiness = await readyResponse.json().catch(() => ({}));
assert(readyResponse.status === 200, `Readiness returned ${readyResponse.status}`);
assert(readiness.ready === true, `Runtime is not ready: ${(readiness.missingRequired || []).join(", ")}`);
assert(readiness.mode === "full", `Runtime mode is ${readiness.mode || "unknown"}, expected full`);
assert(readiness.deploymentTier === "production", `Deployment tier is ${readiness.deploymentTier || "unset"}, expected production`);

for (const path of ["/", "/stage", "/nexus", "/missions/world"]) {
  const response = await request(path, { headers: { Accept: "text/html" } });
  assert(response.status === 200, `${path} returned ${response.status}`);
  assert((response.headers.get("content-type") || "").includes("text/html"), `${path} did not return HTML`);
}

const viewer = await request("/api/livekit/viewer-token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ room: "AMXSTAGE", identity: `release-gate-${Date.now()}`, name: "Release Gate", clientType: "production-gate" }),
});
const viewerBody = await viewer.json().catch(() => ({}));
assert(viewer.status === 200, `LiveKit viewer token returned ${viewer.status}`);
assert(Boolean(viewerBody.serverUrl && viewerBody.participantToken), "LiveKit viewer token is incomplete");

if (!runtimeOnly) {
  let certification;
  try { certification = JSON.parse(await readFile(certificationPath, "utf8")); }
  catch { failures.push(`Device certification is missing: ${certificationPath}`); }
  if (certification) {
    const requiredDevices = ["quest3", "android", "iphone", "desktop"];
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    assert(Date.now() - Date.parse(certification.testedAt) <= maxAge, "Device certification is older than 30 days");
    for (const device of requiredDevices) {
      const result = certification.devices?.[device];
      assert(result?.passed === true, `${device} certification has not passed`);
      for (const capability of ["camera", "microphone", "reconnect", "multiplayer"]) assert(result?.capabilities?.[capability] === true, `${device} ${capability} is not certified`);
    }
    assert(certification.devices?.quest3?.capabilities?.controllers === true, "Quest 3 controllers are not certified");
    assert(certification.devices?.quest3?.capabilities?.webxr === true, "Quest 3 WebXR is not certified");
  }
}

if (failures.length) {
  console.error(`Production gate failed for ${baseUrl}:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Production gate passed for ${baseUrl}.`);
}
