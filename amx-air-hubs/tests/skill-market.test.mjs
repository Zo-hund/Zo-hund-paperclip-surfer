import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Skill Market exposes four runs, five verified levels, and exact gross rates", async () => {
  const model = await read("src/skill-market.ts");
  const page = await read("src/pages/skill-market.tsx");
  const routes = await read("src/App.tsx");
  assert.equal((model.match(/id: "event-/g) || []).length, 4);
  for (const rate of [15, 25, 50, 75, 100]) assert.match(model, new RegExp(`rate: ${rate}`));
  assert.match(page, /gross capacity, not guaranteed income/);
  assert.match(routes, /path="\/marketplace\/earn"/);
});

test("live placement requires funding, simulation evidence, and human release", async () => {
  const page = await read("src/pages/skill-market.tsx");
  const model = await read("src/skill-market.ts");
  assert.match(page, /funding\.funded && simulationApproved && supervisorApproved/);
  assert.match(page, /Simulation approved/);
  assert.match(page, /Human supervisor release/);
  assert.match(model, /funded: contractValue >= 2200/);
});

test("balanced block and placement roadmap match the operating brief", async () => {
  const model = await read("src/skill-market.ts");
  assert.match(model, /\{ level: 1, count: 3 \}/);
  assert.match(model, /\{ level: 5, count: 1 \}/);
  assert.match(model, /\{ year: 5, placements: 3000, cumulative: 10000 \}/);
  assert.match(model, /return balancedTeam\.reduce/);
});
