import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productionSource = await readFile(new URL("../src/nexus-xr-production.ts", import.meta.url), "utf8");
const sceneSource = await readFile(new URL("../src/NexusRoomScene.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/pages/nexus.tsx", import.meta.url), "utf8");

test("Nexus XR exposes a complete in-world production toolbelt", () => {
  for (const cue of ["CTR CAM 1", "LFT CAM 2", "RGT CAM 3", "WALL MEDIA", "WALL MAP", "WALL AGENT", "AMX AIR", "LOAD MEDIA", "PLAY", "AUDIO ON", "OVERVIEW", "ENTRY", "STAGE", "STANDBY", "MISSION", "FOCUS", "VFX SHOW", "ROBOT HOME", "ROBOT RACK", "ROBOT SCAN", "PATROL", "HOLD", "NPC WAVE", "NPC TALK"]) {
    assert.match(productionSource, new RegExp(`label: \\"${cue}\\"`));
  }
});

test("Quest controller rays execute cues with haptics and console toggling", () => {
  assert.match(sceneSource, /addEventListener\("selectstart", selectProductionCue\)/);
  assert.match(sceneSource, /addEventListener\("squeezestart", toggleProductionPanel\)/);
  assert.match(sceneSource, /hapticActuators/);
  assert.match(sceneSource, /intersectObjects\(xrProduction\.buttons/);
  assert.match(sceneSource, /getControllerGrip\(index\)/);
  assert.match(sceneSource, /controller\.userData\.inputSource = source/);
  assert.match(sceneSource, /playerRig\.add\(controller, grip\)/);
  assert.match(sceneSource, /ray\.renderOrder = 110/);
  assert.match(sceneSource, /mesh\.renderOrder = 100/);
});

test("XR production cues drive the existing Nexus state", () => {
  assert.match(pageSource, /onXRProductionCue=\{runXRProductionCue\}/);
  assert.match(pageSource, /cue\.target === "wall"/);
  assert.match(pageSource, /takeScreenWall\(cue\.source, "cut"\)/);
  assert.match(pageSource, /mediaElement\.play\(\)/);
  assert.match(pageSource, /waypoint: "rack", arrivalAction: "inspect"/);
  assert.match(pageSource, /setActiveWorldCamera\(cue\.camera\)/);
  assert.match(pageSource, /setLightPreset\(cue\.preset\)/);
  assert.match(pageSource, /updateVfxPreset\(cue\.preset\)/);
  assert.match(pageSource, /issueRunwayNpcCommand/);
});
