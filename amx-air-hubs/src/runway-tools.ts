import { clientTool } from "@runwayml/avatars-react/api";
import { z } from "zod";

export const setWorldCameraTool = clientTool("set_world_camera", {
  description: "Switch the Nexus 3D world camera when the user asks to inspect a room viewpoint.",
  schema: z.object({ camera: z.enum(["overview", "entry", "rack", "briefing"]) }),
});

export const moveRoomAvatarTool = clientTool("move_room_avatar", {
  description: "Move the embodied GLB room avatar to a named Nexus waypoint when the user asks it to go somewhere.",
  schema: z.object({ destination: z.enum(["entry", "stage", "media", "rack", "briefing"]) }),
});

export const performRoomActionTool = clientTool("perform_room_action", {
  description: "Trigger a visible action on the embodied GLB room avatar when the user asks it to wave, talk, or inspect.",
  schema: z.object({ action: z.enum(["wave", "talk", "inspect"]) }),
});

export const openNexusPanelTool = clientTool("open_nexus_panel", {
  description: "Open a Nexus console panel when it is useful to show NPC controls, the LiveKit pod, media, or vision.",
  schema: z.object({ panel: z.enum(["npc", "pod", "media", "vision", "runway"]) }),
});

export const invokeAmxTool = clientTool("invoke_amx_tool", {
  description: "Run a governed AMX read-only skill when the user asks for mission context, pod inspection, a thermal map, or an incident plan.",
  schema: z.object({ tool: z.enum(["mission.context", "dcim.inspect", "rack.thermal-map", "incident.runbook"]) }),
});

export const RUNWAY_CLIENT_TOOLS = [
  setWorldCameraTool,
  moveRoomAvatarTool,
  performRoomActionTool,
  openNexusPanelTool,
  invokeAmxTool,
] as const;
