import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Bot, Box, BrainCircuit, Camera, Cpu, Crosshair, Database, Gauge, Lightbulb,
  LocateFixed, MapPin, MonitorPlay, Radio, RefreshCw, Router, Satellite, ScanLine, Server, Sun, Users, Video, Wifi, Zap,
} from "lucide-react";
import { agents } from "../data";
import { useGeoAnchors, type GeoAnchor } from "../geospatial";

import type {
  LightPreset, LocationPanelData, ProductionScreenId, ScreenProgram, ScreenSourceId,
  ScreenLayoutMode, ScreenStinger, ScreenTransitionStyle, ScreenWallFit, ScreenWallFormat, VideoFit, WorldCameraCapture, WorldCameraId,
} from "../NexusRoomScene";
import type { MapLocationSelection } from "../GoogleLocationPanel";
import { Metric, StatusPill } from "../components";
import { useAMX } from "../AppContext";
import { DEFAULT_NEXUS_AVATAR_URL } from "../avatar-presets";
import { DEFAULT_NPC_STATE, type NpcCommand, type NpcRuntimeState } from "../npc-controller";
import { normalizeNexusGlobeLevel, normalizeNexusVfxPreset, type NexusGlobeLevel, type NexusVfxPreset } from "../nexus-vfx";
import { NexusBroadcastConsole } from "../NexusBroadcastConsole";
import { defaultWorldCameraControls, normalizeWorldCameraControl } from "../world-camera-control";
import { normalizeScreenLayoutMode, normalizeScreenWallFit, normalizeScreenWallFormat } from "../screen-wall";

const LiveKitPod = lazy(async () => ({ default: (await import("../LiveKitPod")).LiveKitPod }));
const NexusRoomScene = lazy(async () => ({ default: (await import("../NexusRoomScene")).NexusRoomScene }));
const SpatialPresenceConsole = lazy(async () => ({ default: (await import("../SpatialPresenceConsole")).SpatialPresenceConsole }));
const DigitalTwinLab = lazy(async () => ({ default: (await import("../DigitalTwinLab")).DigitalTwinLab }));
const NexusMediaPlayer = lazy(async () => ({ default: (await import("../NexusMediaPlayer")).NexusMediaPlayer }));
const NexusProductionSwitcher = lazy(async () => ({ default: (await import("../NexusProductionSwitcher")).NexusProductionSwitcher }));
const GoogleLocationPanel = lazy(async () => ({ default: (await import("../GoogleLocationPanel")).GoogleLocationPanel }));
const RunwayAvatarConsole = lazy(async () => ({ default: (await import("../RunwayAvatarConsole")).RunwayAvatarConsole }));

type NexusTab = "room" | "twin" | "anchors" | "fleet" | "factory";
type RoomConsoleView = "npc" | "pod" | "media" | "vision" | "runway";

const SCREEN_IDS: ProductionScreenId[] = ["Screen_User", "Screen_Agent_Left", "Screen_Agent_Right"];
const SOURCE_IDS: ScreenSourceId[] = ["camera-1", "camera-2", "camera-3", "media", "map", "runway", "amx-air", "amx-labs", "black"];
const DEFAULT_SCREEN_PROGRAM: ScreenProgram = {
  Screen_User: "amx-air",
  Screen_Agent_Left: "amx-labs",
  Screen_Agent_Right: "amx-air",
};

function savedScreenProgram(): ScreenProgram {
  try {
    const saved = JSON.parse(localStorage.getItem("amx_nexus_screen_program") || "null") as Partial<ScreenProgram> | null;
    if (saved && SCREEN_IDS.every((screen) => SOURCE_IDS.includes(saved[screen] as ScreenSourceId))) return saved as ScreenProgram;
  } catch {
    // A corrupt operator preference should never prevent the room from loading.
  }
  return DEFAULT_SCREEN_PROGRAM;
}

function savedScreenMode(): ScreenLayoutMode {
  return normalizeScreenLayoutMode(localStorage.getItem("amx_nexus_screen_mode"));
}

function savedScreenWallFit(): ScreenWallFit {
  return normalizeScreenWallFit(localStorage.getItem("amx_nexus_screen_wall_fit"));
}

function savedScreenWallFormat(): ScreenWallFormat {
  return normalizeScreenWallFormat(localStorage.getItem("amx_nexus_screen_wall_format"));
}

function savedScreenWallSource(): ScreenSourceId {
  const source = localStorage.getItem("amx_nexus_screen_wall_source") as ScreenSourceId | null;
  return source && SOURCE_IDS.includes(source) ? source : "amx-air";
}

function useNexusTelemetry() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setTick((value) => value + 1), 1800); return () => window.clearInterval(timer); }, []);
  return useMemo(() => ({
    fps: 59 + Math.round(Math.sin(tick * 0.7)),
    latency: 18 + Math.round(Math.abs(Math.sin(tick * 0.42)) * 9),
    gpu: 54 + Math.round(Math.sin(tick * 0.5) * 7),
    agentsOnline: agents.length,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  }), [tick]);
}

function GeoMap({ anchors, onSelect }: { anchors: GeoAnchor[]; onSelect: (anchor: GeoAnchor) => void }) {
  return <div className="nexus-geo-map">
    <div className="geo-grid"/><div className="geo-origin"><Crosshair/></div>
    {anchors.slice(-30).map((anchor, index) => {
      const x = Math.max(7, Math.min(93, 50 + anchor.localPosition[0] * 2.2));
      const y = Math.max(7, Math.min(93, 50 + anchor.localPosition[2] * 2.2));
      return <button key={anchor.id} className={`geo-pin ${anchor.source}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => onSelect(anchor)} title={anchor.label}><MapPin/><span>{index + 1}</span></button>;
    })}
    <div className="geo-map-scale"><i/>10 m local radius</div>
  </div>;
}

export function NexusPage() {
  const { settings } = useAMX();
  const [tab, setTab] = useState<NexusTab>("room");
  const [roomConsoleView, setRoomConsoleView] = useState<RoomConsoleView>("npc");
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("amx_nexus_room") || "NEXUS1");
  const [lightPreset, setLightPreset] = useState<LightPreset>("mission");
  const [vfxPreset, setVfxPreset] = useState<NexusVfxPreset>(() => normalizeNexusVfxPreset(localStorage.getItem("amx_nexus_vfx_preset")));
  const [globeLevel, setGlobeLevel] = useState<NexusGlobeLevel>(() => normalizeNexusGlobeLevel(localStorage.getItem("amx_nexus_globe_level")));
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [sceneStreams, setSceneStreams] = useState<MediaStream[]>([]);
  const [mediaElement, setMediaElement] = useState<HTMLVideoElement | null>(null);
  const [runwayElement, setRunwayElement] = useState<HTMLVideoElement | null>(null);
  const [mediaFit, setMediaFit] = useState<VideoFit>("contain");
  const [screenProgram, setScreenProgram] = useState<ScreenProgram>(savedScreenProgram);
  const [screenMode, setScreenMode] = useState<ScreenLayoutMode>(savedScreenMode);
  const [screenWallSource, setScreenWallSource] = useState<ScreenSourceId>(savedScreenWallSource);
  const [screenWallFit, setScreenWallFit] = useState<ScreenWallFit>(savedScreenWallFit);
  const [screenWallFormat, setScreenWallFormat] = useState<ScreenWallFormat>(savedScreenWallFormat);
  const [screenStinger, setScreenStinger] = useState<ScreenStinger | null>(null);
  const [mapLocation, setMapLocation] = useState<MapLocationSelection | null>(null);
  const [activeWorldCamera, setActiveWorldCamera] = useState<WorldCameraId>("overview");
  const [worldCameraControls, setWorldCameraControls] = useState(defaultWorldCameraControls);
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem("amx_ready_player_me_avatar") || DEFAULT_NEXUS_AVATAR_URL);
  const [avatarState, setAvatarState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [npcCommand, setNpcCommand] = useState<NpcCommand | null>(null);
  const [npcState, setNpcState] = useState<NpcRuntimeState>(DEFAULT_NPC_STATE);
  const worldCaptureRef = useRef<WorldCameraCapture | null>(null);
  const stingerTimerRef = useRef<number | null>(null);
  const stingerSequence = useRef(0);
  const runwayCommandSequence = useRef(0);
  const [anchorLabel, setAnchorLabel] = useState("Nexus waypoint");
  const [selectedAnchor, setSelectedAnchor] = useState<GeoAnchor | null>(null);
  const [rendererBackend, setRendererBackend] = useState<"initializing" | "webgpu" | "webgl2">("initializing");
  const geo = useGeoAnchors(roomCode);
  const telemetry = useNexusTelemetry();
  const crew = agents.slice(0, 4);
  const captureWorld = useCallback<WorldCameraCapture>((camera) => worldCaptureRef.current?.(camera) || Promise.resolve(null), []);
  const bindPanelVideo = useCallback((video: HTMLVideoElement | null, fit: VideoFit) => {
    setMediaElement(video);
    setMediaFit(fit);
  }, []);
  const bindRunwayVideo = useCallback((video: HTMLVideoElement | null) => {
    setRunwayElement(video);
  }, []);
  const updateVfxPreset = useCallback((preset: NexusVfxPreset) => {
    setVfxPreset(preset);
    localStorage.setItem("amx_nexus_vfx_preset", preset);
  }, []);
  const updateGlobeLevel = useCallback((level: NexusGlobeLevel) => {
    setGlobeLevel(level);
    localStorage.setItem("amx_nexus_globe_level", level);
  }, []);
  useEffect(() => () => {
    if (stingerTimerRef.current !== null) window.clearTimeout(stingerTimerRef.current);
  }, []);
  const updateAvatar = useCallback((url: string) => {
    setAvatarUrl(url);
    if (url && !url.startsWith("blob:")) localStorage.setItem("amx_ready_player_me_avatar", url);
    else localStorage.removeItem("amx_ready_player_me_avatar");
  }, []);

  const updateRoom = (value: string) => {
    const safe = value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
    setRoomCode(safe);
    localStorage.setItem("amx_nexus_room", safe);
  };
  const issueRunwayNpcCommand = (command: Omit<NpcCommand, "id" | "agentId">) => {
    setNpcCommand({ ...command, id: `runway-${Date.now()}-${++runwayCommandSequence.current}`, agentId: npcState.agentId || crew[0].id });
  };
  const publishMapAnchor = (location: MapLocationSelection) => {
    const anchor = geo.publishAnchor({
      label: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: 5,
      localPosition: [0, 0, -2],
      source: "map",
    });
    setSelectedAnchor(anchor);
  };
  const locationPanel = useMemo<LocationPanelData | null>(() => mapLocation ? {
    ...mapLocation,
    roomCode,
  } : null, [mapLocation, roomCode]);
  const screenSourcesAvailable = useMemo<Partial<Record<ScreenSourceId, boolean>>>(() => ({
    "camera-1": Boolean(sceneStreams[0] || localStream),
    "camera-2": Boolean(sceneStreams[1]),
    "camera-3": Boolean(sceneStreams[2]),
    media: Boolean(mediaElement),
    map: Boolean(locationPanel),
    runway: Boolean(runwayElement),
    "amx-air": true,
    "amx-labs": true,
    black: true,
  }), [localStream, locationPanel, mediaElement, runwayElement, sceneStreams]);
  const takeScreenProgram = useCallback((next: ScreenProgram, transition: ScreenTransitionStyle, targets: ProductionScreenId[]) => {
    if (stingerTimerRef.current !== null) window.clearTimeout(stingerTimerRef.current);
    if (transition === "cut" || settings.reducedMotion) {
      setScreenProgram(next);
      setScreenStinger(null);
      localStorage.setItem("amx_nexus_screen_program", JSON.stringify(next));
      return;
    }
    setScreenStinger({
      id: ++stingerSequence.current,
      targets,
      brand: transition === "dip" ? "dip" : transition,
    });
    stingerTimerRef.current = window.setTimeout(() => {
      setScreenProgram(next);
      setScreenStinger(null);
      localStorage.setItem("amx_nexus_screen_program", JSON.stringify(next));
      stingerTimerRef.current = null;
    }, transition === "dip" ? 360 : 920);
  }, [settings.reducedMotion]);
  const takeScreen = useCallback((targets: ProductionScreenId[], source: ScreenSourceId, transition: ScreenTransitionStyle) => {
    const next = { ...screenProgram };
    targets.forEach((target) => { next[target] = source; });
    takeScreenProgram(next, transition, targets);
  }, [screenProgram, takeScreenProgram]);
  const updateScreenMode = useCallback((mode: ScreenLayoutMode) => {
    if (stingerTimerRef.current !== null) window.clearTimeout(stingerTimerRef.current);
    stingerTimerRef.current = null;
    setScreenStinger(null);
    setScreenMode(mode);
    localStorage.setItem("amx_nexus_screen_mode", mode);
  }, []);
  const updateScreenWallFit = useCallback((fit: ScreenWallFit) => {
    setScreenWallFit(fit);
    localStorage.setItem("amx_nexus_screen_wall_fit", fit);
  }, []);
  const updateScreenWallFormat = useCallback((format: ScreenWallFormat) => {
    setScreenWallFormat(format);
    localStorage.setItem("amx_nexus_screen_wall_format", format);
  }, []);
  const takeScreenWall = useCallback((source: ScreenSourceId, transition: ScreenTransitionStyle) => {
    if (stingerTimerRef.current !== null) window.clearTimeout(stingerTimerRef.current);
    const complete = () => {
      setScreenWallSource(source);
      setScreenStinger(null);
      localStorage.setItem("amx_nexus_screen_wall_source", source);
      stingerTimerRef.current = null;
    };
    if (transition === "cut" || settings.reducedMotion) {
      complete();
      return;
    }
    setScreenStinger({
      id: ++stingerSequence.current,
      targets: SCREEN_IDS,
      brand: transition === "dip" ? "dip" : transition,
    });
    stingerTimerRef.current = window.setTimeout(complete, transition === "dip" ? 360 : 920);
  }, [settings.reducedMotion]);
  const addAnchor = () => {
    if (geo.locationStatus !== "ready") geo.requestLocation();
    const index = geo.anchors.length;
    const anchor = geo.publishAnchor({
      label: anchorLabel.trim() || `Waypoint ${index + 1}`,
      localPosition: [((index % 5) - 2) * 1.8, 0, -2 - Math.floor(index / 5) * 1.6],
      source: "map",
    });
    setSelectedAnchor(anchor);
  };

  return <div className="page nexus-page">
    <header className="nexus-workspace-bar">
      <div className="nexus-workspace-title"><span className="eyebrow">NEXUS CORE / WEBGPU</span><h1>Spatial operations</h1></div>
      <div className="nexus-workspace-health"><span><i className="live-dot"/>ONLINE</span><span><Wifi/>{telemetry.latency} ms</span><span><Gauge/>{telemetry.fps} FPS</span><span><Cpu/>{rendererBackend === "webgpu" ? "WEBGPU" : rendererBackend === "webgl2" ? "WEBGL2" : "GPU INIT"}</span><time>{telemetry.timestamp}</time></div>
      <div className="nexus-tabs" role="tablist">{([
        ["room", "Room", Box], ["twin", "Twin", BrainCircuit], ["anchors", "Anchors", Satellite], ["fleet", "Fleet", Router], ["factory", "Factory", Cpu],
      ] as const).map(([id, label, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon/>{label}</button>)}</div>
    </header>

    {tab === "room" && <div className="nexus-command-layout">
      <section className="nexus-scene-band">
        <Suspense fallback={<div className="nexus-scene-loading"><span/><b>Preparing spatial renderer</b></div>}><NexusRoomScene localStream={localStream} sceneStreams={sceneStreams} mediaElement={mediaElement} runwayElement={runwayElement} mediaFit={mediaFit} locationPanel={locationPanel} screenProgram={screenProgram} screenStinger={screenStinger} screenMode={screenMode} screenWallSource={screenWallSource} screenWallFit={screenWallFit} screenWallFormat={screenWallFormat} anchors={geo.projectedAnchors} lightPreset={lightPreset} vfxPreset={vfxPreset} globeLevel={globeLevel} reducedMotion={settings.reducedMotion} avatarUrl={avatarUrl} npcCommand={npcCommand} activeWorldCamera={activeWorldCamera} cameraControl={worldCameraControls[activeWorldCamera]} onCaptureReady={(capture) => { worldCaptureRef.current = capture; }} onAvatarState={setAvatarState} onNpcState={setNpcState} onBackend={setRendererBackend}/></Suspense>
        <div className="nexus-scene-overlay"><div><span className="eyebrow">BLENDER GLB / {rendererBackend === "webgpu" ? "WEBGPU" : rendererBackend === "webgl2" ? "WEBGL2 FALLBACK" : "GPU INIT"}</span><b>{activeWorldCamera === "overview" ? "NEXUS CONTROL ROOM" : `${activeWorldCamera === "briefing" ? "STAGE RIGHT" : activeWorldCamera.toUpperCase()} CAMERA / LIVE`}</b>{avatarState !== "idle" && <small className={`scene-avatar-state ${avatarState}`}>AVATAR {avatarState.toUpperCase()} / NPC {npcState.action.toUpperCase()}</small>}</div><div className="scene-light-controls" aria-label="Room light preset"><Lightbulb/>{(["standby", "mission", "focus"] as LightPreset[]).map((preset) => <button key={preset} className={lightPreset === preset ? "active" : ""} onClick={() => setLightPreset(preset)}>{preset === "focus" ? <Sun/> : preset}</button>)}</div></div>
      </section>
      <aside className="nexus-room-console">
        <div className="nexus-console-tabs" role="tablist" aria-label="Room console view">{([
          ["npc", "NPC", Bot], ["runway", "Avatar", Video], ["pod", "Pod", Radio], ["media", "Media", MonitorPlay], ["vision", "Vision", ScanLine],
        ] as const).map(([id, label, Icon]) => <button key={id} className={roomConsoleView === id ? "active" : ""} onClick={() => setRoomConsoleView(id)}><Icon/><span>{label}</span>{id === "npc" && <i className={npcState.moving ? "moving" : ""}/>}</button>)}</div>
        <div className="nexus-console-body">
          <div className="nexus-console-view" hidden={roomConsoleView !== "npc" && roomConsoleView !== "vision"}>
            <Suspense fallback={<div className="pod-camera-off"><Radio/><span>Preparing spatial controls</span></div>}><SpatialPresenceConsole view={roomConsoleView === "vision" ? "vision" : "npc"} agents={crew} localStream={localStream} activeCamera={activeWorldCamera} onActiveCamera={setActiveWorldCamera} cameraControl={worldCameraControls[activeWorldCamera]} onCameraControl={(control) => setWorldCameraControls((current) => ({ ...current, [activeWorldCamera]: normalizeWorldCameraControl(control) }))} captureWorld={captureWorld} avatarUrl={avatarUrl} onAvatarUrl={updateAvatar} npcState={npcState} onNpcCommand={setNpcCommand}/></Suspense>
          </div>
          <div className="nexus-console-view" hidden={roomConsoleView !== "pod"}>
            <div className="nexus-room-code"><label htmlFor="nexus-room-code">ROOM CHANNEL</label><input id="nexus-room-code" value={roomCode} onChange={(event) => updateRoom(event.target.value)}/><small>Anchors and media use this room scope.</small></div>
            <NexusBroadcastConsole roomCode={roomCode}/>
            <Suspense fallback={<div className="pod-camera-off"><Radio/><span>Preparing room media</span></div>}><LiveKitPod compact roomCode={roomCode} agents={crew} onLocalStream={setLocalStream} onSceneStreams={setSceneStreams}/></Suspense>
          </div>
          <div className="nexus-console-view" hidden={roomConsoleView !== "media"}>
            <div className="nexus-content-deck"><div className="content-deck-title"><span className="eyebrow">WORLD CONTENT DECK</span><b>Production routing</b></div>
              <Suspense fallback={<div className="pod-camera-off"><Radio/><span>Preparing production switcher</span></div>}><NexusProductionSwitcher roomCode={roomCode} mode={screenMode} wallSource={screenWallSource} wallFit={screenWallFit} wallFormat={screenWallFormat} vfxPreset={vfxPreset} globeLevel={globeLevel} program={screenProgram} available={screenSourcesAvailable} transitioning={Boolean(screenStinger)} onMode={updateScreenMode} onWallFit={updateScreenWallFit} onWallFormat={updateScreenWallFormat} onVfxPreset={updateVfxPreset} onGlobeLevel={updateGlobeLevel} onTakeWall={takeScreenWall} onTake={takeScreen} onTakeLayout={(next, transition) => takeScreenProgram(next, transition, SCREEN_IDS)}/></Suspense>
              <Suspense fallback={<div className="pod-camera-off"><Radio/><span>Preparing media player</span></div>}><NexusMediaPlayer onPanelVideo={bindPanelVideo}/></Suspense>
              <Suspense fallback={<div className="pod-camera-off"><Radio/><span>Preparing location map</span></div>}><GoogleLocationPanel agent={crew[0]} roomCode={roomCode} onSelection={setMapLocation} onPublishAnchor={publishMapAnchor}/></Suspense>
            </div>
          </div>
          <div className="nexus-console-view" hidden={roomConsoleView !== "runway"}>
            <Suspense fallback={<div className="pod-camera-off"><Radio/><span>Preparing Runway Characters</span></div>}><RunwayAvatarConsole roomCode={roomCode} agentId={npcState.agentId || crew[0].id} onWorldCamera={setActiveWorldCamera} onMoveNpc={(waypoint) => issueRunwayNpcCommand({ kind: "move", waypoint })} onNpcAction={(action) => issueRunwayNpcCommand({ kind: "action", action })} onOpenPanel={setRoomConsoleView} onPanelVideo={bindRunwayVideo}/></Suspense>
          </div>
        </div>
      </aside>
    </div>}

    {tab === "twin" && <Suspense fallback={<div className="section-wrap nexus-scene-loading"><span/><b>Preparing AI digital twin</b></div>}><DigitalTwinLab roomCode={roomCode} reducedMotion={settings.reducedMotion} onBackend={setRendererBackend}/></Suspense>}

    {tab === "anchors" && <div className="section-wrap nexus-anchor-layout">
      <section className="nexus-anchor-map-panel"><div className="section-heading"><div><span className="eyebrow">REALTIME SPATIAL MAP</span><h2>Room anchors</h2></div><StatusPill tone={geo.locationStatus === "ready" ? "green" : "gold"}>{geo.locationStatus}</StatusPill></div><GeoMap anchors={geo.projectedAnchors} onSelect={setSelectedAnchor}/><div className="geo-coordinate-strip"><span><LocateFixed/>{geo.location ? `${geo.location.latitude.toFixed(6)}, ${geo.location.longitude.toFixed(6)}` : "Location not enabled"}</span><span>Accuracy {geo.location ? `${Math.round(geo.location.accuracy)} m` : "--"}</span><button className="button secondary" onClick={geo.requestLocation}><RefreshCw/>Refresh location</button></div></section>
      <aside className="nexus-anchor-console"><span className="eyebrow">ANCHOR TOOL</span><h2>Publish waypoint</h2><label>Anchor label<input value={anchorLabel} onChange={(event) => setAnchorLabel(event.target.value)} maxLength={80}/></label><button className="button primary full" onClick={addAnchor}><MapPin/>Place realtime anchor</button>{geo.locationError && <p className="inline-error">{geo.locationError}</p>}<div className="anchor-list">{geo.anchors.slice().reverse().map((anchor) => <button className={selectedAnchor?.id === anchor.id ? "active" : ""} key={anchor.id} onClick={() => setSelectedAnchor(anchor)}><MapPin/><span><b>{anchor.label}</b><small>{anchor.source} / {anchor.ownerId}</small></span><i>{anchor.accuracy ? `${Math.round(anchor.accuracy)}m` : "local"}</i></button>)}</div>{selectedAnchor && <div className="selected-anchor"><b>{selectedAnchor.label}</b><code>{selectedAnchor.id}</code><span>{selectedAnchor.latitude?.toFixed(6) || "local"} / {selectedAnchor.longitude?.toFixed(6) || "transform"}</span><button className="button ghost full" onClick={() => { geo.removeAnchor(selectedAnchor); setSelectedAnchor(null); }}>Remove anchor</button></div>}</aside>
    </div>}

    {tab === "fleet" && <div className="section-wrap nexus-fleet-view"><div className="signal-grid"><Metric label="Active devices" value="12" delta="8 spatial / 4 mobile" icon={Camera}/><Metric label="Agent workers" value={agents.length} delta="All healthy" icon={Bot}/><Metric label="Realtime latency" value={`${telemetry.latency} ms`} delta="Supabase channel" icon={Activity}/><Metric label="Anchor records" value={geo.anchors.length} delta={`Room ${roomCode}`} icon={MapPin}/></div><section className="nexus-device-table"><div className="nexus-table-head"><span>NODE</span><span>RUNTIME</span><span>LOAD</span><span>ROOM</span><span>STATE</span></div>{[
      ["XR-POD-01", "Quest / WebXR", "48%", roomCode], ["MOBILE-07", "Android / AR", "33%", roomCode], ["BLENDER-OPS", "Three.js renderer", `${telemetry.gpu}%`, "NEXUS"], ["AGENT-ROUTER", "Worker / AI", "26%", "GLOBAL"],
    ].map((device) => <div className="nexus-table-row" key={device[0]}><b>{device[0]}</b><span>{device[1]}</span><span>{device[2]}</span><code>{device[3]}</code><StatusPill tone="green">online</StatusPill></div>)}</section></div>}

    {tab === "factory" && <div className="section-wrap nexus-factory-view"><section><div className="section-heading"><div><span className="eyebrow">HUMAN AGENTIC AI</span><h2>Agent orchestration</h2></div><StatusPill tone="green">POLICY ACTIVE</StatusPill></div><div className="agent-routing-flow"><div><Users/><b>Human intent</b><span>Voice, touch, spatial input</span></div><i><Zap/></i><div><Cpu/><b>Nexus router</b><span>Tools, memory, safety</span></div><i><Zap/></i><div><Bot/><b>Agent crew</b><span>Role-aware action</span></div></div></section><aside><span className="eyebrow">CORE SERVICES</span>{[{icon:Database,label:"Realtime memory",value:"connected"},{icon:Server,label:"Worker gateway",value:"secure"},{icon:Radio,label:"Skill Pod events",value:"streaming"},{icon:Satellite,label:"Spatial anchors",value:`${geo.anchors.length} active`}].map(({icon:Icon,label,value}) => <div className="factory-service" key={label}><Icon/><span><b>{label}</b><small>{value}</small></span><i/></div>)}</aside></div>}
  </div>;
}
