import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Mic, MicOff, PhoneOff, UserPlus, Send,
  CheckCircle2, AlertTriangle, Zap, Maximize, Minimize, Video,
  Activity, Cpu, Radar, Crosshair, Network, BarChart2,
  Camera, CameraOff, Monitor, MonitorOff, Radio, RadioTower,
  Terminal, Eye,
} from "lucide-react";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useWebRTC } from "../../hooks/useWebRTC";
import { useGeminiLive } from "../../hooks/useGeminiLive";
import { usePageAgent } from "../../hooks/usePageAgent";
import { meetingsApi } from "../../api/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "../../context/ToastContext";
import { useQuery } from "@tanstack/react-query";
import { InviteAgentsDialog } from "./InviteAgentsDialog";

interface VoiceMeetingRoomProps {
  meetingId: string;
  onClose: () => void;
}

const SPEAKER_COLORS = [
  "#94a3b8", "#cbd5e1", "#64748b", "#475569",
  "#e2e8f0", "#9ca3af", "#d1d5db", "#4b5563",
];

// ── Micro-components ──────────────────────────────────────────────────────────

const AudioEqualizer = () => (
  <div className="flex gap-1.5 items-end justify-center h-8 opacity-90 mx-auto mt-4">
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.4s_ease-in-out_infinite_alternate]" style={{ height: "40%" }} />
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.6s_ease-in-out_infinite_alternate]" style={{ height: "100%", animationDelay: "-0.2s" }} />
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.5s_ease-in-out_infinite_alternate]" style={{ height: "60%", animationDelay: "-0.4s" }} />
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.7s_ease-in-out_infinite_alternate]" style={{ height: "80%", animationDelay: "-0.1s" }} />
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.3s_ease-in-out_infinite_alternate]" style={{ height: "50%", animationDelay: "-0.5s" }} />
  </div>
);

function GeminiStatusBar({ status, isSpeaking }: { status: string; isSpeaking: boolean }) {
  const statusColor: Record<string, string> = {
    connected: "#34d399",
    listening: "#94a3b8",
    thinking: "#fbbf24",
    speaking: "#60a5fa",
    error: "#f87171",
    unavailable: "#6b7280",
    connecting: "#fbbf24",
    idle: "#374151",
  };
  const color = statusColor[status] ?? "#94a3b8";
  const bars = [0.3, 0.7, 1, 0.6, 0.4, 0.8, 0.5, 0.9];

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-[#94a3b8]/10 bg-black/50 flex-shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <RadioTower className="h-3 w-3" style={{ color }} />
        <span className="text-[9px] font-black uppercase tracking-[0.25em]" style={{ color }}>
          Gemini Live
        </span>
      </div>
      {/* Waveform */}
      <div className="flex items-center gap-0.5 h-4">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-0.5 rounded-full transition-all"
            style={{
              height: isSpeaking ? `${h * 100}%` : "20%",
              background: color,
              animation: isSpeaking ? `pulse ${0.3 + i * 0.08}s ease-in-out infinite alternate` : "none",
              opacity: status === "idle" ? 0.2 : 0.8,
            }}
          />
        ))}
      </div>
      <span className="text-[8px] uppercase tracking-widest font-black text-white/30 ml-auto">
        gemini-2.0-flash-live · {status}
      </span>
    </div>
  );
}

// Video element ref handler
function VideoTile({ stream, label, muted = false }: { stream: MediaStream; label: string; muted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative rounded-xl overflow-hidden aspect-video bg-black border border-[#94a3b8]/20">
      <video ref={videoRef} autoPlay muted={muted} playsInline className="w-full h-full object-cover" />
      <div className="absolute bottom-2 left-3 text-[9px] font-black uppercase tracking-widest text-white/60 bg-black/60 px-2 py-0.5 rounded-full">
        {label}
      </div>
    </div>
  );
}

// Vision preview canvas updated from MediaStream frames
function VisionPreview({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!stream) return;
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;
    void video.play().catch(() => {});

    const interval = setInterval(() => {
      const canvas = canvasRef.current;
      if (!canvas || video.readyState < 2) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }, 1000);

    return () => {
      clearInterval(interval);
      video.srcObject = null;
    };
  }, [stream]);

  if (!stream) {
    return (
      <div className="aspect-video rounded-lg bg-black/60 border border-[#94a3b8]/10 flex flex-col items-center justify-center gap-2">
        <Eye className="h-5 w-5 text-[#94a3b8]/20" />
        <span className="text-[8px] uppercase tracking-widest text-[#94a3b8]/30">No feed</span>
      </div>
    );
  }

  return (
    <div className="relative aspect-video rounded-lg overflow-hidden border border-[#94a3b8]/20">
      <canvas ref={canvasRef} width={320} height={180} className="w-full h-full object-cover" />
      <div className="absolute top-1 right-1 text-[7px] uppercase tracking-widest font-black text-emerald-400/80 bg-black/60 px-1.5 py-0.5 rounded-full flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        LIVE
      </div>
    </div>
  );
}

// ── Connection Indicator Panel ──────────────────────────────────────────────

function ConnectionIndicator({
  status, isSpeaking, audioLevel, geminiActive,
}: {
  status: string;
  isSpeaking: boolean;
  audioLevel: number;
  geminiActive: boolean;
}) {
  const STATUS_CFG: Record<string, { color: string; label: string; pulse: boolean }> = {
    idle:        { color: "#374151", label: "Standby",    pulse: false },
    connecting:  { color: "#fbbf24", label: "Connecting", pulse: true  },
    connected:   { color: "#34d399", label: "Online",     pulse: false },
    listening:   { color: "#94a3b8", label: "Listening",  pulse: true  },
    thinking:    { color: "#fbbf24", label: "Thinking",   pulse: true  },
    speaking:    { color: "#60a5fa", label: "Speaking",   pulse: true  },
    error:       { color: "#f87171", label: "Error",      pulse: true  },
    unavailable: { color: "#ef4444", label: "Offline",    pulse: false },
  };
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.idle;

  // Volume bar: 8 segments
  const segments = 8;
  const activeSeg = Math.round(audioLevel * segments * 4); // amplify for visibility

  return (
    <div className="p-4 rounded-xl border border-[#94a3b8]/20 bg-black/60 backdrop-blur-md flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RadioTower className="h-3.5 w-3.5" style={{ color: cfg.color }} />
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50">AI Link</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2.5 w-2.5 rounded-full ${cfg.pulse ? "animate-pulse" : ""}`}
            style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }}
          />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* WebSocket signal bars */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[8px] uppercase tracking-widest text-white/30 font-black">Signal</span>
        <div className="flex items-end gap-1 h-6">
          {[0.25, 0.45, 0.65, 0.85, 1].map((h, i) => {
            const active = geminiActive && status !== "idle" && status !== "unavailable";
            const lit = active && i <= (status === "error" ? 0 : status === "connecting" ? 1 : status === "connected" || status === "listening" ? 3 : 4);
            return (
              <div key={i} className="flex-1 rounded-sm transition-all duration-300"
                style={{
                  height: `${h * 100}%`,
                  background: lit ? cfg.color : "rgba(255,255,255,0.06)",
                  boxShadow: lit ? `0 0 6px ${cfg.color}80` : "none",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Mic volume meter */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[8px] uppercase tracking-widest text-white/30 font-black">Mic Input</span>
          <span className="text-[8px] font-black" style={{ color: audioLevel > 0.05 ? "#34d399" : "#374151" }}>
            {audioLevel > 0.05 ? "ACTIVE" : "SILENT"}
          </span>
        </div>
        <div className="flex gap-0.5 h-4 items-end">
          {Array.from({ length: segments }, (_, i) => {
            const lit = i < activeSeg;
            const segColor = i < segments * 0.6 ? "#34d399" : i < segments * 0.85 ? "#fbbf24" : "#f87171";
            return (
              <div key={i} className="flex-1 rounded-sm transition-all duration-75"
                style={{
                  height: `${40 + i * 8}%`,
                  background: lit ? segColor : "rgba(255,255,255,0.05)",
                  boxShadow: lit ? `0 0 4px ${segColor}` : "none",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Gemini speaking waveform */}
      {isSpeaking && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[8px] uppercase tracking-widest text-[#60a5fa]/60 font-black">AI Output</span>
          <div className="flex items-center justify-center gap-1 h-6">
            {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 0.4, 0.7, 1, 0.8, 0.5].map((h, i) => (
              <div key={i} className="w-1 rounded-full bg-[#60a5fa]"
                style={{
                  height: `${h * 100}%`,
                  animation: `pulse ${0.25 + i * 0.04}s ease-in-out infinite alternate`,
                  boxShadow: "0 0 4px #60a5fa",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Instructions when not connected */}
      {!geminiActive && (
        <p className="text-[8px] text-white/20 uppercase tracking-widest text-center border border-dashed border-white/10 rounded-lg px-2 py-2 leading-relaxed">
          Press AI OFF to activate<br />voice link
        </p>
      )}
    </div>
  );
}

export function VoiceMeetingRoom({ meetingId, onClose }: VoiceMeetingRoomProps) {
  const { startRecording, stopRecording } = useVoiceRecorder();
  const webrtc = useWebRTC();
  const geminiModality =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "text"
      ? ("text" as const)
      : ("audio" as const);
  const gemini = useGeminiLive(meetingId, { modality: geminiModality });
  const pageAgent = usePageAgent();

  const [micActive, setMicActive] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "cockpit" | "video">("cockpit");
  const [geminiActive, setGeminiActive] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { pushToast } = useToast();

  const { data: meeting, refetch: refetchMeeting } = useQuery({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => meetingsApi.getDetail(meetingId),
    refetchInterval: 2500,
  });

  // ── Wire Gemini tool calls → Page Agent ──────────────────────────────────
  useEffect(() => {
    gemini.setToolCallHandler(async (name, callId, args) => {
      const result = await pageAgent.execute(name, callId, args);
      return result;
    });
  }, [gemini, pageAgent]);

  // ── Surface WebRTC permission errors as toasts ───────────────────────────
  useEffect(() => {
    if (webrtc.cameraError) {
      pushToast({ title: "Camera Access Denied", body: webrtc.cameraError, tone: "error" });
    }
  }, [webrtc.cameraError, pushToast]);

  useEffect(() => {
    if (webrtc.screenError) {
      pushToast({ title: "Screen Share Failed", body: webrtc.screenError, tone: "error" });
    }
  }, [webrtc.screenError, pushToast]);

  // ── Stream video frames to Gemini when active ─────────────────────────────
  useEffect(() => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    const activeStream = webrtc.screenStream ?? webrtc.cameraStream;
    if (!geminiActive || !activeStream) return;

    frameIntervalRef.current = setInterval(() => {
      const frame = webrtc.captureFrame(activeStream);
      if (frame) gemini.sendVideoFrame(frame);
    }, 1000);

    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, [geminiActive, webrtc.screenStream, webrtc.cameraStream, gemini, webrtc]);

  // ── Append Gemini model transcripts to meeting ────────────────────────────
  const prevTranscriptLenRef = useRef(0);
  useEffect(() => {
    const entries = gemini.transcript;
    if (entries.length <= prevTranscriptLenRef.current) return;
    const newEntries = entries.slice(prevTranscriptLenRef.current);
    prevTranscriptLenRef.current = entries.length;
    for (const entry of newEntries) {
      if (entry.role === "model" && entry.text.trim()) {
        meetingsApi.addTranscript(meetingId, {
          actorType: "agent",
          actorId: "gemini-live",
          text: entry.text,
          timestampOffset: 0,
        }).then(() => refetchMeeting()).catch(() => {});
      }
    }
  }, [gemini.transcript, meetingId, refetchMeeting]);

  // ── Auto-scroll thread ────────────────────────────────────────────────────
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [meeting?.transcripts?.length, meeting?.outcomes?.length, mode]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, []);

  const colorMap = new Map<string, string>();
  (meeting?.participants ?? []).forEach((p, i) => {
    colorMap.set(p.agentId, SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
  });

  const lastSpeakerId = meeting?.transcripts?.slice(-1)[0]?.actorId ?? null;
  const transcripts = meeting?.transcripts ?? [];
  const participants = meeting?.participants ?? [];
  const outcomes = meeting?.outcomes ?? [];

  const isCockpit = mode === "cockpit";
  const isVideo = mode === "video";
  const isExpanded = isCockpit || isVideo;

  // ── Action handlers ───────────────────────────────────────────────────────

  const toggleMic = async () => {
    if (!micActive) {
      await startRecording();
      setMicActive(true);
      pushToast({ title: "Mic Active", body: "Recording started.", tone: "success" });
    } else {
      stopRecording();
      setMicActive(false);
    }
  };

  const toggleGemini = useCallback(() => {
    if (!geminiActive) {
      gemini.connect();
      setGeminiActive(true);
      pushToast({ title: "Gemini Live", body: "Connecting to AI assistant…" });
    } else {
      gemini.disconnect();
      setGeminiActive(false);
    }
  }, [geminiActive, gemini, pushToast]);

  const toggleCamera = useCallback(async () => {
    if (webrtc.cameraActive) {
      webrtc.stopCamera();
    } else {
      await webrtc.startCamera();
    }
  }, [webrtc]);

  const toggleScreen = useCallback(async () => {
    if (webrtc.screenActive) {
      webrtc.stopScreenShare();
    } else {
      await webrtc.startScreenShare();
      pushToast({ title: "Screen sharing active", body: "Gemini can now see your screen." });
    }
  }, [webrtc, pushToast]);

  const handleSend = async () => {
    const text = commandText.trim();
    if (!text) return;
    setCommandText("");
    if (geminiActive && gemini.status !== "idle") {
      gemini.sendText(text);
    }
    await meetingsApi.addTranscript(meetingId, {
      actorType: "user",
      actorId: "Board Member",
      text,
      timestampOffset: 0,
    });
    await refetchMeeting();
    inputRef.current?.focus();
  };

  const handleEndCall = async () => {
    if (micActive) stopRecording();
    if (geminiActive) gemini.disconnect();
    webrtc.stopCamera();
    webrtc.stopScreenShare();
    try {
      await meetingsApi.finalize(meetingId);
      onClose();
      pushToast({ title: "Session Closed", body: "Accountability log indexed.", tone: "success" });
    } catch {
      onClose();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-700 ease-in-out ${isExpanded ? "bg-black/90 backdrop-blur-md" : "bg-black/70 backdrop-blur-sm"}`}>

      {isExpanded && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 -left-[20%] w-[50%] h-[50%] bg-[#94a3b8]/10 blur-[80px] rounded-full mix-blend-screen" />
          <div className="absolute -bottom-1/4 -right-[10%] w-[50%] h-[50%] bg-slate-700/10 blur-[80px] rounded-full mix-blend-screen" />
        </div>
      )}

      <div
        className={`relative flex flex-col rounded-2xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.8)] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${isExpanded ? "w-[96vw] max-w-7xl h-[92vh]" : "w-full max-w-2xl h-[88vh]"}`}
        style={{
          background: isExpanded ? "linear-gradient(135deg, rgba(8,8,16,0.95) 0%, rgba(12,12,24,0.95) 100%)" : "#0d0d18",
          border: isExpanded ? "1px solid rgba(0, 243, 255, 0.2)" : "1px solid rgba(148,163,184,0.12)",
          boxShadow: isExpanded ? "0 0 40px rgba(148,163,184,0.05), inset 0 0 20px rgba(148,163,184,0.05)" : undefined,
        }}
      >
        {isExpanded && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 0%, rgba(148,163,184,0.03) 100%)" }} />
        )}

        {/* ── Header ─────────────────────────────────────────── */}
        <header className={`relative z-10 flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3 border-b flex-shrink-0 backdrop-blur-md
          ${isExpanded ? "border-[#94a3b8]/20 bg-black/40" : "border-white/[0.06] bg-[#09090f]"}`}>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isExpanded && <Radar className="h-4 w-4 text-[#94a3b8] animate-pulse drop-shadow-[0_0_8px_rgba(148,163,184,0.8)] mr-1 hidden sm:block" />}
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-[pulse_1s_infinite] shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <span className={`text-[10px] font-black uppercase tracking-widest ${isExpanded ? "text-[#94a3b8]" : "text-red-400"}`}>
              {isExpanded ? "A.I. LIVE" : "LIVE"}
            </span>
          </div>

          <h2 className="text-[12px] md:text-[13px] font-black uppercase tracking-widest text-white/90 truncate ml-1 flex-1 min-w-0">
            {meeting?.title ?? "Strategic Session"}
            {isExpanded && <span className="ml-3 text-[9px] text-white/30 tracking-[0.3em] hidden md:inline">// UPLINK ACTIVE</span>}
          </h2>

          {/* Mode toggles */}
          <div className="flex items-center gap-1">
            {(["chat", "cockpit", "video"] as const).map((m) => {
              const Icon = m === "chat" ? Minimize : m === "cockpit" ? Maximize : Video;
              return (
                <Button key={m} size="sm" variant="ghost"
                  className={`h-7 px-2 text-[8px] font-black uppercase tracking-[0.15em] transition-all
                    ${mode === m ? "bg-[#94a3b8]/20 text-[#94a3b8] shadow-[0_0_15px_rgba(148,163,184,0.2)]" : "text-white/40 hover:text-[#94a3b8]"}`}
                  onClick={() => setMode(m)}>
                  <Icon className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline capitalize">{m === "cockpit" ? "Cockpit" : m === "video" ? "Vid Pod" : "Chat"}</span>
                </Button>
              );
            })}
          </div>

          <div className="w-px h-5 bg-white/10 hidden sm:block" />

          {/* Media + Gemini controls */}
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost"
              className={`h-7 px-2 text-[8px] font-black uppercase transition-all ${webrtc.cameraActive ? "text-emerald-400 bg-emerald-400/10" : "text-white/30 hover:text-white/60"}`}
              onClick={toggleCamera} title="Toggle camera">
              {webrtc.cameraActive ? <Camera className="h-3 w-3" /> : <CameraOff className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost"
              className={`h-7 px-2 text-[8px] font-black uppercase transition-all ${webrtc.screenActive ? "text-blue-400 bg-blue-400/10" : "text-white/30 hover:text-white/60"}`}
              onClick={toggleScreen} title="Toggle screen share">
              {webrtc.screenActive ? <Monitor className="h-3 w-3" /> : <MonitorOff className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost"
              className={`h-7 px-2 text-[8px] font-black uppercase tracking-wider transition-all gap-1
                ${geminiActive
                  ? gemini.isSpeaking
                    ? "text-blue-400 bg-blue-400/15 shadow-[0_0_12px_rgba(96,165,250,0.3)] animate-pulse"
                    : "text-amber-400 bg-amber-400/15 shadow-[0_0_12px_rgba(251,191,36,0.3)]"
                  : "text-white/30 hover:text-white/60"}`}
              onClick={toggleGemini} title="Toggle Gemini Live">
              <Radio className="h-3 w-3" />
              <span className="hidden sm:inline">{geminiActive ? "AI ON" : "AI OFF"}</span>
            </Button>
          </div>

          <div className="w-px h-5 bg-white/10 hidden sm:block" />

          <Button size="sm" variant="ghost"
            className="h-7 px-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]/50 hover:text-[#94a3b8] hover:bg-[#94a3b8]/10 gap-1.5 flex-shrink-0 hidden sm:flex"
            onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3 w-3" />
            <span className="hidden md:inline">Add Entity</span>
          </Button>
          <Button size="icon" variant="ghost"
            className="h-7 w-7 rounded-lg flex-shrink-0 bg-red-950/40 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white transition-all shadow-[0_0_10px_rgba(239,68,68,0.2)] hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] ml-1"
            onClick={handleEndCall}>
            <PhoneOff className="h-3.5 w-3.5" />
          </Button>
        </header>

        {/* ── Gemini Status Bar (when active) ────────────────── */}
        {geminiActive && (
          <GeminiStatusBar status={gemini.status} isSpeaking={gemini.isSpeaking} />
        )}

        {/* ── Main Layout Body ───────────────────────────────── */}
        <div className={`relative z-10 flex-1 flex overflow-hidden ${isExpanded ? "flex-col md:flex-row gap-3 p-3" : "flex-col"}`}>

          {/* ── LEFT PANE ─────────────────────────────────────── */}
          {isCockpit ? (
            <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-3">
              {/* ── AI Connection Indicator ── */}
              <ConnectionIndicator
                status={gemini.status}
                isSpeaking={gemini.isSpeaking}
                audioLevel={gemini.audioLevel}
                geminiActive={geminiActive}
              />

              {/* Sub-Systems Intel HUD */}
              <div className="p-4 rounded-xl border border-[#94a3b8]/20 bg-black/40 backdrop-blur-md relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#94a3b8]/5 to-transparent pointer-events-none" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 mb-4 text-[#94a3b8]/70">
                  <Activity className="h-3.5 w-3.5" /> Sub-Systems
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[9px] uppercase tracking-widest font-black mb-1">
                      <span className="text-white/50">Cognitive Load</span>
                      <span className="text-[#94a3b8]">42%</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[#94a3b8] w-[42%] shadow-[0_0_10px_#94a3b8]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] uppercase tracking-widest font-black mb-1">
                      <span className="text-white/50">Token Matrix</span>
                      <span className="text-green-400">Stable</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-green-400 w-[89%] shadow-[0_0_10px_#4ade80]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] uppercase tracking-widest font-black mb-1">
                      <span className="text-white/50">Gemini Vision</span>
                      <span style={{ color: (webrtc.cameraActive || webrtc.screenActive) && geminiActive ? "#34d399" : "#6b7280" }}>
                        {(webrtc.cameraActive || webrtc.screenActive) && geminiActive ? "Active" : "Off"}
                      </span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 transition-all"
                        style={{ width: (webrtc.cameraActive || webrtc.screenActive) && geminiActive ? "100%" : "0%" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Gemini Vision Preview */}
              <div className="p-3 rounded-xl border border-[#94a3b8]/15 bg-black/40 backdrop-blur-md">
                <h3 className="text-[9px] font-black uppercase tracking-[0.3em] flex items-center gap-2 mb-2 text-[#94a3b8]/50">
                  <Eye className="h-3 w-3" /> Gemini Vision
                </h3>
                <VisionPreview stream={webrtc.screenStream ?? webrtc.cameraStream} />
              </div>

              {/* Linked Entities (Participants) */}
              <div className="flex-1 p-3 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                <h3 className="text-[10px] flex items-center gap-2 mb-3 font-black uppercase tracking-[0.3em] text-white/40">
                  <Network className="h-3 w-3" /> Linked Entities
                </h3>
                <div className="space-y-2">
                  {participants.map((p) => {
                    const color = colorMap.get(p.agentId) ?? "#94a3b8";
                    const isSpeaking = lastSpeakerId === p.agentId || p.status === "thinking" || p.status === "responding";
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border border-white/5 bg-white/[0.02]">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black relative flex-shrink-0"
                          style={{ background: `${color}15`, border: `1.5px solid ${isSpeaking ? color : `${color}28`}`, boxShadow: isSpeaking ? `0 0 10px ${color}55` : "none" }}>
                          {p.icon ? <span style={{ fontSize: "0.9rem" }}>{p.icon}</span> : <Bot className="h-4 w-4" style={{ color }} />}
                          <span className="absolute -bottom-0 -right-0 h-2 w-2 rounded-full border border-black"
                            style={{ background: p.status === "thinking" ? "#fbbf24" : p.status === "responding" ? color : p.status === "active" ? "#34d399" : "#ffffff20" }} />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-widest truncate" style={{ color }}>{p.name}</span>
                          <span className="text-[8px] uppercase tracking-[0.2em] text-white/30 flex items-center gap-1">
                            {p.status === "thinking" ? <><Cpu className="h-2 w-2 text-amber-400 animate-spin" /> Processing</> : p.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : isVideo ? (
            /* ── VIDEO GRID ──────────────────────────────────── */
            <div className="flex-1 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto content-start" style={{ scrollbarWidth: "none" }}>
              {/* Local camera feed */}
              {webrtc.cameraStream && (
                <VideoTile stream={webrtc.cameraStream} label="You (Camera)" muted />
              )}
              {/* Screen share */}
              {webrtc.screenStream && (
                <div className="sm:col-span-2">
                  <VideoTile stream={webrtc.screenStream} label="Screen Share" muted />
                </div>
              )}
              {/* Agent cards */}
              {participants.map((p) => {
                const color = colorMap.get(p.agentId) ?? "#94a3b8";
                const isSpeaking = lastSpeakerId === p.agentId || p.status === "thinking" || p.status === "responding";
                return (
                  <div key={p.id} className="relative rounded-2xl overflow-hidden aspect-video bg-black/60 border border-white/10 flex flex-col items-center justify-center transition-all duration-300"
                    style={{ borderColor: isSpeaking ? `${color}60` : undefined, boxShadow: isSpeaking ? `0 0 30px ${color}30, inset 0 0 20px ${color}15` : undefined }}>
                    <div className="absolute top-3 left-4 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/90">{p.name}</span>
                    </div>
                    {p.status === "thinking" && (
                      <div className="absolute top-3 right-4 flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md border border-white/10">
                        <Cpu className="h-3 w-3 text-amber-400 animate-spin" />
                        <span className="text-[8px] font-black uppercase text-amber-400">Processing</span>
                      </div>
                    )}
                    <div className="relative mt-2">
                      {isSpeaking && <div className="absolute inset-0 blur-2xl rounded-full scale-150 mix-blend-screen" style={{ background: `${color}40` }} />}
                      <div className="h-20 w-20 rounded-[30px] flex items-center justify-center text-4xl relative z-10 border-2 shadow-2xl"
                        style={{ background: `linear-gradient(145deg, ${color}20, rgba(0,0,0,0.8))`, borderColor: isSpeaking ? color : `${color}40`, boxShadow: isSpeaking ? `0 0 40px ${color}80, inset 0 0 20px ${color}50` : `0 0 10px rgba(0,0,0,0.5)`, color: isSpeaking ? "#fff" : color }}>
                        {p.icon ? <span>{p.icon}</span> : <Bot className="h-10 w-10" />}
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 transition-opacity duration-300" style={{ color, opacity: isSpeaking ? 1 : 0 }}>
                      {isSpeaking && <AudioEqualizer />}
                    </div>
                    <div className="absolute bottom-3 left-4 right-4 flex justify-between items-center opacity-40 text-[9px] uppercase font-black tracking-[0.3em]">
                      <span>[ {p.status} ]</span>
                      <span>NODE ACTIVE</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── CHAT STRIP ──────────────────────────────────── */
            participants.length > 0 && (
              <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.04] bg-[#0a0a15] overflow-x-auto flex-shrink-0 scrollbar-hide">
                {participants.map((p) => {
                  const color = colorMap.get(p.agentId) ?? "#94a3b8";
                  const isSpeaking = lastSpeakerId === p.agentId || p.status === "thinking" || p.status === "responding";
                  return (
                    <div key={p.id} className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-black relative select-none"
                        style={{ background: `${color}15`, border: `2px solid ${isSpeaking ? color : `${color}28`}`, boxShadow: isSpeaking ? `0 0 14px ${color}55, 0 0 4px ${color}80` : "none", transition: "box-shadow 0.4s ease, border-color 0.4s ease" }}>
                        {p.icon ? <span style={{ fontSize: "1rem" }}>{p.icon}</span> : <Bot className="h-4 w-4" style={{ color }} />}
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a15]"
                          style={{ background: p.status === "thinking" ? "#fbbf24" : p.status === "responding" ? color : p.status === "active" ? "#34d399" : "#ffffff20" }} />
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-tight" style={{ color: `${color}80` }}>{p.name.split(" ")[0]}</span>
                      {p.status === "thinking" && <span className="text-[7px] text-amber-400 font-bold animate-pulse">···</span>}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── CENTER PANE: Thread ───────────────────────────── */}
          <div className={`flex flex-col min-w-0 bg-black/20 backdrop-blur-sm rounded-xl border border-white/5 relative overflow-hidden transition-all duration-500 ease-out
            ${isVideo ? "w-full md:w-80 flex-shrink-0" : "flex-1"}`}>

            {isExpanded && (
              <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{ backgroundImage: "linear-gradient(rgba(0,243,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,243,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            )}

            <div ref={threadRef} className={`flex-1 overflow-y-auto space-y-0.5 scroll-smooth relative z-10 ${isExpanded ? "px-6 py-6" : "px-4 py-4"}`}
              style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(148,163,184,0.15) transparent" }}>

              {transcripts.length === 0 && outcomes.length === 0 && gemini.transcript.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <Crosshair className="h-16 w-16 mb-5 text-[#94a3b8]/40" />
                  <p className="text-[11px] text-white/40 font-black uppercase tracking-[0.3em]">Link Established</p>
                  <p className="text-[10px] text-[#94a3b8]/40 mt-3 tracking-widest uppercase">Voice · /decide · /task · /risk</p>
                </div>
              )}

              {/* Meeting transcripts */}
              {transcripts.map((t, i) => {
                const isUser = t.actorType === "user";
                const isGemini = t.actorId === "gemini-live";
                const participant = participants.find((p) => p.agentId === t.actorId);
                const color = isGemini ? "#60a5fa" : participant ? (colorMap.get(participant.agentId) ?? "#94a3b8") : "#e2e8f0";
                const isCommand = t.text.startsWith("/");
                const isMention = !isCommand && t.text.includes("@");
                const prev = transcripts[i - 1];
                const isGrouped = !!prev && prev.actorId === t.actorId;
                const initials = isGemini ? "G" : isUser ? "B" : (participant?.name?.[0]?.toUpperCase() ?? "A");

                return (
                  <div key={t.id} className={`flex gap-3 ${isGrouped ? "mt-0.5" : "mt-5"} ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                    {!isGrouped ? (
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-1 shadow-lg"
                        style={{ background: `${color}20`, border: `1px solid ${color}60`, color, boxShadow: `0 0 10px ${color}30` }}>
                        {isGemini ? <Radio className="h-3.5 w-3.5" /> : participant?.icon ? <span style={{ fontSize: "0.85rem" }}>{participant.icon}</span> : initials}
                      </div>
                    ) : <div className="w-8 flex-shrink-0" />}

                    <div className={`flex flex-col gap-0.5 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
                      {!isGrouped && (
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] px-1 mb-0.5" style={{ color: isUser ? "rgba(255,255,255,0.4)" : color }}>
                          {isGemini ? "Gemini AI" : isUser ? "Director" : (participant?.name ?? t.actorId)}
                        </span>
                      )}
                      <div className="px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words backdrop-blur-md shadow-sm border border-white/5"
                        style={
                          isGemini ? { background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", color: "rgba(255,255,255,0.95)" }
                          : isCommand ? { background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.3)", color: "#94a3b8", fontFamily: "monospace" }
                          : isMention ? { background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "rgba(255,255,255,0.95)" }
                          : isUser ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.95)" }
                          : { background: `${color}12`, border: `1px solid ${color}30`, color: "rgba(255,255,255,0.95)" }
                        }>
                        {t.text}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Outcomes in chat/video mode */}
              {!isCockpit && outcomes.map((o) => (
                <div key={o.id} className="flex items-start gap-2.5 mt-5 mx-2 px-3 py-2.5 rounded-xl border"
                  style={o.type === "decision" ? { background: "rgba(52,211,153,0.06)", borderColor: "rgba(52,211,153,0.2)" } : o.type === "risk" ? { background: "rgba(251,191,36,0.06)", borderColor: "rgba(251,191,36,0.2)" } : { background: "rgba(148,163,184,0.06)", borderColor: "rgba(148,163,184,0.2)" }}>
                  {o.type === "decision" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />}
                  {o.type === "risk" && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0 animate-pulse" />}
                  {o.type === "action_item" && <Zap className="h-3.5 w-3.5 text-[#94a3b8] mt-0.5 flex-shrink-0" />}
                  <div className="min-w-0">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] mr-1" style={{ color: o.type === "decision" ? "#34d399" : o.type === "risk" ? "#fbbf24" : "#94a3b8" }}>{o.type.replace("_", " ")} //</span>
                    <span className="text-[12px] text-white/80">{o.content}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Input strip */}
            <div className={`relative z-10 px-4 py-3 flex-shrink-0 ${isExpanded ? "bg-black/40 border-t border-[#94a3b8]/20 rounded-b-xl" : "bg-[#09090f] border-t border-white/[0.06]"}`}>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl flex-shrink-0 transition-all shadow-md"
                  style={micActive ? { background: "rgba(239,68,68,0.2)", color: "#f87171", boxShadow: "0 0 15px rgba(239,68,68,0.3)" } : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
                  onClick={toggleMic}>
                  {micActive ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
                </Button>

                <Input ref={inputRef}
                  placeholder={geminiActive ? "Ask Gemini or transmit protocol…" : "Transmit protocol or message…"}
                  className="flex-1 h-10 text-[13px] rounded-xl text-white placeholder:text-[#94a3b8]/30 focus-visible:ring-1 focus-visible:ring-[#94a3b8] transition-all"
                  style={{ background: isExpanded ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.04)", border: isExpanded ? "1px solid rgba(148,163,184,0.3)" : "1px solid rgba(255,255,255,0.08)" }}
                  value={commandText} onChange={(e) => setCommandText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()} />

                <Button size="icon" className="h-10 w-10 rounded-xl flex-shrink-0 transition-all shadow-lg"
                  style={{ background: commandText.trim() ? "#94a3b8" : "rgba(148,163,184,0.1)", color: commandText.trim() ? "#050510" : "rgba(148,163,184,0.4)" }}
                  onClick={handleSend} disabled={!commandText.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* ── RIGHT PANE: Outcomes + Voice Commands (Cockpit) ── */}
          {isCockpit && (
            <div className="w-full md:w-72 flex-shrink-0 flex flex-col gap-3">
              {/* Strategic Outcomes / Telemetry */}
              <div className="flex-1 rounded-xl border border-[#94a3b8]/20 bg-black/40 backdrop-blur-md overflow-hidden flex flex-col relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#94a3b8]/5 rounded-bl-[100px] pointer-events-none" />
                <div className="px-4 py-3 border-b border-[#94a3b8]/10 flex items-center justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 text-[#94a3b8]/70">
                    <BarChart2 className="h-3.5 w-3.5" /> Telemetry Feed
                  </h3>
                  <span className="text-[8px] uppercase font-black px-1.5 py-0.5 bg-[#94a3b8]/10 text-[#94a3b8] rounded">Syncing</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
                  {outcomes.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center">
                      <p className="text-[9px] text-[#94a3b8]/30 uppercase tracking-[0.2em] border border-dashed border-[#94a3b8]/10 p-4 rounded-xl">
                        No telemetry detected.<br />Issuing commands will<br />populate intelligence vectors.
                      </p>
                    </div>
                  ) : outcomes.map((o) => (
                    <div key={o.id} className="relative p-3 rounded-xl border bg-black/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                      style={o.type === "decision" ? { borderColor: "rgba(52,211,153,0.3)" } : o.type === "risk" ? { borderColor: "rgba(251,191,36,0.3)" } : { borderColor: "rgba(148,163,184,0.3)" }}>
                      <div className="flex items-start gap-2">
                        {o.type === "decision" && <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />}
                        {o.type === "risk" && <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 animate-pulse drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]" />}
                        {o.type === "action_item" && <Zap className="h-4 w-4 text-[#94a3b8] flex-shrink-0 drop-shadow-[0_0_5px_rgba(148,163,184,0.8)]" />}
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: o.type === "decision" ? "#34d399" : o.type === "risk" ? "#fbbf24" : "#94a3b8" }}>
                            {o.type.replace("_", " ")}
                          </span>
                          <p className="text-[11px] text-white/70 leading-relaxed font-medium">{o.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voice Commands Log */}
              {pageAgent.commandLog.length > 0 && (
                <div className="rounded-xl border border-[#94a3b8]/15 bg-black/40 backdrop-blur-md overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#94a3b8]/10 flex items-center gap-2">
                    <Terminal className="h-3 w-3 text-[#94a3b8]/50" />
                    <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[#94a3b8]/50">Voice Commands</h3>
                  </div>
                  <div className="p-3 space-y-1.5 max-h-40 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                    {pageAgent.commandLog.slice(0, 5).map((cmd, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <span className="text-[9px] font-black text-emerald-400/80 font-mono truncate block">{cmd.command}</span>
                          <span className="text-[8px] text-white/30 truncate block">{cmd.result}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <InviteAgentsDialog
        meetingId={meetingId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        participants={participants}
        onInvited={() => refetchMeeting()}
      />
    </div>
  );
}
