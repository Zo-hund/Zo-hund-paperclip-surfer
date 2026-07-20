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

test("normalizes bounded show-score controls and rejects unknown looks", () => {
  const state = audio.normalizeStageAudio({
    score: {
      armed: true,
      beatSync: false,
      mode: "cue-follow",
      lighting: "unknown-look",
      vfx: "laser-sweep",
      sound: "impact",
      intensity: 900,
      activeCue: "demo",
      firedAt: 42,
    },
  });

  assert.equal(state.score.armed, true);
  assert.equal(state.score.beatSync, false);
  assert.equal(state.score.lighting, "house");
  assert.equal(state.score.vfx, "laser-sweep");
  assert.equal(state.score.intensity, 100);
  assert.equal(state.score.activeCue, "demo");
});

test("applies a deterministic finale score and computes a shared beat clock", () => {
  const score = audio.applyStageScoreCue(audio.DEFAULT_STAGE_SCORE, "close", 5_250);
  const clock = audio.stageScoreClock(120, 1_000, 5_250);

  assert.deepEqual(
    { lighting: score.lighting, vfx: score.vfx, sound: score.sound, intensity: score.intensity, cue: score.activeCue },
    { lighting: "finale", vfx: "confetti", sound: "impact", intensity: 94, cue: "close" },
  );
  assert.deepEqual(clock, { beat: 1, bar: 3, phase: 0.5, beatDuration: 500 });
  assert.equal(audio.STAGE_VFX_LOOKS.some((look) => look.id.includes("strobe")), false);
});
