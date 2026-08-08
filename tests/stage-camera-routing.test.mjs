import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/stage-camera-routing.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routing = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("sorts stage feeds by stable participant identity and source", () => {
  const feeds = [
    { id: routing.stageFeedId("zara", "camera"), participantIdentity: "zara", source: "camera" },
    { id: routing.stageFeedId("alex", "screen"), participantIdentity: "alex", source: "screen" },
    { id: routing.stageFeedId("alex", "camera"), participantIdentity: "alex", source: "camera" },
  ];

  assert.deepEqual(routing.sortStageVideoFeeds(feeds).map((feed) => feed.id), ["alex:camera", "zara:camera", "alex:screen"]);
});

test("keeps explicit camera routes offline until the same identity returns", () => {
  const route = routing.stageFeedId("host-1", "camera");
  const republished = { id: route, participantIdentity: "host-1", source: "camera", muted: false };

  assert.equal(routing.selectStageProgramFeed([], "host", route), null);
  assert.equal(routing.selectStageProgramFeed([republished], "host", route), republished);
  assert.equal(routing.selectStageProgramFeed([{ id: "other:camera", participantIdentity: "other", source: "camera" }], "host", route), null);
});

test("migrates pre-release track routes to auto without changing stable routes", () => {
  const legacy = { wide: "participant-TR_track", host: "auto", audience: "host-1:camera", crane: "virtual" };
  const stable = { wide: "host-1:camera", host: "auto", audience: "guest-1:screen", crane: "virtual" };

  assert.deepEqual(routing.migrateLegacyStageCameraRoutes(legacy), { wide: "auto", host: "auto", audience: "host-1:camera", crane: "virtual" });
  assert.equal(routing.migrateLegacyStageCameraRoutes(stable), stable);
});

test("does not count stage monitors or agent services as audience", () => {
  const participants = [
    { identity: "viewer-1", metadata: JSON.stringify({ role: "viewer", clientType: "audience" }) },
    { identity: "operator-1", metadata: JSON.stringify({ role: "participant", clientType: "operator" }) },
    { identity: "stage-monitor-1", metadata: JSON.stringify({ role: "viewer", clientType: "stage-monitor" }) },
    { identity: "voice-worker", metadata: JSON.stringify({ role: "agent", agentName: "amx-agent" }) },
  ];

  assert.equal(routing.countStageAudienceParticipants(participants, 1), 3);
});

test("bounds stage monitor retry backoff", () => {
  assert.equal(routing.stageMonitorRetryDelay(0), 1_000);
  assert.equal(routing.stageMonitorRetryDelay(3), 8_000);
  assert.equal(routing.stageMonitorRetryDelay(12), 30_000);
});
