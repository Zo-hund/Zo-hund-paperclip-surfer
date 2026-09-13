const enabled = (value: string | undefined, fallback: boolean) => value == null ? fallback : value !== "false" && value !== "0";

export const MISSION_WORLD_FEATURES = {
  webXR: enabled(import.meta.env.VITE_ENABLE_MISSION_WEBXR, true),
  realtimeMultiplayer: enabled(import.meta.env.VITE_ENABLE_MISSION_MULTIPLAYER, false),
} as const;
