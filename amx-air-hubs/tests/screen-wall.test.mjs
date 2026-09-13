import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/screen-wall.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const wall = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("normalizes persisted screen transformer settings", () => {
  assert.equal(wall.normalizeScreenLayoutMode("wall"), "wall");
  assert.equal(wall.normalizeScreenLayoutMode("unknown"), "triple");
  assert.equal(wall.normalizeScreenWallFit("cover"), "cover");
  assert.equal(wall.normalizeScreenWallFit("invalid"), "contain");
  assert.equal(wall.normalizeScreenWallFormat("cinema"), "cinema");
  assert.equal(wall.normalizeScreenWallFormat("panorama"), "panorama");
  assert.equal(wall.normalizeScreenWallFormat("invalid"), "production");
  assert.equal(wall.SCREEN_WALL_FORMATS.production.ratio, "16:9");
});

test("builds a bounded public TV wall receiver", () => {
  assert.equal(wall.screenWallCastHref(" nexus room ! "), "/watch/NEXUSROOM?display=wall&source=nexus");
});

test("creates one resizable Three.js output and hides the separate screen surfaces", () => {
  const scene = readFileSync(new URL("../src/NexusRoomScene.tsx", import.meta.url), "utf8");
  assert.match(scene, /new THREE\.PlaneGeometry\(wallWidth, wallHeight\)/);
  assert.match(scene, /SCREEN_WALL_FORMATS\[screenWallFormat\]\.aspect/);
  assert.match(scene, /wall\.rotation\.set\(0, Math\.PI, Math\.PI\)/);
  assert.match(scene, /screenMode === "wall" && wall/);
  assert.match(scene, /mesh\.visible = false/);
  assert.match(scene, /fitOverride: screenWallFit/);
});

test("exposes Full, Fill, display, and Presentation API casting controls", () => {
  const switcher = readFileSync(new URL("../src/NexusProductionSwitcher.tsx", import.meta.url), "utf8");
  const viewer = readFileSync(new URL("../src/pages/stage-viewer.tsx", import.meta.url), "utf8");
  assert.match(switcher, /PresentationRequest/);
  assert.match(switcher, />Full<\/button>/);
  assert.match(switcher, />Fill<\/button>/);
  assert.match(switcher, />TV Cast<\/button>/);
  assert.match(switcher, /Screen wall viewing format/);
  assert.match(viewer, /display-wall/);
});
