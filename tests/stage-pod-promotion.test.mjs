import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const stage = readFileSync(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
const monitor = readFileSync(new URL("../src/StageFeedMonitor.tsx", import.meta.url), "utf8");
const promotions = readFileSync(new URL("../src/showcase-promotions.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker.js", import.meta.url), "utf8");

test("requires operator approval before a pod becomes the stage source", () => {
  assert.match(stage, /reviewShowcase\(request, true\)/);
  assert.match(stage, /status: "published", sourceRoom: request\.roomCode/);
  assert.match(stage, /mode: "metaverse"/);
  assert.match(stage, /organizationTags\.map/);
});

test("routes approved pod camera, screen, and voice feeds into stage production", () => {
  assert.match(stage, /roomCode=\{monitoredRoom\}/);
  assert.match(stage, /programAudioStream=\{stageProgramStream\}/);
  assert.match(monitor, /publication\.kind === Track\.Kind\.Audio/);
  assert.match(monitor, /new MediaStream\(tracks\)/);
  assert.match(monitor, /publication\.setSubscribed\(video \|\| audio\)/);
  assert.match(monitor, /\/api\/livekit\/monitor-token/);
  assert.match(worker, /url\.pathname === "\/api\/livekit\/monitor-token"\) return \["operator"\]/);
  assert.doesNotMatch(worker.match(/function publicApiRequest[\s\S]*?function requiredMemberRoles/)?.[0] || "", /monitor-token/);
});

test("carries organization and event identity through the realtime promotion bus", () => {
  assert.match(promotions, /organizationTags: string\[\]/);
  assert.match(promotions, /"promotion-submit" \| "promotion-review"/);
  assert.match(promotions, /"promotion-query"/);
  assert.match(promotions, /amx-stage-promotions-v1/);
});
