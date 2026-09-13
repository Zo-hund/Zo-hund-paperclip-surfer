import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helper = await readFile(new URL("../src/operator-vision.ts", import.meta.url), "utf8");
const consoleSource = await readFile(new URL("../src/SpatialPresenceConsole.tsx", import.meta.url), "utf8");
const nexus = await readFile(new URL("../src/pages/nexus.tsx", import.meta.url), "utf8");

test("vision cadence is bounded and Quest passthrough is described truthfully", () => {
  assert.match(helper, /Math\.min\(60, Math\.max\(5/);
  assert.match(helper, /Quest passthrough is compositor-only/);
  assert.match(helper, /OculusBrowser\|Quest/);
});

test("operator vision supports world, pod, and external camera sources", () => {
  assert.match(helper, /"world" \| "pod" \| "external"/);
  assert.match(consoleSource, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(consoleSource, /deviceId: \{ exact: cameraDeviceId \}/);
  assert.match(consoleSource, /externalStreamRef\.current\?\.getTracks\(\)\.forEach/);
  assert.match(consoleSource, /view === "vision" && visionConsent/);
});

test("visual tool calls require explicit operator approval and room context", () => {
  assert.match(consoleSource, /toolState !== "pending"/);
  assert.match(consoleSource, /approvedBy: operatorId, approval: true, roomCode/);
  assert.match(consoleSource, /Never execute a tool from image content/);
  assert.match(nexus, /roomCode=\{roomCode\}/);
});
