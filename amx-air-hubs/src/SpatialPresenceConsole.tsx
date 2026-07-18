import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Camera, Cctv, Eye, LoaderCircle, ScanLine, Upload, UserRound, X } from "lucide-react";
import type { Agent } from "./data";
import { AVATAR_PRESETS } from "./avatar-presets";
import { sendAgentRequest, type AgentAttachment } from "./agent-runtime";
import { WORLD_CAMERAS, type WorldCameraCapture, type WorldCameraId } from "./NexusRoomScene";

type VisionSource = "live" | "world";
type VisionState = "idle" | "capturing" | "analyzing" | "complete" | "error";

interface Props {
  agents: Agent[];
  localStream: MediaStream | null;
  activeCamera: WorldCameraId;
  onActiveCamera: (camera: WorldCameraId) => void;
  captureWorld: WorldCameraCapture;
  avatarUrl: string;
  onAvatarUrl: (url: string) => void;
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

export function SpatialPresenceConsole({ agents, localStream, activeCamera, onActiveCamera, captureWorld, avatarUrl, onAvatarUrl }: Props) {
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

  const busy = visionState === "capturing" || visionState === "analyzing";
  const liveReady = Boolean(localStream?.getVideoTracks().some((track) => track.readyState === "live"));
  const activePreset = AVATAR_PRESETS.find((preset) => preset.url === avatarUrl);

  return <section className="spatial-presence-console">
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

    <div className="spatial-console-section avatar-console">
      <div className="spatial-console-head"><div><span className="eyebrow">BUILT-IN / GLB AVATARS</span><h3>Room avatar</h3></div><UserRound/></div>
      <label className="avatar-preset-control"><span>Built-in avatar</span><select value={activePreset?.url || ""} onChange={(event) => { const url = event.target.value; if (url) onAvatarUrl(url); }}><option value="" disabled>Custom avatar</option>{AVATAR_PRESETS.map((preset) => <option key={preset.id} value={preset.url}>{preset.label}</option>)}</select></label>
      <div className="avatar-url-row"><input aria-label="Ready Player Me GLB URL" placeholder="https://models.readyplayer.me/...glb" value={avatarInput} onChange={(event) => setAvatarInput(event.target.value)}/><button onClick={applyAvatarUrl} disabled={!normalizeAvatarUrl(avatarInput)}>Load</button></div>
      <div className="avatar-import-actions"><label className="button secondary"><Upload/>Import exported GLB<input type="file" accept=".glb,model/gltf-binary" onChange={(event) => { importAvatar(event.target.files?.[0]); event.target.value = ""; }}/></label><button className="button secondary" disabled={!creatorUrl} onClick={() => setCreatorOpen(true)}><UserRound/>{creatorUrl ? "Open private creator" : "Creator retired"}</button></div>
      {avatarUrl && <p className="avatar-active"><i/>{activePreset ? `${activePreset.label} loaded into the Blender room` : "Custom avatar loaded into the Blender room"}</p>}
    </div>

    {creatorOpen && <div className="rpm-modal" role="dialog" aria-modal="true" aria-label="Ready Player Me avatar creator">
      <div className="rpm-modal-head"><div><span className="eyebrow">READY PLAYER ME</span><b>Build your room avatar</b></div><button onClick={() => setCreatorOpen(false)} aria-label="Close avatar creator" title="Close"><X/></button></div>
      <iframe title="Ready Player Me avatar creator" allow="camera *; microphone *" src={creatorUrl}/>
    </div>}
  </section>;
}
