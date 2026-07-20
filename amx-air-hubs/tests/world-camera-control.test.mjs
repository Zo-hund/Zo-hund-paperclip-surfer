import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/world-camera-control.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cameras = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("moves the briefing rig clear of the center display wall", () => {
  const pose = cameras.WORLD_CAMERA_POSES.briefing;
  assert.ok(Math.abs(pose.position[0]) > 4.5);
  assert.ok(pose.position[1] > 4);
  assert.ok(pose.position[2] > -4.5);
});

test("bounds virtual PTZ controls to usable production ranges", () => {
  assert.deepEqual(cameras.normalizeWorldCameraControl({ pan: 90, tilt: -50, zoom: 8 }), { pan: 45, tilt: -20, zoom: 2.2 });
  assert.deepEqual(cameras.normalizeWorldCameraControl({ pan: -13.4, tilt: 7.6, zoom: 1.36 }), { pan: -13, tilt: 8, zoom: 1.4 });
});

test("creates independent controls for every world camera", () => {
  const controls = cameras.defaultWorldCameraControls();
  controls.overview.pan = 20;
  assert.equal(controls.entry.pan, 0);
  assert.deepEqual(Object.keys(controls), ["overview", "entry", "rack", "briefing"]);
});
