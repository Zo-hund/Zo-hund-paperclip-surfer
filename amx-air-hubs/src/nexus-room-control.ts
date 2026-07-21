import type { NpcCommand } from "./npc-controller";

export const NEXUS_CONTROL_TOPIC = "amx.nexus.control.v1";
export const NEXUS_CHAT_TOPIC = "amx.nexus.chat.v1";

export type NexusChatMessage = {
  id: string;
  kind: "chat";
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
};

export type NexusNpcMessage = {
  id: string;
  kind: "npc-command";
  senderId: string;
  sentAt: number;
  command: NpcCommand;
};

export type NexusRoomMessage = NexusChatMessage | NexusNpcMessage;

export interface NexusRoomControl {
  connected: boolean;
  sendNpcCommand: (command: NpcCommand) => Promise<boolean>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NPC_KINDS = new Set(["assign", "move", "nudge", "action", "behavior", "speed", "stop", "reset"]);
const NPC_ACTIONS = new Set(["idle", "wave", "talk", "inspect"]);
const NPC_DIRECTIONS = new Set(["forward", "back", "left", "right"]);
const NPC_BEHAVIORS = new Set(["hold", "patrol"]);
const NPC_WAYPOINTS = new Set(["entry", "stage", "media", "rack", "briefing"]);

function boundedString(value: unknown, maximum: number) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

export function isNpcCommand(value: unknown): value is NpcCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Partial<NpcCommand>;
  if (!boundedString(command.id, 128) || !boundedString(command.agentId, 64) || !NPC_KINDS.has(String(command.kind))) return false;
  if (command.waypoint !== undefined && !NPC_WAYPOINTS.has(String(command.waypoint))) return false;
  if (command.direction !== undefined && !NPC_DIRECTIONS.has(String(command.direction))) return false;
  if (command.action !== undefined && !NPC_ACTIONS.has(String(command.action))) return false;
  if (command.behavior !== undefined && !NPC_BEHAVIORS.has(String(command.behavior))) return false;
  if (command.speed !== undefined && (!Number.isFinite(command.speed) || command.speed < 0.5 || command.speed > 2.2)) return false;
  if (command.position !== undefined && (!Array.isArray(command.position) || command.position.length !== 3 || command.position.some((item) => !Number.isFinite(item) || Math.abs(item) > 20))) return false;
  return command.cue === undefined || (typeof command.cue === "string" && command.cue.length <= 500);
}

export function encodeNexusRoomMessage(message: NexusRoomMessage) {
  return encoder.encode(JSON.stringify(message));
}

export function decodeNexusRoomMessage(payload: Uint8Array): NexusRoomMessage | null {
  if (payload.byteLength > 16 * 1024) return null;
  try {
    const message = JSON.parse(decoder.decode(payload)) as Partial<NexusRoomMessage>;
    if (!boundedString(message.id, 128) || !boundedString(message.senderId, 64) || !Number.isFinite(message.sentAt)) return null;
    if (message.kind === "chat") {
      return boundedString(message.senderName, 80) && boundedString(message.text, 500) ? message as NexusChatMessage : null;
    }
    if (message.kind === "npc-command") return isNpcCommand(message.command) ? message as NexusNpcMessage : null;
    return null;
  } catch {
    return null;
  }
}

export function isOperatorMetadata(metadata?: string) {
  try {
    const value = JSON.parse(metadata || "{}") as Record<string, unknown>;
    return value.app === "amx-air-hubs" && value.clientType === "operator";
  } catch {
    return false;
  }
}

export function isRoomCommunicatorMetadata(metadata?: string) {
  try {
    const value = JSON.parse(metadata || "{}") as Record<string, unknown>;
    return value.app === "amx-air-hubs" && (value.clientType === "operator" || value.role === "agent");
  } catch {
    return false;
  }
}
