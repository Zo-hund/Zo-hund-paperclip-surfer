import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getMemberDataClient, type MemberProfile } from "./member-auth";
import type { StageVenueLayout } from "./stage-events";
import { normalizeMemberAvatarUrl } from "./member-avatar";

export interface StageVenuePose {
  id: string;
  name: string;
  color: string;
  avatarUrl: string | null;
  position: [number, number, number];
  yaw: number;
  updatedAt: number;
}

const PALETTE = ["#55e6ff", "#ff63de", "#79eea8", "#f4c96b", "#9f8cff"];
const bounded = (value: unknown, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const safeRoom = (value: string) => value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || "AMXSTAGE";

export function normalizeStageVenuePose(value: Partial<StageVenuePose> | undefined): StageVenuePose | null {
  const id = String(value?.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!id || !Array.isArray(value?.position) || value.position.length !== 3) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(value.color)) ? String(value.color) : PALETTE[0];
  return {
    id,
    name: String(value.name || "Member").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 48) || "Member",
    color,
    avatarUrl: normalizeMemberAvatarUrl(value.avatarUrl),
    position: [bounded(value.position[0], -28, 28), bounded(value.position[1], 0, 3), bounded(value.position[2], -28, 28)],
    yaw: bounded(value.yaw, -Math.PI * 2, Math.PI * 2),
    updatedAt: bounded(value.updatedAt, 0, Date.now() + 60_000) || Date.now(),
  };
}

function localHost() { return ["localhost", "127.0.0.1"].includes(location.hostname); }

export function useStageVenuePresence(roomCode: string, layout: StageVenueLayout, profile: MemberProfile | null) {
  const room = safeRoom(roomCode);
  const memberId = useMemo(() => `member-${String(profile?.id || sessionStorage.getItem("amx_participant") || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48)}`, [profile?.id]);
  const name = profile?.display_name || "AMX Member";
  const color = PALETTE[Math.abs([...memberId].reduce((total, character) => total + character.charCodeAt(0), 0)) % PALETTE.length];
  const avatarUrl = normalizeMemberAvatarUrl(profile?.avatar_model_url);
  const [participants, setParticipants] = useState<StageVenuePose[]>([]);
  const [transport, setTransport] = useState<"connecting" | "websocket" | "local mesh" | "offline">("connecting");
  const poseRef = useRef<StageVenuePose>({ id: memberId, name, color, avatarUrl, position: [0, 0, 8], yaw: Math.PI, updatedAt: Date.now() });
  const localRef = useRef<BroadcastChannel | null>(null);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const lastPublishRef = useRef(0);
  useEffect(() => { poseRef.current = { ...poseRef.current, name, color, avatarUrl, updatedAt: Date.now() }; }, [avatarUrl, color, name]);

  const receive = useCallback((candidate: Partial<StageVenuePose>) => {
    const pose = normalizeStageVenuePose(candidate);
    if (!pose || pose.id === memberId) return;
    setParticipants((current) => [...current.filter((item) => item.id !== pose.id && Date.now() - item.updatedAt < 20_000), pose].slice(-48));
  }, [memberId]);

  useEffect(() => {
    sessionStorage.setItem("amx_participant", memberId.replace(/^member-/, ""));
    const channelName = `amx-stage-venue-${room}-${layout}`;
    const config = window.__AMX_CONFIG__;
    if (localHost() || !config?.supabaseUrl || !config.supabasePublishableKey) {
      if (!("BroadcastChannel" in window)) { setTransport("offline"); return; }
      const channel = new BroadcastChannel(channelName);
      localRef.current = channel;
      channel.onmessage = (event) => receive(event.data as StageVenuePose);
      setTransport("local mesh");
      channel.postMessage(poseRef.current);
      return () => { channel.close(); localRef.current = null; };
    }
    let cancelled = false;
    let activeChannel: RealtimeChannel | null = null;
    void getMemberDataClient().then((supabase) => {
      if (cancelled) return;
      const channel = supabase.channel(channelName, { config: { broadcast: { self: false }, presence: { key: memberId } } });
      activeChannel = channel;
      realtimeRef.current = channel;
      channel
        .on("broadcast", { event: "pose" }, ({ payload }) => receive(payload as StageVenuePose))
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<StageVenuePose>();
          const peers = Object.values(state).flat().map((entry) => normalizeStageVenuePose(entry)).filter((entry): entry is StageVenuePose => Boolean(entry && entry.id !== memberId));
          setParticipants(peers.slice(-48));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setTransport("websocket");
            void channel.track(poseRef.current);
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setTransport("offline");
        });
    }).catch(() => setTransport("offline"));
    return () => {
      cancelled = true;
      if (activeChannel) {
        void activeChannel.untrack();
        void activeChannel.unsubscribe();
      }
      realtimeRef.current = null;
    };
  }, [layout, memberId, receive, room]);

  const publishPose = useCallback((position: [number, number, number], yaw: number) => {
    const now = Date.now();
    if (now - lastPublishRef.current < 100) return;
    lastPublishRef.current = now;
    const pose = normalizeStageVenuePose({ id: memberId, name, color, avatarUrl, position, yaw, updatedAt: now });
    if (!pose) return;
    poseRef.current = pose;
    if (realtimeRef.current) {
      void realtimeRef.current.send({ type: "broadcast", event: "pose", payload: pose });
      void realtimeRef.current.track(pose);
    } else localRef.current?.postMessage(pose);
  }, [avatarUrl, color, memberId, name]);

  return { participantId: memberId, participants, transport, publishPose };
}
