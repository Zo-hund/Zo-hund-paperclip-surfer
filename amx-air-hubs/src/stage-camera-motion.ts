export type StageCameraMotionId = "static" | "crane-reveal" | "crane-sweep" | "dolly-push" | "orbit-arc" | "truck-parallax" | "audience-pan" | "dolly-zoom";

export interface StageCameraMotionState {
  id: StageCameraMotionId;
  intensity: number;
  speed: number;
  loop: boolean;
  startedAt: number | null;
}

export interface StageCameraMotionPreset {
  id: StageCameraMotionId;
  label: string;
  detail: string;
  useCase: string;
  baseShot: "wide" | "host" | "audience" | "crane";
  durationMs: number;
}

export const STAGE_CAMERA_MOTION_PRESETS: StageCameraMotionPreset[] = [
  { id: "static", label: "Locked", detail: "Stable composition", useCase: "Interviews, accessibility, and long-form panels", baseShot: "wide", durationMs: 0 },
  { id: "crane-reveal", label: "Crane reveal", detail: "Rise and pull back", useCase: "Show openings, venue reveals, and keynote entrances", baseShot: "crane", durationMs: 8_000 },
  { id: "crane-sweep", label: "Crane sweep", detail: "High lateral arc", useCase: "Awards, applause, transitions, and stage resets", baseShot: "crane", durationMs: 10_000 },
  { id: "dolly-push", label: "Dolly push", detail: "Slow push to subject", useCase: "Keynote emphasis, emotional beats, and calls to action", baseShot: "wide", durationMs: 7_000 },
  { id: "orbit-arc", label: "Orbit arc", detail: "Curved presenter move", useCase: "Product demos, XR reveals, and performance coverage", baseShot: "host", durationMs: 9_000 },
  { id: "truck-parallax", label: "Parallax truck", detail: "Side-to-side depth", useCase: "Panel introductions, sponsor sets, and dimensional scenes", baseShot: "host", durationMs: 8_000 },
  { id: "audience-pan", label: "Audience pan", detail: "Reaction sweep", useCase: "Q&A, applause, community callouts, and room energy", baseShot: "audience", durationMs: 8_000 },
  { id: "dolly-zoom", label: "Dolly zoom", detail: "Perspective compression", useCase: "Dramatic reveals, narrative pivots, and finale moments", baseShot: "host", durationMs: 7_000 },
];

export const DEFAULT_STAGE_CAMERA_MOTION: StageCameraMotionState = {
  id: "static",
  intensity: 68,
  speed: 1,
  loop: false,
  startedAt: null,
};

const MOTION_IDS = new Set(STAGE_CAMERA_MOTION_PRESETS.map((preset) => preset.id));

function bounded(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

export function normalizeStageCameraMotion(value?: Partial<StageCameraMotionState> | null): StageCameraMotionState {
  const id = MOTION_IDS.has(value?.id as StageCameraMotionId) ? value?.id as StageCameraMotionId : "static";
  const startedAt = Number(value?.startedAt);
  return {
    id,
    intensity: Math.round(bounded(value?.intensity, DEFAULT_STAGE_CAMERA_MOTION.intensity, 10, 100)),
    speed: Math.round(bounded(value?.speed, DEFAULT_STAGE_CAMERA_MOTION.speed, 0.5, 2) * 100) / 100,
    loop: Boolean(value?.loop) && id !== "static",
    startedAt: id !== "static" && Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null,
  };
}

export function stageCameraMotionPreset(id: StageCameraMotionId) {
  return STAGE_CAMERA_MOTION_PRESETS.find((preset) => preset.id === id) || STAGE_CAMERA_MOTION_PRESETS[0];
}

export function stageCameraMotionProgress(motion: StageCameraMotionState, now = Date.now()) {
  const preset = stageCameraMotionPreset(motion.id);
  if (motion.id === "static" || !motion.startedAt || !preset.durationMs) return 0;
  const duration = preset.durationMs / motion.speed;
  const elapsed = Math.max(0, now - motion.startedAt);
  return motion.loop ? (elapsed % duration) / duration : Math.min(1, elapsed / duration);
}

export function smoothCameraMotionProgress(progress: number, loop: boolean) {
  const boundedProgress = Math.max(0, Math.min(1, progress));
  if (loop) return (1 - Math.cos(boundedProgress * Math.PI * 2)) / 2;
  return boundedProgress * boundedProgress * (3 - 2 * boundedProgress);
}
