import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/stage-camera-motion.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const camera = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("camera motion catalog covers practical production moves", () => {
  const ids = camera.STAGE_CAMERA_MOTION_PRESETS.map((preset) => preset.id);
  assert.deepEqual(ids, ["static", "crane-reveal", "crane-sweep", "dolly-push", "orbit-arc", "truck-parallax", "audience-pan", "dolly-zoom"]);
  for (const preset of camera.STAGE_CAMERA_MOTION_PRESETS.filter((item) => item.id !== "static")) {
    assert.ok(preset.useCase.length > 20);
    assert.ok(preset.durationMs >= 7_000);
    assert.match(preset.baseShot, /^(wide|host|audience|crane)$/);
  }
});

test("normalizes camera motion controls to production limits", () => {
  assert.deepEqual(camera.normalizeStageCameraMotion({ id: "unknown", intensity: 900, speed: 0.1, loop: true, startedAt: 400 }), {
    id: "static",
    intensity: 100,
    speed: 0.5,
    loop: false,
    startedAt: null,
  });
  assert.deepEqual(camera.normalizeStageCameraMotion({ id: "crane-sweep", intensity: 42.4, speed: 1.26, loop: true, startedAt: 1_000 }), {
    id: "crane-sweep",
    intensity: 42,
    speed: 1.26,
    loop: true,
    startedAt: 1_000,
  });
});

test("calculates synchronized one-shot and looping motion progress", () => {
  const oneShot = { id: "crane-reveal", intensity: 68, speed: 1, loop: false, startedAt: 1_000 };
  assert.equal(camera.stageCameraMotionProgress(oneShot, 5_000), 0.5);
  assert.equal(camera.stageCameraMotionProgress(oneShot, 20_000), 1);
  assert.equal(camera.stageCameraMotionProgress({ ...oneShot, loop: true }, 10_000), 0.125);
  assert.equal(camera.stageCameraMotionProgress({ ...oneShot, speed: 2 }, 3_000), 0.5);
  assert.equal(camera.smoothCameraMotionProgress(0.5, true), 1);
  assert.equal(camera.smoothCameraMotionProgress(0, false), 0);
});
