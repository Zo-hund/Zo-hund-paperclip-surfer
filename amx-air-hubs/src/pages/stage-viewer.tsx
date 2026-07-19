import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Clapperboard, Maximize2, MonitorPlay, Radio, Share2, Users, Volume2, VolumeX, Wifi } from "lucide-react";
import {
  RemoteVideoTrack, Room, RoomEvent, Track,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from "livekit-client";
import { useParams } from "react-router-dom";
import type { LiveVideoFeed } from "../LiveKitPod";
import { useStageProduction, type StageShot } from "../stage-production";
import { stageSeatCounts } from "../stage-events";
import type { RendererBackend } from "../webgpu";

const AMXXRStageScene = lazy(async () => ({ default: (await import("../AMXXRStageScene")).AMXXRStageScene }));

type ViewerStatus = "connecting" | "live" | "venue-only" | "offline";
type ViewerMode = "program" | "venue";

interface ViewerFeed extends LiveVideoFeed {
  participantIdentity: string;
  track: RemoteVideoTrack;
}

const SHOT_INDEX: Record<StageShot, number> = { wide: 0, host: 1, audience: 2, crane: 3 };

function ViewerProgramVideo({ feed }: { feed: ViewerFeed }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    feed.track.attach(video);
    void video.play().catch(() => undefined);
    return () => { feed.track.detach(video); };
  }, [feed]);
  return <video ref={ref} className="stage-viewer-video" autoPlay muted playsInline/>;
}

export function StageLiveViewerPage() {
  const params = useParams();
  const roomCode = String(params.roomCode || "AMXSTAGE").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || "AMXSTAGE";
  const production = useStageProduction(roomCode, { readOnly: true });
  const [status, setStatus] = useState<ViewerStatus>("connecting");
  const [mode, setMode] = useState<ViewerMode>("program");
  const [feeds, setFeeds] = useState<ViewerFeed[]>([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [backend, setBackend] = useState<RendererBackend>("webgl2");
  const roomRef = useRef<Room | null>(null);
  const audioHostRef = useRef<HTMLDivElement>(null);
  const identity = useMemo(() => `viewer-${crypto.randomUUID().slice(0, 12)}`, []);
  const seatCounts = stageSeatCounts(production.state.event.seats);

  const addFeed = useCallback((track: RemoteVideoTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    const source = publication.source === Track.Source.ScreenShare ? "screen" : "camera";
    const id = `${participant.identity}-${track.sid}`;
    const feed: ViewerFeed = {
      id,
      participantIdentity: participant.identity,
      name: source === "screen" ? `${participant.name || participant.identity} / screen` : participant.name || participant.identity,
      local: false,
      source,
      stream: new MediaStream([track.mediaStreamTrack]),
      muted: track.isMuted,
      track,
    };
    setFeeds((current) => current.some((item) => item.id === id) ? current.map((item) => item.id === id ? feed : item) : [...current, feed]);
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomCode, identity, name: "AMX Stage Viewer", role: "viewer" }),
      });
      const credentials = await response.json().catch(() => ({})) as { serverUrl?: string; participantToken?: string; error?: string };
      if (!response.ok || !credentials.serverUrl || !credentials.participantToken) {
        setStatus(response.status === 503 ? "venue-only" : "offline");
        setNotice(response.status === 503 ? "Virtual venue is live. Camera relay is not configured." : credentials.error || "Live camera relay is unavailable.");
        return;
      }
      const room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
      roomRef.current = room;
      const updateCount = () => setParticipantCount(room.remoteParticipants.size + 1);
      room.on(RoomEvent.ParticipantConnected, updateCount);
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        updateCount();
        setFeeds((current) => current.filter((feed) => feed.participantIdentity !== participant.identity));
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) addFeed(track as RemoteVideoTrack, publication, participant);
        if (track.kind === Track.Kind.Audio && audioHostRef.current) audioHostRef.current.appendChild(track.attach());
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((element) => element.remove());
        setFeeds((current) => current.filter((feed) => feed.track !== track));
      });
      room.on(RoomEvent.TrackMuted, (publication) => setFeeds((current) => current.map((feed) => feed.track === publication.track ? { ...feed, muted: true } : feed)));
      room.on(RoomEvent.TrackUnmuted, (publication) => setFeeds((current) => current.map((feed) => feed.track === publication.track ? { ...feed, muted: false } : feed)));
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioEnabled(room.canPlaybackAudio));
      room.on(RoomEvent.Reconnecting, () => setStatus("connecting"));
      room.on(RoomEvent.Reconnected, () => { setStatus("live"); updateCount(); });
      room.on(RoomEvent.Disconnected, () => { setStatus("offline"); setFeeds([]); });
      await room.connect(credentials.serverUrl, credentials.participantToken);
      updateCount();
      setStatus("live");
    } catch (error) {
      setStatus("offline");
      setNotice(error instanceof Error ? error.message : "Live camera relay is unavailable.");
    }
  }, [addFeed, identity, roomCode]);

  useEffect(() => {
    void connect();
    return () => {
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    document.title = `${production.state.event.title} | AMX AIR Hubs Live`;
  }, [production.state.event.title]);

  const route = production.state.cameraRoutes[production.state.shot];
  const programFeed = useMemo(() => {
    const active = feeds.filter((feed) => !feed.muted);
    if (!active.length || route === "virtual") return null;
    if (route && route !== "auto") {
      const direct = active.find((feed) => feed.id === route || feed.participantIdentity === route);
      if (direct) return direct;
    }
    return active[SHOT_INDEX[production.state.shot]] || active[0];
  }, [feeds, production.state.shot, route]);
  const showProgram = mode === "program" && Boolean(programFeed);
  const channelLive = production.state.live || status === "live";

  const enableAudio = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioEnabled(room.canPlaybackAudio);
      setNotice(room.canPlaybackAudio ? "Program audio enabled." : "Tap again after allowing audio playback.");
    } catch {
      setNotice("Audio playback is blocked by this browser.");
    }
  };
  const share = async () => {
    const data = { title: production.state.event.title, text: `Watch ${production.state.event.title} live on AMX AIR Hubs.`, url: location.href };
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(location.href);
      setNotice("Viewer link copied.");
    }
  };
  const fullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  };

  return <main className={`stage-viewer-page ${showProgram ? "program-active" : "venue-active"}`} style={{ "--viewer-accent": production.state.sponsor.accent } as React.CSSProperties}>
    <div className="stage-viewer-media" aria-label="AMX XR Stage live program">
      <Suspense fallback={<div className="stage-viewer-loading"><span/><b>OPENING AMX XR STAGE</b></div>}>
        <AMXXRStageScene mode={production.state.mode} shot={production.state.shot} sponsor={production.state.sponsor} generalSeats={production.state.generalSeats} vipSeats={production.state.vipSeats} seats={production.state.event.seats} venueLayout={production.state.event.venueLayout} live={production.state.live} audio={production.state.audio} programFeed={programFeed} reducedMotion={matchMedia("(prefers-reduced-motion: reduce)").matches} portraitFraming onBackend={setBackend}/>
      </Suspense>
      {showProgram && programFeed && <ViewerProgramVideo feed={programFeed}/>} 
      {!programFeed && <div className="stage-viewer-waiting"><Clapperboard/><span><b>VIRTUAL PROGRAM</b><small>Live camera feed waiting</small></span></div>}
    </div>

    <header className="stage-viewer-topbar">
      <div className="stage-viewer-brand"><img src="/brand/amx-air-hubs-brand.png" alt="AMX AIR Hubs"/><span><b>AMX AIR HUBS.CC</b><small>XR STAGE / LIVE</small></span></div>
      <div className={`stage-viewer-live ${channelLive ? "live" : "standby"}`}><i/><span>{production.state.live ? "LIVE" : "STANDBY"}</span></div>
      <div className="stage-viewer-header-actions"><button onClick={() => void share()} aria-label="Share live viewer" title="Share live viewer"><Share2/></button><button onClick={() => void fullscreen()} aria-label="Toggle fullscreen" title="Toggle fullscreen"><Maximize2/></button></div>
    </header>

    <section className="stage-viewer-title">
      <span>{production.state.event.format.toUpperCase()} / {production.state.event.sourceRoom}</span>
      <h1>{production.state.event.title}</h1>
      <p>{production.state.sponsor.headline}</p>
    </section>

    <div className="stage-viewer-metrics">
      <span><Users/><b>{seatCounts.checkedIn}</b><small>CHECKED IN</small></span>
      <span><Wifi/><b>{participantCount}</b><small>CONNECTED</small></span>
      <span><Radio/><b>{production.state.shot.toUpperCase()}</b><small>PROGRAM</small></span>
    </div>

    <div className="stage-viewer-controls">
      <div className="stage-viewer-mode" aria-label="Viewer mode"><button className={mode === "program" ? "active" : ""} disabled={!programFeed} onClick={() => setMode("program")} aria-label="Watch program feed" title="Program feed"><MonitorPlay/><span>Program</span></button><button className={mode === "venue" || !programFeed ? "active" : ""} onClick={() => setMode("venue")} aria-label="Watch virtual venue" title="Virtual venue"><Box/><span>Venue</span></button></div>
      <button className={audioEnabled ? "audio active" : "audio"} disabled={status !== "live"} onClick={() => void enableAudio()} aria-label={audioEnabled ? "Program audio enabled" : "Enable program audio"} title={audioEnabled ? "Program audio enabled" : "Enable program audio"}>{audioEnabled ? <Volume2/> : <VolumeX/>}</button>
    </div>

    <footer className="stage-viewer-sponsor"><i/><span><small>PRESENTED WITH</small><b>{production.state.sponsor.name}</b></span><strong>{production.state.sponsor.cta}</strong></footer>
    <div ref={audioHostRef} className="stage-viewer-audio" aria-hidden="true"/>
    {notice && <button className="stage-viewer-notice" onClick={() => setNotice("")}><span>{notice}</span></button>}
    <div className="stage-viewer-health" data-status={status} data-renderer={backend} data-program-feed={programFeed?.id || "virtual"} data-room={production.room}/>
  </main>;
}
