import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/xr-access.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const access = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const capabilities = (overrides = {}) => ({
  methods: ["mouse", "keyboard"], webXR: false, immersiveAR: false, immersiveVR: false,
  camera: false, voice: false, gamepad: false, touch: false, handTracking: false,
  ...overrides,
});

test("routes immersive devices directly into AR, VR, and passthrough MR", () => {
  const ready = capabilities({ webXR: true, immersiveAR: true, immersiveVR: true, handTracking: true });
  assert.deepEqual(access.resolveSpatialAccess("ar", ready), { requested: "ar", resolved: "ar", ready: true, status: "WebXR AR ready" });
  assert.equal(access.resolveSpatialAccess("vr", ready).resolved, "vr");
  assert.equal(access.resolveSpatialAccess("mr", ready).resolved, "mr");
});

test("routes phones to camera AR and non-XR devices to browser 3D", () => {
  const phone = capabilities({ camera: true, touch: true });
  assert.equal(access.resolveSpatialAccess("ar", phone).resolved, "ar");
  assert.equal(access.resolveSpatialAccess("mr", phone).resolved, "ar");
  assert.equal(access.resolveSpatialAccess("vr", phone).resolved, "3d");
  assert.equal(access.resolveSpatialAccess("mr", capabilities()).resolved, "3d");
});

test("exposes spatial access from desktop and mobile application navigation", () => {
  const shell = readFileSync(new URL("../src/components.tsx", import.meta.url), "utf8");
  assert.match(shell, /aria-label="Open spatial access"/);
  assert.match(shell, />Spatial access</);
  assert.match(shell, /Augmented reality/);
  assert.match(shell, /Virtual reality/);
  assert.match(shell, /Mixed reality/);
});
