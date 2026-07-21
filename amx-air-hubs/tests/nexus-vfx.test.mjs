import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/nexus-vfx.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const vfx = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("normalizes Nexus VFX and globe staging preferences", () => {
  assert.equal(vfx.normalizeNexusVfxPreset("show"), "show");
  assert.equal(vfx.normalizeNexusVfxPreset("unknown"), "ambient");
  assert.equal(vfx.normalizeNexusGlobeLevel("low"), "low");
  assert.equal(vfx.normalizeNexusGlobeLevel("unknown"), "center");
  assert.ok(vfx.NEXUS_GLOBE_LEVELS.low.offset < vfx.NEXUS_GLOBE_LEVELS.center.offset);
  assert.ok(vfx.NEXUS_GLOBE_LEVELS.high.offset > vfx.NEXUS_GLOBE_LEVELS.center.offset);
});

test("creates an additive Three.js particle system around the movable hologram", () => {
  const scene = readFileSync(new URL("../src/NexusRoomScene.tsx", import.meta.url), "utf8");
  assert.match(scene, /Nexus_VFX_Particle_System/);
  assert.match(scene, /THREE\.AdditiveBlending/);
  assert.match(scene, /NEXUS_GLOBE_LEVELS\[globeLevelRef\.current\]\.offset/);
  assert.match(scene, /object\.position\.y = baseY \+ vfx\.currentShift/);
});

test("exposes particle and globe height controls in the production console", () => {
  const switcher = readFileSync(new URL("../src/NexusProductionSwitcher.tsx", import.meta.url), "utf8");
  assert.match(switcher, /Hologram particle effect/);
  assert.match(switcher, /Globe height/);
  assert.match(switcher, /WORLD VFX/);
});
