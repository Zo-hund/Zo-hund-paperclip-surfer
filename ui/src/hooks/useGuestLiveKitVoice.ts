/**
 * useGuestLiveKitVoice
 *
 * A deliberately lean, from-scratch LiveKit connection hook for the guest
 * meeting view — NOT a stripped copy of useLiveKitVoice. It takes a
 * pre-issued { token, url } pair (minted once by POST /api/guest/meetings/
 * :token/join) and connects directly, rather than fetching its own token
 * from /api/livekit/token (which requires board/company auth a guest
 * doesn't have).
 *
 * It deliberately omits everything useLiveKitVoice does for board users:
 * no react-router-dom/company-prefix navigation, no registerRpcMethod
 * handlers (navigate_to/open_modal/capture_page_screenshot/show_module) — a
 * guest has no internal pages to navigate and letting the dispatched voice
 * agent screenshot a guest's browser tab is out of scope. Only
 * audio/video/screenshare/canvas/reactions/chat data-channel plumbing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalTrackPublication,
  ConnectionState,
  type RoomOptions,
} from "livekit-client";
import type {
  CanvasEvent,
  CanvasStrokeEvent,
  CanvasCursorEvent,
  ReactionEvent,
  VideoTrackMap,
  LiveKitVoiceStatus,
} from "./useLiveKitVoice";

export interface GuestConnectionParams {
  token: string;
  url: string;
  identity: string;
}

export interface UseGuestLiveKitVoiceOptions {
  onCanvasEvent?: (event: CanvasEvent, identity?: string) => void;
  onCanvasCursor?: (cursor: CanvasCursorEvent) => void;
  onReaction?: (reaction: ReactionEvent) => void;
  onChatText?: (text: string, identity?: string) => void;
}

const decoder = new TextDecoder();

export function useGuestLiveKitVoice(options: UseGuestLiveKitVoiceOptions = {}) {
  const { onCanvasEvent, onCanvasCursor, onReaction, onChatText } = options;

  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const onCanvasEventRef = useRef(onCanvasEvent);
  const onCanvasCursorRef = useRef(onCanvasCursor);
  const onReactionRef = useRef(onReaction);
  const onChatTextRef = useRef(onChatText);
  onCanvasEventRef.current = onCanvasEvent;
  onCanvasCursorRef.current = onCanvasCursor;
  onReactionRef.current = onReaction;
  onChatTextRef.current = onChatText;

  const [status, setStatus] = useState<LiveKitVoiceStatus>("idle");
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [cameraEnabled, setCameraEnabledState] = useState(false);
  const [screenShareEnabled, setScreenShareEnabledState] = useState(false);
  const [videoTracks, setVideoTracks] = useState<VideoTrackMap>(new Map());
  const [localVideoTrack, setLocalVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [localScreenTrack, setLocalScreenTrack] = useState<MediaStreamTrack | null>(null);

  const handleData = useCallback((payload: Uint8Array, participant?: RemoteParticipant) => {
    try {
      const text = decoder.decode(payload);
      const msg = JSON.parse(text) as Record<string, unknown>;

      if (msg.type === "canvas_stroke" || msg.type === "canvas_clear") {
        onCanvasEventRef.current?.(msg as unknown as CanvasEvent, participant?.identity);
        return;
      }
      if (msg.type === "canvas_cursor" && typeof msg.x === "number" && typeof msg.y === "number" && participant?.identity) {
        onCanvasCursorRef.current?.({ identity: participant.identity, x: msg.x, y: msg.y, ts: Date.now() });
        return;
      }
      if (msg.type === "reaction" && typeof msg.emoji === "string") {
        onReactionRef.current?.({ emoji: msg.emoji, identity: participant?.identity ?? "unknown", ts: Date.now() });
        return;
      }
      if (msg.type === "text" && typeof msg.text === "string") {
        onChatTextRef.current?.(msg.text, participant?.identity);
        return;
      }
      if (msg.type === "status" && typeof msg.status === "string") {
        setStatus(msg.status as LiveKitVoiceStatus);
      }
    } catch {
      // Malformed message — ignore
    }
  }, []);

  const connect = useCallback(async (params: GuestConnectionParams) => {
    if (roomRef.current?.state === ConnectionState.Connected) return;
    setStatus("connecting");
    setError(null);

    try {
      const roomOptions: RoomOptions = {
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
      };

      const room = new Room(roomOptions);
      roomRef.current = room;

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        handleData(payload, participant as RemoteParticipant | undefined);
      });
      room.on(RoomEvent.ParticipantConnected, () => setParticipantCount(room.remoteParticipants.size));
      room.on(RoomEvent.ParticipantDisconnected, () => setParticipantCount(room.remoteParticipants.size));
      room.on(RoomEvent.Disconnected, () => setStatus("disconnected"));
      room.on(RoomEvent.Connected, () => {
        setStatus("connected");
        setParticipantCount(room.remoteParticipants.size);
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeakers(speakers.map((s) => s.identity));
      });

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          const sid = track.sid ?? track.mediaStreamTrack.id;
          const el = track.attach() as HTMLAudioElement;
          el.autoplay = true;
          el.style.display = "none";
          document.body.appendChild(el);
          el.play().catch(() => {});
          audioElsRef.current.set(sid, el);
          return;
        }
        if (track.kind === Track.Kind.Video) {
          setVideoTracks((prev) => {
            const next = new Map(prev);
            const existing = next.get(participant.identity) ?? {};
            if (pub.source === Track.Source.ScreenShare) existing.screen = track.mediaStreamTrack;
            else existing.video = track.mediaStreamTrack;
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
        if (pub.track?.kind !== Track.Kind.Video) return;
        if (pub.source === Track.Source.Camera) setLocalVideoTrack(pub.track.mediaStreamTrack);
        else if (pub.source === Track.Source.ScreenShare) setLocalScreenTrack(pub.track.mediaStreamTrack);
      });

      room.on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        pub.track?.detach();
        if (pub.track?.kind !== Track.Kind.Video) return;
        if (pub.source === Track.Source.Camera) setLocalVideoTrack(null);
        else if (pub.source === Track.Source.ScreenShare) setLocalScreenTrack(null);
      });

      await room.connect(params.url, params.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setMutedState(false);
      setStatus("listening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
    }
  }, [handleData]);

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    audioElsRef.current.forEach((el) => el.remove());
    audioElsRef.current.clear();
    setStatus("idle");
    setCameraEnabledState(false);
    setScreenShareEnabledState(false);
    setVideoTracks(new Map());
    setLocalVideoTrack(null);
    setLocalScreenTrack(null);
    setActiveSpeakers([]);
    setMutedState(false);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!roomRef.current) return;
    const next = !cameraEnabled;
    await roomRef.current.localParticipant.setCameraEnabled(next);
    setCameraEnabledState(next);
  }, [cameraEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;
    const next = !screenShareEnabled;
    try {
      await roomRef.current.localParticipant.setScreenShareEnabled(next, { cursor: "always" } as any);
      setScreenShareEnabledState(next);
    } catch (err) {
      setScreenShareEnabledState(false);
      throw err;
    }
  }, [screenShareEnabled]);

  const setMuted = useCallback((next: boolean) => {
    roomRef.current?.localParticipant.setMicrophoneEnabled(!next);
    setMutedState(next);
  }, []);

  const sendText = useCallback((text: string) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const data = new TextEncoder().encode(JSON.stringify({ type: "text", text }));
    room.localParticipant.publishData(data, { reliable: true });
  }, []);

  const sendCanvasStroke = useCallback((stroke: Omit<CanvasStrokeEvent, "type">) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const data = new TextEncoder().encode(JSON.stringify({ type: "canvas_stroke", ...stroke }));
    room.localParticipant.publishData(data, { reliable: true });
  }, []);

  const sendCanvasClear = useCallback(() => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const data = new TextEncoder().encode(JSON.stringify({ type: "canvas_clear" }));
    room.localParticipant.publishData(data, { reliable: true });
  }, []);

  const sendCanvasCursor = useCallback((pos: { x: number; y: number }) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const data = new TextEncoder().encode(JSON.stringify({ type: "canvas_cursor", ...pos }));
    room.localParticipant.publishData(data, { reliable: false });
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    const data = new TextEncoder().encode(JSON.stringify({ type: "reaction", emoji }));
    room.localParticipant.publishData(data, { reliable: false });
    onReactionRef.current?.({ emoji, identity: room.localParticipant.identity, ts: Date.now() });
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    status,
    error,
    participantCount,
    activeSpeakers,
    muted,
    connect,
    disconnect,
    setMuted,
    sendText,
    sendCanvasStroke,
    sendCanvasClear,
    sendCanvasCursor,
    sendReaction,
    isConnected: status !== "idle" && status !== "error" && status !== "disconnected",
    cameraEnabled,
    toggleCamera,
    screenShareEnabled,
    toggleScreenShare,
    screenShareSupported: typeof navigator?.mediaDevices?.getDisplayMedia === "function",
    videoTracks,
    localVideoTrack,
    localScreenTrack,
  };
}
