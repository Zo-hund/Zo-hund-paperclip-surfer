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
  const acceptRequest = source.indexOf("await acceptPodInvite(token", signInGuard);
  assert.ok(signInGuard >= 0, "missing member sign-in guard");
  assert.ok(acceptRequest > signInGuard, "invite must not be accepted before member sign-in");
  assert.match(source, /Sign in to unlock pass/);
  assert.match(source, /QR and ZKODE are separate credentials/);
});

test("general event passes route to the live viewer instead of WebXR", async () => {
  const invites = await readFile(new URL("../src/pod-invites.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages/invites.tsx", import.meta.url), "utf8");
  assert.match(invites, /isStageAudiencePass/);
  assert.match(invites, /watch\/\$\{encodeURIComponent\(invite\.roomCode\)\}/);
  assert.match(page, /if\(!isStageAudiencePass\(accepted\)\)joinImmersiveRoomFromInvite/);
  assert.match(page, /Unlock pass and watch live/);
});
