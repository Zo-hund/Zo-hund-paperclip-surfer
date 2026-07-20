import type { StageVideoProfile } from "./stage-video";

export interface DjEgress {
  id: string;
  room: string;
  status: string;
}

export interface DjBroadcastState {
  configured: boolean;
  destinationCount: number;
  active: DjEgress | null;
  alreadyActive?: boolean;
  videoProfile?: StageVideoProfile;
  width?: number;
  height?: number;
  frameRate?: number;
}

export async function controlDjBroadcast(action: "status" | "start" | "stop", room: string, controlToken: string, videoProfile: StageVideoProfile, egressId?: string) {
  const response = await fetch(`/api/livekit/egress/dj/${action}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${controlToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ room, videoProfile, ...(egressId ? { egressId } : {}) }),
  });
  const body = await response.json().catch(() => ({})) as DjBroadcastState & { error?: string };
  if (!response.ok) throw new Error(body.error || `Broadcast control returned ${response.status}`);
  return body;
}
