import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const load = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Runpod credentials and endpoints stay behind the operator Worker boundary", async () => {
  const [worker, env, routes] = await Promise.all([load("../worker.js"), load("../.env.example"), load("../src/App.tsx")]);
  assert.match(worker, /const RUNPOD_API_BASE = "https:\/\/api\.runpod\.ai\/v2"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/runpod\/"\).*\["operator"\]/);
  assert.match(worker, /runpodConfiguredEndpointIds\(env\)\.includes\(endpointId\)/);
  assert.match(worker, /RUNPOD_WEBHOOK_SECRET/);
  assert.match(routes, /path="\/control\/gpu" element={<RequireMember roles=\{\["operator"\]\}>/);
  assert.match(env, /RUNPOD_API_KEY=/);
  assert.doesNotMatch(env, /VITE_RUNPOD/);
});

test("Runpod jobs use the documented async lifecycle and signed callback", async () => {
  const worker = await load("../worker.js");
  assert.match(worker, /runpodRequest\(env, endpointId, "run"/);
  assert.match(worker, /`status\/\$\{row\.provider_job_id\}`/);
  assert.match(worker, /`cancel\/\$\{row\.provider_job_id\}`/);
  assert.match(worker, /webhook: `\$\{callbackBase\}\/api\/runpod\/callback\?jobId=/);
  assert.match(worker, /policy: \{ executionTimeout:/);
  assert.match(worker, /RUNPOD_TERMINAL_STATES/);
  assert.match(worker, /function safeRunpodOutputUrl/);
  assert.match(worker, /redirect: "manual"/);
  assert.match(worker, /GPU output redirect is not safe to capture/);
});

test("tenant GPU policy enforces budget, concurrency, allowlists, and training approval", async () => {
  const worker = await load("../worker.js");
  for (const contract of [
    "monthlyBudgetCents", "perJobLimitCents", "maxConcurrentJobs", "allowedWorkloads", "allowedGpus",
    "Operator approval is required for model training", "Tenant monthly GPU budget would be exceeded",
    "Tenant concurrent GPU job limit reached",
  ]) assert.match(worker, new RegExp(contract));
});

test("GPU ledgers are migrated and Supabase mirrors remain tenant-scoped with RLS", async () => {
  const [d1, supabase] = await Promise.all([load("../drizzle/0015_runpod_gpu_compute.sql"), load("../supabase/migrations/20260814190000_runpod_gpu_compute.sql")]);
  for (const table of ["gpu_tenant_policies", "gpu_jobs", "gpu_usage_events", "gpu_delivery_events"]) {
    assert.match(d1, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
    assert.match(supabase, new RegExp(`public\\.${table}`));
  }
  assert.match(supabase, /enable row level security/g);
  assert.match(supabase, /can_manage_connection_tenant\(tenant_id\)/);
  assert.match(supabase, /revoke insert, update, delete on public\.gpu_jobs/);
});

test("completed GPU videos use the existing Stage hot-load library", async () => {
  const [page, deck] = await Promise.all([load("../src/pages/gpu-compute.tsx"), load("../src/StageProgramMediaDeck.tsx")]);
  assert.match(page, /storeStageMediaAsset\(tenantId, result\.delivery\.stageAsset\)/);
  assert.match(deck, /export function storeStageMediaAsset/);
  assert.match(deck, /amx-stage-media-added/);
  assert.match(page, /Prepare LiveKit ingress/);
});
