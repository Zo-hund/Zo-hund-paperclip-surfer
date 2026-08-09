import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adapterConfig, buildUniFiAuthorization, createHybridHandler, executeHybridCommand } from "../edge/amx-hybrid-adapter.mjs";

function configured() {
  return adapterConfig({
    AIR_EDGE_ADAPTER_TOKEN: "adapter-secret",
    AIR_HYBRID_ENFORCEMENT: "opnsense",
    OPNSENSE_URL: "https://opnsense.local",
    OPNSENSE_API_KEY: "key",
    OPNSENSE_API_SECRET: "secret",
    OPNSENSE_ROOM_POLICIES_JSON: JSON.stringify({ 120: { downloadPipeUuid: "down-uuid", uploadPipeUuid: "up-uuid" } }),
    UNIFI_NETWORK_URL: "https://unifi.local",
    UNIFI_API_KEY: "unifi-key",
    UNIFI_SITE_ID: "site-1",
    TMOBILE_GATEWAY_URL: "http://192.168.12.1",
  });
}

describe("AMX hybrid physical gateway adapter", () => {
  test("translates a room entitlement into documented UniFi guest limits", () => {
    assert.deepEqual(buildUniFiAuthorization({ dataLimitMb: 500, downloadLimitMbps: 100, uploadLimitMbps: 50, timeLimitMinutes: 120 }, 2), {
      action: "AUTHORIZE_GUEST_ACCESS", timeLimitMinutes: 120, dataUsageLimitMBytes: 250, rxRateLimitKbps: 50_000, txRateLimitKbps: 25_000,
    });
  });

  test("applies OPNsense pipes before acknowledging and authorizes UniFi clients", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ result: "saved" }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await executeHybridCommand({ action: "ACTIVATE_CONTAINER", runtimeId: "runtime-1", payload: { vlan: 120, dataLimitMb: 1_000, downloadLimitMbps: 500, uploadLimitMbps: 250, clients: ["client-1"] } }, configured(), { fetchImpl });
    assert.equal(result.applied, true);
    assert.equal(result.evidence.enforcement.driver, "opnsense");
    assert.equal(result.evidence.unifi.authorized, 1);
    assert.ok(calls.some((call) => call.url.endsWith("/api/trafficshaper/service/reconfigure")));
    const unifi = calls.find((call) => call.url.includes("/v1/sites/site-1/clients/client-1/actions"));
    assert.equal(JSON.parse(unifi.init.body).action, "AUTHORIZE_GUEST_ACCESS");
  });

  test("fails closed when the configured VLAN has no physical pipe mapping", async () => {
    const config = configured();
    config.opnsense.roomPolicies[121] = { downloadPipeUuid: "down-b", uploadPipeUuid: "up-b" };
    await assert.rejects(() => executeHybridCommand({ action: "ACTIVATE_CONTAINER", runtimeId: "runtime-1", payload: { vlan: 999, downloadLimitMbps: 10, uploadLimitMbps: 5 } }, config, { fetchImpl: async () => new Response("{}") }), /No OPNsense pipe mapping/);
  });

  test("health remains unavailable until a real enforcement driver and adapter token exist", async () => {
    const handler = createHybridHandler(adapterConfig({ TMOBILE_GATEWAY_URL: "http://192.168.12.1" }));
    const response = await handler(new Request("http://adapter.local/health"));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).ready, false);
  });
});
