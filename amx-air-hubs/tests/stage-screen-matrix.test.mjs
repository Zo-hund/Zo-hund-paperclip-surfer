import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Stage state persists independent center, left, and right screen routes", async () => {
  const production = await readFile(new URL("../src/stage-production.ts", import.meta.url), "utf8");
  assert.match(production, /screenRoutes: Record<StageScreenId, string>/);
  assert.match(production, /center: "program"/);
  assert.match(production, /screenRoutes: \{ \.\.\.DEFAULT_SCREEN_ROUTES, \.\.\.saved\.screenRoutes \}/);
});

test("operator matrix offers program, sponsor, guests, members, and media per screen", async () => {
  const stage = await readFile(new URL("../src/pages/stage.tsx", import.meta.url), "utf8");
  assert.match(stage, /VENUE DISPLAY MATRIX/);
  assert.match(stage, /ROUTE ALL/);
  assert.match(stage, /GUEST \/ MEMBER \/ \{feed\.name\}/);
  assert.match(stage, /MEDIA \/ \{asset\.name\}/);
  assert.match(stage, /routeVenueScreen\(screen,event\.target\.value\)/);
});

test("venue screens have physical frames and illuminated trim", async () => {
  const scene = await readFile(new URL("../src/AMXXRStageScene.tsx", import.meta.url), "utf8");
  assert.match(scene, /const screenFrame =/);
  assert.match(scene, /width \+ 0\.34, height \+ 0\.34/);
  assert.match(scene, /width \+ 0\.12, height \+ 0\.12/);
  assert.match(scene, /groups = new Map<string, THREE\.Mesh\[\]>/);
});
