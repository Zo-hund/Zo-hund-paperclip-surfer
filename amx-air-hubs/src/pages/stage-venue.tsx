import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, ChevronLeft, Clapperboard, Focus, Glasses, Headphones, Maximize2, MessageSquare, Mic, MicOff, Radio, RotateCcw, Users, Video, Wifi } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAMX } from "../AppContext";
import { agents } from "../data";
import { useMemberAuth } from "../member-auth";
import type { StageVenueLayout } from "../stage-events";
import { useStageProduction } from "../stage-production";
import { stageCameraMotionPreset } from "../stage-camera-motion";
import { useStageVenuePresence } from "../stage-venue-presence";
import { nextStageCue, venueCommandFromVoice, type StageVenueOperatorCommand, type VenueFollowTarget } from "../stage-venue-production";
import type { StageVenueControls, StageVenueXRMode } from "../StageVenueWorld";
import type { NexusRoomControl } from "../nexus-room-control";
import type { NpcCommand } from "../npc-controller";
import type { LiveVideoFeed } from "../LiveKitPod";
import { selectStageProgramFeed } from "../stage-camera-routing";
import "../stage-venue.css";

const StageVenueWorld = lazy(async () => ({ default: (await import("../StageVenueWorld")).StageVenueWorld }));
const LiveKitPod = lazy(async () => ({ default: (await import("../LiveKitPod")).LiveKitPod }));
const layouts: StageVenueLayout[] = ["theater", "arena", "expo-hall"];

interface VenueSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { length: number; [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type VenueSpeechRecognitionConstructor = new () => VenueSpeechRecognition;

function venueLayout(value?: string): StageVenueLayout {
  return layouts.includes(value as StageVenueLayout) ? value as StageVenueLayout : "theater";
}

function venueLabel(value: StageVenueLayout) {
  return value === "expo-hall" ? "Expo Hall" : value[0].toUpperCase() + value.slice(1);
}

export function StageVenuePage() {
  const { venueId } = useParams();
  const [search] = useSearchParams();
  const layout = venueLayout(venueId);
  const room = (search.get("room") || "AMXSTAGE").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || "AMXSTAGE";
  const member = useMemberAuth();
  const isOperator = member.profile?.membership_role === "operator";
  const production = useStageProduction(room, { readOnly: !isOperator });
  const { settings } = useAMX();
  const presence = useStageVenuePresence(room, layout, member.profile);
  const controlsRef = useRef<StageVenueControls | null>(null);
  const roomControlRef = useRef<NexusRoomControl | null>(null);
  const recognitionRef = useRef<VenueSpeechRecognition | null>(null);
  const voiceControlRef = useRef<() => void>(() => undefined);
  const [mode, setMode] = useState<StageVenueXRMode>("web");
  const [status, setStatus] = useState("Browser venue ready");
  const [commsOpen, setCommsOpen] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [followTarget, setFollowTarget] = useState<VenueFollowTarget>("off");
  const [npcCommand, setNpcCommand] = useState<NpcCommand | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("Say a camera, show, crew, or agent command");
  const [videoFeeds, setVideoFeeds] = useState<LiveVideoFeed[]>([]);
  const programFeed = useMemo(() => selectStageProgramFeed(videoFeeds, production.state.shot, production.state.cameraRoutes[production.state.shot]), [production.state.cameraRoutes, production.state.shot, videoFeeds]);
  const onReady = useCallback((controls: StageVenueControls | null) => { controlsRef.current = controls; }, []);

  const enter = async (nextMode: StageVenueXRMode) => {
    setMode(nextMode);
    try { setStatus(await controlsRef.current?.enter(nextMode) || "XR renderer is still loading"); }
    catch (error) { setStatus(error instanceof Error ? error.message : `${nextMode.toUpperCase()} could not start`); }
  };

  const runOperatorCommand = useCallback((command: StageVenueOperatorCommand) => {
    if (!isOperator) { setStatus("Operator membership is required for production controls."); return; }
    if (command.kind === "voice") { voiceControlRef.current(); return; }
    if (command.kind === "shot") production.update({ shot: command.shot });
    if (command.kind === "motion") {
      const preset = stageCameraMotionPreset(command.motion);
      production.update({ shot: preset.baseShot, cameraMotion: { ...production.state.cameraMotion, id: command.motion, startedAt: Date.now() } });
    }
    if (command.kind === "follow") setFollowTarget(command.target);
    if (command.kind === "show") {
      if (command.action === "go-live") production.update({ live: true, cue: production.state.cue === "standby" ? "opening" : production.state.cue });
      if (command.action === "standby") production.update({ live: false, cue: "standby" });
      if (command.action === "next-cue") production.update({ cue: nextStageCue(production.state.cue) });
    }
    if (command.kind === "crew") {
      production.update({ cue: command.action === "call" ? "speaker" : command.action === "clear" ? "close" : "standby" });
    }
    if (command.kind === "npc") {
      const base = { id: crypto.randomUUID(), agentId: "jaz", cue: `Venue operator: ${command.action}` };
      const next: NpcCommand = command.action === "stage" ? { ...base, kind: "move", waypoint: "stage", arrivalAction: "wave" }
        : command.action === "patrol" || command.action === "follow" ? { ...base, kind: "behavior", behavior: "patrol" }
          : command.action === "hold" ? { ...base, kind: "stop" }
            : { ...base, kind: "action", action: command.action };
      setNpcCommand(next);
      void roomControlRef.current?.sendNpcCommand(next);
    }
    setStatus(`${command.kind.toUpperCase()} command sent to ${room}.`);
  }, [isOperator, production]);

  const toggleVoiceControl = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; setVoiceListening(false); return; }
    const speechWindow = window as unknown as { SpeechRecognition?: VenueSpeechRecognitionConstructor; webkitSpeechRecognition?: VenueSpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setStatus("Voice commands are unavailable in this browser. Use the controller or operator panel."); return; }
    const recognition = new Recognition();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.trim() || "";
      setVoiceTranscript(transcript || "No command heard");
      const command = venueCommandFromVoice(transcript);
      if (command) runOperatorCommand(command);
      else setStatus(`Voice command not recognized: ${transcript || "no speech"}`);
    };
    recognition.onerror = (event) => setStatus(event.error === "not-allowed" ? "Microphone permission is required for voice control." : `Voice control error: ${event.error}`);
    recognition.onend = () => { recognitionRef.current = null; setVoiceListening(false); };
    recognitionRef.current = recognition;
    try { recognition.start(); setVoiceListening(true); setVoiceTranscript("Listening..."); setStatus("Voice control listening for one production command."); }
    catch { recognitionRef.current = null; setVoiceListening(false); setStatus("Voice control could not start. Check microphone permission."); }
  }, [runOperatorCommand]);
  voiceControlRef.current = toggleVoiceControl;
  useEffect(() => () => recognitionRef.current?.stop(), []);

  return <main className="stage-venue-page" data-layout={layout} data-xr-mode={mode}>
    <Suspense fallback={<div className="stage-venue-loading"><span/><b>Building {venueLabel(layout)}</b></div>}>
      <StageVenueWorld key={layout} layout={layout} production={production.state} programFeed={programFeed} programMedia={production.state.programMedia} participants={presence.participants} reducedMotion={settings.reducedMotion} operator={isOperator} npcCommand={npcCommand} followTarget={followTarget} onOperatorCommand={runOperatorCommand} onPose={presence.publishPose} onReady={onReady}/>
    </Suspense>

    <header className="stage-venue-header">
      <Link to="/missions" className="stage-venue-icon" aria-label="Leave venue" title="Leave venue"><ChevronLeft/></Link>
      <div><span>AMX XR VENUE / {room}</span><h1>{production.state.event.title}</h1></div>
      <div className="stage-venue-tally"><span className={production.state.live ? "live" : "ready"}><i/>{production.state.live ? "LIVE" : "LOBBY"}</span><span><Users/>{presence.participants.length + 1}</span><span><Wifi/>{presence.transport}</span></div>
    </header>

    <nav className="stage-venue-layouts" aria-label="Venue layout">
      {layouts.map((item) => <Link key={item} className={item === layout ? "active" : ""} to={`/venues/${item}?room=${room}`}>{venueLabel(item)}</Link>)}
    </nav>

    <div className="stage-venue-modes" role="group" aria-label="Immersive mode">
      {(["web", "ar", "vr", "mr"] as StageVenueXRMode[]).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => void enter(item)}><Glasses/><span>{item.toUpperCase()}</span></button>)}
    </div>

    <section className="stage-venue-program" aria-live="polite">
      <span>{production.state.cue.toUpperCase()} / {production.state.shot.toUpperCase()}</span>
      <b>{production.state.sponsor.name}</b>
      <small>{status}</small>
    </section>

    {isOperator && <>
      <button className={`stage-venue-operator-toggle ${operatorOpen ? "active" : ""}`} onClick={() => setOperatorOpen((current) => !current)} aria-expanded={operatorOpen} aria-controls="venue-operator" title="Production controls"><Clapperboard/><span>Operator</span></button>
      <aside id="venue-operator" className={`stage-venue-operator ${operatorOpen ? "open" : ""}`} aria-hidden={!operatorOpen}>
        <header><div><span>XR OPERATOR / {room}</span><b>{production.state.live ? "ON AIR" : "STANDBY"}</b></div><Radio className={production.state.live ? "live" : ""}/></header>
        <div className="stage-venue-operator-grid" aria-label="Production camera shots">
          {(["wide", "host", "audience", "crane"] as const).map((shot) => <button key={shot} className={production.state.shot === shot ? "active" : ""} onClick={() => runOperatorCommand({ kind: "shot", shot })}><Video/><span>{shot}</span></button>)}
        </div>
        <div className="stage-venue-operator-grid" aria-label="Camera follow controls">
          {(["off", "host", "crew", "agent"] as VenueFollowTarget[]).map((target) => <button key={target} className={followTarget === target ? "active" : ""} onClick={() => runOperatorCommand({ kind: "follow", target })}><Focus/><span>{target}</span></button>)}
        </div>
        <div className="stage-venue-operator-grid compact" aria-label="Show and agent controls">
          <button onClick={() => runOperatorCommand({ kind: "show", action: production.state.live ? "standby" : "go-live" })}><Radio/><span>{production.state.live ? "Standby" : "Go live"}</span></button>
          <button onClick={() => runOperatorCommand({ kind: "show", action: "next-cue" })}><Clapperboard/><span>Next cue</span></button>
          <button onClick={() => runOperatorCommand({ kind: "npc", action: "stage" })}><Bot/><span>Agent stage</span></button>
          <button onClick={() => runOperatorCommand({ kind: "npc", action: "wave" })}><Bot/><span>Agent wave</span></button>
          <button onClick={() => runOperatorCommand({ kind: "crew", action: "call" })}><Users/><span>Call crew</span></button>
          <button onClick={() => runOperatorCommand({ kind: "crew", action: "hold" })}><Users/><span>Hold crew</span></button>
        </div>
        <button className={`stage-venue-voice ${voiceListening ? "active" : ""}`} onClick={toggleVoiceControl} aria-pressed={voiceListening}>{voiceListening ? <MicOff/> : <Mic/>}<span>{voiceTranscript}</span></button>
      </aside>
    </>}

    <div className="stage-venue-mobile-controls" aria-label="Venue movement controls">
      <button onClick={() => controlsRef.current?.turn(-1)} aria-label="Turn left" title="Turn left"><RotateCcw/></button>
      <div><button onClick={() => controlsRef.current?.move(1, 0)} aria-label="Move forward"><ArrowUp/></button><span><button onClick={() => controlsRef.current?.move(0, -1)} aria-label="Move left"><ArrowLeft/></button><button onClick={() => controlsRef.current?.move(-1, 0)} aria-label="Move backward"><ArrowDown/></button><button onClick={() => controlsRef.current?.move(0, 1)} aria-label="Move right"><ArrowRight/></button></span></div>
      <button onClick={() => controlsRef.current?.recenter()} aria-label="Recenter position" title="Recenter"><Maximize2/></button>
    </div>

    <button className={`stage-venue-comms-toggle ${commsOpen ? "active" : ""}`} onClick={() => setCommsOpen((current) => !current)} aria-expanded={commsOpen} aria-controls="venue-comms"><Headphones/><span>Room comms</span><MessageSquare/></button>
    <aside id="venue-comms" className={`stage-venue-comms ${commsOpen ? "open" : ""}`} aria-hidden={!commsOpen}>
      <Suspense fallback={<div className="stage-venue-comms-loading">Preparing voice and video</div>}><LiveKitPod compact autoJoin roomCode={room} agents={agents.slice(0, 2)} clientType={isOperator ? "operator" : "venue-member"} participantName={member.profile?.display_name || "AMX Member"} onVideoFeeds={setVideoFeeds} onControlReady={(control) => { roomControlRef.current = control; }} onRemoteNpcCommand={setNpcCommand}/></Suspense>
    </aside>
  </main>;
}
