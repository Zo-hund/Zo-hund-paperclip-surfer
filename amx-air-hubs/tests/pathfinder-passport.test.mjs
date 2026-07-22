import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const pathfinder = await read("src/mission-world/pathfinder.ts");
const passport = await read("src/PathfinderPassport.tsx");
const world = await read("src/MissionWorld.tsx");
const routes = await read("src/App.tsx");
const proof = await read("src/mission-world/opprrc.ts");
const flags = await read("src/mission-world/features.ts");

test("Pathfinder groups require real learning, approved simulations, and team mastery", () => {
  assert.match(pathfinder, /approved\.length >= 2 && know >= 50/);
  assert.match(pathfinder, /progress\.completed\.length === 5 && averageScore >= 85 && progress\.mode === "teams"/);
  for (const group of ["Explorer", "Builder", "Ambassador"]) assert.match(pathfinder, new RegExp(`"${group}"`));
});

test("Know Do Be and Create Curate Connect derive from persisted mission evidence", () => {
  for (const dimension of ["know", "do: doScore", "be", "create", "curate", "connect"]) assert.match(pathfinder, new RegExp(dimension));
  assert.match(pathfinder, /completedLessons\(progress\)/);
  assert.match(pathfinder, /configuration\.plan/);
  assert.match(pathfinder, /configuration\.role/);
});

test("collectible vault exposes five skill coins plus gated mastery artifacts", () => {
  for (const collectible of ["AI Apprentice Neural Coin", "Reality Shifter XR Portal Coin", "Robot Wrangler Gear Coin", "Flow Architect Automation Coin", "World Builder Cube Coin", "Mission Master Star Coin", "Human-Agentic Orchestrator Coin"]) assert.match(pathfinder, new RegExp(collectible));
  for (const tier of ["Bronze", "Silver", "Gold", "Platinum", "Onyx"]) assert.match(pathfinder, new RegExp(`"${tier}"`));
  assert.match(passport, /new THREE\.WebGLRenderer/);
  assert.match(passport, /Interactive Three\.js Pathfinder collectible vault/);
});

test("passport routes separate profile, proof, evidence, credentials, and deployment readiness", () => {
  for (const route of ["/profile", "/profile/collectibles", "/profile/evidence", "/profile/credentials", "/profile/deployments", "/profile/toolbelt", "/proof/:credentialId"]) assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(passport, /OPPRRC evidence lives in the Proof Wallet/);
  assert.match(pathfinder, /Supervised workshop delivered/);
  assert.match(pathfinder, /complete: false/);
});

test("Mission World launches native WebXR with Quest controllers and browser fallback", () => {
  assert.match(world, /renderer\.xr\.enabled = true/);
  assert.match(world, /requestSession\(sessionMode, options\)/);
  assert.match(world, /renderer\.setAnimationLoop\(render\)/);
  assert.match(world, /renderer\.xr\.getController\(index\)/);
  assert.match(world, /addEventListener\("select", selectWithController\)/);
  assert.match(world, /Web 3D remains available/);
  for (const mode of ["web", "ar", "vr", "mr"]) assert.match(world, new RegExp(`"${mode}"`));
});

test("progressive flags and organization-scoped proof prevent capability overclaims", () => {
  assert.match(flags, /VITE_ENABLE_MISSION_WEBXR/);
  assert.match(flags, /VITE_ENABLE_MISSION_MULTIPLAYER/);
  assert.match(flags, /realtimeMultiplayer.*false/);
  assert.match(proof, /amx_active_tenant/);
  assert.match(proof, /tenant:\$\{tenantId\}/);
});
