import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/metaverse-session.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const session = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("ships a renderable collaborative Three.js blueprint", () => {
  const parsed = session.parseWorldBlueprint(session.worldBlueprintCode());
  assert.equal(parsed.error, "");
  assert.equal(parsed.blueprint.title, "AMX Co-Creation Pod");
  assert.equal(parsed.blueprint.entities.length, 4);
});

test("rejects invalid or oversized world code", () => {
  assert.match(session.parseWorldBlueprint("{").error, /JSON|position|property/i);
  assert.match(session.parseWorldBlueprint("x".repeat(10_001)).error, /10 KB/);
  assert.match(session.parseWorldBlueprint('{"title":"empty"}').error, /entities array/);
});

test("bounds remote entities, transforms, colors, and organization tags", () => {
  const entities = Array.from({ length: 70 }, (_, index) => ({ id: `e-${index}`, primitive: "unknown", color: "unsafe", position: [999, 0, -999], scale: [-20, 0, 2] }));
  const parsed = session.parseWorldBlueprint(JSON.stringify({ title: "Bounded", environment: "unknown", entities }));
  assert.equal(parsed.blueprint.entities.length, 48);
  assert.deepEqual(parsed.blueprint.entities[0].position, [20, 0, -20]);
  assert.deepEqual(parsed.blueprint.entities[0].scale, [8, 0.05, 2]);
  assert.equal(parsed.blueprint.entities[0].primitive, "box");
  assert.equal(parsed.blueprint.entities[0].color, "#55e6ff");
  assert.deepEqual(session.normalizeOrganizationTags(["AMX Labs", "AMX Labs", "XR Con!"]), ["amx-labs", "xr-con"]);
});

test("supports solo, co-op, and team session contracts", () => {
  assert.match(source, /MetaverseMode = "solo" \| "co-op" \| "teams"/);
  assert.match(source, /MetaverseEventType = "showcase" \| "summit" \| "conference" \| "expo"/);
});
