import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productionSource = await readFile(new URL("../src/nexus-xr-production.ts", import.meta.url), "utf8");
const sceneSource = await readFile(new URL("../src/NexusRoomScene.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/pages/nexus.tsx", import.meta.url), "utf8");

test("Nexus XR exposes a complete in-world production toolbelt", () => {
  for (const cue of ["CAM 1", "MEDIA", "AMX AIR", "OVERVIEW", "ENTRY", "STAGE", "STANDBY", "MISSION", "FOCUS", "VFX CALM", "VFX SHOW", "NPC WAVE", "NPC TALK"]) {
    assert.match(productionSource, new RegExp(`label: \\"${cue}\\"`));
  }
});

test("Quest controller rays execute cues with haptics and console toggling", () => {
  assert.match(sceneSource, /addEventListener\("selectstart", selectProductionCue\)/);
  assert.match(sceneSource, /addEventListener\("squeezestart", toggleProductionPanel\)/);
  assert.match(sceneSource, /hapticActuators/);
  assert.match(sceneSource, /intersectObjects\(xrProduction\.buttons/);
});

test("XR production cues drive the existing Nexus state", () => {
  assert.match(pageSource, /onXRProductionCue=\{runXRProductionCue\}/);
  assert.match(pageSource, /takeScreenWall\(cue\.source, "cut"\)/);
  assert.match(pageSource, /setActiveWorldCamera\(cue\.camera\)/);
  assert.match(pageSource, /setLightPreset\(cue\.preset\)/);
  assert.match(pageSource, /updateVfxPreset\(cue\.preset\)/);
  assert.match(pageSource, /issueRunwayNpcCommand/);
});
