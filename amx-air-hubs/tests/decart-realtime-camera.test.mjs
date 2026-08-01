import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Decart permanent credentials remain Worker-only and client tokens are scoped", async () => {
  const worker = await readFile(new URL("../worker.js", import.meta.url), "utf8");
  const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(worker, /\/api\/decart\/client-token/);
  assert.match(worker, /allowedModels: \["lucy-2\.5"\]/);
  assert.match(worker, /allowedOrigins: \[origin\]/);
  assert.match(worker, /maxSessionDuration: 1800/);
  assert.match(env, /DECART_API_KEY=/);
  assert.doesNotMatch(env, /VITE_DECART_API_KEY/);
});

test("Lucy output becomes a normal routable Stage camera feed", async () => {
  const camera = await readFile(new URL("../src/DecartRealtimeCamera.tsx", import.meta.url), "utf8");
  const stage = await readFile(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
  assert.match(camera, /models\.realtime\("lucy-2\.5"\)/);
  assert.match(camera, /preferredVideoCodec: "vp8"/);
  assert.match(camera, /setPrompt\(prompt\.trim\(\)/);
  assert.match(camera, /AI CAMERA \/ LUCY 2\.5/);
  assert.match(camera, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(stage, /decartFeed \? \[\.\.\.videoFeeds, decartFeed\]/);
});
