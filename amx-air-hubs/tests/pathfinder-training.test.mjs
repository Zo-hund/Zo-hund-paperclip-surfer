import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pathfinder-training.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/pathfinder-training.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Pathfinder training preserves the complete three-hour KNOW DO BE agenda", () => {
  assert.equal((source.match(/minutes: 15/g) || []).length, 8);
  assert.equal((source.match(/minutes: 20/g) || []).length, 2);
  assert.equal((source.match(/minutes: 10/g) || []).length, 2);
  for (const pillar of ["KNOW", "DO", "BE"]) assert.match(source, new RegExp(`pillar: "${pillar}"`));
});

test("learner and facilitator views share seven competency checks and persisted state", () => {
  assert.match(source, /TRAINING_STORAGE_KEY/);
  assert.match(source, /Receive completion certification/);
  assert.match(page, /Complete the seven readiness checks/);
  assert.match(page, /LEARNER ROSTER \+ SIGN-OFF/);
  assert.match(page, /Issue certificate/);
});

test("protected routes and printable kit are shipped", () => {
  assert.match(app, /\/missions\/pathfinder-educator/);
  assert.match(app, /\/training\/pathfinder\/facilitator/);
  assert.match(page, /xrt-pathfinder-training-kit\.pdf/);
  const pdf = new URL("../public/resources/xrt-pathfinder-training-kit.pdf", import.meta.url);
  assert.ok(statSync(pdf).size > 10_000);
});
