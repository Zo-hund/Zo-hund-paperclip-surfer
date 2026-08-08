import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Decart permanent credentials remain Worker-only and client tokens are scoped", async () => {
  const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
  const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(worker, /\/api\/decart\/client-token/);
  assert.match(worker, /const approvedModels = \["lucy-latest", "lucy-2\.5"/);
  assert.match(worker, /allowedModels: \[model\]/);
  assert.match(worker, /allowedOrigins: \[origin\]/);
  assert.match(worker, /maxSessionDuration: 1800/);
  assert.match(env, /DECART_API_KEY=/);
  assert.doesNotMatch(env, /VITE_DECART_API_KEY/);
});

test("Approved Lucy outputs become normal routable Stage camera feeds", async () => {
  const camera = await readFile(new URL("../src/DecartRealtimeCamera.tsx", import.meta.url), "utf8");
  const stage = await readFile(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
  assert.match(camera, /models\.realtime\(modelId\)/);
  assert.match(camera, /lucy-restyle-2/);
  assert.match(camera, /lucy-vton-3/);
  assert.match(camera, /preferredVideoCodec: "vp8"/);
  assert.match(camera, /clientRef\.current\.set\(\{ prompt: prompt\.trim\(\), image: referenceImage, enhance: true \}\)/);
  assert.match(camera, /reference_image/);
  assert.match(camera, /\/api\/decart\/render/);
  assert.match(camera, /AI CAMERA \/ \$\{label\.toUpperCase\(\)\}/);
  assert.match(camera, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(stage, /decartFeed \? \[\.\.\.videoFeeds, decartFeed\]/);
});

test("Decart recorded-video rendering stays behind the Worker credential boundary", async () => {
  const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
  assert.match(worker, /url\.pathname === "\/api\/decart\/render"/);
  assert.match(worker, /Source video exceeds the 200 MB Decart limit/);
  assert.match(worker, /Reference image must be JPG, PNG, or WebP under 10 MB/);
  assert.match(worker, /https:\/\/api\.decart\.ai\/v1\/jobs\//);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/decart\/"\).*\["operator"\]/);
});
