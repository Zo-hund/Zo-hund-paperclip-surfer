export type NexusBroadcastFormat = "show" | "podcast";

export function normalizeBroadcastRoom(value: string, fallback = "AMXSTAGE") {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || fallback;
}

export function nexusStageHref(room: string, format: NexusBroadcastFormat) {
  const params = new URLSearchParams({ room: normalizeBroadcastRoom(room), format, console: "audio", source: "nexus" });
  return `/stage?${params.toString()}`;
}

export function nexusViewerHref(room: string) {
  return `/watch/${encodeURIComponent(normalizeBroadcastRoom(room))}`;
}

export function stageLaunchConfig(search: string) {
  const params = new URLSearchParams(search);
  const requestedRoom = params.get("room");
  const requestedFormat = params.get("format");
  return {
    room: requestedRoom ? normalizeBroadcastRoom(requestedRoom) : null,
    format: requestedFormat === "podcast" || requestedFormat === "show" ? requestedFormat as NexusBroadcastFormat : null,
    openAudio: params.get("console") === "audio",
    fromNexus: params.get("source") === "nexus",
  };
}
