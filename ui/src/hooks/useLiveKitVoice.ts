/**
 * useLiveKitVoice
 *
 * Connects the browser to a LiveKit room and bridges incoming data-channel
 * messages to page navigation + platform operations.
 *
 * The AMX Voice Agent sends JSON messages over the LiveKit data channel:
 *   { type: "tool_call", name: "navigate_to", args: { path: "/AMXA/agents" } }
 *   { type: "tool_call", name: "open_modal",  args: { modal: "new_issue" } }
 *   { type: "status",    status: "listening" | "thinking" | "speaking" }
 *   { type: "transcript", role: "user" | "model", text: "..." }
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalParticipant,
  type LocalTrackPublication,
  ConnectionState,
  type RoomOptions,
} from "livekit-client";

export type LiveKitVoiceStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "disconnected";

export interface TranscriptEntry {
  role: "user" | "model";
  text: string;
  ts: number;
}

export type VideoTrackEntry = { video?: MediaStreamTrack; screen?: MediaStreamTrack };
export type VideoTrackMap = Map<string, VideoTrackEntry>;

export interface UseLiveKitVoiceOptions {
  /** LiveKit room name. Defaults to "amx-command-room" (the global orb room). */
  roomName?: string;
  /** Identity shown in the LiveKit room. Defaults to "board-user". */
  identity?: string;
  /** If true, auto-connect on mount. */
  autoConnect?: boolean;
  /** Called when the agent issues a navigate_to command. */
  onNavigate?: (path: string) => void;
  /** Called when the agent issues any tool_call. */
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  /** Company prefix for building navigation paths (e.g. "AMXA"). */
  companyPrefix?: string;
  /** Company id (UUID) — passed to the token endpoint so the dispatched
   *  voice agent can adopt that company's persona, if one is configured. */
  companyId?: string;
}

const decoder = new TextDecoder();

export function useLiveKitVoice(options: UseLiveKitVoiceOptions = {}) {
  const {
    roomName = "amx-command-room",
    identity = "board-user",
    autoConnect = false,
    onNavigate,
    onToolCall,
    companyPrefix,
    companyId,
  } = options;

  const navigate = useNavigate();
  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [status, setStatus] = useState<LiveKitVoiceStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [agentJoined, setAgentJoined] = useState(false);
  const [cameraEnabled, setCameraEnabledState] = useState(false);
  const [screenShareEnabled, setScreenShareEnabledState] = useState(false);
  const [videoTracks, setVideoTracks] = useState<VideoTrackMap>(new Map());
  const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);

  /** Resolve a relative path to include company prefix */
  const resolvePath = useCallback(
    (path: string) => {
      if (!companyPrefix) return path;
      if (path.startsWith(`/${companyPrefix}/`) || path.startsWith(`/${companyPrefix}`)) return path;
      const clean = path.startsWith("/") ? path : `/${path}`;
      return `/${companyPrefix}${clean}`;
    },
    [companyPrefix],
  );

  /** Handle incoming data channel messages from the AMX Voice Agent */
  const handleData = useCallback(
    (payload: Uint8Array, _participant?: RemoteParticipant | LocalParticipant) => {
      try {
        const text = decoder.decode(payload);
        const msg = JSON.parse(text) as Record<string, unknown>;

        if (msg.type === "status" && typeof msg.status === "string") {
          setStatus(msg.status as LiveKitVoiceStatus);
          return;
        }

        if (msg.type === "transcript") {
          setTranscript((prev) => [
            ...prev.slice(-99),
            { role: msg.role as "user" | "model", text: String(msg.text ?? ""), ts: Date.now() },
          ]);
          return;
        }

        if (msg.type === "tool_call" && typeof msg.name === "string") {
          const args = (msg.args ?? {}) as Record<string, unknown>;
          onToolCall?.(msg.name, args);

          if (msg.name === "navigate_to" && typeof args.path === "string") {
            const resolved = resolvePath(args.path);
            onNavigate?.(resolved);
            navigate(resolved);
          }

          if (msg.name === "navigate_to_agent" && typeof args.agentId === "string") {
            const tab = typeof args.tab === "string" ? `/${args.tab}` : "";
            navigate(resolvePath(`/agents/${args.agentId}${tab}`));
          }

          if (msg.name === "navigate_to_issue" && typeof args.issueId === "string") {
            navigate(resolvePath(`/issues/${args.issueId}`));
          }
        }
      } catch {
        // Malformed message — ignore
      }
    },
    [navigate, resolvePath, onNavigate, onToolCall],
  );

  /** Connect to a LiveKit room. Pass a roomName to override the default
   *  (needed because callers set the meeting id and connect in the same tick). */
  const connect = useCallback(async (roomNameOverride?: string) => {
    if (roomRef.current?.state === ConnectionState.Connected) return;
    setStatus("connecting");
    setError(null);
    const targetRoom = roomNameOverride ?? roomName;

    try {
      const resp = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: targetRoom, identity, companyId }),
      });

      if (!resp.ok) {
        const errData = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `Token fetch failed (${resp.status})`);
      }

      const { token, url } = (await resp.json()) as { token: string; url: string };

      const roomOptions: RoomOptions = {
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
        },
      };

      const room = new Room(roomOptions);
      roomRef.current = room;

      room.on(RoomEvent.DataReceived, handleData);
      room.on(RoomEvent.ParticipantConnected, () => {
        setParticipantCount(room.remoteParticipants.size);
        room.remoteParticipants.forEach((p: RemoteParticipant) => {
          if (p.identity.includes("amx-voice-agent") || p.identity.includes("voice-agent")) {
            setAgentJoined(true);
          }
        });
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        setParticipantCount(room.remoteParticipants.size);
        setAgentJoined(false);
      });
      room.on(RoomEvent.Disconnected, () => {
        setStatus("disconnected");
        setAgentJoined(false);
      });
      room.on(RoomEvent.Connected, () => {
        setStatus("connected");
        setParticipantCount(room.remoteParticipants.size);
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          // Attach + play the remote audio (e.g. the JAZ voice agent speaking).
          // Without this the audio track is subscribed but never heard.
          const sid = track.sid ?? track.mediaStreamTrack.id;
          const el = track.attach() as HTMLAudioElement;
          el.autoplay = true;
          el.style.display = "none";
          document.body.appendChild(el);
          el.play().catch(() => { /* autoplay may need a gesture; mic-enable already provided one */ });
          audioElsRef.current.set(sid, el);
          setAgentJoined(true);
          return;
        }
        if (track.kind === Track.Kind.Video) {
          setVideoTracks((prev) => {
            const next = new Map(prev);
            const existing = next.get(participant.identity) ?? {};
            if (pub.source === Track.Source.ScreenShare) {
              existing.screen = track.mediaStreamTrack;
            } else {
              existing.video = track.mediaStreamTrack;
            }
            next.set(participant.identity, existing);
            return next;
          });
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach();
          const sid = track.sid ?? track.mediaStreamTrack.id;
          const el = audioElsRef.current.get(sid);
          if (el) { el.remove(); audioElsRef.current.delete(sid); }
          return;
        }
        if (track.kind === Track.Kind.Video) {
          track.detach();
          setVideoTracks((prev) => {
            const next = new Map(prev);
            const existing = next.get(participant.identity);
            if (existing) {
              if (pub.source === Track.Source.ScreenShare) delete existing.screen;
              else delete existing.video;
              if (!existing.video && !existing.screen) next.delete(participant.identity);
              else next.set(participant.identity, { ...existing });
            }
            return next;
          });
        }
      });

      room.on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.track?.kind === Track.Kind.Video && pub.source === Track.Source.Camera) {
          setLocalVideoTrack(pub.track.mediaStreamTrack);
        }
      });

      room.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        pub.track?.detach();
        if (pub.track?.kind === Track.Kind.Video && pub.source === Track.Source.Camera) {
          setLocalVideoTrack(null);
        }
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setStatus("listening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
    }
  }, [roomName, identity, companyId, handleData]);

  /** Disconnect from the room */
  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current.clear();
    setStatus("idle");
    setAgentJoined(false);
    setCameraEnabledState(false);
    setScreenShareEnabledState(false);
    setVideoTracks(new Map());
    setLocalVideoTrack(null);
  }, []);

  /** Toggle local camera */
  const toggleCamera = useCallback(async () => {
    if (!roomRef.current) return;
    const next = !cameraEnabled;
    await roomRef.current.localParticipant.setCameraEnabled(next);
    setCameraEnabledState(next);
  }, [cameraEnabled]);

  /** Toggle screen share */
  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;
    const next = !screenShareEnabled;
    try {
      await roomRef.current.localParticipant.setScreenShareEnabled(next, { cursor: "always" } as any);
      setScreenShareEnabledState(next);
    } catch {
      setScreenShareEnabledState(false);
    }
  }, [screenShareEnabled]);

  /** Mute/unmute local mic */
  const setMuted = useCallback((muted: boolean) => {
    roomRef.current?.localParticipant.setMicrophoneEnabled(!muted);
  }, []);

  /** Send a text message to the agent via data channel */
  const sendText = useCallback((text: string) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({ type: "text", text }));
    room.localParticipant.publishData(data, { reliable: true });
  }, []);

  useEffect(() => {
    if (autoConnect) void connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  return {
    status,
    transcript,
    error,
    participantCount,
    agentJoined,
    connect,
    disconnect,
    setMuted,
    sendText,
    isConnected: status !== "idle" && status !== "error" && status !== "disconnected",
    cameraEnabled,
    toggleCamera,
    screenShareEnabled,
    toggleScreenShare,
    videoTracks,
    localVideoTrack,
    room: roomRef.current,
  };
}
