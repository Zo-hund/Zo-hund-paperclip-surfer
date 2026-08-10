import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("routed program media is passed into the Three.js venue", async () => {
  const stage = await readFile(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
  const viewer = await readFile(new URL("../src/pages/stage-viewer.tsx", import.meta.url), "utf8");
  assert.match(stage, /programMedia=\{production\.state\.programMedia\.url/);
  assert.match(viewer, /const programMedia = production\.state\.programMedia\.url/);
  assert.match(stage, /screenRoutes: \{ center: "program", left: "program", right: "program" \}/);
});

test("event promo provides a scheduled public landing experience", async () => {
  const viewer = await readFile(new URL("../src/pages/stage-viewer.tsx", import.meta.url), "utf8");
  const events = await readFile(new URL("../src/stage-events.ts", import.meta.url), "utf8");
  assert.match(viewer, /className="stage-event-landing"/);
  assert.match(viewer, /GET EVENT PASS/);
  assert.match(viewer, /runtimeMinutes/);
  assert.match(events, /runtimeMinutes: Math\.max\(15/);
});

test("URL media is normalized to one uncropped 16:9 texture across all venue screens", async () => {
  const scene = await readFile(new URL("../src/AMXXRStageScene.tsx", import.meta.url), "utf8");
  assert.match(scene, /function bindProgramMedia/);
  assert.match(scene, /canvas\.width = 1280/);
  assert.match(scene, /canvas\.height = 720/);
  assert.match(scene, /Math\.min\(canvas\.width \/ video\.videoWidth, canvas\.height \/ video\.videoHeight\)/);
  assert.match(scene, /context\.drawImage\(video, x, y, width, height\)/);
  assert.match(scene, /new THREE\.CanvasTexture\(canvas\)/);
  assert.match(scene, /programScreensRef\.current = \[programScreen, leftSponsor, rightSponsor\]/);
  assert.match(scene, /new THREE\.PlaneGeometry\(9\.6, 5\.4\)/);
  assert.match(scene, /new THREE\.PlaneGeometry\(4\.2, 2\.36\)/);
});
