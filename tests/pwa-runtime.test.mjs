import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("service worker contains cache failures and skips partial XR responses", async () => {
  const worker = await read("public/sw.js");
  assert.match(worker, /const CACHE = "amx-air-v6"/);
  assert.match(worker, /response\.status === 200/);
  assert.match(worker, /!request\.headers\.has\("range"\)/);
  assert.match(worker, /\(await caches\.match\("\/index\.html"\)\) \|\| Response\.error\(\)/);
  assert.match(worker, /try \{\s+const cache = await caches\.open\(CACHE\)/);
  assert.match(worker, /catch \{\s+\/\/ Storage limits and unsupported responses must not break the request\./);
  assert.doesNotMatch(worker, /if \(response\.ok\) caches\.open/);
});

test("member invitation claims run once and rejected tokens are discarded", async () => {
  const account = await read("src/pages/account.tsx");
  assert.match(account, /const attemptedInvite = useRef\(""\)/);
  assert.match(account, /attemptedInvite\.current === invite/);
  assert.match(account, /attemptedInvite\.current = invite/);
  assert.match(account, /catch\(\(error\) => \{\s+localStorage\.removeItem\("amx_member_invite"\)/);
  assert.match(account, /\[auth\.profile\?\.id, auth\.session\?\.user\.id, invite, navigate\]/);
  assert.doesNotMatch(account, /\}, \[auth, invite, navigate\]\)/);
});
