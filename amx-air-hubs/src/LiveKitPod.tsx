import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Camera, CameraOff, Mic, MicOff, MonitorUp, Radio, Users, Video, Volume2, VolumeX, Wifi } from "lucide-react";
import {
  LocalVideoTrack, RemoteVideoTrack, Room, RoomEvent, Track, VideoPresets, VideoQuality,
  type TrackPublishOptions, type VideoCaptureOptions,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from "livekit-client";
import type { Agent } from "./data";
import { countStageAudienceParticipants, stageFeedId } from "./stage-camera-routing";
import { stageVideoDiagnostics, stageVideoProfile, type StageVideoDiagnostics, type StageVideoProfile } from "./stage-video";

type PodStatus = "idle" | "connecting" | "livekit" | "local" | "error";
export type CaptureState = "off" | "requesting" | "published" | "muted" | "blocked";
type PlaybackState = "off" | "ready" | "blocked";
export type ProgramAudioState = "off" | "publishing" | "published" | "blocked";
export type LiveVideoFeed = {
  id: string;
  participantIdentity?: string;
  name: string;
  local: boolean;
  source: "camera" | "screen";
  stream: MediaStream;
  muted: boolean;
  width?: number;
  height?: number;
  frameRate?: number;
};

type VideoSurface = {
  id: string;
  participantIdentity?: string;
  name: string;
  local: boolean;
  source: "camera" | "screen";
  muted?: boolean;
  track?: LocalVideoTrack | RemoteVideoTrack;
  stream?: MediaStream;
  width?: number;
  height?: number;
  frameRate?: number;
};

interface Props {
  roomCode: string;
  agents: Agent[];
  onLocalStream?: (stream: MediaStream | null) => void;
  onSceneStreams?: (streams: MediaStream[]) => void;
  onVideoFeeds?: (feeds: LiveVideoFeed[]) => void;
  onCameraState?: (state: CaptureState) => void;
  programAudioStream?: MediaStream | null;
  onProgramAudioState?: (state: ProgramAudioState) => void;
  videoProfile?: StageVideoProfile;
  onCameraQuality?: (quality: StageVideoDiagnostics | null) => void;
  compact?: boolean;
}

function liveKitVideoConfig(profileId: StageVideoProfile) {
  const profile = stageVideoProfile(profileId);
  const capture = {
    facingMode: "user",
    frameRate: profile.frameRate,
    resolution: { width: profile.width, height: profile.height, frameRate: profile.frameRate },
  } satisfies VideoCaptureOptions;
  const publish = {
    simulcast: true,
    videoEncoding: { maxBitrate: profile.videoBitrate, maxFramerate: profile.frameRate },
    videoSimulcastLayers: [VideoPresets.h216, VideoPresets.h540],
  } satisfies TrackPublishOptions;
  return { capture, profile, publish };
}

function mediaDeviceMessage(error: unknown, device: "camera" | "microphone" = "camera") {
  const label = device === "camera" ? "Camera" : "Microphone";
  const action = device === "camera" ? "camera" : "microphone";
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return `${label} permission is blocked. Allow ${action} access in this site's browser settings, then retry.`;
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return `No usable ${action} was found on this device.`;
  if (name === "NotReadableError" || name === "TrackStartError") return `${label} is busy in another app or browser tab. Close it there, then retry.`;
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") return `${label} does not support the requested capture settings.`;
  if (name === "SecurityError") return `${label} access is disabled by this browser's site policy.`;
  if (name === "AbortError") return `${label} startup was interrupted. Retry the connection.`;
  return error instanceof Error && error.message ? `${label} could not open: ${error.message}` : `${label} could not be opened on this device.`;
}

function PodVideoTile({ surface }: { surface: VideoSurface }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (surface.track) surface.track.attach(element);
    else if (surface.stream) {
      element.srcObject = surface.stream;
      void element.play().catch(() => undefined);
    }
    return () => {
      surface.track?.detach(element);
      if (!surface.track) element.srcObject = null;
    };
  }, [surface]);
  const resolution = surface.width && surface.height ? ` / ${surface.width}x${surface.height}` : "";
  return <div className={`pod-video-tile ${surface.local ? "local" : "remote"} ${surface.source} ${surface.muted ? "muted" : ""}`}><video ref={ref} autoPlay muted={surface.local} playsInline/><span>{surface.source === "screen" ? surface.name.toUpperCase() : surface.local ? "YOU" : surface.name}{resolution}{surface.muted ? " / MUTED" : ""}</span></div>;
}

export function LiveKitPod({ roomCode, agents, onLocalStream, onSceneStreams, onVideoFeeds, onCameraState, programAudioStream, onProgramAudioState, videoProfile = "720p30", onCameraQuality, compact }: Props) {
  const safeRoom = roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64) || "LOCAL";
  const identity = useMemo(() => sessionStorage.getItem("amx_participant") || crypto.randomUUID().slice(0, 8), []);
  const videoConfig = useMemo(() => liveKitVideoConfig(videoProfile), [videoProfile]);
  const [status, setStatus] = useState<PodStatus>("idle");
  const [message, setMessage] = useState("Camera and room media are off");
  const [surfaces, setSurfaces] = useState<VideoSurface[]>([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [cameraState, setCameraState] = useState<CaptureState>("off");
  const [microphoneState, setMicrophoneState] = useState<CaptureState>("off");
  const [screenShareState, setScreenShareState] = useState<CaptureState>("off");
  const [playbackState, setPlaybackState] = useState<PlaybackState>("off");
  const [programAudioState, setProgramAudioState] = useState<ProgramAudioState>("off");
  const [connectionQuality, setConnectionQuality] = useState("unknown");
  const [activeSpeaker, setActiveSpeaker] = useState("");
  const roomRef = useRef<Room | null>(null);
  const fallbackStreamRef = useRef<MediaStream | null>(null);
  const programTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioHostRef = useRef<HTMLDivElement>(null);
  const onLocalStreamRef = useRef(onLocalStream);
  const onSceneStreamsRef = useRef(onSceneStreams);
  const onVideoFeedsRef = useRef(onVideoFeeds);
  const onProgramAudioStateRef = useRef(onProgramAudioState);
  const onCameraQualityRef = useRef(onCameraQuality);
  const appliedVideoProfileRef = useRef(videoProfile);
  useEffect(() => { onLocalStreamRef.current = onLocalStream; }, [onLocalStream]);
  useEffect(() => { onSceneStreamsRef.current = onSceneStreams; }, [onSceneStreams]);
  useEffect(() => { onVideoFeedsRef.current = onVideoFeeds; }, [onVideoFeeds]);
  useEffect(() => { onProgramAudioStateRef.current = onProgramAudioState; }, [onProgramAudioState]);
  useEffect(() => { onCameraQualityRef.current = onCameraQuality; }, [onCameraQuality]);
  useEffect(() => { onCameraState?.(cameraState); }, [cameraState, onCameraState]);
  useEffect(() => { sessionStorage.setItem("amx_participant", identity); }, [identity]);

  useEffect(() => {
    const feeds = surfaces.flatMap<LiveVideoFeed>((surface) => {
      const stream = surface.stream || (surface.track ? new MediaStream([surface.track.mediaStreamTrack]) : null);
      const settings = surface.track?.mediaStreamTrack.getSettings() || stream?.getVideoTracks()[0]?.getSettings();
      const diagnostics = stageVideoDiagnostics(settings);
      return stream ? [{ id: surface.id, participantIdentity: surface.participantIdentity, name: surface.name, local: surface.local, source: surface.source, stream, muted: Boolean(surface.muted), width: diagnostics.width, height: diagnostics.height, frameRate: diagnostics.frameRate }] : [];
    });
    onSceneStreamsRef.current?.(feeds.slice().sort((left, right) => Number(right.source === "screen") - Number(left.source === "screen")).map((feed) => feed.stream));
    onVideoFeedsRef.current?.(feeds);
    const camera = feeds.find((feed) => feed.local && feed.source === "camera" && !feed.muted);
    onCameraQualityRef.current?.(camera ? stageVideoDiagnostics(camera.stream.getVideoTracks()[0]?.getSettings()) : null);
  }, [surfaces]);

  const addVideoTrack = useCallback((track: LocalVideoTrack | RemoteVideoTrack, id: string, name: string, local: boolean, source: "camera" | "screen" = "camera", participantIdentity?: string) => {
    setSurfaces((current) => {
      const diagnostics = stageVideoDiagnostics(track.mediaStreamTrack.getSettings());
      const next = { id, participantIdentity, name, local, source, track, muted: track.isMuted, width: diagnostics.width, height: diagnostics.height, frameRate: diagnostics.frameRate };
      const index = current.findIndex((surface) => surface.id === id);
      if (index < 0) return [...current, next];
      return current.map((surface, surfaceIndex) => surfaceIndex === index ? next : surface);
    });
  }, []);

  const disconnect = useCallback(() => {
    fallbackStreamRef.current?.getTracks().forEach((track) => track.stop());
    fallbackStreamRef.current = null;
    void roomRef.current?.disconnect();
    roomRef.current = null;
    programTrackRef.current = null;
    setSurfaces([]);
    setParticipantCount(1);
    setCameraState("off");
    setMicrophoneState("off");
    setScreenShareState("off");
    setPlaybackState("off");
    setProgramAudioState("off");
    setConnectionQuality("unknown");
    setActiveSpeaker("");
    setStatus("idle");
    setMessage("Camera and room media are off");
    onLocalStreamRef.current?.(null);
    onSceneStreamsRef.current?.([]);
    onVideoFeedsRef.current?.([]);
    onProgramAudioStateRef.current?.("off");
    onCameraQualityRef.current?.(null);
  }, []);

  useEffect(() => disconnect, [disconnect]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const nextTrack = programAudioStream?.getAudioTracks().find((track) => track.readyState === "live") || null;
    if (programTrackRef.current === nextTrack) {
      const nextState: ProgramAudioState = nextTrack ? "published" : "off";
      setProgramAudioState(nextState);
      onProgramAudioStateRef.current?.(nextState);
      return;
    }
    let stale = false;
    void (async () => {
      const previousTrack = programTrackRef.current;
      if (previousTrack) await room.localParticipant.unpublishTrack(previousTrack, false);
      if (stale) return;
      programTrackRef.current = null;
      if (!nextTrack) {
        setProgramAudioState("off");
        onProgramAudioStateRef.current?.("off");
        return;
      }
      setProgramAudioState("publishing");
      onProgramAudioStateRef.current?.("publishing");
      try {
        await room.localParticipant.publishTrack(nextTrack, { name: "AMX Program Mix", source: Track.Source.Unknown, stream: "amx-stage-program" });
        if (stale) {
          await room.localParticipant.unpublishTrack(nextTrack, false);
          return;
        }
        programTrackRef.current = nextTrack;
        setProgramAudioState("published");
        onProgramAudioStateRef.current?.("published");
      } catch (error) {
        setProgramAudioState("blocked");
        onProgramAudioStateRef.current?.("blocked");
        setMessage(error instanceof Error ? `Program mix could not publish: ${error.message}` : "Program mix could not publish");
      }
    })();
    return () => { stale = true; };
  }, [programAudioStream, status]);

  const openLocalPreview = useCallback(async (reason?: string) => {
    fallbackStreamRef.current?.getTracks().forEach((track) => track.stop());
    fallbackStreamRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setMessage("Camera media is unavailable on this browser or insecure origin");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: videoConfig.profile.width },
          height: { ideal: videoConfig.profile.height },
          frameRate: { ideal: videoConfig.profile.frameRate },
        },
        audio: false,
      });
      const diagnostics = stageVideoDiagnostics(stream.getVideoTracks()[0]?.getSettings());
      fallbackStreamRef.current = stream;
      setSurfaces([{ id: stageFeedId(identity, "camera"), participantIdentity: identity, name: "You", local: true, source: "camera", stream, width: diagnostics.width, height: diagnostics.height, frameRate: diagnostics.frameRate }]);
      setStatus("local");
      setCameraState("published");
      setMicrophoneState("off");
      setMessage(reason || "Private local self-view is live");
      onLocalStreamRef.current?.(stream);
    } catch (error) {
      setStatus("error");
      setCameraState("blocked");
      setMessage(mediaDeviceMessage(error));
    }
  }, [identity, videoConfig.profile.frameRate, videoConfig.profile.height, videoConfig.profile.width]);

  const join = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setCameraState("blocked");
      setMicrophoneState("blocked");
      setMessage(window.isSecureContext ? "This browser does not expose camera capture. Open the HTTPS Stage in Quest Browser, Chrome, or Safari." : "Camera capture requires the HTTPS Stage URL.");
      return;
    }
    setStatus("connecting");
    setCameraState("requesting");
    setMicrophoneState("requesting");
    setMessage("Securing room token...");
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: safeRoom, identity, name: "AMX Explorer" }),
      });
      const credentials = await response.json().catch(() => ({})) as { serverUrl?: string; participantToken?: string; error?: string; agentDispatch?: { configured?: boolean; dispatched?: boolean; agentName?: string } };
      if (!response.ok || !credentials.serverUrl || !credentials.participantToken) {
        await openLocalPreview(response.status === 503 ? "Local self-view live; add LiveKit stage credentials for multi-user media" : credentials.error);
        return;
      }
      roomRef.current?.disconnect();
      const room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true, videoCaptureDefaults: videoConfig.capture, publishDefaults: videoConfig.publish });
      roomRef.current = room;
      const updateCount = () => setParticipantCount(countStageAudienceParticipants(room.remoteParticipants.values(), 1));
      room.on(RoomEvent.ParticipantConnected, updateCount);
      room.on(RoomEvent.ParticipantDisconnected, updateCount);
      room.on(RoomEvent.ParticipantMetadataChanged, updateCount);
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) {
          const screen = publication.source === Track.Source.ScreenShare;
          const source = screen ? "screen" : "camera";
          addVideoTrack(track as RemoteVideoTrack, stageFeedId(participant.identity, source), screen ? `${participant.name || participant.identity} / screen` : participant.name || participant.identity, false, source, participant.identity);
        }
        if (track.kind === Track.Kind.Audio && audioHostRef.current) audioHostRef.current.appendChild(track.attach());
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((element) => element.remove());
        setSurfaces((current) => current.filter((surface) => surface.track !== track));
      });
      room.on(RoomEvent.TrackMuted, (publication) => {
        setSurfaces((current) => current.map((surface) => surface.track === publication.track ? { ...surface, muted: true } : surface));
      });
      room.on(RoomEvent.TrackUnmuted, (publication) => {
        setSurfaces((current) => current.map((surface) => surface.track === publication.track ? { ...surface, muted: false } : surface));
      });
      room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source !== Track.Source.ScreenShare) return;
        setSurfaces((current) => current.filter((surface) => surface.source !== "screen" || !surface.local));
        setScreenShareState("off");
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeaker(speakers[0]?.name || speakers[0]?.identity || "");
      });
      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (participant === room.localParticipant) setConnectionQuality(String(quality));
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => setPlaybackState(room.canPlaybackAudio ? "ready" : "blocked"));
      room.on(RoomEvent.LocalAudioSilenceDetected, () => setMessage("Voice is published, but LiveKit is detecting silence from this microphone"));
      room.on(RoomEvent.MediaDevicesError, (mediaError) => setMessage(mediaDeviceMessage(mediaError)));
      room.on(RoomEvent.Reconnecting, () => {
        setStatus("connecting");
        setMessage("Reconnecting room media...");
      });
      room.on(RoomEvent.Reconnected, () => {
        setStatus("livekit");
        setMessage("LiveKit room reconnected");
        updateCount();
      });
      room.on(RoomEvent.Disconnected, () => {
        programTrackRef.current = null;
        setStatus("idle");
        setMessage("Room disconnected");
        setSurfaces([]);
        setCameraState("off");
        setMicrophoneState("off");
        setScreenShareState("off");
        setPlaybackState("off");
        setProgramAudioState("off");
        onLocalStreamRef.current?.(null);
        onProgramAudioStateRef.current?.("off");
      });
      await room.connect(credentials.serverUrl, credentials.participantToken);
      try {
        await room.startAudio();
        setPlaybackState(room.canPlaybackAudio ? "ready" : "blocked");
      } catch {
        setPlaybackState("blocked");
      }
      setMessage("Opening camera and microphone...");
      let cameraReady = false;
      let cameraIssue = "";
      try {
        appliedVideoProfileRef.current = videoProfile;
        await room.localParticipant.setCameraEnabled(true, videoConfig.capture, videoConfig.publish);
        const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
        const localTrack = publication?.videoTrack as LocalVideoTrack | undefined;
        if (localTrack) {
          cameraReady = true;
          localTrack.setPublishingQuality(VideoQuality.HIGH);
          addVideoTrack(localTrack, stageFeedId(identity, "camera"), "You", true, "camera", identity);
          onLocalStreamRef.current?.(new MediaStream([localTrack.mediaStreamTrack]));
        }
      } catch (error) {
        cameraReady = false;
        cameraIssue = mediaDeviceMessage(error);
      }
      setCameraState(cameraReady ? "published" : "blocked");
      let microphoneReady = false;
      let microphoneIssue = "";
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        const microphone = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        microphoneReady = Boolean(microphone?.audioTrack && !microphone.isMuted);
      } catch (error) {
        microphoneReady = false;
        microphoneIssue = mediaDeviceMessage(error, "microphone");
      }
      setMicrophoneState(microphoneReady ? "published" : "blocked");
      updateCount();
      setStatus("livekit");
      const agentState = credentials.agentDispatch?.dispatched ? ` / ${credentials.agentDispatch.agentName || "voice agent"} dispatched` : credentials.agentDispatch?.configured ? " / voice agent unavailable" : "";
      const voiceState = microphoneReady && room.canPlaybackAudio ? " / voice ready" : microphoneReady ? " / voice published; tap audio to listen" : ` / ${microphoneIssue || "microphone permission is off"}`;
      setMessage(`LiveKit room connected${agentState}${voiceState}${cameraReady ? "" : ` / ${cameraIssue || "camera permission is off; tap the camera button to retry"}`}`);
    } catch (error) {
      await openLocalPreview(error instanceof Error ? `Local self-view live; ${error.message}` : undefined);
    }
  }, [addVideoTrack, identity, openLocalPreview, safeRoom, videoConfig, videoProfile]);

  useEffect(() => {
    if (appliedVideoProfileRef.current === videoProfile) return;
    appliedVideoProfileRef.current = videoProfile;
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = publication?.videoTrack as LocalVideoTrack | undefined;
    if (!track || track.isMuted) return;
    let cancelled = false;
    setCameraState("requesting");
    void (async () => {
      try {
        await room.localParticipant.unpublishTrack(track, false);
        await track.restartTrack(videoConfig.capture);
        await room.localParticipant.publishTrack(track, videoConfig.publish);
        if (cancelled) return;
        track.setPublishingQuality(VideoQuality.HIGH);
        addVideoTrack(track, stageFeedId(identity, "camera"), "You", true, "camera", identity);
        onLocalStreamRef.current?.(new MediaStream([track.mediaStreamTrack]));
        setCameraState("published");
        setMessage(`${videoConfig.profile.label} camera profile is live`);
      } catch (error) {
        if (cancelled) return;
        setCameraState("blocked");
        setMessage(mediaDeviceMessage(error));
      }
    })();
    return () => { cancelled = true; };
  }, [addVideoTrack, identity, status, videoConfig, videoProfile]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const shouldEnable = microphoneState !== "published";
    setMicrophoneState("requesting");
    try {
      await room.localParticipant.setMicrophoneEnabled(shouldEnable);
      const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      setMicrophoneState(shouldEnable && publication?.audioTrack && !publication.isMuted ? "published" : "muted");
    } catch (error) {
      setMicrophoneState("blocked");
      setMessage(mediaDeviceMessage(error, "microphone"));
    }
  }, [microphoneState, status]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const shouldEnable = cameraState !== "published";
    setCameraState("requesting");
    try {
      await room.localParticipant.setCameraEnabled(shouldEnable, videoConfig.capture, videoConfig.publish);
      if (!shouldEnable) {
        setSurfaces((current) => current.filter((surface) => !surface.local || surface.source !== "camera"));
        onLocalStreamRef.current?.(null);
        setCameraState("muted");
        return;
      }
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const track = publication?.videoTrack as LocalVideoTrack | undefined;
      if (!track) throw new Error("Camera track was not published");
      track.setPublishingQuality(VideoQuality.HIGH);
      addVideoTrack(track, stageFeedId(identity, "camera"), "You", true, "camera", identity);
      onLocalStreamRef.current?.(new MediaStream([track.mediaStreamTrack]));
      setCameraState("published");
    } catch (error) {
      setCameraState("blocked");
      setMessage(mediaDeviceMessage(error));
    }
  }, [addVideoTrack, cameraState, identity, status, videoConfig]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const shouldEnable = screenShareState !== "published";
    setScreenShareState("requesting");
    try {
      await room.localParticipant.setScreenShareEnabled(shouldEnable, shouldEnable ? {
        audio: true,
        systemAudio: "include",
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
      } : undefined);
      if (!shouldEnable) {
        setSurfaces((current) => current.filter((surface) => surface.source !== "screen" || !surface.local));
        setScreenShareState("off");
        return;
      }
      const publication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      const track = publication?.videoTrack as LocalVideoTrack | undefined;
      if (!track) throw new Error("Screen-share track was not published");
      addVideoTrack(track, stageFeedId(identity, "screen"), "Your screen", true, "screen", identity);
      setScreenShareState("published");
      const audioPublication = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
      setMessage(`Screen share is live in the pod and routed to a Blender panel${audioPublication?.audioTrack ? " with shared audio" : "; enable tab or system audio in the share picker for the program mix"}`);
    } catch (error) {
      setScreenShareState("blocked");
      setMessage(error instanceof Error ? error.message : "Screen sharing is unavailable on this browser");
    }
  }, [addVideoTrack, identity, screenShareState, status]);

  const resumeAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try { await room.startAudio(); setPlaybackState(room.canPlaybackAudio ? "ready" : "blocked"); }
    catch { setPlaybackState("blocked"); }
  }, []);

  const live = status === "livekit" || status === "local";
  const cameraDiagnostics = surfaces.find((surface) => surface.local && surface.source === "camera" && !surface.muted);
  return <section className={`livekit-pod ${compact ? "compact" : ""}`} data-transport={status} data-camera-state={cameraState} data-microphone-state={microphoneState} data-screen-state={screenShareState} data-video-profile={videoProfile} data-camera-resolution={cameraDiagnostics?.width && cameraDiagnostics.height ? `${cameraDiagnostics.width}x${cameraDiagnostics.height}` : "pending"} data-video-feeds={surfaces.filter((surface) => !surface.muted).length}>
    <div className="livekit-pod-head"><div><span className="eyebrow">LIVEKIT ROOM / {safeRoom}</span><h2>Human + agent screens</h2></div><span className={`pod-transport ${status}`}><i/>{status === "livekit" ? "LIVEKIT" : status === "local" ? "LOCAL VIDEO" : status.toUpperCase()}</span></div>
    <div className="pod-screen-grid">
      {surfaces.length ? surfaces.map((surface) => <PodVideoTile key={surface.id} surface={surface}/>) : <div className="pod-camera-off"><CameraOff/><span>Your screen is private until you join</span></div>}
      {agents.slice(0, compact ? 2 : 3).map((agent) => <div className="pod-agent-screen" key={agent.id} style={{ "--agent-screen": agent.color } as React.CSSProperties}><span><Bot/></span><b>{agent.name}</b><small>{agent.role}</small><i>AGENT READY</i></div>)}
    </div>
    <div ref={audioHostRef} className="pod-audio-host"/>
    <div className="livekit-pod-foot">
      <div><span><Users/>{participantCount} human{participantCount === 1 ? "" : "s"}</span><span><Radio/>{agents.length} agents</span><span className={cameraState === "published" ? "media-ready" : ""}><Video/>{cameraDiagnostics?.width && cameraDiagnostics.height ? `${cameraDiagnostics.width}x${cameraDiagnostics.height}${cameraDiagnostics.frameRate ? ` ${cameraDiagnostics.frameRate}fps` : ""}` : videoConfig.profile.shortLabel}</span><span className={microphoneState === "published" ? "media-ready" : ""}>{microphoneState === "published" ? <Mic/> : <MicOff/>}{microphoneState === "published" ? "voice published" : microphoneState}</span><span className={playbackState === "ready" ? "media-ready" : ""}>{playbackState === "ready" ? <Volume2/> : <VolumeX/>}{playbackState === "ready" ? "audio ready" : playbackState}</span>{programAudioState !== "off" && <span className={programAudioState === "published" ? "media-ready" : ""}><Volume2/>{programAudioState === "published" ? "program mix" : programAudioState}</span>}{screenShareState === "published" && <span className="media-ready"><MonitorUp/>screen live</span>}{status === "livekit" && <span><Wifi/>{activeSpeaker ? `${activeSpeaker} speaking` : connectionQuality}</span>}</div>
      {live ? <div className="pod-media-actions">{status === "livekit" && <><button disabled={cameraState === "requesting"} onClick={() => void toggleCamera()} aria-label={cameraState === "published" ? "Turn camera off" : "Turn camera on"} title={cameraState === "published" ? "Turn camera off" : "Turn camera on"}>{cameraState === "published" ? <Camera/> : <CameraOff/>}</button><button disabled={microphoneState === "requesting"} onClick={() => void toggleMicrophone()} aria-label={microphoneState === "published" ? "Mute microphone" : "Unmute microphone"} title={microphoneState === "published" ? "Mute microphone" : "Unmute microphone"}>{microphoneState === "published" ? <Mic/> : <MicOff/>}</button><button disabled={screenShareState === "requesting"} onClick={() => void toggleScreenShare()} aria-label={screenShareState === "published" ? "Stop screen sharing" : "Share screen"} title={screenShareState === "published" ? "Stop screen sharing" : "Share screen"} className={screenShareState === "published" ? "active" : ""}><MonitorUp/></button>{playbackState === "blocked" && <button onClick={() => void resumeAudio()} aria-label="Resume room audio" title="Resume room audio"><Volume2/></button>}</>}<button className="button secondary" onClick={disconnect}><CameraOff/>Leave</button></div> : <button className="button primary" disabled={status === "connecting"} onClick={join}>{status === "connecting" ? <Radio/> : <Video/>}{status === "connecting" ? "Connecting" : status === "error" ? "Retry camera" : "Join pod"}</button>}
    </div>
    <p className="pod-status-message">{message}</p>
  </section>;
}
