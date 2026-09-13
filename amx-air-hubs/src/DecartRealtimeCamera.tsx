import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw, Sparkles, Square, WandSparkles, X } from "lucide-react";
import { createDecartClient, models, type RealTimeClient } from "@decartai/sdk";
import type { LiveVideoFeed } from "./LiveKitPod";

type Status = "idle" | "requesting" | "connecting" | "connected" | "generating" | "reconnecting" | "error";
type RealtimeModelId = "lucy-latest" | "lucy-2.5" | "lucy-restyle-latest" | "lucy-restyle-2" | "lucy-vton-latest" | "lucy-vton-3" | "lucy-2.1";
type RenderModelId = RealtimeModelId | "lucy-clip-latest";
const REALTIME_MODELS: { id: RealtimeModelId; label: string; detail: string }[] = [
  { id: "lucy-latest", label: "Lucy Latest", detail: "general editing" },
  { id: "lucy-2.5", label: "Lucy 2.5", detail: "objects and backgrounds" },
  { id: "lucy-restyle-latest", label: "Restyle Latest", detail: "current scene styling" },
  { id: "lucy-restyle-2", label: "Restyle 2", detail: "artistic styling" },
  { id: "lucy-vton-latest", label: "VTON Latest", detail: "current virtual try-on" },
  { id: "lucy-vton-3", label: "VTON 3", detail: "wardrobe and clothing" },
  { id: "lucy-2.1", label: "Lucy 2.1", detail: "legacy character edit" },
];

export function DecartRealtimeCamera({ onFeedChange }: { onFeedChange: (feed: LiveVideoFeed | null) => void }) {
  const [prompt, setPrompt] = useState("Polished broadcast wardrobe and cinematic studio lighting");
  const [modelId, setModelId] = useState<RealtimeModelId>("lucy-latest");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [mode, setMode] = useState<"realtime" | "render">("realtime");
  const [renderModel, setRenderModel] = useState<RenderModelId>("lucy-latest");
  const [renderFile, setRenderFile] = useState<File | null>(null);
  const [renderStatus, setRenderStatus] = useState("idle");
  const [renderUrl, setRenderUrl] = useState("");
  const renderRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Lucy 2.5 is ready as a routable AI camera source.");
  const [seconds, setSeconds] = useState(0);
  const inputRef = useRef<HTMLVideoElement>(null);
  const outputRef = useRef<HTMLVideoElement>(null);
  const sourceRef = useRef<MediaStream | null>(null);
  const outputStreamRef = useRef<MediaStream | null>(null);
  const clientRef = useRef<RealTimeClient | null>(null);

  const stop = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    sourceRef.current?.getTracks().forEach((track) => track.stop());
    sourceRef.current = null;
    outputStreamRef.current = null;
    if (inputRef.current) inputRef.current.srcObject = null;
    if (outputRef.current) outputRef.current.srcObject = null;
    onFeedChange(null);
    setStatus("idle");
    setSeconds(0);
    setMessage("AI camera stopped and released.");
  };

  useEffect(() => stop, []);
  useEffect(() => () => { if (renderUrl) URL.revokeObjectURL(renderUrl); }, [renderUrl]);

  const start = async () => {
    stop();
    setStatus("requesting");
    setMessage("Requesting camera permission...");
    try {
      const model = models.realtime(modelId);
      const tokenResponse = await fetch("/api/decart/client-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: modelId }) });
      const token = await tokenResponse.json().catch(() => ({})) as { apiKey?: string; error?: string };
      if (!tokenResponse.ok || !token.apiKey) throw new Error(token.error || "Decart realtime token is unavailable");
      const source = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", frameRate: { ideal: typeof model.fps === "number" ? model.fps : model.fps.ideal }, width: { ideal: model.width }, height: { ideal: model.height } } });
      sourceRef.current = source;
      if (inputRef.current) { inputRef.current.srcObject = source; await inputRef.current.play().catch(() => undefined); }
      setStatus("connecting");
      setMessage(`Connecting ${REALTIME_MODELS.find((item) => item.id === modelId)?.label} realtime transformation...`);
      const decart = createDecartClient({ apiKey: token.apiKey });
      const realtime = await decart.realtime.connect(source, {
        model,
        mirror: "auto",
        preferredVideoCodec: "vp8",
        initialState: { prompt: { text: prompt.trim(), enhance: true }, ...(referenceImage ? { image: referenceImage } : {}) },
        onConnectionChange: (next) => { setStatus(next === "disconnected" ? "error" : next); setMessage(next === "generating" ? "AI camera is generating and ready to route." : `AI camera ${next}.`); },
        onRemoteStream: (stream) => {
          outputStreamRef.current = stream;
          if (outputRef.current) { outputRef.current.srcObject = stream; void outputRef.current.play().catch(() => undefined); }
          const label = REALTIME_MODELS.find((item) => item.id === modelId)?.label || modelId;
          onFeedChange({ id: `decart-${modelId}`, participantIdentity: `decart-${modelId}`, name: `AI CAMERA / ${label.toUpperCase()}`, local: true, source: "camera", stream, muted: false, width: model.width, height: model.height, frameRate: typeof model.fps === "number" ? model.fps : model.fps.ideal });
        },
      });
      realtime.on("generationTick", ({ seconds: elapsed }) => setSeconds(Math.round(elapsed)));
      realtime.on("error", (error) => { setStatus("error"); setMessage(`${error.code}: ${error.message}`); });
      clientRef.current = realtime;
    } catch (error) {
      sourceRef.current?.getTracks().forEach((track) => track.stop());
      sourceRef.current = null;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "AI camera could not start");
      onFeedChange(null);
    }
  };

  const updatePrompt = async () => {
    if (!clientRef.current || !prompt.trim()) return;
    try {
      await clientRef.current.set({ prompt: prompt.trim(), image: referenceImage, enhance: true });
      setMessage(referenceImage ? "Prompt and reference image applied together." : "Prompt updated without interrupting the live stream.");
    }
    catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Prompt update failed"); }
  };

  const submitRender = async () => {
    if (!renderFile || !prompt.trim()) return;
    setRenderStatus("uploading");
    try {
      const form = new FormData();
      form.set("model", renderModel);
      form.set("prompt", prompt.trim());
      form.set("data", renderFile);
      if (referenceImage) form.set("reference_image", referenceImage);
      const submitted = await fetch("/api/decart/render", { method: "POST", body: form });
      const job = await submitted.json().catch(() => ({})) as { jobId?: string; error?: string };
      if (!submitted.ok || !job.jobId) throw new Error(job.error || "Render could not be submitted");
      let state = "pending";
      while (["pending", "processing"].includes(state)) {
        setRenderStatus(state);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const response = await fetch(`/api/decart/render/${job.jobId}`);
        const progress = await response.json().catch(() => ({})) as { status?: string; error?: string };
        if (!response.ok) throw new Error(progress.error || "Render status could not be checked");
        state = progress.status || "failed";
      }
      if (state !== "completed") throw new Error("Decart render failed");
      setRenderStatus("downloading");
      const content = await fetch(`/api/decart/render/${job.jobId}/content`);
      if (!content.ok) throw new Error("Rendered video could not be downloaded");
      const url = URL.createObjectURL(await content.blob());
      setRenderUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return url; });
      setRenderStatus("ready");
    } catch (error) { setRenderStatus("error"); setMessage(error instanceof Error ? error.message : "Render failed"); }
  };

  const routeRender = async () => {
    const video = renderRef.current;
    if (!video) return;
    await video.play();
    const stream = (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
    onFeedChange({ id: "decart-render", participantIdentity: "decart-render", name: `AI RENDER / ${renderModel.toUpperCase()}`, local: true, source: "screen", stream, muted: false, width: video.videoWidth, height: video.videoHeight, frameRate: 30 });
    setMessage("Rendered video is now available in camera and screen routing.");
  };

  const active = !["idle", "error"].includes(status);
  return <section className="stage-control-section decart-camera" data-status={status}>
    <header><div><span className="eyebrow">AI CAMERA + RENDER</span><h2>Decart visual engine</h2></div><span className={`stage-sync-state ${status === "generating" ? "audio-live" : ""}`}><Sparkles/>{mode === "realtime" ? status.toUpperCase() : renderStatus.toUpperCase()}{seconds && mode === "realtime" ? ` / ${seconds}S` : ""}</span></header>
    <div className="decart-mode"><button className={mode==="realtime"?"active":""} onClick={()=>setMode("realtime")}>REALTIME</button><button className={mode==="render"?"active":""} onClick={()=>{stop();setMode("render")}}>RENDER VIDEO</button></div>
    {mode === "realtime" ? <>
    <label className="decart-model-select"><span>MODEL</span><select value={modelId} disabled={active} onChange={(event)=>setModelId(event.target.value as RealtimeModelId)}>{REALTIME_MODELS.map((item)=><option key={item.id} value={item.id}>{item.label} / {item.detail}</option>)}</select></label>
    <div className="decart-reference"><label><ImagePlus/><span>{referenceImage ? referenceImage.name : "ADD REFERENCE IMAGE"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>setReferenceImage(event.target.files?.[0] || null)}/></label>{referenceImage&&<button title="Remove reference image" onClick={()=>setReferenceImage(null)}><X/></button>}</div>
    <div className="decart-camera-previews"><figure><video ref={inputRef} muted playsInline/><figcaption>CAMERA INPUT</figcaption></figure><figure><video ref={outputRef} muted playsInline/><figcaption>AI PROGRAM SOURCE</figcaption></figure></div>
    <label className="decart-prompt"><WandSparkles/><input value={prompt} onChange={(event)=>setPrompt(event.target.value)} maxLength={500} placeholder="Describe the realtime visual edit"/><button onClick={()=>void updatePrompt()} disabled={!clientRef.current || !prompt.trim()}><RefreshCw/>UPDATE</button></label>
    <div className="decart-camera-actions"><button onClick={()=>void start()} disabled={active}><Camera/>START AI CAMERA</button><button className="stop" onClick={stop} disabled={!active && status !== "error"}><Square/>STOP</button></div>
    </> : <>
      <label className="decart-model-select"><span>MODEL</span><select value={renderModel} disabled={!['idle','ready','error'].includes(renderStatus)} onChange={(event)=>setRenderModel(event.target.value as RenderModelId)}>{[...REALTIME_MODELS,{id:"lucy-clip-latest" as RenderModelId,label:"Lucy Clip Latest",detail:"legacy video editing"}].map((item)=><option key={item.id} value={item.id}>{item.label} / {item.detail}</option>)}</select></label>
      <div className="decart-render-source"><label><Camera/><span>{renderFile ? renderFile.name : "SELECT MP4 OR WEBM VIDEO"}</span><input type="file" accept="video/mp4,video/webm" onChange={(event)=>setRenderFile(event.target.files?.[0] || null)}/></label></div>
      <label className="decart-prompt"><WandSparkles/><input value={prompt} onChange={(event)=>setPrompt(event.target.value)} maxLength={1000} placeholder="Describe the recorded-video transformation"/><button disabled><Sparkles/>QUEUE</button></label>
      {renderUrl&&<video className="decart-render-preview" ref={renderRef} src={renderUrl} controls playsInline/>}
      <div className="decart-camera-actions"><button onClick={()=>void submitRender()} disabled={!renderFile||!prompt.trim()||!['idle','ready','error'].includes(renderStatus)}><Sparkles/>GENERATE</button><button onClick={()=>void routeRender()} disabled={renderStatus!=="ready"}><RefreshCw/>ROUTE</button></div>
    </>}
    <p>{message}</p>
  </section>;
}
