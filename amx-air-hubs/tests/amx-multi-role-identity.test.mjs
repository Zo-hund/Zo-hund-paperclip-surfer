import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical identity supports every AMX business role", () => {
  const source = read("src/amx-identity.ts");
  for (const role of ["MEMBER","LEARNER","BUILDER","DEVELOPER","FOUNDER","WORKFORCE","MENTOR","INSTRUCTOR","EMPLOYER","PARTNER","AIR_HUB","STAFF","ADMIN"]) assert.match(source, new RegExp(`"${role}"`));
});

test("role mutations are operator governed and append audit events", () => {
  const sql = read("supabase/migrations/20260810233000_amx_multi_role_identity.sql");
  assert.match(sql, /private\.can_manage_connection_tenant/);
  assert.match(sql, /identity\.role\.grant/);
  assert.match(sql, /identity\.role\.revoke/);
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /revoke all on public\.amx_role_assignments from anon/);
});

test("membership access tier remains separate from additive business roles", () => {
  assert.match(read("src/member-auth.tsx"), /MembershipRole = "member" \| "trainer" \| "operator"/);
  assert.doesNotMatch(read("src/amx-identity.ts"), /membership_role/);
});
