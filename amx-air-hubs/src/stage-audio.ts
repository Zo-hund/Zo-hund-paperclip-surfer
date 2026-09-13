export type StageAudioFormat = "show" | "podcast" | "dj";
export type StageAudioTransport = "stopped" | "playing";
export type StageDeckPreset = "air-pulse" | "night-grid" | "spoken-bed" | "sponsor-sting";
export type StageDeckTrack = StageDeckPreset | `upload:${string}`;
export type StageSoundscape = "air-grid" | "deep-focus" | "crowd-warmup" | "podcast-room";
export type StageScoreMode = "manual" | "cue-follow";
export type StageLightingLook = "house" | "keynote" | "neon-grid" | "audience" | "brand" | "finale";
export type StageVfxLook = "clean" | "beat-pulse" | "laser-sweep" | "prism" | "confetti";
export type StageSoundDesign = "none" | "impact" | "riser" | "pulse" | "sparkle";
export type StageScoreCue = "standby" | "opening" | "speaker" | "demo" | "qa" | "sponsor" | "close";

export interface StageScoreState {
  armed: boolean;
  beatSync: boolean;
  mode: StageScoreMode;
  lighting: StageLightingLook;
  vfx: StageVfxLook;
  sound: StageSoundDesign;
  intensity: number;
  activeCue: StageScoreCue | null;
  firedAt: number | null;
}

export interface StageScorePreset {
  cue: StageScoreCue;
  label: string;
  lighting: StageLightingLook;
  vfx: StageVfxLook;
  sound: StageSoundDesign;
  intensity: number;
}

export interface StageAudioAsset {
  id: string;
  url: string;
  name: string;
  contentType: string;
  size: number;
  duration: number;
  createdAt: string;
  rightsConfirmed: true;
}

export interface StageAudioState {
  format: StageAudioFormat;
  transport: StageAudioTransport;
  recording: boolean;
  voiceEnabled: boolean;
  voiceGain: number;
  soundscapeEnabled: boolean;
  soundscapeGain: number;
  programGain: number;
  masterMuted: boolean;
  deckA: StageDeckTrack;
  deckB: StageDeckTrack;
  crossfader: number;
  master: number;
  bpm: number;
  soundscape: StageSoundscape;
  startedAt: number | null;
  recordStartedAt: number | null;
  library: StageAudioAsset[];
  stingerTrack: StageDeckTrack | null;
  stingerTriggeredAt: number | null;
  score: StageScoreState;
}

export const STAGE_LIGHTING_LOOKS: Array<{ id: StageLightingLook; label: string }> = [
  { id: "house", label: "House" },
  { id: "keynote", label: "Keynote" },
  { id: "neon-grid", label: "Neon Grid" },
  { id: "audience", label: "Audience" },
  { id: "brand", label: "AMX Brand" },
  { id: "finale", label: "Finale" },
];

export const STAGE_VFX_LOOKS: Array<{ id: StageVfxLook; label: string }> = [
  { id: "clean", label: "Clean" },
  { id: "beat-pulse", label: "Beat Pulse" },
  { id: "laser-sweep", label: "Laser Sweep" },
  { id: "prism", label: "Prism" },
  { id: "confetti", label: "Confetti" },
];

export const STAGE_SCORE_PRESETS: StageScorePreset[] = [
  { cue: "standby", label: "Standby", lighting: "house", vfx: "clean", sound: "none", intensity: 32 },
  { cue: "opening", label: "Opening", lighting: "brand", vfx: "prism", sound: "riser", intensity: 86 },
  { cue: "speaker", label: "Speaker", lighting: "keynote", vfx: "clean", sound: "pulse", intensity: 60 },
  { cue: "demo", label: "Demo", lighting: "neon-grid", vfx: "laser-sweep", sound: "sparkle", intensity: 78 },
  { cue: "qa", label: "Q&A", lighting: "audience", vfx: "beat-pulse", sound: "pulse", intensity: 56 },
  { cue: "sponsor", label: "Sponsor", lighting: "brand", vfx: "prism", sound: "sparkle", intensity: 82 },
  { cue: "close", label: "Finale", lighting: "finale", vfx: "confetti", sound: "impact", intensity: 94 },
];

export const DEFAULT_STAGE_SCORE: StageScoreState = {
  armed: false,
  beatSync: true,
  mode: "cue-follow",
  lighting: "house",
  vfx: "clean",
  sound: "none",
  intensity: 32,
  activeCue: null,
  firedAt: null,
};

export const STAGE_DECK_PRESETS: Array<{ id: StageDeckPreset; label: string }> = [
  { id: "air-pulse", label: "AIR Pulse" },
  { id: "night-grid", label: "Night Grid" },
  { id: "spoken-bed", label: "Spoken Bed" },
  { id: "sponsor-sting", label: "Sponsor Sting" },
];

export const DEFAULT_STAGE_AUDIO: StageAudioState = {
  format: "show",
  transport: "stopped",
  recording: false,
  voiceEnabled: true,
  voiceGain: 82,
  soundscapeEnabled: true,
  soundscapeGain: 45,
  programGain: 80,
  masterMuted: false,
  deckA: "air-pulse",
  deckB: "night-grid",
  crossfader: 50,
  master: 62,
  bpm: 112,
  soundscape: "air-grid",
  startedAt: null,
  recordStartedAt: null,
  library: [],
  stingerTrack: "sponsor-sting",
  stingerTriggeredAt: null,
  score: DEFAULT_STAGE_SCORE,
};

const PRESETS = new Set<StageDeckTrack>(STAGE_DECK_PRESETS.map((track) => track.id));
const FORMATS = new Set<StageAudioFormat>(["show", "podcast", "dj"]);
const SOUNDSCAPES = new Set<StageSoundscape>(["air-grid", "deep-focus", "crowd-warmup", "podcast-room"]);
const SCORE_MODES = new Set<StageScoreMode>(["manual", "cue-follow"]);
const LIGHTING_LOOKS = new Set<StageLightingLook>(STAGE_LIGHTING_LOOKS.map((look) => look.id));
const VFX_LOOKS = new Set<StageVfxLook>(STAGE_VFX_LOOKS.map((look) => look.id));
const SOUND_DESIGNS = new Set<StageSoundDesign>(["none", "impact", "riser", "pulse", "sparkle"]);
const SCORE_CUES = new Set<StageScoreCue>(STAGE_SCORE_PRESETS.map((preset) => preset.cue));
const MAX_LIBRARY_ITEMS = 24;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function timestamp(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function normalizeStageScore(value?: Partial<StageScoreState> | null): StageScoreState {
  const source = value || {};
  return {
    armed: Boolean(source.armed),
    beatSync: source.beatSync !== false,
    mode: SCORE_MODES.has(source.mode as StageScoreMode) ? source.mode as StageScoreMode : DEFAULT_STAGE_SCORE.mode,
    lighting: LIGHTING_LOOKS.has(source.lighting as StageLightingLook) ? source.lighting as StageLightingLook : DEFAULT_STAGE_SCORE.lighting,
    vfx: VFX_LOOKS.has(source.vfx as StageVfxLook) ? source.vfx as StageVfxLook : DEFAULT_STAGE_SCORE.vfx,
    sound: SOUND_DESIGNS.has(source.sound as StageSoundDesign) ? source.sound as StageSoundDesign : DEFAULT_STAGE_SCORE.sound,
    intensity: Math.round(boundedNumber(source.intensity, DEFAULT_STAGE_SCORE.intensity, 0, 100)),
    activeCue: SCORE_CUES.has(source.activeCue as StageScoreCue) ? source.activeCue as StageScoreCue : null,
    firedAt: timestamp(source.firedAt),
  };
}

export function applyStageScoreCue(score: StageScoreState, cue: StageScoreCue, firedAt = Date.now()): StageScoreState {
  const preset = STAGE_SCORE_PRESETS.find((candidate) => candidate.cue === cue) || STAGE_SCORE_PRESETS[0];
  return normalizeStageScore({ ...score, lighting: preset.lighting, vfx: preset.vfx, sound: preset.sound, intensity: preset.intensity, activeCue: cue, firedAt });
}

export function stageScoreClock(bpm: number, startedAt: number | null, now = Date.now()) {
  const safeBpm = boundedNumber(bpm, DEFAULT_STAGE_AUDIO.bpm, 60, 160);
  const elapsed = startedAt ? Math.max(0, now - startedAt) : 0;
  const beatDuration = 60_000 / safeBpm;
  const beatIndex = Math.floor(elapsed / beatDuration);
  return {
    beat: beatIndex % 4 + 1,
    bar: Math.floor(beatIndex / 4) + 1,
    phase: (elapsed % beatDuration) / beatDuration,
    beatDuration,
  };
}

function normalizeAsset(value: unknown): StageAudioAsset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StageAudioAsset>;
  const id = String(candidate.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  const contentType = String(candidate.contentType || "").toLowerCase().split(";")[0].trim();
  if (!id || !contentType.startsWith("audio/") || candidate.rightsConfirmed !== true) return null;
  const createdAt = typeof candidate.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt))
    ? candidate.createdAt
    : new Date(0).toISOString();
  return {
    id,
    url: `/api/media/${id}`,
    name: String(candidate.name || `Audio ${id.slice(0, 8)}`).trim().slice(0, 120),
    contentType,
    size: Math.round(boundedNumber(candidate.size, 0, 0, MAX_MEDIA_BYTES)),
    duration: boundedNumber(candidate.duration, 0, 0, 24 * 60 * 60),
    createdAt,
    rightsConfirmed: true,
  };
}

export function stageAudioTrackId(assetId: string): StageDeckTrack {
  return `upload:${assetId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`;
}

export function stageAudioAssetForTrack(track: StageDeckTrack | null, library: StageAudioAsset[]) {
  if (!track?.startsWith("upload:")) return null;
  const id = track.slice("upload:".length);
  return library.find((asset) => asset.id === id) || null;
}

function validTrack(value: unknown, library: StageAudioAsset[], fallback: StageDeckTrack): StageDeckTrack {
  const track = String(value || "") as StageDeckTrack;
  if (PRESETS.has(track)) return track;
  return stageAudioAssetForTrack(track, library) ? track : fallback;
}

export function normalizeStageAudio(value?: Partial<StageAudioState> | null): StageAudioState {
  const source = value || {};
  const seen = new Set<string>();
  const library = (Array.isArray(source.library) ? source.library : [])
    .map(normalizeAsset)
    .filter((asset): asset is StageAudioAsset => Boolean(asset))
    .filter((asset) => {
      if (seen.has(asset.id)) return false;
      seen.add(asset.id);
      return true;
    })
    .slice(0, MAX_LIBRARY_ITEMS);
  const format = FORMATS.has(source.format as StageAudioFormat) ? source.format as StageAudioFormat : DEFAULT_STAGE_AUDIO.format;
  const soundscape = SOUNDSCAPES.has(source.soundscape as StageSoundscape) ? source.soundscape as StageSoundscape : DEFAULT_STAGE_AUDIO.soundscape;
  const stingerValue = Object.prototype.hasOwnProperty.call(source, "stingerTrack") ? source.stingerTrack : DEFAULT_STAGE_AUDIO.stingerTrack;
  const stingerCandidate = stingerValue == null ? null : validTrack(stingerValue, library, DEFAULT_STAGE_AUDIO.stingerTrack || "sponsor-sting");
  return {
    format,
    transport: source.transport === "playing" ? "playing" : "stopped",
    recording: Boolean(source.recording),
    voiceEnabled: source.voiceEnabled !== false,
    voiceGain: Math.round(boundedNumber(source.voiceGain, DEFAULT_STAGE_AUDIO.voiceGain, 0, 120)),
    soundscapeEnabled: source.soundscapeEnabled !== false,
    soundscapeGain: Math.round(boundedNumber(source.soundscapeGain, DEFAULT_STAGE_AUDIO.soundscapeGain, 0, 100)),
    programGain: Math.round(boundedNumber(source.programGain, DEFAULT_STAGE_AUDIO.programGain, 0, 100)),
    masterMuted: Boolean(source.masterMuted),
    deckA: validTrack(source.deckA, library, DEFAULT_STAGE_AUDIO.deckA),
    deckB: validTrack(source.deckB, library, DEFAULT_STAGE_AUDIO.deckB),
    crossfader: Math.round(boundedNumber(source.crossfader, DEFAULT_STAGE_AUDIO.crossfader, 0, 100)),
    master: Math.round(boundedNumber(source.master, DEFAULT_STAGE_AUDIO.master, 0, 100)),
    bpm: Math.round(boundedNumber(source.bpm, DEFAULT_STAGE_AUDIO.bpm, 60, 160)),
    soundscape,
    startedAt: timestamp(source.startedAt),
    recordStartedAt: timestamp(source.recordStartedAt),
    library,
    stingerTrack: stingerCandidate,
    stingerTriggeredAt: timestamp(source.stingerTriggeredAt),
    score: normalizeStageScore(source.score),
  };
}

export function stageAudioTrackLabel(track: StageDeckTrack, library: StageAudioAsset[]) {
  return STAGE_DECK_PRESETS.find((preset) => preset.id === track)?.label
    || stageAudioAssetForTrack(track, library)?.name
    || "Unavailable track";
}

export function stageAudioDurationLabel(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
