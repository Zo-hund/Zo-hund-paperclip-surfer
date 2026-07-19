import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { defaultStageEvent, normalizeStageEvent, type StageEventState } from "./stage-events";

export type StageMode = "in-person" | "online" | "metaverse";
export type StageShot = "wide" | "host" | "audience" | "crane";
export type StageCue = "standby" | "opening" | "speaker" | "demo" | "qa" | "sponsor" | "close";
export type StageAudioFormat = "show" | "podcast" | "dj";
export type StageAudioTransport = "stopped" | "playing";
export type StageDeckTrack = "air-pulse" | "night-grid" | "spoken-bed" | "sponsor-sting";
export type StageSoundscape = "air-grid" | "deep-focus" | "crowd-warmup" | "podcast-room";

export interface StageAudioState {
  format: StageAudioFormat;
  transport: StageAudioTransport;
  recording: boolean;
  deckA: StageDeckTrack;
  deckB: StageDeckTrack;
  crossfader: number;
  master: number;
  bpm: number;
  soundscape: StageSoundscape;
  startedAt: number | null;
  recordStartedAt: number | null;
}

export interface SponsorCreative {
  id: string;
  name: string;
  headline: string;
  cta: string;
  accent: string;
}

export interface StageProductionState {
  live: boolean;
  mode: StageMode;
  shot: StageShot;
  cue: StageCue;
  sponsor: SponsorCreative;
  cameraRoutes: Record<StageShot, string>;
  audio: StageAudioState;
  event: StageEventState;
  generalSeats: number;
  vipSeats: number;
  connectedPods: string[];
  revision: number;
  updatedAt: string;
  operatorId: string;
}

interface StagePacket {
  type: "stage-state";
  state: StageProductionState;
}

export const DEFAULT_SPONSORS: SponsorCreative[] = [
  { id: "amx-air", name: "AMX AIR HUBS.CC", headline: "Create. Curate. Connect.", cta: "ENTER THE XR RUNWAY", accent: "#55e6ff" },
  { id: "amx-labs", name: "AMX LABS", headline: "Human Agentic AI in the real world", cta: "BUILD WITH THE LAB", accent: "#f4c96b" },
  { id: "tech-at-nite", name: "TECH AT NITE", headline: "Skills, community, and creative technology", cta: "JOIN THE NEXT COHORT", accent: "#79eea8" },
];

export const DEFAULT_CAMERA_ROUTES: Record<StageShot, string> = {
  wide: "auto",
  host: "auto",
  audience: "auto",
  crane: "auto",
};

export const DEFAULT_STAGE_AUDIO: StageAudioState = {
  format: "show",
  transport: "stopped",
  recording: false,
  deckA: "air-pulse",
  deckB: "night-grid",
  crossfader: 50,
  master: 62,
  bpm: 112,
  soundscape: "air-grid",
  startedAt: null,
  recordStartedAt: null,
};

function localHost() {
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

function initialState(operatorId: string, room = "AMXSTAGE"): StageProductionState {
  const revision = Date.now();
  return {
    live: false,
    mode: "in-person",
    shot: "wide",
    cue: "standby",
    sponsor: DEFAULT_SPONSORS[0],
    cameraRoutes: { ...DEFAULT_CAMERA_ROUTES },
    audio: { ...DEFAULT_STAGE_AUDIO },
    event: defaultStageEvent(room),
    generalSeats: 0,
    vipSeats: 0,
    connectedPods: ["AMX-MAIN"],
    revision,
    updatedAt: new Date(revision).toISOString(),
    operatorId,
  };
}

function storedState(room: string, operatorId: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(`amx_stage_${room}`) || "null") as StageProductionState | null;
    if (!saved) return initialState(operatorId, room);
    const revision = Number(saved.revision) || Date.parse(saved.updatedAt) || Date.now();
    return { ...initialState(operatorId, room), ...saved, cameraRoutes: { ...DEFAULT_CAMERA_ROUTES, ...saved.cameraRoutes }, audio: { ...DEFAULT_STAGE_AUDIO, ...saved.audio }, event: normalizeStageEvent(saved.event, room, saved.generalSeats, saved.vipSeats), revision, updatedAt: new Date(revision).toISOString(), operatorId };
  } catch {
    return initialState(operatorId, room);
  }
}

export function useStageProduction(roomCode: string) {
  const room = roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || "AMXSTAGE";
  const operatorId = useMemo(() => sessionStorage.getItem("amx_stage_operator") || crypto.randomUUID().slice(0, 8), []);
  const [state, setState] = useState<StageProductionState>(() => storedState(room, operatorId));
  const [transport, setTransport] = useState<"connecting" | "websocket" | "local mesh" | "offline">("connecting");
  const [peerCount, setPeerCount] = useState(1);
  const stateRef = useRef(state);
  const roomRef = useRef(room);
  const localRef = useRef<BroadcastChannel | null>(null);
  const bridgeLocalRef = useRef<BroadcastChannel[]>([]);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const bridgeRealtimeRef = useRef<RealtimeChannel[]>([]);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { sessionStorage.setItem("amx_stage_operator", operatorId); }, [operatorId]);
  useEffect(() => {
    if (roomRef.current === room) return;
    roomRef.current = room;
    const next = storedState(room, operatorId);
    stateRef.current = next;
    setState(next);
  }, [operatorId, room]);

  const receive = useCallback((packet: StagePacket) => {
    if (packet.type !== "stage-state") return;
    const revision = Number(packet.state.revision) || Date.parse(packet.state.updatedAt) || 0;
    const incoming = { ...packet.state, cameraRoutes: { ...DEFAULT_CAMERA_ROUTES, ...packet.state.cameraRoutes }, audio: { ...DEFAULT_STAGE_AUDIO, ...packet.state.audio }, event: normalizeStageEvent(packet.state.event, room, packet.state.generalSeats, packet.state.vipSeats), revision, updatedAt: new Date(revision).toISOString() };
    const current = stateRef.current;
    if (incoming.revision < current.revision) return;
    if (incoming.revision === current.revision && incoming.operatorId.localeCompare(current.operatorId) <= 0) return;
    stateRef.current = incoming;
    setState(incoming);
    localStorage.setItem(`amx_stage_${room}`, JSON.stringify(incoming));
  }, [room]);

  const broadcast = useCallback((packet: StagePacket) => {
    if (realtimeRef.current) {
      void realtimeRef.current.send({ type: "broadcast", event: "stage-sync", payload: packet });
      bridgeRealtimeRef.current.forEach((channel) => {
        void channel.send({ type: "broadcast", event: "stage-sync", payload: packet });
      });
      return;
    }
    localRef.current?.postMessage(packet);
    bridgeLocalRef.current.forEach((channel) => channel.postMessage(packet));
  }, []);

  useEffect(() => {
    const config = window.__AMX_CONFIG__;
    if (localHost() || !config?.supabaseUrl || !config.supabasePublishableKey) {
      if (!("BroadcastChannel" in window)) { setTransport("offline"); return; }
      const channel = new BroadcastChannel(`amx-stage-${room}`);
      channel.onmessage = (event) => receive(event.data as StagePacket);
      localRef.current = channel;
      setTransport("local mesh");
      return () => { channel.close(); localRef.current = null; };
    }

    const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const channel = supabase.channel(`amx-stage-${room}`, {
      config: { broadcast: { self: false }, presence: { key: operatorId } },
    });
    supabaseRef.current = supabase;
    realtimeRef.current = channel;
    channel
      .on("broadcast", { event: "stage-sync" }, ({ payload }) => receive(payload as StagePacket))
      .on("presence", { event: "sync" }, () => setPeerCount(Math.max(1, Object.keys(channel.presenceState()).length)))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setTransport("websocket");
          void channel.track({ operatorId, joinedAt: new Date().toISOString() });
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setTransport("offline");
      });
    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
      realtimeRef.current = null;
      supabaseRef.current = null;
    };
  }, [operatorId, receive, room]);

  const bridgeKey = state.connectedPods.filter((pod) => pod !== room).sort().join("|");
  useEffect(() => {
    const podRooms = bridgeKey.split("|").filter(Boolean);
    if (!podRooms.length) return;
    const config = window.__AMX_CONFIG__;
    if (localHost() || !config?.supabaseUrl || !config.supabasePublishableKey) {
      if (!("BroadcastChannel" in window)) return;
      const channels = podRooms.map((pod) => new BroadcastChannel(`amx-stage-${pod}`));
      bridgeLocalRef.current = channels;
      const packet: StagePacket = { type: "stage-state", state: stateRef.current };
      channels.forEach((channel) => channel.postMessage(packet));
      return () => {
        channels.forEach((channel) => channel.close());
        bridgeLocalRef.current = [];
      };
    }

    const supabase = supabaseRef.current;
    if (!supabase) return;
    const channels = podRooms.map((pod) => {
      const channel = supabase.channel(`amx-stage-${pod}`);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.send({ type: "broadcast", event: "stage-sync", payload: { type: "stage-state", state: stateRef.current } satisfies StagePacket });
        }
      });
      return channel;
    });
    bridgeRealtimeRef.current = channels;
    return () => {
      channels.forEach((channel) => { void supabase.removeChannel(channel); });
      bridgeRealtimeRef.current = [];
    };
  }, [bridgeKey]);

  const update = useCallback((patch: Partial<Omit<StageProductionState, "revision" | "updatedAt" | "operatorId">>) => {
    const revision = Math.max(Date.now(), stateRef.current.revision + 1);
    const next: StageProductionState = {
      ...stateRef.current,
      ...patch,
      revision,
      updatedAt: new Date(revision).toISOString(),
      operatorId,
    };
    stateRef.current = next;
    setState(next);
    localStorage.setItem(`amx_stage_${room}`, JSON.stringify(next));
    broadcast({ type: "stage-state", state: next });
    return next;
  }, [broadcast, operatorId, room]);

  return { room, state, transport, peerCount, update };
}
