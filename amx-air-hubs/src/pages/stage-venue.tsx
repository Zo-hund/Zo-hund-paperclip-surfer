import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, Glasses, Headphones, Maximize2, MessageSquare, RotateCcw, Users, Wifi } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAMX } from "../AppContext";
import { agents } from "../data";
import { useMemberAuth } from "../member-auth";
import type { StageVenueLayout } from "../stage-events";
import { useStageProduction } from "../stage-production";
import { useStageVenuePresence } from "../stage-venue-presence";
import type { StageVenueControls, StageVenueXRMode } from "../StageVenueWorld";
import "../stage-venue.css";

const StageVenueWorld = lazy(async () => ({ default: (await import("../StageVenueWorld")).StageVenueWorld }));
const LiveKitPod = lazy(async () => ({ default: (await import("../LiveKitPod")).LiveKitPod }));
const layouts: StageVenueLayout[] = ["theater", "arena", "expo-hall"];

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
  const production = useStageProduction(room, { readOnly: true });
  const member = useMemberAuth();
  const { settings } = useAMX();
  const presence = useStageVenuePresence(room, layout, member.profile);
  const controlsRef = useRef<StageVenueControls | null>(null);
  const [mode, setMode] = useState<StageVenueXRMode>("web");
  const [status, setStatus] = useState("Browser venue ready");
  const [commsOpen, setCommsOpen] = useState(false);
  const onReady = useCallback((controls: StageVenueControls | null) => { controlsRef.current = controls; }, []);

  const enter = async (nextMode: StageVenueXRMode) => {
    setMode(nextMode);
    try { setStatus(await controlsRef.current?.enter(nextMode) || "XR renderer is still loading"); }
    catch (error) { setStatus(error instanceof Error ? error.message : `${nextMode.toUpperCase()} could not start`); }
  };

  return <main className="stage-venue-page" data-layout={layout} data-xr-mode={mode}>
    <Suspense fallback={<div className="stage-venue-loading"><span/><b>Building {venueLabel(layout)}</b></div>}>
      <StageVenueWorld key={layout} layout={layout} production={production.state} participants={presence.participants} reducedMotion={settings.reducedMotion} onPose={presence.publishPose} onReady={onReady}/>
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

    <div className="stage-venue-mobile-controls" aria-label="Venue movement controls">
      <button onClick={() => controlsRef.current?.turn(-1)} aria-label="Turn left" title="Turn left"><RotateCcw/></button>
      <div><button onClick={() => controlsRef.current?.move(1, 0)} aria-label="Move forward"><ArrowUp/></button><span><button onClick={() => controlsRef.current?.move(0, -1)} aria-label="Move left"><ArrowLeft/></button><button onClick={() => controlsRef.current?.move(-1, 0)} aria-label="Move backward"><ArrowDown/></button><button onClick={() => controlsRef.current?.move(0, 1)} aria-label="Move right"><ArrowRight/></button></span></div>
      <button onClick={() => controlsRef.current?.recenter()} aria-label="Recenter position" title="Recenter"><Maximize2/></button>
    </div>

    <button className={`stage-venue-comms-toggle ${commsOpen ? "active" : ""}`} onClick={() => setCommsOpen((current) => !current)} aria-expanded={commsOpen} aria-controls="venue-comms"><Headphones/><span>Room comms</span><MessageSquare/></button>
    <aside id="venue-comms" className={`stage-venue-comms ${commsOpen ? "open" : ""}`} aria-hidden={!commsOpen}>
      <Suspense fallback={<div className="stage-venue-comms-loading">Preparing voice and video</div>}><LiveKitPod compact roomCode={room} agents={agents.slice(0, 2)} clientType="venue-member" participantName={member.profile?.display_name || "AMX Member"}/></Suspense>
    </aside>
  </main>;
}
