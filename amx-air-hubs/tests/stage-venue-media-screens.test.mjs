import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("routed program media is passed into the Three.js venue", async () => {
  const stage = await readFile(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
  assert.match(stage, /programMedia=\{programChannel\.route\.startsWith\("media:"\)/);
});

test("URL media becomes one video texture across all venue screens", async () => {
  const scene = await readFile(new URL("../src/AMXXRStageScene.tsx", import.meta.url), "utf8");
  assert.match(scene, /function bindProgramMedia/);
  assert.match(scene, /new THREE\.VideoTexture\(video\)/);
  assert.match(scene, /programScreensRef\.current = \[programScreen, leftSponsor, rightSponsor\]/);
  assert.match(scene, /new THREE\.PlaneGeometry\(9\.6, 5\.4\)/);
  assert.match(scene, /new THREE\.PlaneGeometry\(4\.2, 2\.36\)/);
});
