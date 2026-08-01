import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Sparkles, Square, WandSparkles } from "lucide-react";
import { createDecartClient, models, type RealTimeClient } from "@decartai/sdk";
import type { LiveVideoFeed } from "./LiveKitPod";

type Status = "idle" | "requesting" | "connecting" | "connected" | "generating" | "reconnecting" | "error";

export function DecartRealtimeCamera({ onFeedChange }: { onFeedChange: (feed: LiveVideoFeed | null) => void }) {
  const [prompt, setPrompt] = useState("Polished broadcast wardrobe and cinematic studio lighting");
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

  const start = async () => {
    stop();
    setStatus("requesting");
    setMessage("Requesting camera permission...");
    try {
      const model = models.realtime("lucy-2.5");
      const tokenResponse = await fetch("/api/decart/client-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "lucy-2.5" }) });
      const token = await tokenResponse.json().catch(() => ({})) as { apiKey?: string; error?: string };
      if (!tokenResponse.ok || !token.apiKey) throw new Error(token.error || "Decart realtime token is unavailable");
      const source = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", frameRate: { ideal: typeof model.fps === "number" ? model.fps : model.fps.ideal }, width: { ideal: model.width }, height: { ideal: model.height } } });
      sourceRef.current = source;
      if (inputRef.current) { inputRef.current.srcObject = source; await inputRef.current.play().catch(() => undefined); }
      setStatus("connecting");
      setMessage("Connecting Lucy 2.5 realtime transformation...");
      const decart = createDecartClient({ apiKey: token.apiKey });
      const realtime = await decart.realtime.connect(source, {
        model,
        mirror: "auto",
        preferredVideoCodec: "vp8",
        initialState: { prompt: { text: prompt.trim(), enhance: true } },
        onConnectionChange: (next) => { setStatus(next === "disconnected" ? "error" : next); setMessage(next === "generating" ? "AI camera is generating and ready to route." : `AI camera ${next}.`); },
        onRemoteStream: (stream) => {
          outputStreamRef.current = stream;
          if (outputRef.current) { outputRef.current.srcObject = stream; void outputRef.current.play().catch(() => undefined); }
          onFeedChange({ id: "decart-lucy-25", participantIdentity: "decart-lucy-25", name: "AI CAMERA / LUCY 2.5", local: true, source: "camera", stream, muted: false, width: model.width, height: model.height, frameRate: typeof model.fps === "number" ? model.fps : model.fps.ideal });
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
    try { await clientRef.current.setPrompt(prompt.trim(), { enhance: true }); setMessage("Prompt updated without interrupting the live stream."); }
    catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Prompt update failed"); }
  };

  const active = !["idle", "error"].includes(status);
  return <section className="stage-control-section decart-camera" data-status={status}>
    <header><div><span className="eyebrow">REALTIME AI CAMERA</span><h2>Decart Lucy 2.5</h2></div><span className={`stage-sync-state ${status === "generating" ? "audio-live" : ""}`}><Sparkles/>{status.toUpperCase()}{seconds ? ` / ${seconds}S` : ""}</span></header>
    <div className="decart-camera-previews"><figure><video ref={inputRef} muted playsInline/><figcaption>CAMERA INPUT</figcaption></figure><figure><video ref={outputRef} muted playsInline/><figcaption>AI PROGRAM SOURCE</figcaption></figure></div>
    <label className="decart-prompt"><WandSparkles/><input value={prompt} onChange={(event)=>setPrompt(event.target.value)} maxLength={500} placeholder="Describe the realtime visual edit"/><button onClick={()=>void updatePrompt()} disabled={!clientRef.current || !prompt.trim()}><RefreshCw/>UPDATE</button></label>
    <div className="decart-camera-actions"><button onClick={()=>void start()} disabled={active}><Camera/>START AI CAMERA</button><button className="stop" onClick={stop} disabled={!active && status !== "error"}><Square/>STOP</button></div>
    <p>{message}</p>
  </section>;
}
