import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair, ArrowUpToLine, Bot, CalendarRange, Camera, CameraOff, ChevronRight, CircleDot, CircleStop, Clapperboard, Crown, Disc3, Film, Headphones, Link2, LockKeyhole,
  ListChecks, Megaphone, Mic2, Minus, MonitorPlay, Music2, Pause, Play, Plus, Podcast, Radio, RadioTower, RefreshCw, Sparkles, Users, Video, Volume2, Wifi,
} from "lucide-react";
import type { CaptureState, LiveVideoFeed, ProgramAudioState } from "../LiveKitPod";
import type { StageFeedMonitorStatus } from "../StageFeedMonitor";
import { agents } from "../data";
import { trackEvent } from "../platform";
import { useAMX } from "../AppContext";
import { StageAudioLibrary } from "../StageAudioLibrary";
import { useStageSoundscape } from "../StageSoundscape";
import { StageEventConsole } from "../StageEventConsole";
import { StageScoreDesigner } from "../StageScoreDesigner";
import { StageShowWorkflow, type StageWorkflowRuntimeCue } from "../StageShowWorkflow";
import { controlDjBroadcast, type DjBroadcastState } from "../dj-broadcast";
import { getActiveTenant } from "../operations";
import { STAGE_DECK_PRESETS, applyStageScoreCue, normalizeStageScore, stageAudioTrackId, type StageScoreState } from "../stage-audio";
import { stageEventPreset } from "../stage-events";
import { reviseStageShowWorkflow, stageWorkflowReadiness, type StageShowWorkflow as StageShowWorkflowState } from "../stage-show-workflow";
import { selectStageProgramFeed, sortStageVideoFeeds } from "../stage-camera-routing";
import {
  DEFAULT_SPONSORS, useStageProduction, type SponsorCreative, type StageAudioFormat, type StageAudioState, type StageCue, type StageDeckTrack, type StageMode, type StageShot, type StageSoundscape,
} from "../stage-production";

const AMXXRStageScene = lazy(async () => ({ default: (await import("../AMXXRStageScene")).AMXXRStageScene }));
const LiveKitPod = lazy(async () => ({ default: (await import("../LiveKitPod")).LiveKitPod }));
const StageFeedMonitor = lazy(async () => ({ default: (await import("../StageFeedMonitor")).StageFeedMonitor }));

type ConsoleView = "workflow" | "production" | "collab" | "audio" | "audience" | "sponsors";

const SHOTS: Array<{ id: StageShot; label: string; detail: string; icon: typeof Camera }> = [
  { id: "wide", label: "CAM 1", detail: "Stage wide", icon: Video },
  { id: "host", label: "CAM 2", detail: "Host close", icon: Camera },
  { id: "audience", label: "CAM 3", detail: "Audience reverse", icon: Users },
  { id: "crane", label: "CRANE", detail: "Venue sweep", icon: Film },
];

const CUES: Array<{ id: StageCue; label: string }> = [
  { id: "standby", label: "Standby" },
  { id: "opening", label: "Opening" },
  { id: "speaker", label: "Speaker" },
  { id: "demo", label: "Demo" },
  { id: "qa", label: "Q&A" },
  { id: "sponsor", label: "Sponsor" },
  { id: "close", label: "Close" },
];

const SOUNDSCAPES: Array<{ id: StageSoundscape; label: string }> = [
  { id: "air-grid", label: "AIR Grid" },
  { id: "deep-focus", label: "Deep Focus" },
  { id: "crowd-warmup", label: "Crowd Warmup" },
  { id: "podcast-room", label: "Podcast Room" },
];

function elapsedLabel(startedAt: number | null, now: number) {
  if (!startedAt) return "00:00";
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function CameraFeedPreview({ feed }: { feed: LiveVideoFeed | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !feed || feed.muted) return;
    video.srcObject = feed.stream;
    void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [feed]);
  if (!feed || feed.muted) return <span className="stage-camera-empty"><CameraOff/><small>{feed?.muted ? "MUTED" : "NO FEED"}</small></span>;
  return <video ref={ref} autoPlay muted playsInline className={feed.local ? "local" : ""}/>;
}

export function AMXXRStagePage() {
  const { settings, activeMission } = useAMX();
  const [view, setView] = useState<ConsoleView>("workflow");
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("amx_stage_room") || "AMXSTAGE");
  const production = useStageProduction(roomCode);
  const soundscapeRuntime = useStageSoundscape(production.state.audio);
  const [runtimeNow, setRuntimeNow] = useState(Date.now());
  const [videoFeeds, setVideoFeeds] = useState<LiveVideoFeed[]>([]);
  const [feedMonitorStatus, setFeedMonitorStatus] = useState<StageFeedMonitorStatus>("connecting");
  const [cameraMediaState, setCameraMediaState] = useState<CaptureState>("off");
  const [programAudioState, setProgramAudioState] = useState<ProgramAudioState>("off");
  const [djControlToken, setDjControlToken] = useState("");
  const [djBroadcast, setDjBroadcast] = useState<DjBroadcastState | null>(null);
  const [djBroadcastBusy, setDjBroadcastBusy] = useState(false);
  const [djBroadcastMessage, setDjBroadcastMessage] = useState("Enter the private control token to check the broadcast destination.");
  const consoleBodyRef = useRef<HTMLDivElement>(null);
  const [backend, setBackend] = useState<"initializing" | "webgpu" | "webgl2">("initializing");
  const [podDraft, setPodDraft] = useState("");
  const [autoSponsor, setAutoSponsor] = useState(false);
  const [customSponsors, setCustomSponsors] = useState<SponsorCreative[]>(() => {
    try { return JSON.parse(localStorage.getItem("amx_stage_sponsors") || "[]") as SponsorCreative[]; }
    catch { return []; }
  });
  const [sponsorDraft, setSponsorDraft] = useState({ name: "", headline: "", cta: "VISIT THE SPONSOR", accent: "#55e6ff" });
  const inventory = useMemo(() => [...DEFAULT_SPONSORS, ...customSponsors], [customSponsors]);
  const crew = agents.slice(0, 4);
  const tenantId = getActiveTenant();
  const deckTracks = useMemo(() => [
    ...STAGE_DECK_PRESETS,
    ...production.state.audio.library.map((asset) => ({ id: stageAudioTrackId(asset.id), label: asset.name })),
  ], [production.state.audio.library]);
  const orderedVideoFeeds = useMemo(() => sortStageVideoFeeds(videoFeeds), [videoFeeds]);
  const cameraChannels = useMemo(() => SHOTS.map((camera) => {
    const configuredRoute = production.state.cameraRoutes[camera.id] || "auto";
    return { ...camera, route: configuredRoute, feed: selectStageProgramFeed(orderedVideoFeeds, camera.id, configuredRoute) };
  }), [orderedVideoFeeds, production.state.cameraRoutes]);
  const programChannel = cameraChannels.find((camera) => camera.id === production.state.shot) || cameraChannels[0];

  const changeRoom = (value: string) => {
    const safe = value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
    setRoomCode(safe);
    localStorage.setItem("amx_stage_room", safe);
  };
  const setMode = (mode: StageMode) => {
    production.update({ mode });
    trackEvent("stage_mode_changed", { locationTag: production.room });
  };
  const takeShot = (shot: StageShot) => {
    production.update({ shot });
    const feed = cameraChannels.find((camera) => camera.id === shot)?.feed;
    trackEvent("stage_camera_taken", { campaignId: feed?.id, locationTag: production.room });
  };
  const routeCamera = (shot: StageShot, route: string) => {
    production.update({ cameraRoutes: { ...production.state.cameraRoutes, [shot]: route } });
    trackEvent("stage_camera_routed", { campaignId: route === "auto" || route === "virtual" ? undefined : route, locationTag: production.room });
  };
  const updateAudio = (patch: Partial<StageAudioState>) => {
    production.update({ audio: { ...production.state.audio, ...patch } });
  };
  const updateScore = (patch: Partial<StageScoreState>) => {
    updateAudio({ score: normalizeStageScore({ ...production.state.audio.score, ...patch }) });
  };
  const scoredAudioForCue = (cue: StageCue, force = false) => {
    const audio = production.state.audio;
    if (!audio.score.armed || (!force && audio.score.mode !== "cue-follow")) return audio;
    return { ...audio, score: applyStageScoreCue(audio.score, cue) };
  };
  const selectAudioFormat = (format: StageAudioFormat) => {
    const formatPatch: Partial<StageAudioState> = format === "podcast"
      ? { format, soundscape: "podcast-room", deckA: "spoken-bed", bpm: 88 }
      : format === "dj"
        ? { format, soundscape: "crowd-warmup", deckA: "air-pulse", deckB: "night-grid", bpm: 124 }
        : { format, soundscape: "air-grid", bpm: 112 };
    updateAudio(formatPatch);
    trackEvent("stage_audio_format_changed", { campaignId: format, locationTag: production.room });
  };
  const toggleAudioTransport = async () => {
    const playing = production.state.audio.transport === "playing";
    if (playing) {
      updateAudio({ transport: "stopped", recording: false, startedAt: null, recordStartedAt: null });
      await soundscapeRuntime.disable();
      trackEvent("stage_audio_stopped", { locationTag: production.room });
      return;
    }
    const enabled = await soundscapeRuntime.enable();
    if (!enabled) return;
    updateAudio({ transport: "playing", startedAt: Date.now() });
    trackEvent("stage_audio_started", { campaignId: production.state.audio.soundscape, locationTag: production.room });
  };
  const toggleRecordingCue = async () => {
    const recording = !production.state.audio.recording;
    if (recording && !soundscapeRuntime.enabled) await soundscapeRuntime.enable();
    updateAudio({
      recording,
      transport: recording ? "playing" : production.state.audio.transport,
      startedAt: recording && !production.state.audio.startedAt ? Date.now() : production.state.audio.startedAt,
      recordStartedAt: recording ? Date.now() : null,
    });
    trackEvent(recording ? "stage_podcast_record_cued" : "stage_podcast_record_stopped", { locationTag: production.room });
  };
  const fireStinger = async () => {
    if (!production.state.audio.stingerTrack) return;
    if (!soundscapeRuntime.enabled && !(await soundscapeRuntime.enable())) return;
    updateAudio({ stingerTriggeredAt: Date.now() });
    trackEvent("stage_audio_stinger_fired", { campaignId: production.state.audio.stingerTrack, locationTag: production.room });
  };
  const runDjBroadcast = async (action: "status" | "start" | "stop") => {
    if (!djControlToken.trim()) {
      setDjBroadcastMessage("A private stream control token is required.");
      return;
    }
    setDjBroadcastBusy(true);
    setDjBroadcastMessage(action === "start" ? "Starting the LiveKit room stream..." : action === "stop" ? "Stopping the outbound stream..." : "Checking the LiveKit egress...");
    try {
      const result = await controlDjBroadcast(action, production.room, djControlToken.trim(), action === "stop" ? djBroadcast?.active?.id : undefined);
      setDjBroadcast(result);
      const live = Boolean(result.active);
      setDjBroadcastMessage(live ? `LiveKit room mix is streaming to ${result.destinationCount} destination${result.destinationCount === 1 ? "" : "s"}.` : `Broadcast control ready for ${result.destinationCount} destination${result.destinationCount === 1 ? "" : "s"}.`);
      trackEvent(action === "start" ? "stage_dj_broadcast_started" : action === "stop" ? "stage_dj_broadcast_stopped" : "stage_dj_broadcast_checked", { locationTag: production.room });
    } catch (error) {
      setDjBroadcastMessage(error instanceof Error ? error.message : "DJ broadcast control failed");
    } finally {
      setDjBroadcastBusy(false);
    }
  };
  const openCameraSetup = () => {
    setView("collab");
    window.requestAnimationFrame(() => {
      const body = consoleBodyRef.current;
      const media = body?.querySelector<HTMLElement>(".livekit-pod");
      if (!body || !media) return;
      const top = media.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8;
      body.scrollTo({ top, behavior: settings.reducedMotion ? "auto" : "smooth" });
    });
  };
  const fireCue = (cue: StageCue) => {
    const scoredAudio = scoredAudioForCue(cue);
    const patch: Parameters<typeof production.update>[0] = { cue, ...(scoredAudio !== production.state.audio ? { audio: scoredAudio } : {}) };
    if (scoredAudio !== production.state.audio && !soundscapeRuntime.enabled) void soundscapeRuntime.enable();
    if (cue === "sponsor") patch.sponsor = inventory[(inventory.findIndex((item) => item.id === production.state.sponsor.id) + 1) % inventory.length];
    production.update(patch);
    trackEvent("stage_cue_fired", { campaignId: cue === "sponsor" ? patch.sponsor?.id : undefined, locationTag: production.room });
  };
  const fireScoreCue = async (cue: StageCue) => {
    if (!production.state.audio.score.armed) return;
    if (!soundscapeRuntime.enabled) void soundscapeRuntime.enable();
    const patch: Parameters<typeof production.update>[0] = { cue, audio: scoredAudioForCue(cue, true) };
    if (cue === "sponsor") patch.sponsor = inventory[(inventory.findIndex((item) => item.id === production.state.sponsor.id) + 1) % inventory.length];
    production.update(patch);
    trackEvent("stage_score_cue_fired", { campaignId: cue, locationTag: production.room });
  };
  const updateShowWorkflow = (workflow: StageShowWorkflowState, runtime?: StageWorkflowRuntimeCue) => {
    const patch: Parameters<typeof production.update>[0] = { workflow };
    if (runtime) {
      patch.cue = runtime.cue;
      patch.shot = runtime.shot;
      const scoredAudio = scoredAudioForCue(runtime.cue);
      if (scoredAudio !== production.state.audio) {
        patch.audio = scoredAudio;
        if (!soundscapeRuntime.enabled) void soundscapeRuntime.enable();
      }
      if (runtime.target !== "MAIN-STAGE") patch.event = { ...production.state.event, sourceRoom: runtime.target };
      if (runtime.cue === "sponsor") patch.sponsor = inventory[(inventory.findIndex((item) => item.id === production.state.sponsor.id) + 1) % inventory.length];
    }
    production.update(patch);
    if (runtime) trackEvent("stage_rundown_cue_taken", { campaignId: runtime.cue === "sponsor" ? patch.sponsor?.id : undefined, locationTag: runtime.target });
  };
  const applyShowLive = (live: boolean, workflow: StageShowWorkflowState) => {
    const cue: StageCue = live ? "opening" : "close";
    const scoredAudio = scoredAudioForCue(cue);
    if (scoredAudio !== production.state.audio && !soundscapeRuntime.enabled) void soundscapeRuntime.enable();
    production.update({ live, workflow, event: { ...production.state.event, status: live ? "live" : "complete" }, cue, shot: live ? "wide" : production.state.shot, audio: scoredAudio });
    trackEvent(live ? "stage_show_started" : "stage_show_ended", { campaignId: production.state.sponsor.id, locationTag: production.room });
  };
  const toggleLive = () => {
    const live = !production.state.live;
    const readiness = stageWorkflowReadiness(production.state.workflow);
    if (live && (!readiness.ready || production.state.workflow.status !== "ready")) {
      setView("workflow");
      return;
    }
    const timestamp = new Date().toISOString();
    const workflow = reviseStageShowWorkflow(production.state.workflow, live ? {
      phase: "live", status: "on-air", showStartedAt: production.state.workflow.showStartedAt || timestamp, showEndedAt: null, holdStartedAt: null,
    } : {
      phase: "post", status: "wrap", showEndedAt: timestamp, holdStartedAt: null, holdReason: "", currentItemId: null,
      rundown: production.state.workflow.rundown.map((item) => item.status === "live" ? { ...item, status: "complete", completedAt: timestamp } : item),
    }, { action: live ? "show.started" : "show.ended", detail: live ? "Main Stage and connected Pod rundown started" : "Program ended and post-production handoff opened", actor: production.state.operatorId });
    applyShowLive(live, workflow);
  };
  const linkPod = () => {
    const pod = podDraft.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
    if (!pod || production.state.connectedPods.includes(pod)) return;
    production.update({ connectedPods: [...production.state.connectedPods, pod].slice(-8) });
    setPodDraft("");
    trackEvent("stage_pod_linked", { locationTag: pod });
  };
  const unlinkPod = (pod: string) => production.update({ connectedPods: production.state.connectedPods.filter((item) => item !== pod) });
  const promotePod = (pod: string) => {
    const preset = stageEventPreset(production.state.event.format);
    production.update({
      event: { ...production.state.event, sourceRoom: pod, status: production.state.event.status === "draft" ? "published" : production.state.event.status },
      sponsor: { id: production.state.event.id, name: production.state.event.title, headline: `${preset.label} / ${pod} promoted to stage`, cta: new Date(production.state.event.startsAt).toLocaleString(), accent: preset.accent },
      cue: "opening",
      shot: "wide",
    });
    setView("audience");
    trackEvent("stage_room_promoted", { campaignId: production.state.event.id, locationTag: pod });
  };
  const addSponsor = () => {
    if (!sponsorDraft.name.trim() || !sponsorDraft.headline.trim()) return;
    const sponsor: SponsorCreative = { ...sponsorDraft, id: `sponsor-${crypto.randomUUID().slice(0, 8)}`, name: sponsorDraft.name.trim(), headline: sponsorDraft.headline.trim(), cta: sponsorDraft.cta.trim() || "VISIT THE SPONSOR" };
    const next = [...customSponsors, sponsor].slice(-12);
    setCustomSponsors(next);
    localStorage.setItem("amx_stage_sponsors", JSON.stringify(next));
    production.update({ sponsor, cue: "sponsor" });
    setSponsorDraft({ name: "", headline: "", cta: "VISIT THE SPONSOR", accent: "#55e6ff" });
    trackEvent("stage_sponsor_created", { campaignId: sponsor.id, locationTag: production.room });
  };
  const selectSponsor = useCallback((sponsor: SponsorCreative) => {
    production.update({ sponsor, cue: "sponsor" });
    trackEvent("stage_sponsor_impression", { campaignId: sponsor.id, locationTag: production.room });
  }, [production]);

  useEffect(() => {
    if (!autoSponsor || !production.state.live || inventory.length < 2) return;
    const timer = window.setInterval(() => {
      const index = inventory.findIndex((item) => item.id === production.state.sponsor.id);
      selectSponsor(inventory[(index + 1) % inventory.length]);
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [autoSponsor, inventory, production.state.live, production.state.sponsor.id, selectSponsor]);

  useEffect(() => {
    if (production.state.audio.transport !== "playing" && !production.state.audio.recording) return;
    setRuntimeNow(Date.now());
    const timer = window.setInterval(() => setRuntimeNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [production.state.audio.recording, production.state.audio.transport]);

  useEffect(() => {
    setDjBroadcast(null);
    setDjBroadcastMessage("Enter the private control token to check the broadcast destination.");
  }, [production.room]);

  const seatsTotal = production.state.generalSeats + production.state.vipSeats;
  return <div className="page amx-stage-page">
    <Suspense fallback={null}><StageFeedMonitor roomCode={production.room} onStatus={setFeedMonitorStatus} onVideoFeeds={setVideoFeeds}/></Suspense>
    <header className="stage-workspace-bar">
      <div className="stage-title"><span className="eyebrow">AMX XR STAGE / LIVE PRODUCTION</span><h1>Show control</h1></div>
      <div className="stage-show-status"><span className={production.state.live ? "live" : "ready"}><i/>{production.state.live ? "ON AIR" : "READY"}</span><span><Camera/>{production.state.shot.toUpperCase()} / {programChannel.feed && !programChannel.feed.muted ? programChannel.feed.name : "VIRTUAL"}</span><span><Users/>{seatsTotal} seated</span><span><Link2/>{production.state.connectedPods.length} pods</span><span><Wifi/>{production.transport}</span></div>
      <button className={`stage-live-button ${production.state.live ? "end" : ""}`} onClick={toggleLive}>{production.state.live ? <CircleStop/> : stageWorkflowReadiness(production.state.workflow).ready && production.state.workflow.status === "ready" ? <Radio/> : <ListChecks/>}{production.state.live ? "END SHOW" : stageWorkflowReadiness(production.state.workflow).ready && production.state.workflow.status === "ready" ? "GO LIVE" : "PREFLIGHT"}</button>
    </header>

    <div className="stage-command-layout">
      <section className="stage-scene-band">
        <Suspense fallback={<div className="nexus-scene-loading"><span/><b>Preparing AMX XR Stage</b></div>}><AMXXRStageScene mode={production.state.mode} shot={production.state.shot} sponsor={production.state.sponsor} generalSeats={production.state.generalSeats} vipSeats={production.state.vipSeats} seats={production.state.event.seats} venueLayout={production.state.event.venueLayout} live={production.state.live} audio={production.state.audio} programFeed={programChannel.feed} reducedMotion={settings.reducedMotion} onBackend={setBackend}/></Suspense>
        <div className="stage-scene-overlay"><div><span className="eyebrow">{production.state.event.format.toUpperCase()} / {production.state.mode.toUpperCase()} / {backend === "webgpu" ? "WEBGPU" : backend === "webgl2" ? "WEBGL2" : "GPU INIT"}</span><b>{production.state.event.title}</b><small>{production.state.event.status.toUpperCase()} / {production.state.event.sourceRoom} / PGM {programChannel.label}: {programChannel.feed && !programChannel.feed.muted ? programChannel.feed.name : production.state.sponsor.name}</small></div><div className="stage-seat-tally"><Crown/><span>VIP <b>{production.state.vipSeats}/8</b></span><i/><Armchair/><span>HOUSE <b>{production.state.generalSeats}/36</b></span></div></div>
      </section>

      <aside className="stage-console">
        <div className="stage-console-tabs" role="tablist" aria-label="Stage console">{([
          ["workflow", "Run", ListChecks], ["production", "Show", Clapperboard], ["collab", "Pods", Radio], ["audio", "Audio", Headphones], ["audience", "Event", CalendarRange], ["sponsors", "Ads", Megaphone],
        ] as const).map(([id, label, Icon]) => <button key={id} className={view === id ? "active" : ""} aria-label={label} onClick={() => setView(id)}><Icon/><span>{label}</span></button>)}</div>
        <div ref={consoleBodyRef} className="stage-console-body">
          <div className="stage-console-view" hidden={view !== "workflow"}>
            <StageShowWorkflow room={production.room} tenantId={tenantId} event={production.state.event} connectedPods={production.state.connectedPods} workflow={production.state.workflow} operatorId={production.state.operatorId} live={production.state.live} onWorkflowChange={updateShowWorkflow} onLiveChange={applyShowLive}/>
          </div>
          <div className="stage-console-view" hidden={view !== "production"}>
            <section className="stage-control-section"><header><div><span className="eyebrow">VENUE MODE</span><h2>Audience format</h2></div><span className="stage-sync-state"><i/>{production.peerCount} operator{production.peerCount === 1 ? "" : "s"}</span></header><div className="stage-mode-control">{(["in-person", "online", "metaverse"] as StageMode[]).map((mode) => <button key={mode} className={production.state.mode === mode ? "active" : ""} onClick={() => setMode(mode)}>{mode}</button>)}</div></section>
            <section className="stage-control-section"><header><div><span className="eyebrow">LIVE CAMERA TEAM</span><h2>Route and take</h2></div><div className="stage-camera-header-actions"><span className={`stage-feed-monitor-state ${feedMonitorStatus}`}><Wifi/>{feedMonitorStatus === "live" ? `${orderedVideoFeeds.length} FEED${orderedVideoFeeds.length === 1 ? "" : "S"}` : feedMonitorStatus === "connecting" ? "SCANNING" : "RELAY OFF"}</span>{cameraMediaState !== "published" && <button className={cameraMediaState === "blocked" ? "blocked" : ""} onClick={openCameraSetup}><Camera/>{cameraMediaState === "blocked" ? "RETRY CAMERA" : cameraMediaState === "requesting" ? "OPENING" : "CONNECT CAMERA"}</button>}<span className={production.state.live ? "camera-tally live" : "camera-tally"}><i/>PGM</span></div></header><div className="stage-shot-grid">{cameraChannels.map(({ id, label, detail, icon: Icon, route, feed }) => <div key={id} className={`stage-camera-channel ${production.state.shot === id ? "active" : ""} ${feed && !feed.muted ? "feed-ready" : ""}`}><button aria-label={`${label} ${detail}`} onClick={() => takeShot(id)}><span className="stage-camera-preview"><CameraFeedPreview feed={feed}/></span><Icon/><span className="stage-camera-name"><b>{label}</b><small>{feed ? `${feed.name}${feed.muted ? " / muted" : ""}` : route !== "auto" && route !== "virtual" ? "Feed offline" : detail}</small></span><i/></button><select aria-label={`Route ${label} source`} value={route} onChange={(event) => routeCamera(id, event.target.value)}><option value="auto">AUTO INPUT {orderedVideoFeeds.length > 0 ? id === "wide" ? "1" : id === "host" ? "2" : id === "audience" ? "3" : "4" : ""}</option><option value="virtual">VIRTUAL SHOT</option>{route !== "auto" && route !== "virtual" && !orderedVideoFeeds.some((candidate) => candidate.id === route) && <option value={route}>FEED OFFLINE</option>}{orderedVideoFeeds.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} / {candidate.source}</option>)}</select></div>)}</div></section>
            <section className="stage-control-section"><header><div><span className="eyebrow">SHOW CUES</span><h2>Run of show</h2></div><b className="stage-current-cue">{production.state.cue}</b></header><div className="stage-cue-grid">{CUES.map((cue) => <button key={cue.id} className={production.state.cue === cue.id ? "active" : ""} onClick={() => fireCue(cue.id)}><span>{cue.label}</span><ChevronRight/></button>)}</div></section>
          </div>

          <div className="stage-console-view" hidden={view !== "collab"}>
            <section className="stage-control-section"><header><div><span className="eyebrow">CROSS-POD CONNECTION</span><h2>Linked showcases</h2></div><span className="stage-sync-state"><i/>{production.transport}</span></header><label className="stage-room-field">Stage room<input value={roomCode} onChange={(event) => changeRoom(event.target.value)}/></label><div className="stage-pod-link"><input value={podDraft} onChange={(event) => setPodDraft(event.target.value)} placeholder="POD CODE"/><button onClick={linkPod} disabled={!podDraft.trim()}><Link2/>Link</button></div><div className="stage-pod-list">{production.state.connectedPods.map((pod) => <div key={pod} className={production.state.event.sourceRoom === pod ? "promoted" : ""}><span><i/><b>{pod}</b><small>{production.state.event.sourceRoom === pod ? "promoted event source" : "stage cue bus linked"}</small></span><span className="stage-pod-actions"><button onClick={() => promotePod(pod)} aria-label={`Promote ${pod} to stage`} title={`Promote ${pod} to stage`}><ArrowUpToLine/></button><button onClick={() => unlinkPod(pod)} aria-label={`Unlink ${pod}`} title={`Unlink ${pod}`}><Minus/></button></span></div>)}</div></section>
            <Suspense fallback={<div className="pod-camera-off"><Radio/><span>Preparing stage media</span></div>}><LiveKitPod compact roomCode={production.room} agents={crew} onCameraState={setCameraMediaState} programAudioStream={soundscapeRuntime.programStream} onProgramAudioState={setProgramAudioState}/></Suspense>
          </div>

          <div className="stage-console-view stage-audio-console" hidden={view !== "audio"}>
            <section className="stage-control-section"><header><div><span className="eyebrow">PROGRAM AUDIO</span><h2>Music and podcast runtime</h2></div><span className={`stage-sync-state ${production.state.audio.transport === "playing" ? "audio-live" : ""}`}><i/>{production.state.audio.transport}</span></header><div className="stage-audio-format">{(["show", "podcast", "dj"] as StageAudioFormat[]).map((format) => { const Icon = format === "podcast" ? Podcast : format === "dj" ? Disc3 : Music2; return <button key={format} className={production.state.audio.format === format ? "active" : ""} onClick={() => selectAudioFormat(format)}><Icon/><span>{format}</span></button>; })}</div><div className="stage-audio-transport"><button className={production.state.audio.transport === "playing" ? "active" : ""} onClick={() => void toggleAudioTransport()}>{production.state.audio.transport === "playing" ? <Pause/> : <Play/>}<span>{production.state.audio.transport === "playing" ? "STOP PROGRAM" : "START PROGRAM"}</span></button><button className={soundscapeRuntime.enabled ? "monitoring" : ""} onClick={() => void (soundscapeRuntime.enabled ? soundscapeRuntime.disable() : soundscapeRuntime.enable())}><Headphones/><span>{soundscapeRuntime.enabled ? "MONITOR ON" : "ENABLE MONITOR"}</span></button></div><div className="stage-audio-runtime"><span><Volume2/><b>{soundscapeRuntime.status.toUpperCase()}</b><small>LOCAL MONITOR</small></span><span><Radio/><b>{programAudioState.toUpperCase()}</b><small>ROOM MIX</small></span><span><Wifi/><b>{production.transport.toUpperCase()}</b><small>PROGRAM SYNC</small></span><span><Music2/><b>{elapsedLabel(production.state.audio.startedAt, runtimeNow)}</b><small>RUNTIME</small></span></div></section>

            <StageScoreDesigner audio={production.state.audio} currentCue={production.state.cue} onUpdate={updateScore} onFire={fireScoreCue}/>

            <StageAudioLibrary audio={production.state.audio} tenantId={tenantId} onUpdate={updateAudio}/>

            <section className="stage-control-section stage-dj-live"><header><div><span className="eyebrow">DJ LIVE / RTMP</span><h2>Outbound broadcast</h2></div><span className={`stage-sync-state ${djBroadcast?.active ? "audio-live" : ""}`}><i/>{djBroadcast?.active ? "ON AIR" : djBroadcastBusy ? "WORKING" : "OFF AIR"}</span></header><div className="stage-dj-live-source"><RadioTower/><span><b>LIVEKIT ROOM MIX</b><small>{production.room} / cameras, voices, screens and program mix</small></span>{djBroadcast?.active && <code>{djBroadcast.active.id.slice(0, 12)}</code>}</div><label className="stage-dj-live-token"><LockKeyhole/><input type="password" autoComplete="off" value={djControlToken} onChange={(event) => setDjControlToken(event.target.value)} placeholder="STREAM CONTROL TOKEN" aria-label="DJ stream control token"/><button disabled={djBroadcastBusy || !djControlToken.trim()} onClick={() => void runDjBroadcast("status")} aria-label="Check DJ broadcast" title="Check DJ broadcast"><RefreshCw/></button></label><div className="stage-dj-live-actions"><button disabled={djBroadcastBusy || !djControlToken.trim() || Boolean(djBroadcast?.active)} onClick={() => void runDjBroadcast("start")}><RadioTower/>START DJ LIVE</button><button className="stop" disabled={djBroadcastBusy || !djBroadcast?.active} onClick={() => void runDjBroadcast("stop")}><CircleStop/>STOP STREAM</button></div><p>{djBroadcastMessage}</p></section>

            <section className="stage-control-section"><header><div><span className="eyebrow">DJ BOOTH / POD</span><h2>Deck mixer</h2></div><b className="stage-audio-bpm">{production.state.audio.bpm} BPM</b></header><div className="stage-deck-grid"><label><span>DECK A</span><select value={production.state.audio.deckA} onChange={(event) => updateAudio({ deckA: event.target.value as StageDeckTrack })}>{deckTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label><label><span>DECK B</span><select value={production.state.audio.deckB} onChange={(event) => updateAudio({ deckB: event.target.value as StageDeckTrack })}>{deckTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label></div><label className="stage-audio-slider"><span>CROSSFADER <b>{production.state.audio.crossfader}%</b></span><input type="range" min="0" max="100" value={production.state.audio.crossfader} onChange={(event) => updateAudio({ crossfader: Number(event.target.value) })}/></label><div className="stage-audio-levels"><label><span>MASTER <b>{production.state.audio.master}%</b></span><input type="range" min="0" max="100" value={production.state.audio.master} onChange={(event) => updateAudio({ master: Number(event.target.value) })}/></label><div className="stage-bpm-stepper"><button onClick={() => updateAudio({ bpm: clamp(production.state.audio.bpm - 1, 60, 160) })} aria-label="Decrease BPM"><Minus/></button><output>{production.state.audio.bpm}</output><button onClick={() => updateAudio({ bpm: clamp(production.state.audio.bpm + 1, 60, 160) })} aria-label="Increase BPM"><Plus/></button></div></div><div className="stage-stinger-control"><label><span>STINGER</span><select value={production.state.audio.stingerTrack || ""} onChange={(event) => updateAudio({ stingerTrack: event.target.value ? event.target.value as StageDeckTrack : null })}><option value="">NO STINGER</option>{deckTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label><button disabled={!production.state.audio.stingerTrack} onClick={() => void fireStinger()}><Sparkles/>FIRE</button></div></section>

            <section className="stage-control-section"><header><div><span className="eyebrow">IN-WORLD SOUNDSCAPE</span><h2>Spatial atmosphere</h2></div><Headphones/></header><div className="stage-soundscape-grid">{SOUNDSCAPES.map((soundscape) => <button key={soundscape.id} className={production.state.audio.soundscape === soundscape.id ? "active" : ""} onClick={() => updateAudio({ soundscape: soundscape.id })}><span>{soundscape.label}</span><i/></button>)}</div></section>

            <section className="stage-control-section stage-podcast-runtime"><header><div><span className="eyebrow">PODCAST POD</span><h2>Record cue and rundown</h2></div><Mic2/></header><button className={production.state.audio.recording ? "recording" : ""} onClick={() => void toggleRecordingCue()}><CircleDot/><span>{production.state.audio.recording ? "STOP RECORD CUE" : "START RECORD CUE"}</span><time>{elapsedLabel(production.state.audio.recordStartedAt, runtimeNow)}</time></button><div><span><b>HOST</b><small>LiveKit voice</small></span><span><b>GUEST</b><small>Pod participant</small></span><span><b>BED</b><small>{SOUNDSCAPES.find((item) => item.id === production.state.audio.soundscape)?.label}</small></span></div></section>
          </div>

          <div className="stage-console-view" hidden={view !== "audience"}>
            <StageEventConsole room={production.room} event={production.state.event} connectedPods={production.state.connectedPods} generalSeats={production.state.generalSeats} vipSeats={production.state.vipSeats} missionId={activeMission.id} onUpdate={production.update}/>
          </div>

          <div className="stage-console-view" hidden={view !== "sponsors"}>
            <section className="stage-control-section"><header><div><span className="eyebrow">SPONSOR AD SERVER</span><h2>On-air inventory</h2></div><label className="stage-auto-ads"><input type="checkbox" checked={autoSponsor} onChange={(event) => setAutoSponsor(event.target.checked)}/><i/><span>AUTO</span></label></header><div className="stage-sponsor-list">{inventory.map((sponsor) => <button key={sponsor.id} className={production.state.sponsor.id === sponsor.id ? "active" : ""} onClick={() => selectSponsor(sponsor)} style={{ "--sponsor-accent": sponsor.accent } as React.CSSProperties}><i/><span><b>{sponsor.name}</b><small>{sponsor.headline}</small></span><MonitorPlay/></button>)}</div></section>
            <section className="stage-control-section stage-creative-builder"><header><div><span className="eyebrow">CREATIVE</span><h2>Add sponsor slate</h2></div><Sparkles/></header><label>Name<input value={sponsorDraft.name} onChange={(event) => setSponsorDraft((current) => ({ ...current, name: event.target.value }))} maxLength={30}/></label><label>Headline<input value={sponsorDraft.headline} onChange={(event) => setSponsorDraft((current) => ({ ...current, headline: event.target.value }))} maxLength={58}/></label><div><label>Call to action<input value={sponsorDraft.cta} onChange={(event) => setSponsorDraft((current) => ({ ...current, cta: event.target.value }))} maxLength={42}/></label><label className="stage-color-field">Color<input type="color" value={sponsorDraft.accent} onChange={(event) => setSponsorDraft((current) => ({ ...current, accent: event.target.value }))}/></label></div><button className="button secondary full" onClick={addSponsor} disabled={!sponsorDraft.name.trim() || !sponsorDraft.headline.trim()}><Plus/>Add and take to air</button></section>
          </div>
        </div>
      </aside>
    </div>
  </div>;
}
