export type NexusXRProductionCue =
  | { kind: "screen"; source: "camera-1" | "media" | "amx-air" }
  | { kind: "camera"; camera: "overview" | "entry" | "briefing" }
  | { kind: "light"; preset: "standby" | "mission" | "focus" }
  | { kind: "vfx"; preset: "ambient" | "show" }
  | { kind: "npc"; action: "wave" | "talk" };

export interface NexusXRProductionControl {
  id: string;
  label: string;
  detail: string;
  cue: NexusXRProductionCue;
}

export interface NexusXRProductionState {
  screenSource: string;
  camera: string;
  light: string;
  vfx: string;
  npcAction: string;
}

export const NEXUS_XR_PRODUCTION_CONTROLS: NexusXRProductionControl[] = [
  { id: "program-camera", label: "CAM 1", detail: "PROGRAM", cue: { kind: "screen", source: "camera-1" } },
  { id: "program-media", label: "MEDIA", detail: "PROGRAM", cue: { kind: "screen", source: "media" } },
  { id: "program-air", label: "AMX AIR", detail: "PROGRAM", cue: { kind: "screen", source: "amx-air" } },
  { id: "camera-overview", label: "OVERVIEW", detail: "CAMERA", cue: { kind: "camera", camera: "overview" } },
  { id: "camera-entry", label: "ENTRY", detail: "CAMERA", cue: { kind: "camera", camera: "entry" } },
  { id: "camera-stage", label: "STAGE", detail: "CAMERA", cue: { kind: "camera", camera: "briefing" } },
  { id: "light-standby", label: "STANDBY", detail: "LIGHTS", cue: { kind: "light", preset: "standby" } },
  { id: "light-mission", label: "MISSION", detail: "LIGHTS", cue: { kind: "light", preset: "mission" } },
  { id: "light-focus", label: "FOCUS", detail: "LIGHTS", cue: { kind: "light", preset: "focus" } },
  { id: "vfx-ambient", label: "VFX CALM", detail: "WORLD", cue: { kind: "vfx", preset: "ambient" } },
  { id: "vfx-show", label: "VFX SHOW", detail: "WORLD", cue: { kind: "vfx", preset: "show" } },
  { id: "npc-wave", label: "NPC WAVE", detail: "AGENT", cue: { kind: "npc", action: "wave" } },
  { id: "npc-talk", label: "NPC TALK", detail: "AGENT", cue: { kind: "npc", action: "talk" } },
];

export function isNexusXRProductionCueActive(cue: NexusXRProductionCue, state: NexusXRProductionState) {
  if (cue.kind === "screen") return state.screenSource === cue.source;
  if (cue.kind === "camera") return state.camera === cue.camera;
  if (cue.kind === "light") return state.light === cue.preset;
  if (cue.kind === "vfx") return state.vfx === cue.preset;
  return state.npcAction === cue.action;
}
