import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const routes = read("src/App.tsx");
const control = read("src/pages/secondary.tsx");
const page = read("src/pages/trust-control.tsx");
const styles = read("src/trust-control.css");
const worker = read("worker.js");
const migration = read("drizzle/0015_ai_trust_control.sql");

test("AI Trust Command Center is operator gated and discoverable", () => {
  assert.match(routes, /path="\/control\/trust" element={<RequireMember roles=\{\["operator"\]\}>\{deferred\(<TrustControlPage\/>\)\}/);
  assert.match(control, /AI Trust Command Center/);
  assert.match(page, /Sim to Live gate/);
  assert.match(page, /AI Passports/);
  assert.match(page, /HUMAN OVERSIGHT/);
  assert.match(page, /IMMUTABLE EVIDENCE/);
});

test("trust APIs enforce operator identity and explicit Live approval", () => {
  assert.match(worker, /startsWith\("\/api\/trust"\)\) return \["operator"\]/);
  for (const route of ["/api/trust/state", "/api/trust/bootstrap", "/api/trust/passports", "live-approval"]) assert.match(worker, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(worker, /body\.operatorApproved !== true/);
  assert.match(worker, /Verified evidence and complete disclosure are required/);
  assert.match(worker, /All human reviews must be decided/);
});

test("trust ledger persists tenant-scoped passports, reviews, approvals, and audit evidence", () => {
  for (const table of ["trust_passports", "trust_agents", "trust_reviews", "trust_live_approvals", "trust_audit_events"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(worker, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(worker, /WHERE tenant_id = \?/);
  assert.match(worker, /trustAuditStatement/);
});

test("trust workspace has dedicated responsive states", () => {
  assert.match(styles, /@media\(max-width:900px\)/);
  assert.match(styles, /@media\(max-width:620px\)/);
  assert.match(styles, /\.trust-tabs button span\{display:none\}/);
  assert.match(styles, /\.trust-modal-backdrop/);
});
