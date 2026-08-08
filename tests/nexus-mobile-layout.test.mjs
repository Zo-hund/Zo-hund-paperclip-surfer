import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const scene = readFileSync(new URL("../src/NexusRoomScene.tsx", import.meta.url), "utf8");
const pod = readFileSync(new URL("../src/LiveKitPod.tsx", import.meta.url), "utf8");
const runway = readFileSync(new URL("../src/RunwayAvatarConsole.tsx", import.meta.url), "utf8");

test("keeps the Nexus mobile HUD above the moving avatar", () => {
  assert.match(css, /\.nexus-scene-overlay\{top:8px;bottom:auto;display:grid/);
  assert.match(css, /\.nexus-scene-overlay>div:first-child \.eyebrow\{display:none\}/);
  assert.match(scene, /activeCameraRef\.current === "overview" \? responsiveRoomFov\(camera\.aspect\) : 54/);
  assert.match(scene, /cameraControlRef\.current/);
});

test("shows the complete Runway avatar on mobile", () => {
  assert.match(css, /\.runway-avatar-video,\.runway-avatar-video video\{object-fit:contain!important\}/);
  assert.match(css, /\.runway-call-controls\{left:auto;right:7px;bottom:7px;transform:none\}/);
});

test("uses mobile edge media constraints and touch-sized pod communications", () => {
  assert.match(pod, /Math\.min\(profile\.width, 960\)/);
  assert.match(pod, /Math\.min\(profile\.height, 540\)/);
  assert.match(pod, /Math\.min\(profile\.frameRate, 24\)/);
  assert.match(css, /\.livekit-pod\.compact \.pod-video-tile video\{object-fit:contain/);
  assert.match(css, /\.pod-comms input\{height:46px;font-size:16px\}/);
  assert.match(runway, /new MutationObserver\(bindVideo\)/);
  assert.match(scene, /mobileEdge \? 1 : 1\.5/);
});
