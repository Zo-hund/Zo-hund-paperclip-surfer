import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Stage state persists independent center, left, and right screen routes", async () => {
  const production = await readFile(new URL("../src/stage-production.ts", import.meta.url), "utf8");
  assert.match(production, /screenRoutes: Record<StageScreenId, string>/);
  assert.match(production, /screenMedia: Partial<Record<StageScreenId, StageScreenMediaAsset>>/);
  assert.match(production, /center: "program"/);
  assert.match(production, /screenRoutes: \{ \.\.\.DEFAULT_SCREEN_ROUTES, \.\.\.saved\.screenRoutes \}/);
  assert.match(production, /screenMedia: saved\.screenMedia \|\| \{\}/);
});

test("operator matrix offers program, sponsor, guests, members, and media per screen", async () => {
  const stage = await readFile(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
  assert.match(stage, /VENUE DISPLAY MATRIX/);
  assert.match(stage, /ROUTE ALL/);
  assert.match(stage, /GUEST \/ MEMBER \/ \{feed\.name\}/);
  assert.match(stage, /MEDIA \/ \{asset\.name\}/);
  assert.match(stage, /routeVenueScreen\(screen,event\.target\.value\)/);
  assert.match(stage, /screenMedia\[screen\] = \{ id: asset\.id, name: asset\.name, url: asset\.url, contentType: asset\.contentType \}/);
});

test("venue screens have physical frames and illuminated trim", async () => {
  const scene = await readFile(new URL("../src/AMXXRStageScene.tsx", import.meta.url), "utf8");
  assert.match(scene, /const screenFrame =/);
  assert.match(scene, /width \+ 0\.34, height \+ 0\.34/);
  assert.match(scene, /width \+ 0\.12, height \+ 0\.12/);
  assert.match(scene, /groups = new Map<string, THREE\.Mesh\[\]>/);
});

test("live viewer renders synchronized venue routes without camera substitution", async () => {
  const viewer = await readFile(new URL("../src/pages/stage-viewer.tsx", import.meta.url), "utf8");
  const scene = await readFile(new URL("../src/AMXXRStageScene.tsx", import.meta.url), "utf8");

  assert.match(viewer, /screenRoutes=\{production\.state\.screenRoutes\}/);
  assert.match(viewer, /videoFeeds=\{feeds\}/);
  assert.match(viewer, /mediaLibrary=\{screenMediaLibrary\}/);
  assert.match(viewer, /PROGRAM SOURCE UNAVAILABLE/);
  assert.match(viewer, /SCREEN SOURCE UNAVAILABLE/);
  assert.match(scene, /function bindUnavailableSlate/);
  assert.match(scene, /OPERATOR REROUTE REQUIRED/);
});
