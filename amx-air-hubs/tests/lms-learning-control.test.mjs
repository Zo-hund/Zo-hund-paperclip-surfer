import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const runtime = readFileSync(new URL("../src/lms.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/learn.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker.js", import.meta.url), "utf8");
const d1 = readFileSync(new URL("../drizzle/0012_lms_learning_control.sql", import.meta.url), "utf8");
const supabase = readFileSync(new URL("../supabase/migrations/20260810220000_lms_learning_control.sql", import.meta.url), "utf8");

test("Learn Mode exposes connected learner and operator surfaces", () => {
  assert.match(routes, /path="\/learn"/);
  assert.match(routes, /path="\/control\/learning"/);
  assert.match(page, /Learn\. Practice\. Prove\. Go live\. Earn\./);
  assert.match(page, /Program operations/);
});

test("LMS contract covers training workshops market simulations and drip unlocks", () => {
  for (const mode of ["training", "workshop", "market_sim"]) assert.match(runtime, new RegExp(mode));
  for (const stage of ["learn", "practice", "prove", "live", "earn"]) assert.match(runtime, new RegExp(`id: "${stage}"`));
  assert.match(runtime, /unlockAfterModuleId/);
  assert.match(runtime, /availableAt/);
  assert.match(runtime, /rewardCents/);
});

test("worker persists programs enrollments and append-only learning activity", () => {
  for (const route of ["/api/lms/programs", "/api/lms/enrollments"]) assert.match(worker, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(worker, /lms_activity_events/);
  assert.match(worker, /The prerequisite module is not complete/);
  assert.match(worker, /This module has not been released/);
  assert.match(worker, /Members may only update their own progress/);
  assert.match(worker, /Trainer or operator approval is required for this action/);
  assert.match(worker, /status = 'published'/);
});

test("LMS migrations create tenant indexes and Supabase RLS", () => {
  for (const source of [d1, supabase]) for (const table of ["lms_programs", "lms_enrollments", "lms_activity_events"]) assert.match(source, new RegExp(table));
  assert.match(supabase, /ENABLE ROW LEVEL SECURITY/);
  assert.match(supabase, /private\.can_manage_connection_tenant\(tenant_id\)/);
  assert.doesNotMatch(supabase, /TO anon/);
});
