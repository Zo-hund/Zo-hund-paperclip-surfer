import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/stage-video.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const video = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("defaults Stage capture and egress to balanced Full HD", () => {
  assert.deepEqual(video.normalizeStageVideo(), { captureProfile: "1080p30", outputProfile: "1080p30" });
  assert.equal(video.stageVideoProfile("1080p30").width, 1920);
  assert.equal(video.stageVideoProfile("1080p30").egressPreset, 2);
});

test("maps every operator quality profile to a bounded LiveKit egress preset", () => {
  assert.deepEqual(video.STAGE_VIDEO_PROFILES.map(({ id, egressPreset }) => [id, egressPreset]), [
    ["720p30", 0],
    ["1080p30", 2],
    ["1080p60", 3],
  ]);
});

test("rejects unknown persisted profiles and reports delivered camera settings", () => {
  assert.deepEqual(video.normalizeStageVideo({ captureProfile: "4k120", outputProfile: "unknown" }), { captureProfile: "1080p30", outputProfile: "1080p30" });
  assert.deepEqual(video.stageVideoDiagnostics({ width: 1920, height: 1080, frameRate: 29.97 }), {
    width: 1920,
    height: 1080,
    frameRate: 30,
    label: "1920x1080 / 30 FPS",
  });
});
