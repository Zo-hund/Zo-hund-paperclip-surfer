import { useCallback, useEffect, useRef, useState } from "react";
import {
  AvatarCall, AvatarVideo, ControlBar, UserVideo, useAvatarSession, useClientEvent, useTranscript,
  type SessionCredentials,
} from "@runwayml/avatars-react";
import "@runwayml/avatars-react/styles.css";
import {
  Bot, Camera, CameraOff, CheckCircle2, LoaderCircle, Mic, MicOff, MonitorUp, PhoneOff,
  Play, Radio, ShieldCheck, Sparkles, UserRound, Video, Wrench,
} from "lucide-react";
import type { WorldCameraId } from "./NexusRoomScene";
import type { NpcAction, NpcWaypointId } from "./npc-controller";
import {
  invokeAmxTool, moveRoomAvatarTool, openNexusPanelTool, performRoomActionTool, setWorldCameraTool,
} from "./runway-tools";

type RoomConsoleView = "npc" | "pod" | "media" | "vision" | "runway";
type ToolStatus = "idle" | "running" | "complete" | "blocked";

interface AvatarOption {
  id: string;
  name: string;
  type: "preset" | "custom";
  status: string;
  imageUrl?: string;
}

interface AvatarCatalog {
  configured: boolean;
  presets: AvatarOption[];
  avatars: AvatarOption[];
}

interface Props {
  roomCode: string;
  agentId: string;
  onWorldCamera: (camera: WorldCameraId) => void;
  onMoveNpc: (waypoint: NpcWaypointId) => void;
  onNpcAction: (action: Exclude<NpcAction, "idle" | "walk">) => void;
  onOpenPanel: (panel: RoomConsoleView) => void;
  onPanelVideo: (video: HTMLVideoElement | null) => void;
}

interface ToolTrace {
  id: string;
  name: string;
  status: ToolStatus;
  detail: string;
}

const MANUAL_TOOLS = [
  ["mission.context", "Mission context"],
  ["dcim.inspect", "Inspect pod"],
  ["rack.thermal-map", "Thermal map"],
  ["incident.runbook", "Incident plan"],
] as const;

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed with ${response.status}`);
  return body;
}

function RunwayToolBridge({ onWorldCamera, onMoveNpc, onNpcAction, onOpenPanel, onRunTool }: {
  onWorldCamera: Props["onWorldCamera"];
  onMoveNpc: Props["onMoveNpc"];
  onNpcAction: Props["onNpcAction"];
  onOpenPanel: Props["onOpenPanel"];
  onRunTool: (tool: string, source: "voice" | "manual") => void;
}) {
  useClientEvent(setWorldCameraTool, ({ camera }) => onWorldCamera(camera));
  useClientEvent(moveRoomAvatarTool, ({ destination }) => onMoveNpc(destination));
  useClientEvent(performRoomActionTool, ({ action }) => onNpcAction(action));
  useClientEvent(openNexusPanelTool, ({ panel }) => onOpenPanel(panel));
  useClientEvent(invokeAmxTool, ({ tool }) => onRunTool(tool, "voice"));
  return null;
}

function RunwayCallSurface({ onPanelVideo, onTrace, ...bridge }: {
  onPanelVideo: Props["onPanelVideo"];
  onTrace: (detail: string) => void;
  onWorldCamera: Props["onWorldCamera"];
  onMoveNpc: Props["onMoveNpc"];
  onNpcAction: Props["onNpcAction"];
  onOpenPanel: Props["onOpenPanel"];
  onRunTool: (tool: string, source: "voice" | "manual") => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const session = useAvatarSession();
  const transcript = useTranscript({ interim: true, bufferSize: 8 });
  const latestTranscript = transcript.at(-1)?.text || "Say hello, ask about the room, or request a skill.";

  useEffect(() => {
    const timer = window.setInterval(() => {
      const video = stageRef.current?.querySelector("video") || null;
      if (video?.dataset.amxBound === "true") return;
      if (video) video.dataset.amxBound = "true";
      onPanelVideo(video);
    }, 500);
    return () => { window.clearInterval(timer); onPanelVideo(null); };
  }, [onPanelVideo]);

  useEffect(() => {
    if (session.state === "active") onTrace("Runway Character connected to the realtime room.");
  }, [onTrace, session.state]);

  return <>
    <div className="runway-call-stage" ref={stageRef}>
      <AvatarVideo className="runway-avatar-video"/>
      <UserVideo className="runway-user-video" mirror/>
      <span className={`runway-call-state ${session.state}`}><i/>{session.state}</span>
      <ControlBar showScreenShare>{({ isMicEnabled, isCameraEnabled, isScreenShareEnabled, toggleMic, toggleCamera, toggleScreenShare, endCall }) => <div className="runway-call-controls">
        <button onClick={toggleMic} title={isMicEnabled ? "Mute microphone" : "Enable microphone"} aria-label={isMicEnabled ? "Mute microphone" : "Enable microphone"}>{isMicEnabled ? <Mic/> : <MicOff/>}</button>
        <button onClick={toggleCamera} title={isCameraEnabled ? "Disable camera" : "Enable camera"} aria-label={isCameraEnabled ? "Disable camera" : "Enable camera"}>{isCameraEnabled ? <Camera/> : <CameraOff/>}</button>
        <button className={isScreenShareEnabled ? "active" : ""} onClick={toggleScreenShare} title="Share screen" aria-label="Share screen"><MonitorUp/></button>
        <button className="end" onClick={() => void endCall()} title="End call" aria-label="End call"><PhoneOff/></button>
      </div>}</ControlBar>
    </div>
    <output className="runway-transcript"><Radio/><p>{latestTranscript}</p></output>
    <RunwayToolBridge {...bridge}/>
  </>;
}

export function RunwayAvatarConsole({ roomCode, agentId, onWorldCamera, onMoveNpc, onNpcAction, onOpenPanel, onPanelVideo }: Props) {
  const sessionIdRef = useRef("");
  const [catalog, setCatalog] = useState<AvatarCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [selectedKey, setSelectedKey] = useState("preset:human-resource");
  const [callKey, setCallKey] = useState("");
  const [trace, setTrace] = useState<ToolTrace>({ id: "ready", name: "toolbelt", status: "idle", detail: "Toolbelt ready for voice or operator commands." });

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/runway/avatars").then((response) => responseJson<AvatarCatalog>(response)).then((value) => {
      if (!cancelled) setCatalog(value);
    }).catch((error) => {
      if (!cancelled) setCatalogError(error instanceof Error ? error.message : "Runway catalog unavailable");
    });
    return () => { cancelled = true; };
  }, []);

  const options = [...(catalog?.presets || []), ...(catalog?.avatars || [])];
  const selected = options.find((option) => `${option.type}:${option.id}` === selectedKey) || options[0];

  const addTrace = useCallback((detail: string) => {
    setTrace({ id: crypto.randomUUID(), name: "runway.session", status: "complete", detail });
  }, []);

  const runTool = useCallback(async (tool: string, source: "voice" | "manual") => {
    setTrace({ id: crypto.randomUUID(), name: tool, status: "running", detail: `${source === "voice" ? "Avatar" : "Operator"} requested ${tool}.` });
    try {
      const result = await responseJson<{ trace: { status: ToolStatus }; output: string }>(await fetch("/api/agents/tools/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName: tool, agentId, context: { roomCode, source: "runway-avatar-toolbelt" } }),
      }));
      setTrace({ id: crypto.randomUUID(), name: tool, status: result.trace.status, detail: result.output.slice(0, 420) });
    } catch (error) {
      setTrace({ id: crypto.randomUUID(), name: tool, status: "blocked", detail: error instanceof Error ? error.message : "Tool call failed" });
    }
  }, [agentId, roomCode]);

  const connect = useCallback(async (): Promise<SessionCredentials> => {
    if (!selected) throw new Error("Select a Runway avatar first");
    const credentials = await responseJson<SessionCredentials>(await fetch("/api/runway/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        avatarId: selected.id,
        avatarType: selected.type,
        roomCode,
        personality: "You are an AMX AIR Hubs spatial learning guide. Use the available tools when the user asks to inspect the room, move the embodied avatar, open a panel, or run an AMX skill. State clearly that tool calls affect a training simulation unless verified telemetry says otherwise.",
        startScript: `Welcome to room ${roomCode}. I can see, explain, and operate the governed Nexus toolbelt with you.`,
      }),
    }));
    sessionIdRef.current = credentials.sessionId;
    return credentials;
  }, [roomCode, selected]);

  const endSession = useCallback(() => {
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = "";
    if (sessionId) void fetch(`/api/runway/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => undefined);
    setCallKey("");
    onPanelVideo(null);
    setTrace({ id: crypto.randomUUID(), name: "runway.session", status: "complete", detail: "Runway Character session ended." });
  }, [onPanelVideo]);

  return <section className="runway-avatar-console">
    <header className="runway-console-head"><div><span className="eyebrow">RUNWAY CHARACTERS / GWM-1</span><h3>Realtime avatar</h3></div><Video/></header>
    {!callKey && <div className="runway-launcher">
      <div className="runway-avatar-preview">{selected?.imageUrl ? <img src={selected.imageUrl} alt=""/> : <UserRound/>}<span><b>{selected?.name || "Loading avatars"}</b><small>{selected?.type || "catalog"} / {selected?.status || "checking"}</small></span></div>
      <label><span>Character</span><select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} disabled={!options.length}>{options.map((avatar) => <option key={`${avatar.type}:${avatar.id}`} value={`${avatar.type}:${avatar.id}`}>{avatar.name} / {avatar.type}</option>)}</select></label>
      <button className="button primary full" disabled={!catalog?.configured || !selected || selected.status === "FAILED"} onClick={() => setCallKey(`${selectedKey}:${Date.now()}`)}>{catalog ? <Play/> : <LoaderCircle className="spin"/>}{catalog?.configured ? "Start realtime avatar" : "Runway key required"}</button>
      <p className={catalogError ? "error" : ""}>{catalogError || (catalog?.configured ? "Microphone permission is requested when the call starts." : "Configure RUNWAYML_API_SECRET on the server to enable calls.")}</p>
    </div>}
    {callKey && selected && <AvatarCall key={callKey} avatarId={selected.id} connect={connect} audio video onEnd={endSession} onError={(error) => setTrace({ id: crypto.randomUUID(), name: "runway.session", status: "blocked", detail: error.message })}>
      <RunwayCallSurface onPanelVideo={onPanelVideo} onTrace={addTrace} onWorldCamera={onWorldCamera} onMoveNpc={onMoveNpc} onNpcAction={onNpcAction} onOpenPanel={onOpenPanel} onRunTool={runTool}/>
    </AvatarCall>}
    <div className="runway-toolbelt">
      <div className="runway-toolbelt-title"><span><Wrench/>AMX toolbelt</span><small><ShieldCheck/>client actions / governed skills</small></div>
      <div className="runway-tool-grid">{MANUAL_TOOLS.map(([id, label]) => <button key={id} disabled={trace.status === "running"} onClick={() => void runTool(id, "manual")}><Sparkles/><span>{label}</span></button>)}</div>
      <div className="runway-tool-capabilities"><span>CAMERAS</span><span>WAYPOINTS</span><span>ACTIONS</span><span>PANELS</span><span>SKILLS</span></div>
      <output className={`runway-tool-trace ${trace.status}`}>{trace.status === "running" ? <LoaderCircle className="spin"/> : trace.status === "complete" ? <CheckCircle2/> : <Bot/>}<span><b>{trace.name}</b><small>{trace.detail}</small></span></output>
    </div>
  </section>;
}
