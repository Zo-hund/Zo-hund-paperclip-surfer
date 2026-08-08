import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const viewer = await readFile(new URL("../src/pages/stage-viewer.tsx", import.meta.url), "utf8");
const pod = await readFile(new URL("../src/LiveKitPod.tsx", import.meta.url), "utf8");
const soundscape = await readFile(new URL("../src/StageSoundscape.ts", import.meta.url), "utf8");

test("mobile live viewer unlocks every audio bus inside the Listen Live gesture", () => {
  assert.match(viewer, /const localStart = venueAudio\.enable\(\);/);
  assert.match(viewer, /const roomStart = room \? room\.startAudio\(\) : Promise\.resolve\(\);/);
  assert.match(viewer, /const programRequested = Boolean\(programElement && programMedia/);
  assert.match(viewer, /const programStart = programRequested && programElement/);
  assert.match(viewer, /Promise\.allSettled\(\[localStart, roomStart, programStart, \.\.\.remoteStarts\]\)/);
  assert.match(viewer, /const programReady = programRequested && programResult\.status === "fulfilled";/);
  assert.match(viewer, /muted=\{!audioEnabled \|\| programMedia\.muted\}/);
  assert.match(viewer, /webAudioMix: true/);
});

test("mobile pod exposes a resilient LiveKit audio resume path", () => {
  assert.match(pod, /webAudioMix: true/);
  assert.match(pod, /const roomStart = room\.startAudio\(\);/);
  assert.match(pod, /Promise\.allSettled\(\[roomStart, \.\.\.elementStarts\]\)/);
  assert.match(pod, /Tap the speaker control to enable room sound on this device/);
});

test("uploaded soundscape media starts before the mobile audio gesture expires", () => {
  const resumeAt = soundscape.indexOf("const resume = engine.context.resume();");
  const applyAt = soundscape.indexOf("applyState(engine, stateRef.current);", resumeAt);
  const awaitAt = soundscape.indexOf("await resume;", resumeAt);
  assert.ok(resumeAt >= 0 && applyAt > resumeAt && awaitAt > applyAt);
  assert.match(soundscape, /if \(state\.transport === "playing"\) void deck\.media\.play\(\)/);
});
