import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("tenant launch kits use configured organization missions, agents, and proof identity", async () => {
  const page = await read("src/pages/tenant-launch-kit.tsx");
  assert.match(page, /getTenantRecord\(tenantId \|\| getActiveTenant\(\)\)/);
  assert.match(page, /tenant\.agentIds\.includes\(agent\.id\)/);
  assert.match(page, /tenant\.missionIds\.includes\(mission\.id\)/);
  assert.match(page, /tenant\.proofScope/);
  assert.match(page, /tenant\.proofSignature/);
});

test("tenant launch kits include onboarding, agent governance, printables, and QR access", async () => {
  const [page, app, styles] = await Promise.all([
    read("src/pages/tenant-launch-kit.tsx"),
    read("src/App.tsx"),
    read("src/styles.css"),
  ]);
  assert.match(app, /path="\/tenants\/:tenantId\/guide"/);
  for (const label of ["Participant quick start", "Trainer launch checklist", "Agent prompt cards", "Evidence and proof worksheet", "QR access poster"]) assert.match(page, new RegExp(label));
  for (const route of ["/missions", "/pods", "/wallet"]) assert.match(page, new RegExp(`route="${route}"`));
  assert.match(page, /confirm before camera, tools, publishing, or external actions/i);
  assert.match(page, /window\.print\(\)/);
  assert.match(styles, /@media print/);
  assert.match(styles, /\.tenant-launch-kit/);
});
