import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/stage-audio.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const audio = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const asset = {
  id: "track-1",
  url: "https://untrusted.example/audio.mp3",
  name: "Opening Theme",
  contentType: "audio/mpeg",
  size: 2_048,
  duration: 63.4,
  createdAt: "2026-07-19T12:00:00.000Z",
  rightsConfirmed: true,
};

test("normalizes synchronized audio assets and regenerates private media URLs", () => {
  const state = audio.normalizeStageAudio({
    transport: "playing",
    deckA: "upload:track-1",
    deckB: "upload:missing",
    library: [asset, { ...asset }],
    crossfader: 900,
    bpm: 12,
  });

  assert.equal(state.library.length, 1);
  assert.equal(state.library[0].url, "/api/media/track-1");
  assert.equal(state.deckA, "upload:track-1");
  assert.equal(state.deckB, "night-grid");
  assert.equal(state.crossfader, 100);
  assert.equal(state.bpm, 60);
});

test("drops unconfirmed or non-audio assets from shared stage state", () => {
  const state = audio.normalizeStageAudio({
    library: [
      { ...asset, id: "unconfirmed", rightsConfirmed: false },
      { ...asset, id: "video", contentType: "video/mp4" },
    ],
  });

  assert.deepEqual(state.library, []);
  assert.equal(state.stingerTrack, "sponsor-sting");
});

test("resolves uploaded track labels and duration display", () => {
  const state = audio.normalizeStageAudio({ library: [asset] });
  const track = audio.stageAudioTrackId(asset.id);

  assert.equal(audio.stageAudioAssetForTrack(track, state.library)?.name, "Opening Theme");
  assert.equal(audio.stageAudioTrackLabel(track, state.library), "Opening Theme");
  assert.equal(audio.stageAudioDurationLabel(63.4), "1:03");
});
