import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Accessibility, Activity, ArrowRight, BadgeCheck, Bot, Box, BriefcaseBusiness, Camera,
  Check, CheckCircle2, ChevronLeft, ChevronRight, CircleUserRound, Clock3, Compass,
  Gamepad2, Gauge, GraduationCap, Hand, Headphones, HelpCircle, History, LayoutDashboard,
  Layers, ListChecks, LockKeyhole, MessageSquareText, Mic, Monitor, Move3d, Pause, Play,
  Radio, RotateCcw, ScanLine, Settings2, ShieldCheck, Sparkles, Star, Target, Timer,
  Trophy, Users, Volume2, Wifi, Wrench, Zap,
} from "lucide-react";
import { ARScene } from "../ARScene";
import { useAMX } from "../AppContext";
import { AgentGlyph, Metric, PageHeader, QRCodeCard, StatusPill, XPBar } from "../components";
import { agents, missions, type Mission } from "../data";
import { ImmersiveWorld } from "../ImmersiveWorld";
import { useGeoAnchors } from "../geospatial";
import {
  beginImmersiveRun, completeQuestObjective, ensureRoom, experienceModes, getComfort,
  getContinuity, getLevel, getQuest, getRoom, getRunTimeline, humanProfile, modeRoute,
  recordRunEvent, saveRecovery, sharedTools, teams, updateComfort, updateContinuity,
  updateRoom, type ComfortSettings, type ExperienceMode, type Participant, type QuestState,
  type Room, type RunEvent, type SocialMode,
} from "../immersive";
import { detectInputCapabilities, fallbackFor, interactionMap, useUnifiedInput, type InputCapabilities } from "../interaction";
import { createProofRecord, getBadges, getProofs, startProofRecord } from "../platform";
import { useRealtimeRoom } from "../realtime";

const emptyCapabilities: InputCapabilities = {
  methods: ["mouse", "keyboard"], webXR: false, immersiveAR: false, immersiveVR: false,
  camera: false, voice: false, gamepad: false, touch: false, handTracking: false,
};

function missionById(id?: string) {
  return missions.find((mission) => mission.id === id) || missions[0];
}

function capabilityFor(mode: ExperienceMode, capabilities: InputCapabilities) {
  if (mode === "2d") return { ready: true, label: "Ready on this device" };
  if (mode === "3d") return { ready: true, label: "WebGL ready" };
  if (mode === "ar") return { ready: capabilities.immersiveAR || capabilities.camera, label: capabilities.immersiveAR ? "WebXR AR ready" : capabilities.camera ? "Camera fallback" : "2D fallback" };
  if (mode === "vr") return { ready: capabilities.immersiveVR, label: capabilities.immersiveVR ? "Headset ready" : "Falls back to 3D" };
  return { ready: capabilities.immersiveAR, label: capabilities.immersiveAR ? "Passthrough ready" : "Falls back to AR" };
}

function resolveMode(requested: ExperienceMode, capabilities: InputCapabilities): ExperienceMode {
  if (requested === "vr" && !capabilities.immersiveVR) return "3d";
  if (requested === "mr" && !capabilities.immersiveAR) return capabilities.camera ? "ar" : "2d";
  if (requested === "ar" && !capabilities.immersiveAR && !capabilities.camera) return "2d";
  return requested;
}

function crewFor(mission: Mission, socialMode: SocialMode) {
  const ids = socialMode === "team"
    ? [mission.agentId, ...agents.map((agent) => agent.id)]
    : socialMode === "co-op"
      ? [mission.agentId, "taz", "naz", "zohund"]
      : [mission.agentId, "zohund"];
  return Array.from(new Set(ids)).map((id) => agents.find((agent) => agent.id === id)).filter((agent): agent is typeof agents[number] => Boolean(agent));
}

const modeIcons = { "2d": Monitor, "3d": Box, ar: ScanLine, vr: Headphones, mr: Layers };

export function ExperienceLauncherPage() {
  const { missionId } = useParams();
  const mission = missionById(missionId);
  const navigate = useNavigate();
  const { xp, role } = useAMX();
  const [socialMode, setSocialMode] = useState<SocialMode>(() => getContinuity(mission.id, xp, mission.agentId).socialMode);
  const [capabilities, setCapabilities] = useState(emptyCapabilities);
  const continuity = getContinuity(mission.id, xp, mission.agentId);
  const level = getLevel(xp);
  useEffect(() => { void detectInputCapabilities().then(setCapabilities); }, []);

  const launch = (requested: ExperienceMode) => {
    const actual = resolveMode(requested, capabilities);
    const next = beginImmersiveRun(mission, actual, socialMode, xp);
    const crew = crewFor(mission, socialMode);
    ensureRoom(next, mission, role, crew);
    if (actual !== requested) saveRecovery(next.runId, `${requested.toUpperCase()}_UNSUPPORTED`, actual.toUpperCase());
    if (!getProofs().some((proof) => proof.missionId === mission.id && proof.status === "in_progress")) startProofRecord(mission, role);
    navigate(modeRoute(actual, mission.id));
  };

  return <div className="page immersive-launcher section-wrap">
    <PageHeader eyebrow="ONE PROFILE / EVERY DEVICE" title={mission.title} description="Choose how deeply you want to enter. Your mission step, crew, XP, tools, and proof travel with you." actions={<Link className="button secondary" to="/settings/comfort"><Accessibility/>Comfort setup</Link>}/>
    <section className="continuity-strip">
      <div><span>ACTIVE RUN</span><b>{continuity.runId}</b></div>
      <div><span>LAST MODE</span><b>{continuity.activeMode.toUpperCase()}</b></div>
      <div><span>PROGRESS</span><b>{continuity.completedObjectives.length} / {mission.steps.length}</b></div>
      <div><span>LEVEL</span><b>{level.name}</b></div>
      <StatusPill tone="green">Continuity saved</StatusPill>
    </section>
    <div className="social-mode-bar"><div><span className="eyebrow">CREW MODE</span><h2>Choose your flight crew</h2></div><div className="segmented-control">{(["solo","co-op","team"] as SocialMode[]).map((mode)=><button key={mode} className={socialMode===mode?"active":""} onClick={()=>setSocialMode(mode)}>{mode === "co-op" ? "Co-op" : mode[0].toUpperCase()+mode.slice(1)}</button>)}</div></div>
    <section className="mode-launch-grid">
      {experienceModes.map((mode) => { const Icon=modeIcons[mode.id];const status=capabilityFor(mode.id,capabilities);return <button className="mode-launch-card" key={mode.id} onClick={()=>launch(mode.id)}>
        <div className="mode-card-top"><span className="mode-icon"><Icon/></span><StatusPill tone={status.ready?"green":"gold"}>{status.label}</StatusPill></div>
        <span className="mode-index">{mode.short}</span><h3>{mode.label}</h3><p>{mode.detail}</p><div className="mode-capability"><Gauge/><span>{mode.capability}</span><ArrowRight/></div>
      </button>})}
    </section>
    <section className="input-compatibility"><div className="section-heading"><div><span className="eyebrow">UNIFIED INPUT LAYER</span><h2>Use what works for you</h2></div><StatusPill tone="cyan">{capabilities.methods.length} inputs detected</StatusPill></div>
      <div className="input-matrix">{(["select","move-forward","grab","menu","complete"] as const).map((action)=><div key={action}><b>{action.replace("-"," ")}</b><span>{interactionMap[action][fallbackFor(action,capabilities)]}</span><small>{fallbackFor(action,capabilities)}</small></div>)}</div>
    </section>
  </div>;
}

function Cockpit2D({ mission, quest, onInteract }: { mission: Mission; quest: QuestState; onInteract: (label: string) => void }) {
  const [activeTool,setActiveTool]=useState("Mission map");
  const [dropStatus,setDropStatus]=useState("Drop a tool into the workspace");
  const tools=[{name:"Mission map",icon:Compass},{name:"Scene cards",icon:Layers},{name:"Task board",icon:ListChecks},{name:"Proof camera",icon:Camera}];
  return <div className="cockpit-2d">
    <div className="cockpit-map"><div className="map-grid"/><div className="map-route">{quest.objectives.map((objective,index)=><button key={objective.id} className={objective.status} style={{left:`${16+index*32}%`,top:`${28+(index%2)*28}%`}} onClick={()=>onInteract(objective.title)}><span>{index+1}</span><b>{objective.title}</b></button>)}</div><div className="cockpit-callout"><span className="eyebrow">ACTIVE TOOL</span><h2>{activeTool}</h2><p>{mission.objective}</p></div></div>
    <aside className="tool-drawer"><span className="eyebrow">DRAG-AND-DROP TOOLS</span>{tools.map(({name,icon:Icon})=><button draggable key={name} onDragStart={(event)=>event.dataTransfer.setData("text/plain",name)} onClick={()=>{setActiveTool(name);onInteract(name)}}><Icon/><span>{name}</span><ChevronRight/></button>)}
      <div className="tool-drop-zone" onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault();const tool=event.dataTransfer.getData("text/plain");setActiveTool(tool);setDropStatus(`${tool} pinned to this run`);onInteract(tool)}}><Wrench/><span>{dropStatus}</span></div>
    </aside>
  </div>;
}

export function ModeExperiencePage({ mode }: { mode: ExperienceMode }) {
  const params = useParams();
  const stored = getContinuity();
  const mission = missionById(params.missionId || stored.missionId);
  const navigate = useNavigate();
  const { xp, role, settings, grantXP, setLatestProof, refreshRewards } = useAMX();
  const [continuity,setContinuity]=useState(()=>getContinuity(mission.id,xp,mission.agentId));
  const [quest,setQuest]=useState(()=>getQuest(mission));
  const [comfort]=useState(getComfort);
  const [notice,setNotice]=useState("Mission state restored");
  const startedAt=useRef(Date.now());const initialXp=useRef(xp);
  const crew=useMemo(()=>crewFor(mission,continuity.socialMode),[continuity.socialMode,mission]);
  const [room,setRoom]=useState<Room>(()=>ensureRoom(continuity,mission,role,crew));
  const live=useRealtimeRoom(room.code);
  const geo=useGeoAnchors(room.code);
  const sendLive=live.send;
  const current=quest.objectives.find((objective)=>objective.status==="active") || quest.objectives[quest.objectives.length-1];
  const complete=quest.reward.unlocked;

  useEffect(()=>{
    const next=beginImmersiveRun(mission,mode,continuity.socialMode,initialXp.current);setContinuity(next);setRoom(ensureRoom(next,mission,role,crew));
    if(!getProofs().some((proof)=>proof.missionId===mission.id&&proof.status==="in_progress")&&!getProofs().some((proof)=>proof.missionId===mission.id&&proof.status==="complete"))startProofRecord(mission,role);
  },[continuity.socialMode,crew,mission,mode,role]);

  const addEvent=useCallback((title:string)=>{setNotice(title);recordRunEvent(continuity.runId,"tool",title,`${title} activated in ${mode.toUpperCase()} mode.`)},[continuity.runId,mode]);
  const recover=useCallback((fallback:ExperienceMode,reason:string)=>{saveRecovery(continuity.runId,reason,fallback.toUpperCase());setNotice(`Recovered to ${fallback.toUpperCase()}`);navigate(modeRoute(fallback,mission.id))},[continuity.runId,mission.id,navigate]);
  const advance=useCallback(()=>{
    if(complete){navigate(`/mission/${mission.id}/complete`);return}
    const result=completeQuestObjective(mission,current.id);setQuest(result.quest);grantXP(result.xp);
    const completed=[...continuity.completedObjectives,current.id];
    const next=updateContinuity({currentStep:Math.min(mission.steps.length,continuity.currentStep+1),completedObjectives:completed,xp:continuity.xp+result.xp,proofStatus:result.complete?"complete":"in_progress"});setContinuity(next);
    recordRunEvent(next.runId,"objective",`${current.title} complete`,current.detail,"Mario",result.xp);setNotice(`+${result.xp} XP / ${current.title}`);
    sendLive(`${current.title} completed`,"progress");
    if(result.complete){const proof=createProofRecord(mission,role,mission.xp,startedAt.current);setLatestProof(proof);refreshRewards();recordRunEvent(next.runId,"proof","Team proof secured",`${mission.badge} and certificate are ready.`,"System",mission.xp)}
  },[complete,continuity,current,grantXP,mission,navigate,refreshRewards,role,sendLive,setLatestProof]);
  useUnifiedInput(useCallback((action)=>{if(action==="complete")advance();if(action==="help"){sendLive("Mario needs help","presence");setNotice("Help signal sent to the crew")}},[advance,sendLive]));

  const switchMode=(nextMode:ExperienceMode)=>{updateContinuity({previousMode:mode,activeMode:nextMode});navigate(modeRoute(nextMode,mission.id))};
  const progress=Math.round((quest.objectives.filter((item)=>item.status==="complete").length/quest.objectives.length)*100);
  return <div className={`immersive-run-surface mode-${mode}`}>
    <header className="immersive-hud-top"><Link className="icon-button" to={`/play/${mission.id}`} aria-label="Exit to experience launcher"><ChevronLeft/></Link><div className="hud-mission"><span>LIVE RUN / {mission.title}</span><div><i style={{width:`${progress}%`}}/></div></div><div className="hud-score"><Zap/><b>{xp} XP</b><span>{progress}%</span></div></header>
    <div className="mode-switcher" aria-label="Experience mode">{experienceModes.map((item)=><button key={item.id} className={item.id===mode?"active":""} onClick={()=>switchMode(item.id)}>{item.short}</button>)}</div>
    <main className="immersive-stage">
      {mode === "2d" ? <Cockpit2D mission={mission} quest={quest} onInteract={addEvent}/> : mode === "ar" ?
        <div className="immersive-ar-host"><ARScene agent={crew[0]||agents[0]} onPlaced={()=>addEvent("Agent anchored in AR")} onSessionStart={geo.requestLocation} anchors={geo.projectedAnchors} onAnchorPlaced={(placement)=>geo.publishAnchor({label:`${(crew[0]||agents[0]).name} spatial anchor`,...placement,source:placement.source})} textOnly={settings.textOnlyMode}/></div> :
        <ImmersiveWorld mode={mode} comfort={comfort} reducedMotion={settings.reducedMotion} onInteract={addEvent} onFallback={recover}/>
      }
      <aside className="live-objective-panel">
        <div className="objective-head"><div><span className="eyebrow">QUEST OBJECTIVE</span><small>{continuity.socialMode.toUpperCase()} / STEP {Math.min(continuity.currentStep+1,mission.steps.length)}</small></div><strong>{String(Math.min(continuity.currentStep+1,mission.steps.length)).padStart(2,"0")}</strong></div>
        <h1>{complete?"Run complete":current.title}</h1><p>{complete?"Individual and team proof are ready for review.":current.detail}</p>
        <div className="agent-directive"><Sparkles/><div><b>NAZ / GAME MASTER</b><span>{complete?"Flight crew, bring it home.":current.status==="active"?current.title:"Objective synchronized."}</span></div></div>
        <div className="crew-presence"><span><Users/>{Math.max(room.participants.length,live.peers.length)} crew</span><span><Wifi/>{live.transport}</span><span><Mic/>voice ready</span></div>
        <button className="button primary large full" onClick={advance}>{complete?"Review proof":"Complete objective"}<CheckCircle2/></button>
        <div className="objective-list">{quest.objectives.map((objective,index)=><div key={objective.id} className={objective.status}><span>{objective.status==="complete"?<Check/>:index+1}</span><div><b>{objective.title}</b><small>{objective.assignedRole} / +{objective.xp} XP</small></div></div>)}</div>
      </aside>
    </main>
    <footer className="immersive-tool-dock"><div className="hud-notice"><Radio/><span>{notice}</span></div>{sharedTools.slice(0,5).map((tool)=><button key={tool.id} title={tool.name} onClick={()=>addEvent(tool.name)}><Wrench/><span>{tool.name}</span></button>)}<Link to={`/rooms/${room.id}/toolbelt`} title="Open shared toolbelt"><BriefcaseBusiness/><span>All tools</span></Link><button title="Ask for help" onClick={()=>{sendLive("Mario needs help","presence");setNotice("Help signal sent")}}><HelpCircle/><span>Help</span></button></footer>
  </div>;
}

function PresenceRow({ participant }: { participant: Participant }) {
  return <div className="presence-row"><span className="presence-avatar" style={{"--presence":participant.avatarColor} as React.CSSProperties}>{participant.participantType==="agent"?<Bot/>:<CircleUserRound/>}</span><div><b>{participant.displayName}</b><span>{participant.role} / {participant.currentAction}</span></div><StatusPill tone={participant.state==="needs-help"?"red":"green"}>{participant.state}</StatusPill><small>{participant.connectionStrength}%</small></div>;
}

export function RoomLobbyPage() {
  const { roomId }=useParams();const continuity=getContinuity();const mission=missionById(continuity.missionId);const {role}=useAMX();const navigate=useNavigate();
  const crew=crewFor(mission,continuity.socialMode);
  const [room,setRoom]=useState(()=>getRoom(roomId||"")||ensureRoom(continuity,mission,role,crew));const [capabilities,setCapabilities]=useState(emptyCapabilities);const live=useRealtimeRoom(room.code);
  useEffect(()=>{void detectInputCapabilities().then(setCapabilities)},[]);
  const ready=room.readyParticipantIds.includes("guest-user");const toggleReady=()=>{const ids=ready?room.readyParticipantIds.filter((id)=>id!=="guest-user"):[...room.readyParticipantIds,"guest-user"];const next=updateRoom(room.id,{readyParticipantIds:ids,status:ids.length?"active":"waiting"});if(next){setRoom(next);recordRunEvent(room.runId,"presence",ready?"Mario is checking setup":"Mario is ready",`Lobby readiness changed for ${mission.title}.`)}};
  return <div className="page room-lobby-page section-wrap"><PageHeader eyebrow="SHARED MISSION ROOM" title={`${mission.title} lobby`} description="Check the crew, role, voice, device, and comfort setup before entering together." actions={<StatusPill tone={live.transport==="websocket"?"green":"cyan"}>{live.transport}</StatusPill>}/>
    <div className="lobby-grid"><section className="lobby-main"><div className="lobby-brief"><div><span className="eyebrow">ROOM {room.code}</span><h2>{room.socialMode.toUpperCase()} SKILL POD</h2><p>{mission.objective}</p></div><QRCodeCard route={`/rooms/${room.id}/lobby`} title={`Room ${room.code}`}/></div><div className="section-heading"><div><span className="eyebrow">HUMAN + AGENT PRESENCE</span><h2>Flight crew</h2></div><span>{Math.max(room.participants.length,live.peers.length)} connected</span></div><div className="presence-list">{room.participants.map((participant)=><PresenceRow key={participant.id} participant={participant}/>)}</div></section>
      <aside className="lobby-checks"><span className="eyebrow">PRE-FLIGHT CHECK</span><h2>Ready state</h2>{[{icon:Mic,label:"Voice",value:capabilities.voice?"Ready":"Captions fallback"},{icon:Gamepad2,label:"Input",value:capabilities.methods.slice(0,3).join(" + ")},{icon:Headphones,label:"Headset",value:capabilities.immersiveVR?"Detected":"Browser mode"},{icon:Accessibility,label:"Comfort",value:`${getComfort().movement} / ${getComfort().posture}`}].map(({icon:Icon,label,value})=><div className="lobby-check" key={label}><Icon/><span>{label}<b>{value}</b></span><Check/></div>)}<Link className="button secondary full" to="/settings/comfort"><Settings2/>Adjust comfort</Link><button className={`button large full ${ready?"secondary":"primary"}`} onClick={toggleReady}>{ready?<><RotateCcw/>Not ready</>:<><CheckCircle2/>Ready</>}</button><button className="button primary large full" disabled={!ready} onClick={()=>navigate(modeRoute(continuity.activeMode,mission.id))}><Play/>Enter room</button></aside>
    </div>
  </div>;
}

export function ToolbeltPage() {
  const {roomId}=useParams();const continuity=getContinuity();const [tools,setTools]=useState(sharedTools);const room=getRoom(roomId||"");
  const toggle=(id:string)=>setTools((items)=>items.map((tool)=>tool.id===id?{...tool,holder:tool.holder==="Mario"?"Available":"Mario"}:tool));
  return <div className="page section-wrap"><PageHeader eyebrow="SHARED SPATIAL TOOLS" title="Crew toolbelt" description="Request, hold, and return collaborative tools without losing the room state." actions={<Link className="button secondary" to={`/rooms/${roomId}/lobby`}><ChevronLeft/>Room lobby</Link>}/><div className="toolbelt-summary"><Metric label="Room" value={room?.code||"LOCAL"} icon={Radio}/><Metric label="Available" value={tools.filter((tool)=>tool.holder==="Available").length} icon={Wrench}/><Metric label="Held by you" value={tools.filter((tool)=>tool.holder==="Mario").length} icon={BriefcaseBusiness}/><Metric label="Run events" value={getRunTimeline(continuity.runId).length} icon={History}/></div><section className="toolbelt-table"><div className="toolbelt-head"><span>TOOL</span><span>PERMISSION</span><span>CURRENT HOLDER</span><span>ACTION</span></div>{tools.map((tool)=><div className="toolbelt-row" key={tool.id}><div><span className="tool-symbol"><Wrench/></span><b>{tool.name}</b></div><span>{tool.permission}</span><StatusPill tone={tool.holder==="Available"?"green":tool.holder==="Mario"?"cyan":"gold"}>{tool.holder}</StatusPill><button className="button secondary compact" disabled={tool.holder!=="Available"&&tool.holder!=="Mario"} onClick={()=>{toggle(tool.id);recordRunEvent(continuity.runId,"tool",tool.holder==="Mario"?`${tool.name} returned`:`${tool.name} claimed`,`Tool ownership updated in room ${room?.code||"local"}.`)}}>{tool.holder==="Mario"?"Return":"Request"}</button></div>)}</section></div>;
}

export function TeamMonitorPage() {
  const continuity=getContinuity();const mission=missionById(continuity.missionId);const quest=getQuest(mission);const room=getRoom(continuity.roomId);const events=getRunTimeline(continuity.runId);const progress=Math.round((quest.objectives.filter((item)=>item.status==="complete").length/quest.objectives.length)*100);
  return <div className="page section-wrap"><PageHeader eyebrow="TRAINER / LIVE OPERATIONS" title="Team run monitor" description="Watch humans and agents, shared objectives, tools, connection health, recovery, and proof from one operational view." actions={<Link className="button primary" to={modeRoute(continuity.activeMode,mission.id)}><Play/>Open live run</Link>}/><div className="monitor-metrics"><Metric label="Shared progress" value={`${progress}%`} icon={Target}/><Metric label="Participants" value={room?.participants.length||1} icon={Users}/><Metric label="Agents" value={room?.participants.filter((item)=>item.participantType==="agent").length||0} icon={Bot}/><Metric label="Recovery events" value={events.filter((event)=>event.type==="recovery").length} icon={ShieldCheck}/></div><div className="monitor-grid"><section><span className="eyebrow">OBJECTIVE CONTROL</span><h2>{mission.title}</h2><div className="monitor-progress"><i style={{width:`${progress}%`}}/></div>{quest.objectives.map((objective)=><div className={`monitor-objective ${objective.status}`} key={objective.id}><span>{objective.status==="complete"?<Check/>:<Timer/>}</span><div><b>{objective.title}</b><small>{objective.assignedRole} / {objective.detail}</small></div><StatusPill tone={objective.status==="complete"?"green":objective.status==="active"?"cyan":"neutral"}>{objective.status}</StatusPill></div>)}</section><aside><span className="eyebrow">ROOM HEALTH</span><h2>Presence and systems</h2>{room?.participants.map((participant)=><PresenceRow key={participant.id} participant={participant}/>)}<div className="self-heal-status"><ShieldCheck/><div><b>Self-healing active</b><span>Continuity, proof, and offline queue are protected.</span></div></div></aside></div></div>;
}

export function ReplayPage() {
  const continuity=getContinuity();const {runId}=useParams();const mission=missionById(continuity.missionId);const events=getRunTimeline(runId||continuity.runId);const [cursor,setCursor]=useState(Math.max(0,events.length-1));const [playing,setPlaying]=useState(false);
  useEffect(()=>{if(!playing||!events.length)return;const timer=window.setInterval(()=>setCursor((current)=>current>=events.length-1?(setPlaying(false),current):current+1),900);return()=>window.clearInterval(timer)},[events.length,playing]);
  const selected=events[cursor];
  return <div className="page replay-page section-wrap"><PageHeader eyebrow="POST RUN / TIMELINE PLAYBACK" title={`${mission.title} replay`} description="Review mode transitions, crew activity, objective events, tool use, recovery, rewards, and proof moments."/><section className="replay-stage"><div className="replay-visual"><div className="replay-radar"><span/><i/><b>{selected?.type.toUpperCase()||"READY"}</b></div>{selected?<div><span className="eyebrow">{new Date(selected.timestamp).toLocaleTimeString()}</span><h2>{selected.title}</h2><p>{selected.detail}</p><StatusPill tone={selected.type==="recovery"?"gold":selected.type==="proof"?"green":"cyan"}>{selected.actor}</StatusPill></div>:<div><h2>No events captured yet</h2><p>Enter an immersive run to begin the replay timeline.</p></div>}</div><aside className="replay-events">{events.map((event,index)=><button key={event.id} className={cursor===index?"active":""} onClick={()=>setCursor(index)}><span>{String(index+1).padStart(2,"0")}</span><div><b>{event.title}</b><small>{event.type} / {event.actor}</small></div>{event.xp&&<strong>+{event.xp} XP</strong>}</button>)}</aside></section><div className="replay-controls"><button className="icon-button" aria-label={playing?"Pause replay":"Play replay"} onClick={()=>setPlaying(!playing)}>{playing?<Pause/>:<Play/>}</button><input aria-label="Replay timeline" type="range" min="0" max={Math.max(0,events.length-1)} value={cursor} onChange={(event)=>setCursor(Number(event.target.value))}/><span>{events.length?`${cursor+1} / ${events.length}`:"0 / 0"}</span></div></div>;
}

export function ComfortSettingsPage() {
  const [comfort,setComfort]=useState<ComfortSettings>(getComfort);const set=<K extends keyof ComfortSettings>(key:K,value:ComfortSettings[K])=>setComfort(updateComfort({[key]:value}));
  return <div className="page comfort-page section-wrap"><PageHeader eyebrow="COMFORT + SAFETY" title="Set up your body and movement" description="These preferences follow you into browser 3D, VR, mixed reality, and every fallback mode." actions={<Link className="button primary" to={`/play/${getContinuity().missionId}`}><Check/>Save and continue</Link>}/><div className="comfort-layout"><section><div className="comfort-section"><span className="eyebrow">BODY</span><h2>Position and dominant hand</h2><label>Posture<div className="segmented-control">{(["standing","seated"] as const).map((value)=><button className={comfort.posture===value?"active":""} key={value} onClick={()=>set("posture",value)}>{value}</button>)}</div></label><label>Dominant hand<div className="segmented-control">{(["left","right"] as const).map((value)=><button className={comfort.dominantHand===value?"active":""} key={value} onClick={()=>set("dominantHand",value)}>{value}</button>)}</div></label></div><div className="comfort-section"><span className="eyebrow">LOCOMOTION</span><h2>Movement and turning</h2><label>Movement<div className="segmented-control">{(["teleport","smooth","guided"] as const).map((value)=><button className={comfort.movement===value?"active":""} key={value} onClick={()=>set("movement",value)}>{value}</button>)}</div></label><label>Turning<div className="segmented-control">{(["snap","smooth"] as const).map((value)=><button className={comfort.turning===value?"active":""} key={value} onClick={()=>set("turning",value)}>{value}</button>)}</div></label>{[{key:"movementSpeed",label:"Movement speed",unit:"%"},{key:"turnSpeed",label:"Turn speed",unit:"%"},{key:"vignetteStrength",label:"Comfort vignette",unit:"%"}].map((item)=><label className="range-setting" key={item.key}>{item.label}<b>{comfort[item.key as "movementSpeed"]}{item.unit}</b><input type="range" min="0" max="100" value={comfort[item.key as "movementSpeed"]} onChange={(event)=>set(item.key as "movementSpeed",Number(event.target.value))}/></label>)}</div></section><aside className="safety-panel"><ShieldCheck/><span className="eyebrow">SAFETY ACTIVE</span><h2>Your pre-flight profile</h2><dl><div><dt>Position</dt><dd>{comfort.posture}</dd></div><div><dt>Movement</dt><dd>{comfort.movement}</dd></div><div><dt>Turning</dt><dd>{comfort.turning}{comfort.turning==="snap"?` / ${comfort.snapAngle}°`:""}</dd></div><div><dt>Session reminder</dt><dd>{comfort.sessionMinutes} minutes</dd></div><div><dt>Captions</dt><dd>{comfort.captions?"on":"off"}</dd></div></dl><label className="setting-row"><span>Captions<small>Keep agent speech visible.</small></span><input type="checkbox" checked={comfort.captions} onChange={(event)=>set("captions",event.target.checked)}/><i/></label><label className="setting-row"><span>Reduced motion<small>Minimize scene and camera motion.</small></span><input type="checkbox" checked={comfort.reducedMotion} onChange={(event)=>set("reducedMotion",event.target.checked)}/><i/></label><div className="safety-actions"><button className="button secondary"><RotateCcw/>Recenter</button><Link className="button ghost" to="/">Emergency exit</Link></div></aside></div></div>;
}

const profileTabs=["Overview","Skills","Badges","Certificates","Runs","Teams","Projects","Portfolio","Marketplace"];
export function HumanProfilePage() {
  const [tab,setTab]=useState("Overview");const {xp}=useAMX();const level=getLevel(xp);const proofs=getProofs();const badges=getBadges();
  return <div className="page profile-page section-wrap"><section className="profile-command"><div className="profile-avatar"><CircleUserRound/></div><div><span className="eyebrow">HUMAN PROFILE / ONE IDENTITY</span><h1>{humanProfile.name}</h1><p>{humanProfile.handle} / {humanProfile.role} / {humanProfile.organization}</p></div><div className="profile-level"><span>LEVEL {level.index+1}</span><b>{level.name}</b><XPBar value={xp} level={level.index}/></div></section><div className="profile-tabs">{profileTabs.map((item)=><button className={tab===item?"active":""} onClick={()=>setTab(item)} key={item}>{item}</button>)}</div><section className="profile-content"><div><span className="eyebrow">{tab.toUpperCase()}</span><h2>{tab==="Overview"?"Your continuous runway":tab}</h2><p>{tab==="Overview"?"Mission progress, rewards, tools, agents, teams, and proof stay connected across every experience mode.":`Your ${tab.toLowerCase()} records are connected to the same portable profile.`}</p><div className="profile-chip-grid">{(tab==="Skills"?humanProfile.skills:tab==="Badges"?badges:tab==="Projects"||tab==="Portfolio"?humanProfile.portfolio:tab==="Teams"?teams.map((team)=>team.name):[`${proofs.length} verified runs`,`${xp} total XP`,`${badges.length} badges`,...humanProfile.toolbelts]).map((item)=><span key={item}><Star/>{item}</span>)}</div></div><aside><Metric label="XP" value={xp} icon={Zap}/><Metric label="Proofs" value={proofs.length} icon={ShieldCheck}/><Metric label="Badges" value={badges.length} icon={Trophy}/><Metric label="Teams" value={teams.length} icon={Users}/></aside></section></div>;
}

const agentTabs=["Role","Skills","Toolbelt","Plugins","MCP","Runs","Performance","Training","Logs"];
export function AgentProfilePage() {
  const {agentId}=useParams();const agent=agents.find((item)=>item.id===agentId)||agents[0];const [tab,setTab]=useState("Role");
  return <div className="page profile-page section-wrap"><section className="agent-profile-command" style={{"--agent":agent.color} as React.CSSProperties}><AgentGlyph agent={agent}/><div><span className="eyebrow">ACTIVE AGENT PROFILE</span><h1>{agent.name}</h1><h3>{agent.role}</h3><p>{agent.specialty}</p><div className="agent-status-line"><StatusPill tone="green">online</StatusPill><span><Volume2/> {agent.voice}</span><span><Gauge/> 96% success</span></div></div></section><div className="profile-tabs">{agentTabs.map((item)=><button className={tab===item?"active":""} onClick={()=>setTab(item)} key={item}>{item}</button>)}</div><section className="agent-profile-grid"><div><span className="eyebrow">{tab.toUpperCase()}</span><h2>{tab==="Role"?`${agent.name} as a visible teammate`:tab}</h2><p>{tab==="Role"?"This agent can explain objectives, demonstrate actions, monitor progress, trigger game events, save run events, and escalate blockers.":`${agent.name}'s ${tab.toLowerCase()} remain governed by tenant assignment and mission permissions.`}</p><div className="agent-skill-list">{[agent.specialty,"Objective guidance","Progress monitoring","Proof support","Human escalation"].map((skill,index)=><div key={skill}><span>{String(index+1).padStart(2,"0")}</span><b>{skill}</b><StatusPill tone={index<3?"green":"cyan"}>{index<3?"trained":"enabled"}</StatusPill></div>)}</div></div><aside><span className="eyebrow">RUN PERFORMANCE</span><Metric label="Success rate" value="96%" icon={Gauge}/><Metric label="Completed runs" value="184" icon={CheckCircle2}/><Metric label="Human assists" value="47" icon={HelpCircle}/><Metric label="Active tenants" value="3" icon={BriefcaseBusiness}/></aside></section></div>;
}

export function TeamsPage() {
  return <div className="page section-wrap"><PageHeader eyebrow="SQUADS + FLIGHT CREWS" title="Teams" description="Structured human-agent groups carry roles, missions, team XP, rewards, reports, and marketplace projects."/><div className="team-card-grid">{teams.map((team)=><Link to={`/teams/${team.id}`} className="team-card" key={team.id}><div className="team-mark"><Users/></div><StatusPill tone="green">active</StatusPill><span className="eyebrow">{team.organization}</span><h2>{team.name}</h2><p>{team.memberCount} humans / {team.agents.length} agents / {team.badges.length} team badges</p><div><span><Zap/>{team.teamXP} XP</span><span><Trophy/>{team.badges[0]}</span></div><strong>Open team<ChevronRight/></strong></Link>)}</div></div>;
}

export function TeamProfilePage() {
  const {teamId}=useParams();const team=teams.find((item)=>item.id===teamId)||teams[0];const mission=missionById(team.activeMissionId);
  return <div className="page section-wrap"><section className="team-profile-head"><div className="team-mark large"><Users/></div><div><span className="eyebrow">TEAM PROFILE / {team.organization}</span><h1>{team.name}</h1><p>{team.memberCount} members work with {team.agents.map((id)=>id.toUpperCase()).join(" + ")}.</p></div><div><b>{team.teamXP.toLocaleString()}</b><span>TEAM XP</span></div></section><div className="team-profile-grid"><section><span className="eyebrow">ACTIVE MISSION</span><h2>{mission.title}</h2><p>{mission.objective}</p><div className="team-role-grid">{["Mission Lead","Creator","Designer","Developer","Reviewer"].map((role,index)=><div key={role}><CircleUserRound/><span><b>{role}</b><small>{index===0?"Mario":`Crew ${index+1}`}</small></span><StatusPill tone={index<3?"green":"cyan"}>{index<3?"active":"ready"}</StatusPill></div>)}</div><Link className="button primary" to={`/play/${mission.id}`}>Launch team mission<ArrowRight/></Link></section><aside><span className="eyebrow">TEAM REWARDS</span>{team.badges.map((badge)=><div className="team-reward" key={badge}><Trophy/><span><b>{badge}</b><small>Shared proof secured</small></span></div>)}<Link className="button secondary full" to={`/teams/${team.id}/runs`}><Activity/>Run history</Link></aside></div></div>;
}
