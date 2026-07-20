import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public audience routes remain open while private workspaces require membership", async () => {
  const routes = await read("src/App.tsx");
  assert.match(routes, /path="\/watch\/:roomCode" element={<StageLiveViewerPage\/>}/);
  assert.match(routes, /path="\/join\/:token" element={<PodInvitePage\/>}/);
  assert.match(routes, /path="\/stage" element={<RequireMember roles={\["operator"\]}>/);
  assert.match(routes, /path="\/nexus" element={<RequireMember><NexusPage\/>/);
});

test("member profile authorization is database-backed and row-level secured", async () => {
  const schema = await read("supabase/migrations/202607200001_member_accounts.sql");
  const hardening = await read("supabase/migrations/202607200002_member_security_hardening.sql");
  assert.match(schema, /alter table public\.member_profiles enable row level security/);
  assert.match(schema, /id = \(select auth\.uid\(\)\)/);
  assert.match(schema, /grant update \(display_name, handle, avatar_url, profile_visibility\)/);
  assert.match(schema, /revoke all on public\.member_invites from anon, authenticated/);
  assert.match(schema, /digest\(invite_token, 'sha256'\)/);
  assert.match(hardening, /revoke all on function public\.create_member_profile\(\)/);
  assert.match(hardening, /using \(false\)/);
});

test("browser auth uses only the publishable Supabase configuration", async () => {
  const auth = await read("src/member-auth.tsx");
  assert.match(auth, /supabasePublishableKey/);
  assert.doesNotMatch(auth, /service_role|SUPABASE_SERVICE/);
  assert.match(auth, /membership_role/);
  assert.doesNotMatch(auth, /user_metadata\.membership_role|user_metadata\.role/);
});

test("members can change a password from an active session without sending email", async () => {
  const auth = await read("src/member-auth.tsx");
  const account = await read("src/pages/account.tsx");
  assert.match(auth, /client\.auth\.updateUser\(\{ password \}\)/);
  assert.match(auth, /over_email_send_rate_limit/);
  assert.match(account, /className="member-security-panel"/);
  assert.match(account, /auth\.updatePassword\(newPassword\)/);
  assert.doesNotMatch(account, /auth\.recoveryMode \|\| searchParams\.get\("mode"\) === "recovery"/);
});
