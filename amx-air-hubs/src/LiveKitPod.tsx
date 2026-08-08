import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Camera, CameraOff, Mic, MicOff, MonitorUp, Radio, Send, Users, Video, Volume2, VolumeX, Wifi } from "lucide-react";
import {
  AudioPresets, LocalVideoTrack, RemoteVideoTrack, Room, RoomEvent, Track, VideoPresets, VideoQuality,
  type AudioCaptureOptions, type TrackPublishOptions, type VideoCaptureOptions,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from "livekit-client";
import type { Agent } from "./data";
import { sendAgentRequest } from "./agent-runtime";
import type { NpcCommand } from "./npc-controller";
import {
  decodeNexusRoomMessage, encodeNexusRoomMessage, isOperatorMetadata, isRoomCommunicatorMetadata, NEXUS_CHAT_TOPIC, NEXUS_CONTROL_TOPIC, NEXUS_SESSION_TOPIC,
  type NexusChatMessage, type NexusRoomControl, type NexusSessionMessage,
} from "./nexus-room-control";
import { countStageAudienceParticipants, stageFeedId } from "./stage-camera-routing";
import { stageVideoDiagnostics, stageVideoProfile, type StageVideoDiagnostics, type StageVideoProfile } from "./stage-video";
import type { StageSourceIdentity } from "./stage-source-identity";
import { normalizeStageAgentCommand, type StageAgentCommandResult } from "./stage-agent-toolbelt";

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
  track?: LocalVideoTrack | RemoteVideoTrack;
  identity?: StageSourceIdentity;
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
  clientType?: "operator" | "venue-member";
  participantName?: string;
  onLocalStream?: (stream: MediaStream | null) => void;
  onSceneStreams?: (streams: MediaStream[]) => void;
  onVideoFeeds?: (feeds: LiveVideoFeed[]) => void;
  onCameraState?: (state: CaptureState) => void;
  programAudioStream?: MediaStream | null;
  onProgramAudioState?: (state: ProgramAudioState) => void;
  microphoneEnabled?: boolean;
  microphoneGain?: number;
  onMicrophoneEnabledChange?: (enabled: boolean) => void;
  onMicrophoneState?: (state: CaptureState) => void;
  onVoiceLevel?: (level: number) => void;
  autoConnectProgram?: boolean;
  autoJoin?: boolean;
  videoProfile?: StageVideoProfile;
  onCameraQuality?: (quality: StageVideoDiagnostics | null) => void;
  onControlReady?: (control: NexusRoomControl | null) => void;
  onRemoteNpcCommand?: (command: NpcCommand, senderName: string) => void;
  onSessionMessage?: (message: NexusSessionMessage) => void;
  onProductionCommand?: (command: NonNullable<ReturnType<typeof normalizeStageAgentCommand>>) => Promise<StageAgentCommandResult> | StageAgentCommandResult;
  compact?: boolean;
}

type StudioVoiceEngine = {
  context: AudioContext;
  gain: GainNode;
  rawStream: MediaStream;
  outputTrack: MediaStreamTrack;
  meterTimer: number;
};

type PreparedVoiceAccess = Pick<StudioVoiceEngine, "context" | "rawStream">;

const STUDIO_VOICE_CAPTURE = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  latency: { ideal: 0.01 },
  noiseSuppression: true,
  sampleRate: { ideal: 48_000 },
  sampleSize: { ideal: 24 },
  voiceIsolation: true,
} satisfies AudioCaptureOptions;

async function prepareStudioVoiceAccess(): Promise<PreparedVoiceAccess> {
  const streamPromise = navigator.mediaDevices.getUserMedia({ audio: STUDIO_VOICE_CAPTURE, video: false });
  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    void streamPromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => undefined);
    throw new Error("Studio voice processing is unavailable in this browser");
  }
  const context = new AudioContextConstructor({ latencyHint: "interactive", sampleRate: 48_000 });
  try {
    const [rawStream] = await Promise.all([streamPromise, context.resume().then(() => streamPromise)]);
    return { context, rawStream };
  } catch (error) {
    void streamPromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => undefined);
    void context.close();
    throw error;
  }
}

function closePreparedVoiceAccess(access: PreparedVoiceAccess | null) {
  if (!access) return;
  access.rawStream.getTracks().forEach((track) => track.stop());
  void access.context.close();
}

async function createStudioVoiceEngine(gainPercent: number, onLevel: (level: number) => void, prepared?: PreparedVoiceAccess | null) {
  const rawStream = prepared?.rawStream || await navigator.mediaDevices.getUserMedia({ audio: STUDIO_VOICE_CAPTURE, video: false });
  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!prepared && !AudioContextConstructor) {
    rawStream.getTracks().forEach((track) => track.stop());
    throw new Error("Studio voice processing is unavailable in this browser");
  }
  const context = prepared?.context || new (AudioContextConstructor as typeof AudioContext)({ latencyHint: "interactive", sampleRate: 48_000 });
  await context.resume();
  const source = context.createMediaStreamSource(rawStream);
  const highPass = context.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 82;
  highPass.Q.value = 0.72;
  const presence = context.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3_200;
  presence.Q.value = 0.9;
  presence.gain.value = 2.2;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;
  const gain = context.createGain();
  gain.gain.value = Math.max(0, Math.min(1.2, gainPercent / 100));
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  const output = context.createMediaStreamDestination();
  source.connect(highPass).connect(presence).connect(compressor).connect(gain).connect(analyser).connect(output);
  const meterData = new Uint8Array(analyser.fftSize);
  const meterTimer = window.setInterval(() => {
    analyser.getByteTimeDomainData(meterData);
    let energy = 0;
    for (const sample of meterData) {
      const normalized = (sample - 128) / 128;
      energy += normalized * normalized;
    }
    onLevel(Math.min(1, Math.sqrt(energy / meterData.length) * 3.6));
  }, 100);
  const outputTrack = output.stream.getAudioTracks()[0];
  if (!outputTrack) {
    window.clearInterval(meterTimer);
    rawStream.getTracks().forEach((track) => track.stop());
    void context.close();
    throw new Error("Studio voice processor did not create an audio track");
  }
  return { context, gain, rawStream, outputTrack, meterTimer } satisfies StudioVoiceEngine;
}

function closeStudioVoiceEngine(engine: StudioVoiceEngine | null) {
  if (!engine) return;
  window.clearInterval(engine.meterTimer);
  engine.rawStream.getTracks().forEach((track) => track.stop());
  engine.outputTrack.stop();
  void engine.context.close();
}

function liveKitVideoConfig(profileId: StageVideoProfile, mobileEdge: boolean) {
  const profile = stageVideoProfile(profileId);
  const captureWidth = mobileEdge ? Math.min(profile.width, 960) : profile.width;
  const captureHeight = mobileEdge ? Math.min(profile.height, 540) : profile.height;
  const captureFrameRate = mobileEdge ? Math.min(profile.frameRate, 24) : profile.frameRate;
  const capture = {
    facingMode: "user",
    frameRate: captureFrameRate,
    resolution: { width: captureWidth, height: captureHeight, frameRate: captureFrameRate },
  } satisfies VideoCaptureOptions;
  const publish = {
    simulcast: true,
    videoEncoding: { maxBitrate: mobileEdge ? Math.min(profile.videoBitrate, 1_600_000) : profile.videoBitrate, maxFramerate: captureFrameRate },
    videoSimulcastLayers: mobileEdge ? [VideoPresets.h216] : [VideoPresets.h216, VideoPresets.h540],
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
  return <div className={`pod-video-tile ${surface.local ? "local" : "remote"} ${surface.source} ${surface.muted ? "muted" : ""}`}><video ref={ref} autoPlay muted={surface.local} playsInline preload="metadata" disablePictureInPicture/><span>{surface.source === "screen" ? surface.name.toUpperCase() : surface.local ? "YOU" : surface.name}{resolution}{surface.muted ? " / MUTED" : ""}</span></div>;
}

export function LiveKitPod({ roomCode, agents, clientType = "operator", participantName = "AMX Explorer", onLocalStream, onSceneStreams, onVideoFeeds, onCameraState, programAudioStream, onProgramAudioState, microphoneEnabled, microphoneGain = 82, onMicrophoneEnabledChange, onMicrophoneState, onVoiceLevel, autoConnectProgram = false, autoJoin = false, videoProfile = "720p30", onCameraQuality, onControlReady, onRemoteNpcCommand, onSessionMessage, onProductionCommand, compact }: Props) {
  const safeRoom = roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64) || "LOCAL";
  const identity = useMemo(() => sessionStorage.getItem("amx_participant") || crypto.randomUUID().slice(0, 8), []);
  const mobileEdge = useMemo(() => window.matchMedia("(max-width: 760px), (pointer: coarse)").matches, []);
  const videoConfig = useMemo(() => liveKitVideoConfig(videoProfile, mobileEdge), [mobileEdge, videoProfile]);
  const guideAgent = useMemo(() => agents.find((agent) => agent.id === "jaz") || agents[0], [agents]);
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
  const [participantNames, setParticipantNames] = useState<string[]>(["You"]);
  const [chatMessages, setChatMessages] = useState<NexusChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [agentReplying, setAgentReplying] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const fallbackStreamRef = useRef<MediaStream | null>(null);
  const programTrackRef = useRef<MediaStreamTrack | null>(null);
  const voiceEngineRef = useRef<StudioVoiceEngine | null>(null);
  const audioHostRef = useRef<HTMLDivElement>(null);
  const onLocalStreamRef = useRef(onLocalStream);
  const onSceneStreamsRef = useRef(onSceneStreams);
  const onVideoFeedsRef = useRef(onVideoFeeds);
  const onProgramAudioStateRef = useRef(onProgramAudioState);
  const onCameraQualityRef = useRef(onCameraQuality);
  const onMicrophoneStateRef = useRef(onMicrophoneState);
  const onVoiceLevelRef = useRef(onVoiceLevel);
  const onControlReadyRef = useRef(onControlReady);
  const onRemoteNpcCommandRef = useRef(onRemoteNpcCommand);
  const onSessionMessageRef = useRef(onSessionMessage);
  const onProductionCommandRef = useRef(onProductionCommand);
  const agentsRef = useRef(agents);
  const receivedRoomMessageIdsRef = useRef(new Set<string>());
  const appliedVideoProfileRef = useRef(videoProfile);
  useEffect(() => { onLocalStreamRef.current = onLocalStream; }, [onLocalStream]);
  useEffect(() => { onSceneStreamsRef.current = onSceneStreams; }, [onSceneStreams]);
  useEffect(() => { onVideoFeedsRef.current = onVideoFeeds; }, [onVideoFeeds]);
  useEffect(() => { onProgramAudioStateRef.current = onProgramAudioState; }, [onProgramAudioState]);
  useEffect(() => { onCameraQualityRef.current = onCameraQuality; }, [onCameraQuality]);
  useEffect(() => { onMicrophoneStateRef.current = onMicrophoneState; }, [onMicrophoneState]);
  useEffect(() => { onVoiceLevelRef.current = onVoiceLevel; }, [onVoiceLevel]);
  useEffect(() => { onControlReadyRef.current = onControlReady; }, [onControlReady]);
  useEffect(() => { onRemoteNpcCommandRef.current = onRemoteNpcCommand; }, [onRemoteNpcCommand]);
  useEffect(() => { onSessionMessageRef.current = onSessionMessage; }, [onSessionMessage]);
  useEffect(() => { onProductionCommandRef.current = onProductionCommand; }, [onProductionCommand]);
  useEffect(() => { agentsRef.current = agents; }, [agents]);
  useEffect(() => { onCameraState?.(cameraState); }, [cameraState, onCameraState]);
  useEffect(() => { onMicrophoneStateRef.current?.(microphoneState); }, [microphoneState]);
  useEffect(() => { sessionStorage.setItem("amx_participant", identity); }, [identity]);

  useEffect(() => {
    const feeds = surfaces.flatMap<LiveVideoFeed>((surface) => {
      const stream = surface.stream || (surface.track ? new MediaStream([surface.track.mediaStreamTrack]) : null);
      const settings = surface.track?.mediaStreamTrack.getSettings() || stream?.getVideoTracks()[0]?.getSettings();
      const diagnostics = stageVideoDiagnostics(settings);
      return stream ? [{ id: surface.id, participantIdentity: surface.participantIdentity, name: surface.name, local: surface.local, source: surface.source, stream, muted: Boolean(surface.muted), width: diagnostics.width, height: diagnostics.height, frameRate: diagnostics.frameRate, track: surface.track }] : [];
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
    onControlReadyRef.current?.(null);
    fallbackStreamRef.current?.getTracks().forEach((track) => track.stop());
    fallbackStreamRef.current = null;
    roomRef.current?.unregisterRpcMethod("production_control");
    void roomRef.current?.disconnect();
    roomRef.current = null;
    programTrackRef.current = null;
    closeStudioVoiceEngine(voiceEngineRef.current);
    voiceEngineRef.current = null;
    setSurfaces([]);
    setParticipantCount(1);
    setCameraState("off");
    setMicrophoneState("off");
    setScreenShareState("off");
    setPlaybackState("off");
    setProgramAudioState("off");
    setConnectionQuality("unknown");
    setActiveSpeaker("");
    setParticipantNames(["You"]);
    setStatus("idle");
    setMessage("Camera and room media are off");
    onLocalStreamRef.current?.(null);
    onSceneStreamsRef.current?.([]);
    onVideoFeedsRef.current?.([]);
    onProgramAudioStateRef.current?.("off");
    onCameraQualityRef.current?.(null);
    onVoiceLevelRef.current?.(0);
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
        await room.localParticipant.publishTrack(nextTrack, {
          name: "AMX Program Mix",
          source: Track.Source.Unknown,
          stream: "amx-stage-program",
          audioPreset: AudioPresets.musicHighQualityStereo,
          dtx: false,
          forceStereo: true,
          red: true,
        });
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

  const join = useCallback(async (programOnly = false) => {
    if (!programOnly && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)) {
      setStatus("error");
      setCameraState("blocked");
      setMicrophoneState("blocked");
      setMessage(window.isSecureContext ? "This browser does not expose camera capture. Open the HTTPS Stage in Quest Browser, Chrome, or Safari." : "Camera capture requires the HTTPS Stage URL.");
      return;
    }
    let preparedVoice: PreparedVoiceAccess | null = null;
    let preparedVoiceIssue = "";
    if (!programOnly) {
      try { preparedVoice = await prepareStudioVoiceAccess(); }
      catch (error) { preparedVoiceIssue = mediaDeviceMessage(error, "microphone"); }
    }
    setStatus("connecting");
    setCameraState(programOnly ? "off" : "requesting");
    setMicrophoneState(programOnly ? "off" : "requesting");
    setMessage("Securing room token...");
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: safeRoom, identity, name: participantName, clientType }),
      });
      const credentials = await response.json().catch(() => ({})) as { serverUrl?: string; participantToken?: string; error?: string; agentDispatch?: { configured?: boolean; dispatched?: boolean; agentName?: string } };
      if (!response.ok || !credentials.serverUrl || !credentials.participantToken) {
        if (programOnly) {
          setStatus("error");
          setProgramAudioState("blocked");
          onProgramAudioStateRef.current?.("blocked");
          setMessage(response.status === 503 ? "LiveKit credentials are required to publish the studio program bus" : credentials.error || "Studio program bus could not connect");
          return;
        }
        await openLocalPreview(response.status === 503 ? "Local self-view live; add LiveKit stage credentials for multi-user media" : credentials.error);
        closePreparedVoiceAccess(preparedVoice);
        preparedVoice = null;
        return;
      }
      roomRef.current?.disconnect();
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        webAudioMix: true,
        audioCaptureDefaults: STUDIO_VOICE_CAPTURE,
        videoCaptureDefaults: videoConfig.capture,
        publishDefaults: {
          ...videoConfig.publish,
          audioPreset: AudioPresets.musicHighQuality,
          dtx: false,
          forceStereo: false,
          red: true,
        },
      });
      roomRef.current = room;
      const updateCount = () => {
        setParticipantCount(countStageAudienceParticipants(room.remoteParticipants.values(), 1));
        setParticipantNames(["You", ...Array.from(room.remoteParticipants.values()).map((participant) => participant.name || participant.identity).slice(0, 12)]);
      };
      room.on(RoomEvent.ParticipantConnected, updateCount);
      room.on(RoomEvent.ParticipantDisconnected, updateCount);
      room.on(RoomEvent.ParticipantMetadataChanged, updateCount);
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (!participant) return;
        const roomMessage = decodeNexusRoomMessage(payload);
        if (!roomMessage || roomMessage.senderId !== participant.identity) return;
        if (receivedRoomMessageIdsRef.current.has(roomMessage.id)) return;
        receivedRoomMessageIdsRef.current.add(roomMessage.id);
        if (receivedRoomMessageIdsRef.current.size > 200) receivedRoomMessageIdsRef.current.delete(receivedRoomMessageIdsRef.current.values().next().value as string);
        if (topic === NEXUS_CONTROL_TOPIC && roomMessage.kind === "npc-command" && isOperatorMetadata(participant.metadata)) {
          onRemoteNpcCommandRef.current?.(roomMessage.command, participant.name || participant.identity);
        }
        if (topic === NEXUS_CHAT_TOPIC && roomMessage.kind === "chat" && isRoomCommunicatorMetadata(participant.metadata)) {
          const delegatedAgent = roomMessage.agentId ? agentsRef.current.find((agent) => agent.id === roomMessage.agentId) : undefined;
          setChatMessages((current) => [...current, { ...roomMessage, senderName: delegatedAgent?.name || participant.name || roomMessage.senderName }].slice(-50));
        }
        if (topic === NEXUS_SESSION_TOPIC && (roomMessage.kind === "session-request" || roomMessage.kind === "session-state") && isRoomCommunicatorMetadata(participant.metadata)) {
          onSessionMessageRef.current?.({ ...roomMessage, senderName: participant.name || roomMessage.senderName });
        }
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) {
          const screen = publication.source === Track.Source.ScreenShare;
          const source = screen ? "screen" : "camera";
          addVideoTrack(track as RemoteVideoTrack, stageFeedId(participant.identity, source), screen ? `${participant.name || participant.identity} / screen` : participant.name || participant.identity, false, source, participant.identity);
        }
        if (track.kind === Track.Kind.Audio && audioHostRef.current) {
          const element = track.attach();
          element.autoplay = true;
          element.preload = "auto";
          element.setAttribute("playsinline", "");
          audioHostRef.current.appendChild(element);
          void element.play().catch(() => setPlaybackState("blocked"));
        }
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
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setPlaybackState(room.canPlaybackAudio ? "ready" : "blocked");
        if (!room.canPlaybackAudio) setMessage("Tap the speaker control to enable room sound on this device");
      });
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
        onControlReadyRef.current?.(null);
        programTrackRef.current = null;
        closeStudioVoiceEngine(voiceEngineRef.current);
        voiceEngineRef.current = null;
        onVoiceLevelRef.current?.(0);
        setStatus("idle");
        setMessage("Room disconnected");
        setSurfaces([]);
        setCameraState("off");
        setMicrophoneState("off");
        setScreenShareState("off");
        setPlaybackState("off");
        setProgramAudioState("off");
        setParticipantNames(["You"]);
        onLocalStreamRef.current?.(null);
        onProgramAudioStateRef.current?.("off");
      });
      await room.connect(credentials.serverUrl, credentials.participantToken);
      if (clientType === "operator" && onProductionCommandRef.current) {
        room.registerRpcMethod("production_control", async ({ callerIdentity, payload }) => {
          const caller = room.remoteParticipants.get(callerIdentity);
          if (!caller?.isAgent) return JSON.stringify({ ok: false, status: "rejected", message: "Only a connected LiveKit agent can call production controls." });
          const parsed = (() => { try { return JSON.parse(payload) as unknown; } catch { return null; } })();
          const command = normalizeStageAgentCommand(parsed, safeRoom);
          if (!command) return JSON.stringify({ ok: false, status: "rejected", message: "Invalid production command." });
          const result = await onProductionCommandRef.current?.({ ...command, requestedBy: caller.name || caller.identity });
          if (!result) return JSON.stringify({ ok: false, status: "rejected", message: "Stage operator is unavailable." });
          return JSON.stringify({ ok: result.ok, status: result.status, message: result.message });
        });
      }
      onControlReadyRef.current?.({
        connected: true,
        sendNpcCommand: async (command) => {
          if (roomRef.current !== room) return false;
          await room.localParticipant.publishData(encodeNexusRoomMessage({
            id: crypto.randomUUID(), kind: "npc-command", senderId: identity, sentAt: Date.now(), command,
          }), { reliable: true, topic: NEXUS_CONTROL_TOPIC });
          return true;
        },
        sendSessionMessage: async (message) => {
          if (roomRef.current !== room) return false;
          await room.localParticipant.publishData(encodeNexusRoomMessage({
            ...message, id: crypto.randomUUID(), senderId: identity, sentAt: Date.now(),
          }), { reliable: true, topic: NEXUS_SESSION_TOPIC });
          return true;
        },
      });
      try {
        await room.startAudio();
        setPlaybackState(room.canPlaybackAudio ? "ready" : "blocked");
      } catch {
        setPlaybackState("blocked");
      }
      if (programOnly) {
        updateCount();
        setStatus("livekit");
        setMessage("Studio program bus connected to the LiveKit room");
        return;
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
          localTrack.setPublishingQuality(mobileEdge ? VideoQuality.MEDIUM : VideoQuality.HIGH);
          addVideoTrack(localTrack, stageFeedId(identity, "camera"), "You", true, "camera", identity);
          onLocalStreamRef.current?.(new MediaStream([localTrack.mediaStreamTrack]));
        }
      } catch (error) {
        cameraReady = false;
        cameraIssue = mediaDeviceMessage(error);
      }
      setCameraState(cameraReady ? "published" : "blocked");
      let microphoneReady = false;
      let microphonePublished = false;
      let microphoneIssue = "";
      try {
        closeStudioVoiceEngine(voiceEngineRef.current);
        const voiceEngine = await createStudioVoiceEngine(microphoneGain, (level) => onVoiceLevelRef.current?.(level), preparedVoice);
        preparedVoice = null;
        voiceEngineRef.current = voiceEngine;
        await room.localParticipant.publishTrack(voiceEngine.outputTrack, {
          name: "AMX Studio Voice",
          source: Track.Source.Microphone,
          audioPreset: AudioPresets.musicHighQuality,
          dtx: false,
          forceStereo: false,
          red: true,
        });
        const microphone = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (microphoneEnabled === false) await microphone?.audioTrack?.mute();
        microphonePublished = Boolean(microphone?.audioTrack);
        microphoneReady = Boolean(microphone?.audioTrack && !microphone.isMuted && microphoneEnabled !== false);
      } catch (error) {
        closeStudioVoiceEngine(voiceEngineRef.current);
        voiceEngineRef.current = null;
        closePreparedVoiceAccess(preparedVoice);
        preparedVoice = null;
        onVoiceLevelRef.current?.(0);
        microphoneReady = false;
        microphoneIssue = preparedVoiceIssue || mediaDeviceMessage(error, "microphone");
      }
      setMicrophoneState(microphoneReady ? "published" : microphonePublished && microphoneEnabled === false ? "muted" : "blocked");
      updateCount();
      setStatus("livekit");
      const agentState = credentials.agentDispatch?.dispatched ? ` / ${credentials.agentDispatch.agentName || "voice agent"} dispatched` : credentials.agentDispatch?.configured ? " / voice agent unavailable" : "";
      const voiceState = microphoneReady && room.canPlaybackAudio ? " / voice ready" : microphoneReady ? " / voice published; tap audio to listen" : ` / ${microphoneIssue || "microphone permission is off"}`;
      setMessage(`LiveKit room connected${agentState}${voiceState}${cameraReady ? "" : ` / ${cameraIssue || "camera permission is off; tap the camera button to retry"}`}`);
    } catch (error) {
      closePreparedVoiceAccess(preparedVoice);
      preparedVoice = null;
      if (programOnly) {
        const failedRoom = roomRef.current;
        roomRef.current = null;
        failedRoom?.removeAllListeners();
        void failedRoom?.disconnect();
        setStatus("error");
        setProgramAudioState("blocked");
        onProgramAudioStateRef.current?.("blocked");
        setMessage(error instanceof Error ? `Studio program bus could not connect: ${error.message}` : "Studio program bus could not connect");
        return;
      }
      await openLocalPreview(error instanceof Error ? `Local self-view live; ${error.message}` : undefined);
    }
  }, [addVideoTrack, clientType, identity, microphoneEnabled, microphoneGain, mobileEdge, openLocalPreview, participantName, safeRoom, videoConfig, videoProfile]);

  useEffect(() => {
    if (!autoConnectProgram || programAudioStream || status !== "error") return;
    setStatus("idle");
    setProgramAudioState("off");
    onProgramAudioStateRef.current?.("off");
    setMessage("Studio program bus ready to reconnect");
  }, [autoConnectProgram, programAudioStream, status]);

  useEffect(() => {
    if (!autoConnectProgram || !programAudioStream || status !== "idle") return;
    void join(true);
  }, [autoConnectProgram, join, programAudioStream, status]);

  useEffect(() => {
    if (!autoJoin || status !== "idle") return;
    void join(false);
  }, [autoJoin, join, status]);

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

  useEffect(() => {
    const engine = voiceEngineRef.current;
    if (engine) engine.gain.gain.setTargetAtTime(Math.max(0, Math.min(1.2, microphoneGain / 100)), engine.context.currentTime, 0.04);
  }, [microphoneGain]);

  useEffect(() => {
    if (microphoneEnabled === undefined) return;
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = publication?.audioTrack;
    if (!track || microphoneState === "requesting") return;
    let cancelled = false;
    setMicrophoneState("requesting");
    void (microphoneEnabled ? track.unmute() : track.mute())
      .then(() => { if (!cancelled) setMicrophoneState(microphoneEnabled ? "published" : "muted"); })
      .catch((error) => {
        if (cancelled) return;
        setMicrophoneState("blocked");
        setMessage(mediaDeviceMessage(error, "microphone"));
      });
    return () => { cancelled = true; };
  }, [microphoneEnabled, status]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const shouldEnable = microphoneState !== "published";
    if (onMicrophoneEnabledChange) {
      onMicrophoneEnabledChange(shouldEnable);
      return;
    }
    setMicrophoneState("requesting");
    try {
      let publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (shouldEnable && !publication?.audioTrack) {
        closeStudioVoiceEngine(voiceEngineRef.current);
        const voiceEngine = await createStudioVoiceEngine(microphoneGain, (level) => onVoiceLevelRef.current?.(level));
        voiceEngineRef.current = voiceEngine;
        await room.localParticipant.publishTrack(voiceEngine.outputTrack, {
          name: "AMX Studio Voice",
          source: Track.Source.Microphone,
          audioPreset: AudioPresets.musicHighQuality,
          dtx: false,
          forceStereo: false,
          red: true,
        });
        publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      }
      if (!publication?.audioTrack) throw new Error("Studio voice track is unavailable");
      await (shouldEnable ? publication.audioTrack.unmute() : publication.audioTrack.mute());
      setMicrophoneState(shouldEnable ? "published" : "muted");
    } catch (error) {
      setMicrophoneState("blocked");
      setMessage(mediaDeviceMessage(error, "microphone"));
    }
  }, [microphoneGain, microphoneState, onMicrophoneEnabledChange, status]);

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
    try {
      const elements = [...(audioHostRef.current?.querySelectorAll("audio") || [])];
      const roomStart = room.startAudio();
      const elementStarts = elements.map((element) => {
        element.autoplay = true;
        element.muted = false;
        element.volume = 1;
        return element.play();
      });
      const [roomResult, ...elementResults] = await Promise.allSettled([roomStart, ...elementStarts]);
      const elementsReady = elements.length === 0 || elementResults.some((result) => result.status === "fulfilled");
      const ready = roomResult.status === "fulfilled" && room.canPlaybackAudio && elementsReady;
      setPlaybackState(ready ? "ready" : "blocked");
      setMessage(ready ? "Room sound is on" : "Tap the speaker control again after allowing audio playback");
    } catch {
      setPlaybackState("blocked");
      setMessage("Room sound is blocked by this browser");
    }
  }, []);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim().slice(0, 500);
    const room = roomRef.current;
    if (!text || agentReplying || !guideAgent) return;
    const chat: NexusChatMessage = {
      id: crypto.randomUUID(), kind: "chat", senderId: identity, senderName: "AMX Explorer", text, sentAt: Date.now(),
    };
    setChatMessages((current) => [...current, chat].slice(-50));
    setChatInput("");
    setAgentReplying(true);
    try {
      if (room && status === "livekit") await room.localParticipant.publishData(encodeNexusRoomMessage(chat), { reliable: true, topic: NEXUS_CHAT_TOPIC });
      const response = await sendAgentRequest(guideAgent, text, [], "text");
      const agentChat: NexusChatMessage = {
        id: crypto.randomUUID(), kind: "chat", senderId: identity, senderName: guideAgent.name, agentId: guideAgent.id,
        text: response.text.slice(0, 500), sentAt: Date.now(),
      };
      setChatMessages((current) => [...current, agentChat].slice(-50));
      if (room && status === "livekit") await room.localParticipant.publishData(encodeNexusRoomMessage(agentChat), { reliable: true, topic: NEXUS_CHAT_TOPIC });
      setMessage(`${guideAgent.name} responded${status === "livekit" ? " and shared the answer with the room" : " in mobile direct mode"}`);
    } catch (error) {
      setMessage(error instanceof Error ? `${guideAgent.name} could not respond: ${error.message}` : `${guideAgent.name} could not respond`);
    } finally {
      setAgentReplying(false);
    }
  }, [agentReplying, chatInput, guideAgent, identity, status]);

  const live = status === "livekit" || status === "local";
  const cameraDiagnostics = surfaces.find((surface) => surface.local && surface.source === "camera" && !surface.muted);
  return <section className={`livekit-pod ${compact ? "compact" : ""}`} data-transport={status} data-camera-state={cameraState} data-microphone-state={microphoneState} data-voice-profile="studio-48khz" data-screen-state={screenShareState} data-video-profile={videoProfile} data-edge-profile={mobileEdge ? "mobile" : "desktop"} data-camera-resolution={cameraDiagnostics?.width && cameraDiagnostics.height ? `${cameraDiagnostics.width}x${cameraDiagnostics.height}` : "pending"} data-video-feeds={surfaces.filter((surface) => !surface.muted).length}>
    <div className="livekit-pod-head"><div><span className="eyebrow">LIVEKIT ROOM / {safeRoom}</span><h2>Human + agent screens</h2></div><span className={`pod-transport ${status}`}><i/>{status === "livekit" ? cameraState === "off" && microphoneState === "off" ? "PROGRAM BUS" : "LIVEKIT" : status === "local" ? "LOCAL VIDEO" : status.toUpperCase()}</span></div>
    <div className="pod-screen-grid">
      {surfaces.length ? surfaces.map((surface) => <PodVideoTile key={surface.id} surface={surface}/>) : <div className="pod-camera-off"><CameraOff/><span>Your screen is private until you join</span></div>}
      {agents.slice(0, compact ? 2 : 3).map((agent) => <div className="pod-agent-screen" key={agent.id} style={{ "--agent-screen": agent.color } as React.CSSProperties}><span><Bot/></span><b>{agent.name}</b><small>{agent.role}</small><i>AGENT READY</i></div>)}
    </div>
    <div className="pod-comms" data-connected={status === "livekit"}>
      <header><span><Wifi/><b>METAVERSE COMMS</b></span><small>{participantNames.join(" / ")}</small></header>
      <div className="pod-chat-log" aria-live="polite">
        {chatMessages.length ? chatMessages.slice(-6).map((chat) => <p className={chat.agentId ? "agent" : ""} key={chat.id}><b>{chat.agentId ? chat.senderName : chat.senderId === identity ? "YOU" : chat.senderName}</b><span>{chat.text}</span></p>) : <p className="empty"><span>Ask JAZ by text now, or join the room for voice, video, and multiplayer communications.</span></p>}
        {agentReplying && <p className="agent thinking"><b>{guideAgent?.name || "JAZ"}</b><span>Preparing a response...</span></p>}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void sendChat(); }}><input aria-label="Ask JAZ or message the room" maxLength={500} disabled={agentReplying} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={status === "livekit" ? "Ask JAZ or message the room" : "Ask JAZ by text"}/><button aria-label="Send to JAZ" title="Send to JAZ" disabled={agentReplying || !chatInput.trim()}><Send/></button></form>
    </div>
    <div ref={audioHostRef} className="pod-audio-host"/>
    <div className="livekit-pod-foot">
      <div><span><Users/>{participantCount} human{participantCount === 1 ? "" : "s"}</span><span><Radio/>{agents.length} agents</span><span className={cameraState === "published" ? "media-ready" : ""}><Video/>{cameraDiagnostics?.width && cameraDiagnostics.height ? `${cameraDiagnostics.width}x${cameraDiagnostics.height}${cameraDiagnostics.frameRate ? ` ${cameraDiagnostics.frameRate}fps` : ""}` : videoConfig.profile.shortLabel}</span><span className={microphoneState === "published" ? "media-ready" : ""}>{microphoneState === "published" ? <Mic/> : <MicOff/>}{microphoneState === "published" ? "studio voice" : microphoneState}</span><span className={playbackState === "ready" ? "media-ready" : ""}>{playbackState === "ready" ? <Volume2/> : <VolumeX/>}{playbackState === "ready" ? "audio ready" : playbackState}</span>{programAudioState !== "off" && <span className={programAudioState === "published" ? "media-ready" : ""}><Volume2/>{programAudioState === "published" ? "program mix" : programAudioState}</span>}{screenShareState === "published" && <span className="media-ready"><MonitorUp/>screen live</span>}{status === "livekit" && <span><Wifi/>{activeSpeaker ? `${activeSpeaker} speaking` : connectionQuality}</span>}</div>
      {live ? <div className="pod-media-actions">{status === "livekit" && <><button disabled={cameraState === "requesting"} onClick={() => void toggleCamera()} aria-label={cameraState === "published" ? "Turn camera off" : "Turn camera on"} title={cameraState === "published" ? "Turn camera off" : "Turn camera on"}>{cameraState === "published" ? <Camera/> : <CameraOff/>}</button><button disabled={microphoneState === "requesting"} onClick={() => void toggleMicrophone()} aria-label={microphoneState === "published" ? "Mute microphone" : "Unmute microphone"} title={microphoneState === "published" ? "Mute microphone" : "Unmute microphone"}>{microphoneState === "published" ? <Mic/> : <MicOff/>}</button><button disabled={screenShareState === "requesting"} onClick={() => void toggleScreenShare()} aria-label={screenShareState === "published" ? "Stop screen sharing" : "Share screen"} title={screenShareState === "published" ? "Stop screen sharing" : "Share screen"} className={screenShareState === "published" ? "active" : ""}><MonitorUp/></button>{playbackState === "blocked" && <button onClick={() => void resumeAudio()} aria-label="Resume room audio" title="Resume room audio"><Volume2/></button>}</>}<button className="button secondary" onClick={disconnect}><CameraOff/>Leave</button></div> : <button className="button primary" disabled={status === "connecting"} onClick={() => void join(false)}>{status === "connecting" ? <Radio/> : <Video/>}{status === "connecting" ? "Connecting" : status === "error" ? "Retry camera" : "Join pod"}</button>}
    </div>
    <p className="pod-status-message">{message}</p>
  </section>;
}
