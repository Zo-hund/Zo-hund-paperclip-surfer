import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Camera, CameraOff, Mic, MicOff, Radio, Users, Video, Volume2, VolumeX, Wifi } from "lucide-react";
import {
  LocalVideoTrack, RemoteVideoTrack, Room, RoomEvent, Track,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from "livekit-client";
import type { Agent } from "./data";

type PodStatus = "idle" | "connecting" | "livekit" | "local" | "error";
type CaptureState = "off" | "requesting" | "published" | "muted" | "blocked";
type PlaybackState = "off" | "ready" | "blocked";
type VideoSurface = {
  id: string;
  name: string;
  local: boolean;
  track?: LocalVideoTrack | RemoteVideoTrack;
  stream?: MediaStream;
};

interface Props {
  roomCode: string;
  agents: Agent[];
  onLocalStream?: (stream: MediaStream | null) => void;
  compact?: boolean;
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
  return <div className={`pod-video-tile ${surface.local ? "local" : "remote"}`}><video ref={ref} autoPlay muted={surface.local} playsInline/><span>{surface.local ? "YOU" : surface.name}</span></div>;
}

export function LiveKitPod({ roomCode, agents, onLocalStream, compact }: Props) {
  const safeRoom = roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64) || "LOCAL";
  const identity = useMemo(() => sessionStorage.getItem("amx_participant") || crypto.randomUUID().slice(0, 8), []);
  const [status, setStatus] = useState<PodStatus>("idle");
  const [message, setMessage] = useState("Camera and room media are off");
  const [surfaces, setSurfaces] = useState<VideoSurface[]>([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [cameraState, setCameraState] = useState<CaptureState>("off");
  const [microphoneState, setMicrophoneState] = useState<CaptureState>("off");
  const [playbackState, setPlaybackState] = useState<PlaybackState>("off");
  const [connectionQuality, setConnectionQuality] = useState("unknown");
  const [activeSpeaker, setActiveSpeaker] = useState("");
  const roomRef = useRef<Room | null>(null);
  const fallbackStreamRef = useRef<MediaStream | null>(null);
  const audioHostRef = useRef<HTMLDivElement>(null);
  const onLocalStreamRef = useRef(onLocalStream);
  useEffect(() => { onLocalStreamRef.current = onLocalStream; }, [onLocalStream]);
  useEffect(() => { sessionStorage.setItem("amx_participant", identity); }, [identity]);

  const addVideoTrack = useCallback((track: LocalVideoTrack | RemoteVideoTrack, id: string, name: string, local: boolean) => {
    setSurfaces((current) => [...current.filter((surface) => surface.id !== id), { id, name, local, track }]);
  }, []);

  const disconnect = useCallback(() => {
    fallbackStreamRef.current?.getTracks().forEach((track) => track.stop());
    fallbackStreamRef.current = null;
    void roomRef.current?.disconnect();
    roomRef.current = null;
    setSurfaces([]);
    setParticipantCount(1);
    setCameraState("off");
    setMicrophoneState("off");
    setPlaybackState("off");
    setConnectionQuality("unknown");
    setActiveSpeaker("");
    setStatus("idle");
    setMessage("Camera and room media are off");
    onLocalStreamRef.current?.(null);
  }, []);

  useEffect(() => disconnect, [disconnect]);

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
        video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      fallbackStreamRef.current = stream;
      setSurfaces([{ id: identity, name: "You", local: true, stream }]);
      setStatus("local");
      setCameraState("published");
      setMicrophoneState("off");
      setMessage(reason || "Private local self-view is live");
      onLocalStreamRef.current?.(stream);
    } catch (error) {
      setStatus("error");
      setCameraState("blocked");
      setMessage(error instanceof DOMException && error.name === "NotAllowedError" ? "Camera permission is blocked in this browser" : "No camera could be opened for this pod");
    }
  }, [identity]);

  const join = useCallback(async () => {
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
      const room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
      roomRef.current = room;
      const updateCount = () => setParticipantCount(room.remoteParticipants.size + 1);
      room.on(RoomEvent.ParticipantConnected, updateCount);
      room.on(RoomEvent.ParticipantDisconnected, updateCount);
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) addVideoTrack(track as RemoteVideoTrack, `${participant.identity}-${track.sid}`, participant.name || participant.identity, false);
        if (track.kind === Track.Kind.Audio && audioHostRef.current) audioHostRef.current.appendChild(track.attach());
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((element) => element.remove());
        setSurfaces((current) => current.filter((surface) => surface.track !== track));
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeaker(speakers[0]?.name || speakers[0]?.identity || "");
      });
      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (participant === room.localParticipant) setConnectionQuality(String(quality));
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => setPlaybackState(room.canPlaybackAudio ? "ready" : "blocked"));
      room.on(RoomEvent.LocalAudioSilenceDetected, () => setMessage("Voice is published, but LiveKit is detecting silence from this microphone"));
      room.on(RoomEvent.MediaDevicesError, (mediaError) => setMessage(`Media device error: ${mediaError.message}`));
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
        setStatus("idle");
        setMessage("Room disconnected");
        setSurfaces([]);
        setCameraState("off");
        setMicrophoneState("off");
        setPlaybackState("off");
        onLocalStreamRef.current?.(null);
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
      try {
        await room.localParticipant.setCameraEnabled(true);
        const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
        const localTrack = publication?.videoTrack as LocalVideoTrack | undefined;
        if (localTrack) {
          cameraReady = true;
          addVideoTrack(localTrack, identity, "You", true);
          onLocalStreamRef.current?.(new MediaStream([localTrack.mediaStreamTrack]));
        }
      } catch { cameraReady = false; }
      setCameraState(cameraReady ? "published" : "blocked");
      let microphoneReady = false;
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        const microphone = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        microphoneReady = Boolean(microphone?.audioTrack && !microphone.isMuted);
      } catch { microphoneReady = false; }
      setMicrophoneState(microphoneReady ? "published" : "blocked");
      setParticipantCount(room.remoteParticipants.size + 1);
      setStatus("livekit");
      const agentState = credentials.agentDispatch?.dispatched ? ` / ${credentials.agentDispatch.agentName || "voice agent"} dispatched` : credentials.agentDispatch?.configured ? " / voice agent unavailable" : "";
      const voiceState = microphoneReady && room.canPlaybackAudio ? " / voice ready" : microphoneReady ? " / voice published; tap audio to listen" : " / microphone permission is off";
      setMessage(`LiveKit room connected${agentState}${voiceState}${cameraReady ? "" : " / camera permission is off"}`);
    } catch (error) {
      await openLocalPreview(error instanceof Error ? `Local self-view live; ${error.message}` : undefined);
    }
  }, [addVideoTrack, identity, openLocalPreview, safeRoom]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const shouldEnable = microphoneState !== "published";
    setMicrophoneState("requesting");
    try {
      await room.localParticipant.setMicrophoneEnabled(shouldEnable);
      const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      setMicrophoneState(shouldEnable && publication?.audioTrack && !publication.isMuted ? "published" : "muted");
    } catch { setMicrophoneState("blocked"); }
  }, [microphoneState, status]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || status !== "livekit") return;
    const shouldEnable = cameraState !== "published";
    setCameraState("requesting");
    try {
      await room.localParticipant.setCameraEnabled(shouldEnable);
      if (!shouldEnable) {
        setSurfaces((current) => current.filter((surface) => !surface.local));
        onLocalStreamRef.current?.(null);
        setCameraState("muted");
        return;
      }
      const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
      const track = publication?.videoTrack as LocalVideoTrack | undefined;
      if (!track) throw new Error("Camera track was not published");
      addVideoTrack(track, identity, "You", true);
      onLocalStreamRef.current?.(new MediaStream([track.mediaStreamTrack]));
      setCameraState("published");
    } catch { setCameraState("blocked"); }
  }, [addVideoTrack, cameraState, identity, status]);

  const resumeAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try { await room.startAudio(); setPlaybackState(room.canPlaybackAudio ? "ready" : "blocked"); }
    catch { setPlaybackState("blocked"); }
  }, []);

  const live = status === "livekit" || status === "local";
  return <section className={`livekit-pod ${compact ? "compact" : ""}`}>
    <div className="livekit-pod-head"><div><span className="eyebrow">LIVEKIT ROOM / {safeRoom}</span><h2>Human + agent screens</h2></div><span className={`pod-transport ${status}`}><i/>{status === "livekit" ? "LIVEKIT" : status === "local" ? "LOCAL VIDEO" : status.toUpperCase()}</span></div>
    <div className="pod-screen-grid">
      {surfaces.length ? surfaces.map((surface) => <PodVideoTile key={surface.id} surface={surface}/>) : <div className="pod-camera-off"><CameraOff/><span>Your screen is private until you join</span></div>}
      {agents.slice(0, compact ? 2 : 3).map((agent) => <div className="pod-agent-screen" key={agent.id} style={{ "--agent-screen": agent.color } as React.CSSProperties}><span><Bot/></span><b>{agent.name}</b><small>{agent.role}</small><i>AGENT READY</i></div>)}
    </div>
    <div ref={audioHostRef} className="pod-audio-host"/>
    <div className="livekit-pod-foot"><div><span><Users/>{participantCount} human{participantCount === 1 ? "" : "s"}</span><span><Radio/>{agents.length} agents</span><span className={microphoneState === "published" ? "media-ready" : ""}>{microphoneState === "published" ? <Mic/> : <MicOff/>}{microphoneState === "published" ? "voice published" : microphoneState}</span><span className={playbackState === "ready" ? "media-ready" : ""}>{playbackState === "ready" ? <Volume2/> : <VolumeX/>}{playbackState === "ready" ? "audio ready" : playbackState}</span>{status === "livekit" && <span><Wifi/>{activeSpeaker ? `${activeSpeaker} speaking` : connectionQuality}</span>}</div>{live ? <div className="pod-media-actions">{status === "livekit" && <><button onClick={() => void toggleCamera()} aria-label={cameraState === "published" ? "Turn camera off" : "Turn camera on"} title={cameraState === "published" ? "Turn camera off" : "Turn camera on"}>{cameraState === "published" ? <Camera/> : <CameraOff/>}</button><button onClick={() => void toggleMicrophone()} aria-label={microphoneState === "published" ? "Mute microphone" : "Unmute microphone"} title={microphoneState === "published" ? "Mute microphone" : "Unmute microphone"}>{microphoneState === "published" ? <Mic/> : <MicOff/>}</button>{playbackState === "blocked" && <button onClick={() => void resumeAudio()} aria-label="Resume room audio" title="Resume room audio"><Volume2/></button>}</>}<button className="button secondary" onClick={disconnect}><CameraOff/>Leave</button></div> : <button className="button primary" disabled={status === "connecting"} onClick={join}>{status === "connecting" ? <Radio/> : <Video/>}{status === "connecting" ? "Connecting" : "Join pod"}</button>}</div>
    <p className="pod-status-message">{message}</p>
  </section>;
}
