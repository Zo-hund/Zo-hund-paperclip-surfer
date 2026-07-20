export type StageVideoProfile = "720p30" | "1080p30" | "1080p60";

export interface StageVideoProfileDefinition {
  id: StageVideoProfile;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  frameRate: number;
  egressPreset: 0 | 2 | 3;
  videoBitrate: number;
}

export interface StageVideoState {
  captureProfile: StageVideoProfile;
  outputProfile: StageVideoProfile;
}

export interface StageVideoDiagnostics {
  width: number;
  height: number;
  frameRate: number;
  label: string;
}

export const STAGE_VIDEO_PROFILES: StageVideoProfileDefinition[] = [
  { id: "720p30", label: "HD 720p / 30", shortLabel: "720P30", width: 1280, height: 720, frameRate: 30, egressPreset: 0, videoBitrate: 3_000_000 },
  { id: "1080p30", label: "Full HD / 30", shortLabel: "1080P30", width: 1920, height: 1080, frameRate: 30, egressPreset: 2, videoBitrate: 4_500_000 },
  { id: "1080p60", label: "Full HD / 60", shortLabel: "1080P60", width: 1920, height: 1080, frameRate: 60, egressPreset: 3, videoBitrate: 6_000_000 },
];

export const DEFAULT_STAGE_VIDEO: StageVideoState = {
  captureProfile: "1080p30",
  outputProfile: "1080p30",
};

const PROFILE_IDS = new Set<StageVideoProfile>(STAGE_VIDEO_PROFILES.map((profile) => profile.id));

export function normalizeStageVideo(value?: Partial<StageVideoState> | null): StageVideoState {
  return {
    captureProfile: PROFILE_IDS.has(value?.captureProfile as StageVideoProfile) ? value?.captureProfile as StageVideoProfile : DEFAULT_STAGE_VIDEO.captureProfile,
    outputProfile: PROFILE_IDS.has(value?.outputProfile as StageVideoProfile) ? value?.outputProfile as StageVideoProfile : DEFAULT_STAGE_VIDEO.outputProfile,
  };
}

export function stageVideoProfile(profile: StageVideoProfile) {
  return STAGE_VIDEO_PROFILES.find((candidate) => candidate.id === profile) || STAGE_VIDEO_PROFILES[1];
}

export function stageVideoDiagnostics(settings?: MediaTrackSettings | null): StageVideoDiagnostics {
  const width = Math.max(0, Math.round(Number(settings?.width) || 0));
  const height = Math.max(0, Math.round(Number(settings?.height) || 0));
  const frameRate = Math.max(0, Math.round(Number(settings?.frameRate) || 0));
  return {
    width,
    height,
    frameRate,
    label: width && height ? `${width}x${height}${frameRate ? ` / ${frameRate} FPS` : ""}` : "RESOLUTION PENDING",
  };
}
