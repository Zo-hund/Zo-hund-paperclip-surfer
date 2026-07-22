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
  | { kind: "crew"; action: "call" | "hold" | "clear" };

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
