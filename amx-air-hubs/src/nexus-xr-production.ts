export type NexusXRScreenSource = "camera-1" | "camera-2" | "camera-3" | "media" | "map" | "runway" | "amx-air" | "amx-labs" | "black";
export type NexusXRScreenTarget = "center" | "left" | "right" | "wall";

export type NexusXRProductionCue =
  | { kind: "screen"; source: NexusXRScreenSource; target?: NexusXRScreenTarget }
  | { kind: "media"; action: "open" | "play" | "pause" | "mute" | "unmute" }
  | { kind: "camera"; camera: "overview" | "entry" | "briefing" }
  | { kind: "light"; preset: "standby" | "mission" | "focus" }
  | { kind: "vfx"; preset: "ambient" | "show" }
  | { kind: "npc"; action: "wave" | "talk" }
  | { kind: "robot"; action: "home" | "rack" | "inspect" | "patrol" | "hold" };

export interface NexusXRProductionControl {
  id: string;
  label: string;
  detail: string;
  cue: NexusXRProductionCue;
}

export interface NexusXRProductionState {
  screenSource: string;
  screenMode: string;
  camera: string;
  light: string;
  vfx: string;
  npcAction: string;
}

export const NEXUS_XR_PRODUCTION_CONTROLS: NexusXRProductionControl[] = [
  { id: "center-camera", label: "CTR CAM 1", detail: "CENTER SCREEN", cue: { kind: "screen", target: "center", source: "camera-1" } },
  { id: "left-camera", label: "LFT CAM 2", detail: "LEFT SCREEN", cue: { kind: "screen", target: "left", source: "camera-2" } },
  { id: "right-camera", label: "RGT CAM 3", detail: "RIGHT SCREEN", cue: { kind: "screen", target: "right", source: "camera-3" } },
  { id: "wall-camera", label: "WALL CAM 1", detail: "ONE SCREEN", cue: { kind: "screen", target: "wall", source: "camera-1" } },
  { id: "center-media", label: "CTR MEDIA", detail: "CENTER SCREEN", cue: { kind: "screen", target: "center", source: "media" } },
  { id: "left-media", label: "LFT MEDIA", detail: "LEFT SCREEN", cue: { kind: "screen", target: "left", source: "media" } },
  { id: "right-media", label: "RGT MEDIA", detail: "RIGHT SCREEN", cue: { kind: "screen", target: "right", source: "media" } },
  { id: "wall-media", label: "WALL MEDIA", detail: "ONE SCREEN", cue: { kind: "screen", target: "wall", source: "media" } },
  { id: "wall-map", label: "WALL MAP", detail: "GEO CONTEXT", cue: { kind: "screen", target: "wall", source: "map" } },
  { id: "wall-agent", label: "WALL AGENT", detail: "RUNWAY AVATAR", cue: { kind: "screen", target: "wall", source: "runway" } },
  { id: "wall-air", label: "AMX AIR", detail: "BRAND WALL", cue: { kind: "screen", target: "wall", source: "amx-air" } },
  { id: "wall-labs", label: "AMX LABS", detail: "BRAND WALL", cue: { kind: "screen", target: "wall", source: "amx-labs" } },
  { id: "media-open", label: "LOAD MEDIA", detail: "OPEN DECK", cue: { kind: "media", action: "open" } },
  { id: "media-play", label: "PLAY", detail: "A/V DECK", cue: { kind: "media", action: "play" } },
  { id: "media-pause", label: "PAUSE", detail: "A/V DECK", cue: { kind: "media", action: "pause" } },
  { id: "media-mute", label: "AUDIO OFF", detail: "A/V DECK", cue: { kind: "media", action: "mute" } },
  { id: "media-unmute", label: "AUDIO ON", detail: "A/V DECK", cue: { kind: "media", action: "unmute" } },
  { id: "camera-overview", label: "OVERVIEW", detail: "CAMERA", cue: { kind: "camera", camera: "overview" } },
  { id: "camera-entry", label: "ENTRY", detail: "CAMERA", cue: { kind: "camera", camera: "entry" } },
  { id: "camera-stage", label: "STAGE", detail: "CAMERA", cue: { kind: "camera", camera: "briefing" } },
  { id: "light-standby", label: "STANDBY", detail: "LIGHTS", cue: { kind: "light", preset: "standby" } },
  { id: "light-mission", label: "MISSION", detail: "LIGHTS", cue: { kind: "light", preset: "mission" } },
  { id: "light-focus", label: "FOCUS", detail: "LIGHTS", cue: { kind: "light", preset: "focus" } },
  { id: "vfx-show", label: "VFX SHOW", detail: "WORLD", cue: { kind: "vfx", preset: "show" } },
  { id: "robot-home", label: "ROBOT HOME", detail: "SAFE STAGE", cue: { kind: "robot", action: "home" } },
  { id: "robot-rack", label: "ROBOT RACK", detail: "INSPECT AISLE", cue: { kind: "robot", action: "rack" } },
  { id: "robot-inspect", label: "ROBOT SCAN", detail: "TOOL ACTION", cue: { kind: "robot", action: "inspect" } },
  { id: "robot-patrol", label: "PATROL", detail: "ROBOTICS", cue: { kind: "robot", action: "patrol" } },
  { id: "robot-hold", label: "HOLD", detail: "SAFE STOP", cue: { kind: "robot", action: "hold" } },
  { id: "npc-wave", label: "NPC WAVE", detail: "AGENT", cue: { kind: "npc", action: "wave" } },
  { id: "npc-talk", label: "NPC TALK", detail: "AGENT", cue: { kind: "npc", action: "talk" } },
];

export function isNexusXRProductionCueActive(cue: NexusXRProductionCue, state: NexusXRProductionState) {
  if (cue.kind === "screen") return state.screenSource === cue.source && (cue.target !== "wall" || state.screenMode === "wall");
  if (cue.kind === "camera") return state.camera === cue.camera;
  if (cue.kind === "light") return state.light === cue.preset;
  if (cue.kind === "vfx") return state.vfx === cue.preset;
  if (cue.kind === "npc") return state.npcAction === cue.action;
  return false;
}
