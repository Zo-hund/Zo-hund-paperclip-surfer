import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("invite destination carries admission context into the protected lobby", async () => {
  const source = await readFile(new URL("../src/pod-invites.ts", import.meta.url), "utf8");
  assert.match(source, /rooms\/\$\{encodeURIComponent\(invite\.podId\)\}\/lobby/);
  assert.match(source, /invite: invite\.token/);
  assert.match(source, /room: invite\.roomCode/);
  assert.match(source, /access: invite\.role/);
});

test("public pass preview signs members in before consuming an invite use", async () => {
  const source = await readFile(new URL("../src/pages/invites.tsx", import.meta.url), "utf8");
  const signInGuard = source.indexOf("if(!member.session)");
  const acceptRequest = source.indexOf("await acceptPodInvite(token)");
  assert.ok(signInGuard >= 0, "missing member sign-in guard");
  assert.ok(acceptRequest > signInGuard, "invite must not be accepted before member sign-in");
  assert.match(source, /Sign in to claim pass/);
  assert.match(source, /does not by itself prove payment/);
});
