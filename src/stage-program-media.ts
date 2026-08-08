export type StageProgramMediaFit = "contain" | "cover";
export type StageProgramMediaTransport = "stopped" | "playing" | "paused";

export interface StageProgramMediaState {
  url: string;
  name: string;
  contentType: string;
  fit: StageProgramMediaFit;
  muted: boolean;
  transport: StageProgramMediaTransport;
  startedAt: number | null;
  positionSeconds: number;
}

export const DEFAULT_STAGE_PROGRAM_MEDIA: StageProgramMediaState = {
  url: "",
  name: "No media loaded",
  contentType: "video/mp4",
  fit: "contain",
  muted: true,
  transport: "stopped",
  startedAt: null,
  positionSeconds: 0,
};

function safeMediaUrl(value: unknown) {
  const url = String(value || "").trim().slice(0, 2048);
  if (!url) return "";
  if (/^\/api\/media\/[a-zA-Z0-9_-]{8,120}$/.test(url)) return url;
  try { return new URL(url).protocol === "https:" ? url : ""; } catch { return ""; }
}

export function normalizeStageProgramMedia(value?: Partial<StageProgramMediaState> | null): StageProgramMediaState {
  const url = safeMediaUrl(value?.url);
  const transport = ["stopped", "playing", "paused"].includes(String(value?.transport)) ? value?.transport as StageProgramMediaTransport : "stopped";
  return {
    url,
    name: String(value?.name || (url ? "Stage media" : DEFAULT_STAGE_PROGRAM_MEDIA.name)).slice(0, 120),
    contentType: String(value?.contentType || "video/mp4").slice(0, 120),
    fit: value?.fit === "cover" ? "cover" : "contain",
    muted: value?.muted !== false,
    transport: url ? transport : "stopped",
    startedAt: url && transport === "playing" && Number.isFinite(value?.startedAt) ? Number(value?.startedAt) : null,
    positionSeconds: Math.max(0, Math.min(Number(value?.positionSeconds) || 0, 86_400)),
  };
}

export function stageProgramMediaPosition(media: StageProgramMediaState, now = Date.now()) {
  return media.transport === "playing" && media.startedAt
    ? Math.max(0, media.positionSeconds + (now - media.startedAt) / 1000)
    : media.positionSeconds;
}
