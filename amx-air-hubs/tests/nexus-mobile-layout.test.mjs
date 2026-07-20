import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const scene = readFileSync(new URL("../src/NexusRoomScene.tsx", import.meta.url), "utf8");

test("keeps the Nexus mobile HUD above the moving avatar", () => {
  assert.match(css, /\.nexus-scene-overlay\{top:8px;bottom:auto;display:grid/);
  assert.match(css, /\.nexus-scene-overlay>div:first-child \.eyebrow\{display:none\}/);
  assert.match(scene, /camera\.fov = responsiveRoomFov\(camera\.aspect\)/);
});

test("shows the complete Runway avatar on mobile", () => {
  assert.match(css, /\.runway-avatar-video,\.runway-avatar-video video\{object-fit:contain!important\}/);
  assert.match(css, /\.runway-call-controls\{left:auto;right:7px;bottom:7px;transform:none\}/);
});
