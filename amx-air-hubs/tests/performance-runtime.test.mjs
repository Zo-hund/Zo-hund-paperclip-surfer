import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import worker from "../worker.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("edge performance contracts", () => {
  test("keeps load-balancer health probes outside application rate limiting", async () => {
    const source = await read("worker.js");
    const health = source.indexOf('url.pathname === "/api/health"');
    const limiter = source.indexOf("if (!allowRequest(request))", health);
    assert.ok(health > 0 && limiter > health);
  });

  test("serves fingerprinted assets with immutable browser caching", async () => {
    const env = { ASSETS: { fetch: async () => new Response("asset", { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } }) } };
    const response = await worker.fetch(new Request("https://amx.example/assets/StageVenueWorld-Cd4_Kyjv.js"), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  });

  test("loads the member venue page only when its route is requested", async () => {
    const app = await read("src/App.tsx");
    assert.match(app, /const StageVenuePage = lazy/);
    assert.doesNotMatch(app, /import \{ StageVenuePage \} from/);
  });
});
