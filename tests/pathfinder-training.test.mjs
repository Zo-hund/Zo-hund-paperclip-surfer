import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pathfinder-training.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/pathfinder-training.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const live = readFileSync(new URL("../src/pathfinder-training-live.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260808120000_pathfinder_training_production.sql", import.meta.url), "utf8");

test("Pathfinder training preserves the complete three-hour KNOW DO BE agenda", () => {
  assert.equal((source.match(/minutes: 15/g) || []).length, 8);
  assert.equal((source.match(/minutes: 20/g) || []).length, 2);
  assert.equal((source.match(/minutes: 10/g) || []).length, 2);
  for (const pillar of ["KNOW", "DO", "BE"]) assert.match(source, new RegExp(`pillar: "${pillar}"`));
});

test("learner and facilitator views share seven competency checks with offline fallback", () => {
  assert.match(source, /TRAINING_STORAGE_KEY/);
  assert.match(source, /Receive completion certification/);
  assert.match(page, /Complete the seven readiness checks/);
  assert.match(page, /LIVE ROSTER \+ SIGN-OFF/);
  assert.match(page, /Issue named certificate/);
  assert.match(page, /Offline copy active/);
});

test("production sessions use tenant RLS, realtime sync, and governed certification", () => {
  assert.match(live, /pathfinder_training_sessions/);
  assert.match(live, /postgres_changes/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /can_facilitate_pathfinder/);
  assert.match(migration, /certify_pathfinder_participant/);
  assert.doesNotMatch(live, /service_role|SUPABASE_SECRET/i);
});

test("mobile evidence prefills and reusable program deployment are available", () => {
  assert.match(source, /evidenceStarters/);
  assert.match(source, /pathfinderPrograms/);
  assert.match(source, /parsePathfinderProgram/);
  assert.match(page, /Quick program deployment/);
  assert.match(page, /Upload program/);
  assert.match(page, /!current\.evidence\[itemIndex\]\?\.trim/);
});

test("competency milestones drip modules and Solo Co-op Team Skill Pods", () => {
  assert.match(source, /pathfinderTrack/);
  assert.match(source, /trackUnlockState/);
  for (const mode of ['"solo"', '"co-op"', '"team"']) assert.match(source, new RegExp(mode));
  assert.match(page, /DRIP SKILL TRACK/);
  assert.match(page, /COHORT UNLOCK MAP/);
  assert.match(page, /Complete \{item\.requiredCompetencies\} competencies/);
});

test("protected routes and printable kit are shipped", () => {
  assert.match(app, /\/missions\/pathfinder-educator/);
  assert.match(app, /\/training\/pathfinder\/facilitator/);
  assert.match(page, /xrt-pathfinder-training-kit\.pdf/);
  const pdf = new URL("../public/resources/xrt-pathfinder-training-kit.pdf", import.meta.url);
  assert.ok(statSync(pdf).size > 10_000);
});
