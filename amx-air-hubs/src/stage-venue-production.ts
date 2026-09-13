import type { StageCameraMotionId } from "./stage-camera-motion";
import type { StageCue, StageShot } from "./stage-production";

export type VenueFollowTarget = "off" | "host" | "crew" | "agent";
export type VenueNpcAction = "stage" | "follow" | "wave" | "talk" | "patrol" | "hold";

export type StageVenueOperatorCommand =
  | { kind: "shot"; shot: StageShot }
  | { kind: "motion"; motion: StageCameraMotionId }
  | { kind: "follow"; target: VenueFollowTarget }
  | { kind: "show"; action: "go-live" | "standby" | "next-cue" }
  | { kind: "npc"; action: VenueNpcAction }
  | { kind: "crew"; action: "call" | "hold" | "clear" }
  | { kind: "voice"; action: "toggle" };

export interface VenueCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface VenuePoint {
  x: number;
  z: number;
}

export const STAGE_CUE_ORDER: StageCue[] = ["standby", "opening", "speaker", "demo", "qa", "sponsor", "close"];

export function nextStageCue(cue: StageCue) {
  const index = STAGE_CUE_ORDER.indexOf(cue);
  return STAGE_CUE_ORDER[(index + 1) % STAGE_CUE_ORDER.length];
}

export function venueCommandFromVoice(value: string): StageVenueOperatorCommand | null {
  const phrase = value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!phrase) return null;
  if (phrase.includes("go live") || phrase.includes("start show")) return { kind: "show", action: "go-live" };
  if (phrase.includes("standby") || phrase.includes("stop show")) return { kind: "show", action: "standby" };
  if (phrase.includes("next cue")) return { kind: "show", action: "next-cue" };
  if (phrase.includes("follow host")) return { kind: "follow", target: "host" };
  if (phrase.includes("follow crew") || phrase.includes("follow team")) return { kind: "follow", target: "crew" };
  if (phrase.includes("follow agent")) return { kind: "follow", target: "agent" };
  if (phrase.includes("stop follow") || phrase.includes("camera lock")) return { kind: "follow", target: "off" };
  if (phrase.includes("crane reveal")) return { kind: "motion", motion: "crane-reveal" };
  if (phrase.includes("dolly push")) return { kind: "motion", motion: "dolly-push" };
  if (phrase.includes("wide camera") || phrase === "wide") return { kind: "shot", shot: "wide" };
  if (phrase.includes("host camera") || phrase === "host") return { kind: "shot", shot: "host" };
  if (phrase.includes("audience camera") || phrase === "audience") return { kind: "shot", shot: "audience" };
  if (phrase.includes("crane camera") || phrase === "crane") return { kind: "shot", shot: "crane" };
  if (phrase.includes("agent") && phrase.includes("stage")) return { kind: "npc", action: "stage" };
  if (phrase.includes("agent") && (phrase.includes("wave") || phrase.includes("greet"))) return { kind: "npc", action: "wave" };
  if (phrase.includes("agent") && (phrase.includes("talk") || phrase.includes("speak"))) return { kind: "npc", action: "talk" };
  if (phrase.includes("agent") && (phrase.includes("patrol") || phrase.includes("tour"))) return { kind: "npc", action: "patrol" };
  if (phrase.includes("agent") && (phrase.includes("hold") || phrase.includes("stop"))) return { kind: "npc", action: "hold" };
  if (phrase.includes("call crew") || phrase.includes("call team")) return { kind: "crew", action: "call" };
  if (phrase.includes("hold crew") || phrase.includes("hold team")) return { kind: "crew", action: "hold" };
  if (phrase.includes("clear crew") || phrase.includes("clear team")) return { kind: "crew", action: "clear" };
  return null;
}

function overlaps(point: VenuePoint, collider: VenueCollider, radius: number) {
  const nearestX = Math.max(collider.minX, Math.min(point.x, collider.maxX));
  const nearestZ = Math.max(collider.minZ, Math.min(point.z, collider.maxZ));
  return Math.hypot(point.x - nearestX, point.z - nearestZ) < radius;
}

export function resolveVenueMovement(current: VenuePoint, desired: VenuePoint, colliders: VenueCollider[], radius = 0.36): VenuePoint {
  const bounded = { x: Math.max(-27, Math.min(27, desired.x)), z: Math.max(-25, Math.min(25, desired.z)) };
  if (!colliders.some((collider) => overlaps(bounded, collider, radius))) return bounded;
  const slideX = { x: bounded.x, z: current.z };
  if (!colliders.some((collider) => overlaps(slideX, collider, radius))) return slideX;
  const slideZ = { x: current.x, z: bounded.z };
  if (!colliders.some((collider) => overlaps(slideZ, collider, radius))) return slideZ;
  return current;
}

export function isSafeVenuePoint(point: VenuePoint, colliders: VenueCollider[], radius = 0.36) {
  return point.x >= -27 && point.x <= 27 && point.z >= -25 && point.z <= 25 && !colliders.some((collider) => overlaps(point, collider, radius));
}
