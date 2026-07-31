import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Clapperboard, Maximize2, MonitorPlay, Radio, Share2, Users, Volume2, VolumeX, Wifi } from "lucide-react";
import {
  RemoteVideoTrack, Room, RoomEvent, Track, VideoQuality,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from "livekit-client";
import { useParams } from "react-router-dom";
import type { LiveVideoFeed } from "../LiveKitPod";
import { useStageSoundscape } from "../StageSoundscape";
import { useStageProduction } from "../stage-production";
import { stageCameraMotionPreset, type StageCameraMotionState } from "../stage-camera-motion";
import { countStageAudienceParticipants, selectStageProgramFeed, stageFeedId } from "../stage-camera-routing";
import { stageSeatCounts } from "../stage-events";
import type { RendererBackend } from "../webgpu";

const AMXXRStageScene = lazy(async () => ({ default: (await import("../AMXXRStageScene")).AMXXRStageScene }));

type ViewerStatus = "connecting" | "live" | "venue-only" | "offline";
type ViewerMode = "program" | "venue";

interface ViewerFeed extends LiveVideoFeed {
  participantIdentity: string;
  track: RemoteVideoTrack;
}

function programVideoMotion(motion: StageCameraMotionState): Keyframe[] {
  const amount = motion.intensity / 100;
  const crop = 1 + 0.16 * amount;
  switch (motion.id) {
    case "crane-reveal": return [{ transform: `scale(${crop}) translateY(${4 * amount}%)` }, { transform: "scale(1) translateY(0)" }];
    case "crane-sweep": return [{ transform: `scale(${crop}) translateX(${-5 * amount}%)` }, { transform: `scale(${crop}) translateX(${5 * amount}%)` }];
    case "dolly-push": return [{ transform: "scale(1)" }, { transform: `scale(${1 + 0.22 * amount})` }];
    case "orbit-arc": return [{ transform: `scale(${crop}) translateX(${-4 * amount}%)` }, { transform: `scale(${crop}) translateX(${4 * amount}%)` }];
    case "truck-parallax": return [{ transform: `scale(${crop}) translateX(${5 * amount}%)` }, { transform: `scale(${crop}) translateX(${-5 * amount}%)` }];
    case "audience-pan": return [{ transform: `scale(${crop}) translateX(${-6 * amount}%)` }, { transform: `scale(${crop}) translateX(${6 * amount}%)` }];
    case "dolly-zoom": return [{ transform: "scale(1)" }, { transform: `scale(${1 + 0.28 * amount})` }];
    default: return [{ transform: "none" }, { transform: "none" }];
  }
}

function ViewerProgramVideo({ feed, motion }: { feed: ViewerFeed; motion: StageCameraMotionState }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    feed.track.attach(video);
    void video.play().catch(() => undefined);
    return () => { feed.track.detach(video); };
  }, [feed]);
  useEffect(() => {
    const video = ref.current;
    if (!video || motion.id === "static" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const preset = stageCameraMotionPreset(motion.id);
    const duration = preset.durationMs / motion.speed;
    const animation = video.animate(programVideoMotion(motion), {
      duration,
      iterations: motion.loop ? Infinity : 1,
      fill: "forwards",
      easing: "cubic-bezier(.45,0,.2,1)",
    });
    if (motion.startedAt) {
      const elapsed = Math.max(0, Date.now() - motion.startedAt);
      animation.currentTime = motion.loop ? elapsed % duration : Math.min(elapsed, duration);
    }
    return () => animation.cancel();
  }, [motion.id, motion.intensity, motion.loop, motion.speed, motion.startedAt]);
  return <video ref={ref} className="stage-viewer-video" data-camera-motion={motion.id} autoPlay muted playsInline/>;
}

export function StageLiveViewerPage() {
  const params = useParams();
  const roomCode = String(params.roomCode || "AMXSTAGE").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || "AMXSTAGE";
  const displayWall = new URLSearchParams(window.location.search).get("display") === "wall";
  const production = useStageProduction(roomCode, { readOnly: true });
  const [status, setStatus] = useState<ViewerStatus>("connecting");
  const [mode, setMode] = useState<ViewerMode>("program");
  const [feeds, setFeeds] = useState<ViewerFeed[]>([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioTrackCount, setAudioTrackCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [backend, setBackend] = useState<RendererBackend>("webgl2");
  const roomRef = useRef<Room | null>(null);
  const audioHostRef = useRef<HTMLDivElement>(null);
  const audioEnabledRef = useRef(false);
  const venueAudioEnabledRef = useRef(false);
  const audioTrackIdsRef = useRef(new Set<string>());
  const venueAudio = useStageSoundscape(production.state.audio);
  const seatCounts = stageSeatCounts(production.state.event.seats);

  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);
  useEffect(() => { venueAudioEnabledRef.current = venueAudio.enabled; }, [venueAudio.enabled]);

  const addFeed = useCallback((track: RemoteVideoTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    const source = publication.source === Track.Source.ScreenShare ? "screen" : "camera";
    const id = stageFeedId(participant.identity, source);
    const settings = track.mediaStreamTrack.getSettings();
    const feed: ViewerFeed = {
      id,
      participantIdentity: participant.identity,
      name: source === "screen" ? `${participant.name || participant.identity} / screen` : participant.name || participant.identity,
      local: false,
      source,
      stream: new MediaStream([track.mediaStreamTrack]),
      muted: track.isMuted,
      width: Math.round(Number(settings.width) || 0),
      height: Math.round(Number(settings.height) || 0),
      frameRate: Math.round(Number(settings.frameRate) || 0),
      track,
    };
    setFeeds((current) => current.some((item) => item.id === id) ? current.map((item) => item.id === id ? feed : item) : [...current, feed]);
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    try {
      const response = await fetch("/api/livekit/viewer-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomCode, name: "AMX Stage Viewer", clientType: "audience" }),
      });
      const credentials = await response.json().catch(() => ({})) as { serverUrl?: string; participantToken?: string; error?: string };
      if (!response.ok || !credentials.serverUrl || !credentials.participantToken) {
        setStatus(response.status === 503 ? "venue-only" : "offline");
        setNotice(response.status === 503 ? "Virtual venue is live. Camera relay is not configured." : credentials.error || "Live camera relay is unavailable.");
        return;
      }
      const room = new Room({ adaptiveStream: false, dynacast: true, disconnectOnPageLeave: true });
      roomRef.current = room;
      const updateCount = () => setParticipantCount(countStageAudienceParticipants(room.remoteParticipants.values(), 1));
      room.on(RoomEvent.ParticipantConnected, updateCount);
      room.on(RoomEvent.ParticipantMetadataChanged, updateCount);
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        updateCount();
        setFeeds((current) => current.filter((feed) => feed.participantIdentity !== participant.identity));
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video) {
          publication.setVideoQuality(VideoQuality.HIGH);
          addFeed(track as RemoteVideoTrack, publication, participant);
        }
        if (track.kind === Track.Kind.Audio && audioHostRef.current) {
          const element = track.attach();
          element.autoplay = audioEnabledRef.current;
          element.muted = !audioEnabledRef.current;
          audioHostRef.current.appendChild(element);
          const trackId = publication.trackSid || track.sid;
          if (trackId) audioTrackIdsRef.current.add(trackId);
          setAudioTrackCount(audioTrackIdsRef.current.size);
          if (audioEnabledRef.current) void element.play().catch(() => {
            if (!venueAudioEnabledRef.current) {
              audioEnabledRef.current = false;
              setAudioEnabled(false);
            }
            setNotice("Live sound needs another tap on this phone.");
          });
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication) => {
        track.detach().forEach((element) => element.remove());
        setFeeds((current) => current.filter((feed) => feed.track !== track));
        if (track.kind === Track.Kind.Audio) {
          const trackId = publication.trackSid || track.sid;
          if (trackId) audioTrackIdsRef.current.delete(trackId);
          setAudioTrackCount(audioTrackIdsRef.current.size);
        }
      });
      room.on(RoomEvent.TrackMuted, (publication) => setFeeds((current) => current.map((feed) => feed.track === publication.track ? { ...feed, muted: true } : feed)));
      room.on(RoomEvent.TrackUnmuted, (publication) => setFeeds((current) => current.map((feed) => feed.track === publication.track ? { ...feed, muted: false } : feed)));
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (room.canPlaybackAudio) return;
        audioEnabledRef.current = venueAudioEnabledRef.current;
        setAudioEnabled(venueAudioEnabledRef.current);
      });
      room.on(RoomEvent.Reconnecting, () => setStatus("connecting"));
      room.on(RoomEvent.Reconnected, () => { setStatus("live"); updateCount(); });
      room.on(RoomEvent.Disconnected, () => {
        audioEnabledRef.current = venueAudioEnabledRef.current;
        audioTrackIdsRef.current.clear();
        setAudioEnabled(venueAudioEnabledRef.current);
        setAudioTrackCount(0);
        setStatus("offline");
        setFeeds([]);
      });
      await room.connect(credentials.serverUrl, credentials.participantToken);
      updateCount();
      setStatus("live");
    } catch (error) {
      setStatus("offline");
      setNotice(error instanceof Error ? error.message : "Live camera relay is unavailable.");
    }
  }, [addFeed, roomCode]);

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
  const programFeed = useMemo(() => selectStageProgramFeed(feeds, production.state.shot, route), [feeds, production.state.shot, route]);
  const programMedia = route?.startsWith("media:") ? production.state.programMedia : null;
  const showProgram = mode === "program" && Boolean(programFeed);
  const showProgramMedia = mode === "program" && Boolean(programMedia?.url);
  const channelLive = production.state.live || status === "live";

  const enableAudio = async () => {
    const room = roomRef.current;
    try {
      const localReady = await venueAudio.enable();
      venueAudioEnabledRef.current = localReady;
      if (room) await room.startAudio();
      const elements = [...(audioHostRef.current?.querySelectorAll("audio") || [])];
      const results = await Promise.allSettled(elements.map((element) => {
        element.muted = false;
        element.volume = 1;
        return element.play();
      }));
      const mediaReady = elements.length === 0 || results.some((result) => result.status === "fulfilled");
      const remoteReady = Boolean(room?.canPlaybackAudio && mediaReady);
      const ready = localReady || remoteReady;
      audioEnabledRef.current = ready;
      setAudioEnabled(ready);
      setNotice(localReady && remoteReady ? "Venue mix and live room sound are on." : localReady ? "Venue mix is on. Waiting for live voices." : remoteReady ? "Live room sound is on." : "Tap Listen Live again after allowing audio playback.");
    } catch {
      setNotice("Audio playback is blocked by this browser.");
    }
  };
  const disableAudio = async () => {
    await venueAudio.disable();
    venueAudioEnabledRef.current = false;
    audioHostRef.current?.querySelectorAll("audio").forEach((element) => {
      element.autoplay = false;
      element.muted = true;
      element.pause();
    });
    audioEnabledRef.current = false;
    setAudioEnabled(false);
    setNotice("Live sound is off.");
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

  return <main className={`stage-viewer-page ${showProgram ? "program-active" : "venue-active"}${displayWall ? " display-wall" : ""}`} style={{ "--viewer-accent": production.state.sponsor.accent } as React.CSSProperties}>
    <div className="stage-viewer-media" aria-label="AMX XR Stage live program">
      <Suspense fallback={<div className="stage-viewer-loading"><span/><b>OPENING AMX XR STAGE</b></div>}>
        <AMXXRStageScene mode={production.state.mode} shot={production.state.shot} cameraMotion={production.state.cameraMotion} sponsor={production.state.sponsor} generalSeats={production.state.generalSeats} vipSeats={production.state.vipSeats} seats={production.state.event.seats} venueLayout={production.state.event.venueLayout} live={production.state.live} audio={production.state.audio} programFeed={programFeed} reducedMotion={matchMedia("(prefers-reduced-motion: reduce)").matches} portraitFraming onBackend={setBackend}/>
      </Suspense>
      {showProgram && programFeed && <ViewerProgramVideo feed={programFeed} motion={production.state.cameraMotion}/>}
      {showProgramMedia && programMedia && <video className="stage-viewer-program-video" src={programMedia.url} autoPlay={programMedia.transport === "playing"} muted={programMedia.muted} playsInline controls/>}
      {!programFeed && !showProgramMedia && <div className="stage-viewer-waiting"><Clapperboard/><span><b>VIRTUAL PROGRAM</b><small>Live camera feed waiting</small></span></div>}
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
    <section className="stage-viewer-tickets" aria-label="Event passes">{production.state.event.ticketTiers.map((tier) => <article key={tier.id}><span><b>{tier.label}</b><small>{tier.access}</small></span><strong>{tier.priceCents ? `$${(tier.priceCents / 100).toFixed(2)}` : "PASS"}</strong>{tier.checkoutUrl ? <a href={tier.checkoutUrl} target="_blank" rel="noreferrer">GET TICKET</a> : <span>COMING SOON</span>}{tier.priceCents ? Boolean(tier.resourceUrls?.length) && <small>{tier.resourceUrls?.length || 0} DOWNLOADS INCLUDED</small> : (tier.resourceUrls || []).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">RESOURCE {index + 1}</a>)}</article>)}</section>

    <div className="stage-viewer-metrics">
      <span><Users/><b>{seatCounts.checkedIn}</b><small>CHECKED IN</small></span>
      <span><Wifi/><b>{participantCount}</b><small>CONNECTED</small></span>
      <span><Radio/><b>{production.state.shot.toUpperCase()}</b><small>PROGRAM</small></span>
    </div>

    <div className="stage-viewer-controls">
      <div className="stage-viewer-mode" aria-label="Viewer mode"><button className={mode === "program" ? "active" : ""} disabled={!programFeed} onClick={() => setMode("program")} aria-label="Watch program feed" title="Program feed"><MonitorPlay/><span>Program</span></button><button className={mode === "venue" || !programFeed ? "active" : ""} onClick={() => setMode("venue")} aria-label="Watch virtual venue" title="Virtual venue"><Box/><span>Venue</span></button></div>
      <button className={audioEnabled ? "audio active" : "audio"} onClick={() => void (audioEnabled ? disableAudio() : enableAudio())} aria-label={audioEnabled ? "Turn live sound off" : "Enable live sound"} title={audioEnabled ? "Turn live sound off" : "Enable live sound"}>{audioEnabled ? <Volume2/> : <VolumeX/>}</button>
    </div>

    {!audioEnabled && <button className="stage-viewer-audio-gate" onClick={() => void enableAudio()}><Volume2/><span><b>LISTEN LIVE</b><small>{audioTrackCount ? `${audioTrackCount} LIVE FEED${audioTrackCount === 1 ? "" : "S"} + VENUE MIX` : "VOICE + VENUE MIX"}</small></span></button>}

    <footer key={`${production.state.sponsor.id}-${production.state.updatedAt}`} className={`stage-viewer-sponsor sponsor-${production.state.sponsor.animation || "cut"}`}><i/>{production.state.sponsor.logoUrl && <img src={production.state.sponsor.logoUrl} alt=""/>}<span><small>PRESENTED WITH</small><b>{production.state.sponsor.name}</b></span><strong>{production.state.sponsor.cta}</strong></footer>
    <div ref={audioHostRef} className="stage-viewer-audio" aria-hidden="true"/>
    {notice && <button className="stage-viewer-notice" onClick={() => setNotice("")}><span>{notice}</span></button>}
    <div className="stage-viewer-health" data-status={status} data-renderer={backend} data-program-feed={programFeed?.id || "virtual"} data-program-resolution={programFeed?.width && programFeed.height ? `${programFeed.width}x${programFeed.height}` : "virtual"} data-output-profile={production.state.video.outputProfile} data-room={production.room} data-venue-audio={venueAudio.status} data-venue-program-level={venueAudio.levels.program.toFixed(3)} data-venue-ambience-level={venueAudio.levels.ambience.toFixed(3)}/>
  </main>;
}
