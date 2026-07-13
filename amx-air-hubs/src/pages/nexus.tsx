import { useEffect, useMemo, useState } from "react";
import {
  Activity, Bot, Box, Camera, Cpu, Crosshair, Database, Gauge, Lightbulb,
  LocateFixed, MapPin, Radio, RefreshCw, Router, Satellite, Server, Sun, Users, Wifi, Zap,
} from "lucide-react";
import { agents } from "../data";
import { useGeoAnchors, type GeoAnchor } from "../geospatial";
import { LiveKitPod } from "../LiveKitPod";
import { NexusRoomScene, type LightPreset } from "../NexusRoomScene";
import { Metric, PageHeader, StatusPill } from "../components";
import { useAMX } from "../AppContext";

type NexusTab = "room" | "anchors" | "fleet" | "factory";

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
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("amx_nexus_room") || "NEXUS1");
  const [lightPreset, setLightPreset] = useState<LightPreset>("mission");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [anchorLabel, setAnchorLabel] = useState("Nexus waypoint");
  const [selectedAnchor, setSelectedAnchor] = useState<GeoAnchor | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const geo = useGeoAnchors(roomCode);
  const telemetry = useNexusTelemetry();
  const crew = agents.slice(0, 4);

  const updateRoom = (value: string) => {
    const safe = value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
    setRoomCode(safe);
    localStorage.setItem("amx_nexus_room", safe);
  };
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
    <div className="section-wrap"><PageHeader eyebrow="NEXUS CORE / THREE.JS" title="AMX spatial operations" description="Operate Blender-authored XR spaces, LiveKit Skill Pods, agent systems, and synchronized geospatial anchors from one room." actions={<StatusPill tone={sceneReady ? "green" : "gold"}>{sceneReady ? "3D room ready" : "Loading scene"}</StatusPill>}/></div>
    <div className="nexus-status-band"><div className="section-wrap"><span><i className="live-dot"/>NEXUS ONLINE</span><span><Wifi/>{telemetry.latency} ms</span><span><Gauge/>{telemetry.fps} FPS</span><span><Cpu/>GPU {telemetry.gpu}%</span><span><Bot/>{telemetry.agentsOnline} agents</span><time>{telemetry.timestamp}</time></div></div>
    <div className="section-wrap nexus-tabs" role="tablist">{([
      ["room", "Spatial room", Box], ["anchors", "Geo anchors", Satellite], ["fleet", "Fleet", Router], ["factory", "AI factory", Cpu],
    ] as const).map(([id, label, Icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon/>{label}</button>)}</div>

    {tab === "room" && <div className="nexus-command-layout">
      <section className="nexus-scene-band">
        <NexusRoomScene localStream={localStream} anchors={geo.projectedAnchors} lightPreset={lightPreset} reducedMotion={settings.reducedMotion} onReady={() => setSceneReady(true)}/>
        <div className="nexus-scene-overlay"><div><span className="eyebrow">BLENDER GLB / LIVE THREE.JS</span><b>NEXUS CONTROL ROOM</b></div><div className="scene-light-controls" aria-label="Room light preset"><Lightbulb/>{(["standby", "mission", "focus"] as LightPreset[]).map((preset) => <button key={preset} className={lightPreset === preset ? "active" : ""} onClick={() => setLightPreset(preset)}>{preset === "focus" ? <Sun/> : preset}</button>)}</div></div>
      </section>
      <aside className="nexus-room-console">
        <div className="nexus-room-code"><label htmlFor="nexus-room-code">ROOM CHANNEL</label><input id="nexus-room-code" value={roomCode} onChange={(event) => updateRoom(event.target.value)}/><small>Anchors and media use this room scope.</small></div>
        <LiveKitPod compact roomCode={roomCode} agents={crew} onLocalStream={setLocalStream}/>
      </aside>
    </div>}

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
