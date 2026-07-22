import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("member profiles keep 2D photos separate from approved 3D avatar identities", async () => {
  const [migration, auth, account, avatars] = await Promise.all([
    read("supabase/migrations/20260722162354_member_3d_avatars.sql"),
    read("src/member-auth.tsx"), read("src/pages/account.tsx"), read("src/member-avatar.ts"),
  ]);
  assert.match(migration, /add column if not exists avatar_model_url/);
  assert.match(migration, /grant update \(avatar_model_url\).*authenticated/);
  assert.match(migration, /models\[\.\]readyplayer/);
  assert.match(auth, /avatar_model_url: string \| null/);
  assert.match(account, /World avatar/);
  assert.match(account, /Ready Player Me GLB/);
  assert.match(avatars, /url\.hostname !== "models\.readyplayer\.me"/);
  assert.match(avatars, /MEMBER_AVATAR_PRESETS/);
});

test("venue presence loads animated member GLTFs with a Quest-friendly fallback", async () => {
  const [presence, world] = await Promise.all([read("src/stage-venue-presence.ts"), read("src/StageVenueWorld.tsx")]);
  assert.match(presence, /avatarUrl: normalizeMemberAvatarUrl/);
  assert.match(presence, /profile\?\.avatar_model_url/);
  assert.match(world, /GLTFLoader/);
  assert.match(world, /cloneSkeleton/);
  assert.match(world, /MemberAvatarModel/);
  assert.match(world, /MemberAvatarFallback/);
  assert.match(world, /slice\(0, 12\)/);
  assert.match(world, /AnimationMixer/);
});
