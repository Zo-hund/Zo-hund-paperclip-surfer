import type { StageProductionState, StageScreenId, StageShot } from "./stage-production";

export const STAGE_AGENT_ACTIONS = [
  "camera.preview", "camera.take", "screen.route", "media.load", "media.play", "media.pause",
  "audio.mute", "audio.unmute", "audio.set_gain", "cue.fire", "stinger.take",
  "lighting.set_scene", "vfx.trigger", "stream.start", "stream.stop", "robot.inspect",
] as const;

export type StageAgentAction = typeof STAGE_AGENT_ACTIONS[number];
export type StageAgentCommand = {
  id: string;
  action: StageAgentAction;
  room: string;
  target?: string;
  source?: string;
  value?: number | string | boolean;
  media?: { id: string; name: string; url: string; contentType: string };
  operatorApproved?: boolean;
  requestedBy: string;
  requestedAt: number;
};

export type StageAgentCommandResult = {
  ok: boolean;
  status: "executed" | "approval-required" | "rejected";
  message: string;
  state?: StageProductionState;
};

const shots = new Set<StageShot>(["wide", "host", "audience", "crane"]);
const screens = new Set<StageScreenId>(["center", "left", "right"]);
const cues = new Set(["standby", "opening", "speaker", "demo", "qa", "sponsor", "close"]);
const lightingLooks = new Set(["house", "keynote", "neon-grid", "audience", "brand", "finale"]);
const vfxLooks = new Set(["clean", "beat-pulse", "laser-sweep", "prism", "confetti"]);
const actions = new Set<string>(STAGE_AGENT_ACTIONS);
const approvalActions = new Set<StageAgentAction>([
  "camera.take", "screen.route", "media.load", "cue.fire", "stinger.take", "lighting.set_scene",
  "vfx.trigger", "stream.start", "stream.stop", "robot.inspect",
]);

function bounded(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeStageAgentCommand(value: unknown, room: string): StageAgentCommand | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<StageAgentCommand>;
  const action = bounded(raw.action, 40) as StageAgentAction;
  if (!actions.has(action)) return null;
  const media = raw.media && typeof raw.media === "object" ? {
    id: bounded(raw.media.id, 128), name: bounded(raw.media.name, 120), url: bounded(raw.media.url, 2_048), contentType: bounded(raw.media.contentType, 100),
  } : undefined;
  if (media && (!media.id || !media.name || !media.url.startsWith("https://") || !media.contentType)) return null;
  return {
    id: bounded(raw.id, 128) || crypto.randomUUID(), action,
    room: room.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || "AMXSTAGE",
    target: bounded(raw.target), source: bounded(raw.source, 2_048),
    value: typeof raw.value === "number" || typeof raw.value === "boolean" ? raw.value : bounded(raw.value, 120),
    media, operatorApproved: raw.operatorApproved === true,
    requestedBy: bounded(raw.requestedBy, 80) || "agent", requestedAt: Number(raw.requestedAt) || Date.now(),
  };
}

function audit(state: StageProductionState, command: StageAgentCommand, detail: string) {
  return {
    ...state.workflow,
    activity: [...state.workflow.activity, {
      id: command.id, action: `agent.${command.action}`, detail,
      actor: command.requestedBy, at: new Date(command.requestedAt).toISOString(),
    }].slice(-160),
  };
}

export function applyStageAgentCommand(state: StageProductionState, command: StageAgentCommand): StageAgentCommandResult {
  if (approvalActions.has(command.action) && !command.operatorApproved) {
    return { ok: false, status: "approval-required", message: `${command.action} requires confirmation from a Stage operator.` };
  }
  let patch: Partial<StageProductionState> = {};
  let detail = "accepted";
  switch (command.action) {
    case "camera.preview": {
      const shot = command.target as StageShot;
      if (!shots.has(shot)) return { ok: false, status: "rejected", message: "Choose wide, host, audience, or crane." };
      detail = `${shot} selected for preview`;
      break;
    }
    case "camera.take": {
      const shot = command.target as StageShot;
      if (!shots.has(shot)) return { ok: false, status: "rejected", message: "Invalid camera shot." };
      patch = { shot };
      detail = `${shot} taken to Program`;
      break;
    }
    case "screen.route": {
      const target = command.target as StageScreenId;
      if (!screens.has(target) || !command.source) return { ok: false, status: "rejected", message: "A valid screen and source are required." };
      patch = { screenRoutes: { ...state.screenRoutes, [target]: command.source } };
      detail = `${command.source} routed to ${target}`;
      break;
    }
    case "media.load": {
      if (!command.media) return { ok: false, status: "rejected", message: "Secure media metadata is required." };
      patch = { programMedia: { ...state.programMedia, url: command.media.url, name: command.media.name, contentType: command.media.contentType, transport: "paused", positionSeconds: 0, startedAt: null } };
      detail = `${command.media.name} loaded`;
      break;
    }
    case "media.play": patch = { programMedia: { ...state.programMedia, transport: "playing", startedAt: Date.now() } }; detail = "program media playing"; break;
    case "media.pause": patch = { programMedia: { ...state.programMedia, transport: "paused", startedAt: null } }; detail = "program media paused"; break;
    case "audio.mute": patch = { audio: { ...state.audio, masterMuted: true } }; detail = "master audio muted"; break;
    case "audio.unmute": patch = { audio: { ...state.audio, masterMuted: false } }; detail = "master audio unmuted"; break;
    case "audio.set_gain": {
      const gain = Math.max(0, Math.min(100, Number(command.value)));
      if (!Number.isFinite(gain)) return { ok: false, status: "rejected", message: "Gain must be between 0 and 100." };
      patch = { audio: { ...state.audio, master: gain } };
      detail = `master gain set to ${gain}`;
      break;
    }
    case "cue.fire":
      if (!command.target || !cues.has(command.target)) return { ok: false, status: "rejected", message: "Invalid show cue." };
      patch = { cue: command.target as StageProductionState["cue"] }; detail = `${command.target} cue fired`; break;
    case "stinger.take": patch = { cue: "sponsor", audio: { ...state.audio, stingerTrack: (command.target || "sponsor-sting") as typeof state.audio.stingerTrack } }; detail = `${command.target || "sponsor-sting"} stinger taken`; break;
    case "lighting.set_scene":
      if (!command.target || !lightingLooks.has(command.target)) return { ok: false, status: "rejected", message: "Invalid lighting scene." };
      patch = { audio: { ...state.audio, score: { ...state.audio.score, lighting: command.target as typeof state.audio.score.lighting } } }; detail = `${command.target} lighting scene`; break;
    case "vfx.trigger":
      if (!command.target || !vfxLooks.has(command.target)) return { ok: false, status: "rejected", message: "Invalid VFX preset." };
      patch = { audio: { ...state.audio, score: { ...state.audio.score, vfx: command.target as typeof state.audio.score.vfx } } }; detail = `${command.target} VFX triggered`; break;
    case "stream.start": patch = { live: true, event: { ...state.event, status: "live" } }; detail = "public program stream started"; break;
    case "stream.stop": patch = { live: false, event: { ...state.event, status: "complete" } }; detail = "public program stream stopped"; break;
    case "robot.inspect": detail = `governed robotics inspection requested for ${command.target || "stage"}`; break;
  }
  const next = { ...state, ...patch };
  next.workflow = audit(next, command, detail);
  return { ok: true, status: "executed", message: detail, state: next };
}
