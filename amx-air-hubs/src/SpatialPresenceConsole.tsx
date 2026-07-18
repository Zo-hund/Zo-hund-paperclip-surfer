import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, Camera, Cctv, CircleStop, Eye, Gauge, Hand, LoaderCircle, MapPin, MessageCircle, Route, ScanLine, ScanSearch, Send, Upload, UserRound, X } from "lucide-react";
import type { Agent } from "./data";
import { AVATAR_PRESETS } from "./avatar-presets";
import { sendAgentRequest, type AgentAttachment } from "./agent-runtime";
import { WORLD_CAMERAS, type WorldCameraCapture, type WorldCameraId } from "./NexusRoomScene";
import { commandFromCue, NPC_WAYPOINTS, type NpcCommand, type NpcDirection, type NpcRuntimeState } from "./npc-controller";

type VisionSource = "live" | "world";
type VisionState = "idle" | "capturing" | "analyzing" | "complete" | "error";

interface Props {
  view: "npc" | "vision";
  agents: Agent[];
  localStream: MediaStream | null;
  activeCamera: WorldCameraId;
  onActiveCamera: (camera: WorldCameraId) => void;
  captureWorld: WorldCameraCapture;
  avatarUrl: string;
  onAvatarUrl: (url: string) => void;
  npcState: NpcRuntimeState;
  onNpcCommand: (command: NpcCommand) => void;
}

function readFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return Promise.resolve<Blob | null>(null);
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve<Blob | null>(null);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Frame encoding failed"));
    reader.readAsDataURL(blob);
  });
}

function normalizeAvatarUrl(value: string) {
  try {
    const url = new URL(value);
    const readyPlayerHost = url.hostname === "readyplayer.me" || url.hostname.endsWith(".readyplayer.me");
    if (url.protocol !== "https:" || !readyPlayerHost || !url.pathname.toLowerCase().endsWith(".glb")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function SpatialPresenceConsole({ view, agents, localStream, activeCamera, onActiveCamera, captureWorld, avatarUrl, onAvatarUrl, npcState, onNpcCommand }: Props) {
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const scanBusyRef = useRef(false);
  const avatarObjectUrlRef = useRef("");
  const [visionSource, setVisionSource] = useState<VisionSource>("world");
  const [visionConsent, setVisionConsent] = useState(false);
  const [continuousVision, setContinuousVision] = useState(false);
  const [visionState, setVisionState] = useState<VisionState>("idle");
  const [visionResult, setVisionResult] = useState("No visual analysis has been requested.");
  const [visionTimestamp, setVisionTimestamp] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [avatarInput, setAvatarInput] = useState(avatarUrl);
  const [npcAgentId, setNpcAgentId] = useState(() => localStorage.getItem("amx_npc_agent") || agents[0]?.id || "jaz");
  const [npcCue, setNpcCue] = useState("");
  const [npcCueState, setNpcCueState] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [npcCueResult, setNpcCueResult] = useState("NPC ready for an operator or agent cue.");
  const npcCommandSequence = useRef(0);
  const creatorUrl = String((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_READY_PLAYER_ME_CREATOR_URL || "").trim();

  useEffect(() => { setAvatarInput(avatarUrl); }, [avatarUrl]);
  useEffect(() => () => { if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current); }, []);
  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;
    video.srcObject = localStream;
    if (localStream) void video.play().catch(() => undefined);
    return () => { video.pause(); video.srcObject = null; };
  }, [localStream]);

  useEffect(() => {
    if (!creatorOpen) return;
    const receiveAvatar = (event: MessageEvent) => {
      let payload: { source?: string; eventName?: string; data?: { url?: string } } | undefined;
      try { payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (!payload || payload.source !== "readyplayerme" || !["v1.avatar.exported", "v2.avatar.exported"].includes(payload.eventName || "")) return;
      if (!event.origin.endsWith(".readyplayer.me")) return;
      const exportedUrl = normalizeAvatarUrl(payload.data?.url || "");
      if (!exportedUrl) return;
      onAvatarUrl(exportedUrl);
      setAvatarInput(exportedUrl);
      setCreatorOpen(false);
    };
    window.addEventListener("message", receiveAvatar);
    return () => window.removeEventListener("message", receiveAvatar);
  }, [creatorOpen, onAvatarUrl]);

  const analyzeFrame = useCallback(async () => {
    if (!visionConsent || scanBusyRef.current) return;
    scanBusyRef.current = true;
    setVisionState("capturing");
    try {
      const blob = visionSource === "live" ? await readFrame(liveVideoRef.current as HTMLVideoElement) : await captureWorld(activeCamera);
      if (!blob) throw new Error(visionSource === "live" ? "Join the media pod before scanning the live camera" : "The world camera is not ready");
      setVisionState("analyzing");
      const dataUrl = await blobDataUrl(blob);
      const file = new File([blob], `nexus-${visionSource}-${Date.now()}.jpg`, { type: "image/jpeg" });
      const attachment: AgentAttachment = {
        id: crypto.randomUUID(), kind: "image", name: file.name, mimeType: file.type, size: file.size,
        file, dataUrl, previewUrl: dataUrl, transfer: "inline",
      };
      const sourceLabel = visionSource === "live" ? "consented room camera" : `${activeCamera} virtual world camera`;
      const response = await sendAgentRequest(
        agents[0],
        `Inspect this ${sourceLabel} frame for visible equipment, props, spatial layout, operational hazards, and useful training context. Do not identify people or infer identity, demographics, health, or emotions. Clearly separate observations from uncertainty.`,
        [attachment],
        "image",
      );
      setVisionResult(response.text);
      setVisionTimestamp(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setVisionState("complete");
    } catch (error) {
      setVisionResult(error instanceof Error ? error.message : "Visual analysis failed");
      setVisionState("error");
    } finally {
      scanBusyRef.current = false;
    }
  }, [activeCamera, agents, captureWorld, visionConsent, visionSource]);

  useEffect(() => {
    if (!continuousVision || !visionConsent) return;
    void analyzeFrame();
    const timer = window.setInterval(() => void analyzeFrame(), 12_000);
    return () => window.clearInterval(timer);
  }, [analyzeFrame, continuousVision, visionConsent]);

  const applyAvatarUrl = () => {
    const safe = normalizeAvatarUrl(avatarInput);
    if (!safe) return;
    onAvatarUrl(safe);
    setAvatarInput(safe);
  };

  const importAvatar = (file?: File) => {
    if (!file || file.size > 40 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".glb")) return;
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    avatarObjectUrlRef.current = objectUrl;
    setAvatarInput(file.name);
    onAvatarUrl(objectUrl);
  };

  const nextNpcCommandId = () => `${Date.now()}-${++npcCommandSequence.current}`;
  const issueNpcCommand = (command: Omit<NpcCommand, "id" | "agentId">) => {
    onNpcCommand({ ...command, id: nextNpcCommandId(), agentId: npcAgentId });
    const agentName = agents.find((agent) => agent.id === npcAgentId)?.name || "NPC";
    const waypoint = command.waypoint ? NPC_WAYPOINTS.find((item) => item.id === command.waypoint) : undefined;
    const feedback = command.kind === "action" ? `${agentName} is performing ${command.action || "the requested action"}.`
      : command.kind === "move" ? `${agentName} is navigating to ${waypoint?.label || "the selected destination"}.`
        : command.kind === "behavior" ? `${agentName} switched to ${command.behavior || "hold"} behavior.`
          : command.kind === "stop" ? `${agentName} stopped and is holding position.`
            : command.kind === "nudge" ? `${agentName} moved ${command.direction || "to the next position"}.` : "";
    if (feedback) {
      setNpcCueState("complete");
      setNpcCueResult(feedback);
    }
  };
  const nudgeNpc = (direction: NpcDirection) => issueNpcCommand({ kind: "nudge", direction });
  const assignNpcAgent = (agentId: string) => {
    setNpcAgentId(agentId);
    localStorage.setItem("amx_npc_agent", agentId);
    onNpcCommand({ id: nextNpcCommandId(), agentId, kind: "assign" });
  };
  const runNpcCue = async () => {
    const cue = npcCue.trim();
    const agent = agents.find((item) => item.id === npcAgentId) || agents[0];
    if (!cue || !agent || npcCueState === "running") return;
    const command = commandFromCue(cue, agent.id, nextNpcCommandId());
    onNpcCommand(command);
    setNpcCueState("running");
    setNpcCueResult(`${agent.name} is executing the spatial cue.`);
    try {
      const response = await sendAgentRequest(
        agent,
        `You are embodied as the active Nexus room NPC. The operator issued this cue: "${cue}". Acknowledge the movement or behavior briefly and state what room context you will observe at the destination.`,
        [],
        "text",
      );
      setNpcCueResult(response.text);
      setNpcCueState("complete");
    } catch (error) {
      setNpcCueResult(error instanceof Error ? error.message : "The NPC cue could not be completed");
      setNpcCueState("error");
    }
  };

  const busy = visionState === "capturing" || visionState === "analyzing";
  const liveReady = Boolean(localStream?.getVideoTracks().some((track) => track.readyState === "live"));
  const activePreset = AVATAR_PRESETS.find((preset) => preset.url === avatarUrl);

  return <section className="spatial-presence-console">
    {view === "npc" && <>
      <div className="spatial-console-section npc-director">
      <div className="spatial-console-head"><div><span className="eyebrow">NPC DIRECTOR / AGENT CONTROL</span><h3>Avatar behavior</h3></div><Bot/></div>
      <label className="npc-agent-control"><span>Assigned agent</span><select value={npcAgentId} onChange={(event) => assignNpcAgent(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} / {agent.specialty}</option>)}</select></label>
      <output className="npc-runtime-status"><span className={npcState.moving ? "moving" : ""}><i/>{npcState.action}</span><code>{npcState.position[0].toFixed(1)} / {npcState.position[2].toFixed(1)}</code><b>{npcState.behavior}</b></output>

      <div className="npc-waypoints" aria-label="NPC destinations">{NPC_WAYPOINTS.map((waypoint) => <button key={waypoint.id} className={npcState.waypoint === waypoint.id ? "active" : ""} onClick={() => issueNpcCommand({ kind: "move", waypoint: waypoint.id })}><MapPin/><span>{waypoint.label}</span></button>)}</div>

      <div className="npc-drive-row">
        <div className="npc-dpad" aria-label="NPC movement controls">
          <button className="up" aria-label="Move NPC forward" title="Move forward" onClick={() => nudgeNpc("forward")}><ArrowUp/></button>
          <button className="left" aria-label="Move NPC left" title="Move left" onClick={() => nudgeNpc("left")}><ArrowLeft/></button>
          <button className="stop" aria-label="Stop NPC" title="Stop" onClick={() => issueNpcCommand({ kind: "stop" })}><CircleStop/></button>
          <button className="right" aria-label="Move NPC right" title="Move right" onClick={() => nudgeNpc("right")}><ArrowRight/></button>
          <button className="down" aria-label="Move NPC back" title="Move back" onClick={() => nudgeNpc("back")}><ArrowDown/></button>
        </div>
        <div className="npc-mode-controls">
          <div className="npc-behavior-control" role="tablist" aria-label="NPC behavior"><button className={npcState.behavior === "hold" ? "active" : ""} onClick={() => issueNpcCommand({ kind: "behavior", behavior: "hold" })}>Hold</button><button className={npcState.behavior === "patrol" ? "active" : ""} onClick={() => issueNpcCommand({ kind: "behavior", behavior: "patrol" })}><Route/>Patrol</button></div>
          <label className="npc-speed-control"><span><Gauge/>Speed</span><b>{npcState.speed.toFixed(1)} m/s</b><input aria-label="NPC speed" type="range" min="0.5" max="2.2" step="0.1" value={npcState.speed} onChange={(event) => issueNpcCommand({ kind: "speed", speed: Number(event.target.value) })}/></label>
        </div>
      </div>

      <div className="npc-actions"><button onClick={() => issueNpcCommand({ kind: "action", action: "wave" })}><Hand/>Wave</button><button onClick={() => issueNpcCommand({ kind: "action", action: "talk" })}><MessageCircle/>Talk</button><button onClick={() => issueNpcCommand({ kind: "action", action: "inspect" })}><ScanSearch/>Inspect</button></div>
      <form className="npc-agent-cue" onSubmit={(event) => { event.preventDefault(); void runNpcCue(); }}><input aria-label="NPC agent cue" value={npcCue} onChange={(event) => setNpcCue(event.target.value)} placeholder="Send JAZ to inspect the media wall"/><button aria-label="Run NPC agent cue" title="Run cue" disabled={!npcCue.trim() || npcCueState === "running"}>{npcCueState === "running" ? <LoaderCircle className="spin"/> : <Send/>}</button></form>
      <output className={`npc-cue-result ${npcCueState}`}><Bot/><p>{npcCueResult}</p></output>
      </div>

      <div className="spatial-console-section avatar-console">
        <div className="spatial-console-head"><div><span className="eyebrow">BUILT-IN / GLB AVATARS</span><h3>Room avatar</h3></div><UserRound/></div>
        <label className="avatar-preset-control"><span>Built-in avatar</span><select value={activePreset?.url || ""} onChange={(event) => { const url = event.target.value; if (url) onAvatarUrl(url); }}><option value="" disabled>Custom avatar</option>{AVATAR_PRESETS.map((preset) => <option key={preset.id} value={preset.url}>{preset.label}</option>)}</select></label>
        <div className="avatar-url-row"><input aria-label="Ready Player Me GLB URL" placeholder="https://models.readyplayer.me/...glb" value={avatarInput} onChange={(event) => setAvatarInput(event.target.value)}/><button onClick={applyAvatarUrl} disabled={!normalizeAvatarUrl(avatarInput)}>Load</button></div>
        <div className="avatar-import-actions"><label className="button secondary"><Upload/>Import exported GLB<input type="file" accept=".glb,model/gltf-binary" onChange={(event) => { importAvatar(event.target.files?.[0]); event.target.value = ""; }}/></label><button className="button secondary" disabled={!creatorUrl} onClick={() => setCreatorOpen(true)}><UserRound/>{creatorUrl ? "Open private creator" : "Creator retired"}</button></div>
        {avatarUrl && <p className="avatar-active"><i/>{activePreset ? `${activePreset.label} loaded into the Blender room` : "Custom avatar loaded into the Blender room"}</p>}
      </div>
    </>}

    {view === "vision" && <>
      <div className="spatial-console-section">
        <div className="spatial-console-head"><div><span className="eyebrow">WORLD CAMERAS</span><h3>Capture viewpoints</h3></div><Cctv/></div>
        <div className="world-camera-selector" role="tablist" aria-label="World camera viewpoint">
          {WORLD_CAMERAS.map((camera) => <button key={camera.id} className={activeCamera === camera.id ? "active" : ""} onClick={() => onActiveCamera(camera.id)} title={camera.detail}><Camera/><span>{camera.label}</span></button>)}
        </div>
      </div>

      <div className="spatial-console-section vision-console">
        <div className="spatial-console-head"><div><span className="eyebrow">REALTIME VISION</span><h3>Agent scene scan</h3></div><ScanLine className={continuousVision ? "scanning" : ""}/></div>
        <div className="vision-source-control" role="tablist" aria-label="Vision source">
          <button className={visionSource === "world" ? "active" : ""} onClick={() => setVisionSource("world")}><Cctv/>World</button>
          <button className={visionSource === "live" ? "active" : ""} onClick={() => setVisionSource("live")} disabled={!liveReady}><Camera/>Live</button>
        </div>
        <label className="vision-consent"><input type="checkbox" checked={visionConsent} onChange={(event) => { setVisionConsent(event.target.checked); if (!event.target.checked) setContinuousVision(false); }}/><span><b>Allow visual analysis</b><small>Frames are sent only after this consent is enabled.</small></span></label>
        <div className="vision-actions">
          <button className="button secondary" disabled={!visionConsent || busy || (visionSource === "live" && !liveReady)} onClick={() => void analyzeFrame()}>{busy ? <LoaderCircle className="spin"/> : <Eye/>}{busy ? "Analyzing" : "Analyze frame"}</button>
          <button className={`vision-live-toggle ${continuousVision ? "active" : ""}`} role="switch" aria-checked={continuousVision} disabled={!visionConsent || (visionSource === "live" && !liveReady)} onClick={() => setContinuousVision((value) => !value)}><i/><span>12s live scan</span></button>
        </div>
        <output className={`vision-result ${visionState}`}><span><Bot/>{visionTimestamp || "VISION IDLE"}</span><p>{visionResult}</p></output>
        <video ref={liveVideoRef} className="vision-frame-source" muted playsInline/>
      </div>
    </>}

    {creatorOpen && <div className="rpm-modal" role="dialog" aria-modal="true" aria-label="Ready Player Me avatar creator">
      <div className="rpm-modal-head"><div><span className="eyebrow">READY PLAYER ME</span><b>Build your room avatar</b></div><button onClick={() => setCreatorOpen(false)} aria-label="Close avatar creator" title="Close"><X/></button></div>
      <iframe title="Ready Player Me avatar creator" allow="camera *; microphone *" src={creatorUrl}/>
    </div>}
  </section>;
}
