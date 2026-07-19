export type StageAudioFormat = "show" | "podcast" | "dj";
export type StageAudioTransport = "stopped" | "playing";
export type StageDeckPreset = "air-pulse" | "night-grid" | "spoken-bed" | "sponsor-sting";
export type StageDeckTrack = StageDeckPreset | `upload:${string}`;
export type StageSoundscape = "air-grid" | "deep-focus" | "crowd-warmup" | "podcast-room";

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
}

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
};

const PRESETS = new Set<StageDeckTrack>(STAGE_DECK_PRESETS.map((track) => track.id));
const FORMATS = new Set<StageAudioFormat>(["show", "podcast", "dj"]);
const SOUNDSCAPES = new Set<StageSoundscape>(["air-grid", "deep-focus", "crowd-warmup", "podcast-room"]);
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
