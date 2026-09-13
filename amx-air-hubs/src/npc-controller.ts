export type NpcBehavior = "hold" | "patrol";
export type NpcAction = "idle" | "walk" | "wave" | "talk" | "inspect";
export type NpcDirection = "forward" | "back" | "left" | "right";
export type NpcWaypointId = "entry" | "stage" | "media" | "rack" | "briefing";

export interface NpcWaypoint {
  id: NpcWaypointId;
  label: string;
  position: [number, number, number];
}

export const NPC_WAYPOINTS: NpcWaypoint[] = [
  { id: "entry", label: "Entry", position: [0, 0, 3.25] },
  { id: "stage", label: "Stage", position: [1.05, 0, 0.65] },
  { id: "media", label: "Media wall", position: [-2.35, 0, -1.35] },
  { id: "rack", label: "Rack aisle", position: [3.15, 0, -1.1] },
  { id: "briefing", label: "Briefing", position: [0, 0, -0.55] },
];

export type NpcCommand = {
  id: string;
  agentId: string;
  kind: "assign" | "move" | "nudge" | "action" | "behavior" | "speed" | "stop" | "reset";
  waypoint?: NpcWaypointId;
  position?: [number, number, number];
  direction?: NpcDirection;
  action?: Exclude<NpcAction, "walk">;
  arrivalAction?: Exclude<NpcAction, "idle" | "walk">;
  behavior?: NpcBehavior;
  speed?: number;
  cue?: string;
};

export interface NpcRuntimeState {
  agentId: string;
  behavior: NpcBehavior;
  action: NpcAction;
  moving: boolean;
  waypoint: NpcWaypointId | "custom" | null;
  position: [number, number, number];
  speed: number;
}

export const DEFAULT_NPC_STATE: NpcRuntimeState = {
  agentId: "jaz",
  behavior: "hold",
  action: "idle",
  moving: false,
  waypoint: "stage",
  position: [1.05, 0, 0.65],
  speed: 1.1,
};

export function waypointFor(id?: NpcWaypointId) {
  return NPC_WAYPOINTS.find((waypoint) => waypoint.id === id);
}

export function commandFromCue(cue: string, agentId: string, id: string): NpcCommand {
  const normalized = cue.toLowerCase();
  const waypoint = NPC_WAYPOINTS.find((item) => normalized.includes(item.id) || normalized.includes(item.label.toLowerCase()));
  const arrivalAction = normalized.includes("inspect") || normalized.includes("scan") || normalized.includes("look") ? "inspect"
    : normalized.includes("wave") || normalized.includes("greet") ? "wave"
      : normalized.includes("talk") || normalized.includes("present") || normalized.includes("explain") ? "talk" : undefined;
  if (waypoint) return { id, agentId, kind: "move", waypoint: waypoint.id, arrivalAction, cue };
  if (normalized.includes("patrol") || normalized.includes("tour")) return { id, agentId, kind: "behavior", behavior: "patrol", cue };
  if (normalized.includes("stop") || normalized.includes("hold") || normalized.includes("wait")) return { id, agentId, kind: "stop", cue };
  if (normalized.includes("wave") || normalized.includes("greet")) return { id, agentId, kind: "action", action: "wave", cue };
  if (normalized.includes("inspect") || normalized.includes("scan") || normalized.includes("look")) return { id, agentId, kind: "action", action: "inspect", cue };
  return { id, agentId, kind: "action", action: "talk", cue };
}
