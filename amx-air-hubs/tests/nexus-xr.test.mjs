import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/nexus-xr.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const xr = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("keeps Nexus spatial launches on the Nexus room route", () => {
  assert.equal(xr.nexusSpatialRoute("vr", "vr"), "/nexus?xr=vr");
  assert.equal(xr.nexusSpatialRoute("mr", "mr"), "/nexus?xr=mr");
  assert.equal(xr.nexusSpatialRoute("ar", "ar"), "/nexus?xr=mr");
  assert.equal(xr.nexusSpatialRoute("vr", "3d"), "/nexus");
});

test("normalizes Nexus WebXR query modes", () => {
  assert.equal(xr.normalizeNexusXRMode("vr"), "vr");
  assert.equal(xr.normalizeNexusXRMode("mr"), "mr");
  assert.equal(xr.normalizeNexusXRMode("anything"), "none");
});

test("Nexus room owns its WebXR session and Quest locomotion", () => {
  const scene = readFileSync(new URL("../src/NexusRoomScene.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/components.tsx", import.meta.url), "utf8");
  assert.match(shell, /pathname === "\/nexus" \? nexusSpatialRoute/);
  assert.match(scene, /requestSession\(sessionMode/);
  assert.match(scene, /Nexus_XR_Player_Rig/);
  assert.match(scene, /source\.handedness === "left"/);
  assert.match(scene, /source\.handedness === "right"/);
  assert.match(scene, /Enter Nexus/);
});
