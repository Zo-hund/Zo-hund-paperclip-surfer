import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/stage-source-identity.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} }; vm.runInNewContext(js, { module, exports: module.exports, Set, JSON, String });
const { stageSourceIdentity, stageSourceHealth } = module.exports;

test("normalizes bounded remote production identity", () => {
  assert.deepEqual({ ...stageSourceIdentity(JSON.stringify({ sourceLabel: "Waterfront Host", location: "Louisville, KY", organization: "AMX Labs", productionRole: "Host", sourceKind: "phone" }), "fallback", "camera") }, { label: "Waterfront Host", location: "Louisville, KY", organization: "AMX Labs", role: "Host", kind: "phone" });
  assert.equal(stageSourceIdentity("not-json", "NY Producer", "screen").kind, "screen");
});

test("classifies source quality before a take", () => {
  assert.equal(stageSourceHealth({ muted: false, width: 1920, height: 1080, frameRate: 30 }), "ready");
  assert.equal(stageSourceHealth({ muted: false, width: 640, height: 360, frameRate: 15 }), "degraded");
  assert.equal(stageSourceHealth({ muted: true, width: 1920, height: 1080, frameRate: 30 }), "offline");
});
