export type WorldCameraId = "overview" | "entry" | "rack" | "briefing";

export interface WorldCameraControl {
  pan: number;
  tilt: number;
  zoom: number;
}

export interface WorldCameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export const DEFAULT_WORLD_CAMERA_CONTROL: WorldCameraControl = { pan: 0, tilt: 0, zoom: 1 };

export const WORLD_CAMERA_POSES: Record<Exclude<WorldCameraId, "overview">, WorldCameraPose> = {
  entry: { position: [-4.35, 3.25, 4.35], target: [0.3, 1.35, -2.25] },
  rack: { position: [4.45, 2.85, 3.25], target: [-2.5, 1.25, -1.5] },
  briefing: { position: [4.75, 4.35, -3.6], target: [0, 1.55, -1.1] },
};

function bounded(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

export function normalizeWorldCameraControl(value?: Partial<WorldCameraControl> | null): WorldCameraControl {
  return {
    pan: Math.round(bounded(value?.pan, 0, -45, 45)),
    tilt: Math.round(bounded(value?.tilt, 0, -20, 20)),
    zoom: Math.round(bounded(value?.zoom, 1, 0.7, 2.2) * 10) / 10,
  };
}

export function defaultWorldCameraControls(): Record<WorldCameraId, WorldCameraControl> {
  return {
    overview: { ...DEFAULT_WORLD_CAMERA_CONTROL },
    entry: { ...DEFAULT_WORLD_CAMERA_CONTROL },
    rack: { ...DEFAULT_WORLD_CAMERA_CONTROL },
    briefing: { ...DEFAULT_WORLD_CAMERA_CONTROL },
  };
}
