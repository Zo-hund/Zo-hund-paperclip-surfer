import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Mic, MicOff, PhoneOff, UserPlus, Send,
  CheckCircle2, AlertTriangle, Zap, Maximize, Minimize,
  Video, VideoOff, ScreenShare, ScreenShareOff, Circle,
  Activity, Cpu, Radar, Network, BarChart2,
  Hand, Minimize2, PenTool, User, Eye, SmilePlus, ImageIcon, Contact
} from "lucide-react";
import type { AgentState } from "@livekit/components-react";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useCompanyRole } from "../../hooks/useCompanyRole";
import { meetingsApi } from "../../api/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "../../context/ToastContext";
import { useQuery } from "@tanstack/react-query";
import { InviteAgentsDialog } from "./InviteAgentsDialog";
import { InviteGuestDialog } from "./InviteGuestDialog";
import { AgentAudioVisualizerAura } from "@/components/agent-audio-visualizer-aura";
import type { VideoTrackMap, LiveKitVoiceStatus, CanvasEvent, CanvasCursorEvent, ReactionEvent } from "../../hooks/useLiveKitVoice";
import type { BufferedStroke } from "../../hooks/useMeetingCanvasBuffer";
import { useNavigate } from "../../lib/router";
import { ModulePanel } from "./ModulePanel";
import type { ModuleData } from "./ModulePanel";
import { MeetingCanvas } from "./MeetingCanvas";

function toAgentState(status: LiveKitVoiceStatus | undefined): AgentState {
  switch (status) {
    case "connecting":   return "connecting";
    case "connected":    return "listening";
    case "listening":    return "listening";
    case "thinking":     return "thinking";
    case "speaking":     return "speaking";
    case "error":        return "failed";
    case "disconnected": return "disconnected";
    default:             return "idle";
  }
}

export type RoomMode = "chat" | "cockpit" | "video" | "canvas";

interface VoiceMeetingRoomProps {
  meetingId: string;
  onClose: () => void;
  onMinimize?: () => void;
  agentStatus?: LiveKitVoiceStatus;
  /** Real live LiveKit room occupancy (remote participants only) — drives the room light. */
  participantCount?: number;
  /** Controlled room mode (lifted to the overlay so the cockpit can jump straight to a mode). */
  mode?: RoomMode;
  onModeChange?: (mode: RoomMode) => void;
  cameraEnabled?: boolean;
  toggleCamera?: () => void;
  screenShareEnabled?: boolean;
  toggleScreenShare?: () => Promise<void>;
  screenShareSupported?: boolean;
  videoTracks?: VideoTrackMap;
  localVideoTrack?: MediaStreamTrack | null;
  localScreenTrack?: MediaStreamTrack | null;
  sendText?: (text: string) => void;
  sendCanvasStroke?: (stroke: { points: { x: number; y: number }[]; color: string; width: number }) => void;
  sendCanvasClear?: () => void;
  canvasEvent?: CanvasEvent | null;
  /** Live remote cursors on the shared canvas, keyed by LiveKit identity. */
  canvasCursors?: CanvasCursorEvent[];
  sendCanvasCursor?: (pos: { x: number; y: number }) => void;
  /** Full stroke history for replay after mode switches + snapshot rendering. */
  bufferedStrokes?: BufferedStroke[];
  bufferVersion?: number;
  /** Persist the canvas as a PNG artifact outcome on the meeting. */
  onSaveSnapshot?: () => Promise<void>;
  sendReaction?: (emoji: string) => void;
  /** Recent reactions to float over the room (parent prunes them). */
  reactions?: ReactionEvent[];
  setPTTActive?: (active: boolean) => void;
  activeModule?: ModuleData | null;
  clearModule?: () => void;
}

const REACTION_EMOJIS = ["👍", "🔥", "🎉", "❤️", "😂", "👀"];

/** Artifact outcomes store JSON {label, assetId, contentPath} in `content`. */
function parseArtifactContent(content: string): { label?: string; contentPath?: string } | null {
  try {
    const v = JSON.parse(content) as { label?: string; contentPath?: string };
    return v && typeof v === "object" && typeof v.contentPath === "string" ? v : null;
  } catch {
    return null;
  }
}

const SPEAKER_COLORS = [
  "#94a3b8", "#cbd5e1", "#64748b", "#475569",
  "#e2e8f0", "#9ca3af", "#d1d5db", "#4b5563",
];

const AudioEqualizer = () => (
  <div className="flex gap-1.5 items-end justify-center h-8 opacity-90 mx-auto mt-4">
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.4s_ease-in-out_infinite_alternate]" style={{ height: '40%' }} />
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.6s_ease-in-out_infinite_alternate]" style={{ height: '100%', animationDelay: '-0.2s' }} />
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.5s_ease-in-out_infinite_alternate]" style={{ height: '60%', animationDelay: '-0.4s' }} />
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.7s_ease-in-out_infinite_alternate]" style={{ height: '80%', animationDelay: '-0.1s' }} />
    <div className="w-1.5 bg-current rounded-full animate-[pulse_0.3s_ease-in-out_infinite_alternate]" style={{ height: '50%', animationDelay: '-0.5s' }} />
  </div>
);

function VideoTile({ track, name, status }: { track?: MediaStreamTrack; name: string; status?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && track) {
      ref.current.srcObject = new MediaStream([track]);
      ref.current.play().catch(() => {});
    }
    return () => { if (ref.current) ref.current.srcObject = null; };
  }, [track]);

  const isSpeaking = status === "thinking" || status === "responding" || status === "speaking";

  return (
    <div className={`relative rounded-xl overflow-hidden bg-black/60 aspect-video transition-all duration-300 ${
      isSpeaking ? "border-2 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : "border border-[#94a3b8]/20"
    }`}>
      {track ? (
        <video ref={ref} autoPlay playsInline muted className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a14]">
          <span className="text-3xl font-black text-[#94a3b8]/30">{name[0]?.toUpperCase()}</span>
        </div>
      )}
      {isSpeaking && (
        <div className="absolute bottom-10 left-0 right-0">
          <AudioEqualizer />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-gradient-to-t from-black/80">
        <span className="text-[11px] font-black text-white/90 uppercase tracking-wide">{name}</span>
        {status && (
          <span className={`text-[9px] ml-2 ${isSpeaking ? "text-emerald-400" : "text-white/40"}`}>
            {isSpeaking ? "● speaking" : status}
          </span>
        )}
      </div>
    </div>
  );
}

const SLASH_COMMANDS: Record<string, string> = {
  "/agents": "/agents",    "/agent": "/agents",
  "/issues": "/issues",    "/issue": "/issues",    "/tickets": "/issues",
  "/dashboard": "/dashboard", "/home": "/dashboard",
  "/settings": "/company/settings",
  "/projects": "/projects", "/project": "/projects",
  "/meetings": "/meetings", "/meeting": "/meetings",
  "/approvals": "/approvals/pending",
  "/inbox": "/inbox/mine",
  "/costs": "/costs",
  "/analytics": "/analytics",
};

export function VoiceMeetingRoom({ meetingId, onClose, onMinimize, agentStatus, participantCount, mode: controlledMode, onModeChange, cameraEnabled, toggleCamera, screenShareEnabled, toggleScreenShare, screenShareSupported = true, videoTracks, localVideoTrack, localScreenTrack, sendText: sendLiveKitText, sendCanvasStroke, sendCanvasClear, canvasEvent, canvasCursors, sendCanvasCursor, bufferedStrokes, bufferVersion, onSaveSnapshot, sendReaction, reactions, setPTTActive, activeModule, clearModule }: VoiceMeetingRoomProps) {
  const navigate = useNavigate();
  const { startRecording, stopRecording } = useVoiceRecorder();
  const [micActive, setMicActive] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [guestInviteOpen, setGuestInviteOpen] = useState(false);
  const [internalMode, setInternalMode] = useState<RoomMode>("cockpit");
  const mode = controlledMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  const [recording, setRecording] = useState(false);
  const [isPTTMode, setIsPTTMode] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { pushToast } = useToast();

  const { data: meeting, refetch: refetchMeeting } = useQuery({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => meetingsApi.getDetail(meetingId),
    refetchInterval: 2500,
  });

  // Gates invite/camera/screen-share controls below `member` tier — mirrors
  // the server-side assertCompanyRole("member") checks on these actions.
  const { hasRoleAtLeast } = useCompanyRole(meeting?.companyId);
  const canModerate = hasRoleAtLeast("member");

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [meeting?.transcripts?.length, meeting?.outcomes?.length, mode]);

  // Keyed by participant row id — works for both agents and staff (agentId
  // is null for staff rows).
  const colorMap = new Map<string, string>();
  (meeting?.participants ?? []).forEach((p, i) => {
    colorMap.set(p.id, SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
  });

  const lastSpeakerId = meeting?.transcripts?.slice(-1)[0]?.actorId ?? null;

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

  const handleSend = async () => {
    const text = commandText.trim();
    if (!text) return;
    setCommandText("");

    if (text.startsWith("/")) {
      const cmd = text.split(" ")[0].toLowerCase();
      const path = SLASH_COMMANDS[cmd];
      if (path) {
        onMinimize?.();
        navigate(path);
        return;
      }
    }

    sendLiveKitText?.(text);
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
    try {
      await meetingsApi.finalize(meetingId);
      onClose();
      pushToast({ title: "Session Closed", body: "Accountability log indexed.", tone: "success" });
    } catch {
      onClose();
    }
  };

  const handleScreenShare = useCallback(() => {
    if (!screenShareSupported) {
      pushToast({ title: "Not Available", body: "Screen sharing requires a desktop browser. Use camera sharing instead.", tone: "info" });
      return;
    }
    void toggleScreenShare?.()
      .then(() => { if (!screenShareEnabled) setMode("video"); })
      .catch(() => {
        pushToast({ title: "Screen Share Failed", body: "Permission denied or not supported by this browser.", tone: "error" });
      });
  }, [screenShareSupported, screenShareEnabled, toggleScreenShare, pushToast]);

  const transcripts = meeting?.transcripts ?? [];
  const participants = meeting?.participants ?? [];
  const outcomes = meeting?.outcomes ?? [];

  const isCockpit = mode === "cockpit";
  const isVideo = mode === "video";
  const isCanvas = mode === "canvas";
  const isExpanded = isCockpit || isVideo || isCanvas;

  // Shared mobile bottom-bar button style
  const mobileBarBtn = (active: boolean, color = "#94a3b8") =>
    `flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl transition-all ${
      active ? `bg-[${color}]/20 text-[${color}]` : "text-white/40"
    }`;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4 transition-all duration-700 ease-in-out ${
        isExpanded ? "bg-black/90 backdrop-blur-md" : "bg-black/70 backdrop-blur-sm"
      }`}
    >
      {/* Sci-Fi Ambient Glow — desktop only */}
      {isExpanded && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden hidden sm:block">
          <div className="absolute top-1/4 -left-[20%] w-[50%] h-[50%] bg-[#94a3b8]/10 blur-[80px] rounded-full mix-blend-screen" />
          <div className="absolute -bottom-1/4 -right-[10%] w-[50%] h-[50%] bg-slate-700/10 blur-[80px] rounded-full mix-blend-screen" />
        </div>
      )}

      {/* ── Panel ──────────────────────────────────────────────── */}
      <div
        className={`relative flex flex-col overflow-hidden w-full h-full sm:rounded-2xl sm:shadow-[0_0_80px_rgba(0,0,0,0.8)] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${isExpanded ? "sm:w-[96vw] sm:max-w-7xl sm:h-[92vh]" : "sm:max-w-2xl sm:h-[88vh]"}`}
        style={{
          background: isExpanded
            ? "linear-gradient(135deg, rgba(8,8,16,0.98) 0%, rgba(12,12,24,0.98) 100%)"
            : "#0d0d18",
          border: isExpanded
            ? "1px solid rgba(0, 243, 255, 0.15)"
            : "1px solid rgba(148,163,184,0.12)",
        }}
      >
        {isExpanded && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 0%, rgba(148,163,184,0.03) 100%)" }} />
        )}

        {/* ── Floating emoji reactions ──────────────────────── */}
        {reactions && reactions.length > 0 && (
          <div className="absolute top-16 right-6 z-30 pointer-events-none flex flex-col items-end gap-1">
            {reactions.map((r) => (
              <div key={`${r.identity}-${r.ts}`} className="flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <span className="text-2xl animate-bounce">{r.emoji}</span>
                <span className="text-[9px] uppercase tracking-wide text-white/40">
                  {r.identity === "local" ? "you" : r.identity.replace(/^board-user-/, "").slice(0, 8)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Web Module Panel overlay ─────────────────────── */}
        {activeModule && clearModule && (
          <div className="absolute inset-x-4 top-14 bottom-14 sm:bottom-0 z-20 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-2xl h-full">
              <ModulePanel module={activeModule} onClose={clearModule} />
            </div>
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────── */}
        <header
          className={`relative z-10 flex items-center gap-2 px-3 sm:px-5 border-b flex-shrink-0 backdrop-blur-md
            ${isExpanded ? "border-[#94a3b8]/20 bg-black/40 h-12 sm:h-14" : "border-white/[0.06] bg-[#09090f] h-12 sm:h-14"}`}
        >
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isExpanded && <Radar className="h-4 w-4 text-[#94a3b8] animate-pulse drop-shadow-[0_0_8px_rgba(148,163,184,0.8)] mr-1 hidden sm:block" />}
            <AgentAudioVisualizerAura
              size="icon"
              state={toAgentState(agentStatus)}
              color="#1FD5F9"
              themeMode="dark"
            />
            <span className={`text-[10px] font-black uppercase tracking-widest hidden sm:inline ${isExpanded ? "text-[#94a3b8]" : "text-red-400"}`}>
              {isExpanded ? "A.I. LIVE" : "LIVE"}
            </span>
            {micActive && (
              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-wide ml-1">
                <Mic className="h-3 w-3 animate-pulse" />
                <span className="hidden sm:inline">On Air</span>
              </span>
            )}
            {typeof participantCount === "number" && (
              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide ml-1" title="Real-time room occupancy">
                <span className="relative flex h-2 w-2">
                  {participantCount > 0 && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${participantCount > 0 ? "bg-green-500" : "bg-white/20"}`} />
                </span>
                <span className={participantCount > 0 ? "text-green-400" : "text-white/30"}>{participantCount}</span>
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="flex-1 text-[12px] sm:text-[14px] font-black uppercase tracking-widest text-white/90 truncate ml-1">
            {meeting?.title ?? "Strategic Session"}
            {isExpanded && (
              <span className="ml-3 text-[9px] sm:text-[10px] text-white/30 tracking-[0.3em] hidden sm:inline">// UPLINK ACTIVE</span>
            )}
          </h2>

          {/* Desktop: mode tabs */}
          <div className="hidden sm:flex items-center gap-1">
            <Button size="sm" variant="ghost"
              className={`h-8 px-3 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${mode === "chat" ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40 hover:text-[#94a3b8]"}`}
              onClick={() => setMode("chat")}>
              <Minimize className="h-3 w-3 mr-1.5" /> Chat
            </Button>
            <Button size="sm" variant="ghost"
              className={`h-8 px-3 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${mode === "cockpit" ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40 hover:text-[#94a3b8]"}`}
              onClick={() => setMode("cockpit")}>
              <Maximize className="h-3 w-3 mr-1.5" /> Cockpit
            </Button>
            <Button size="sm" variant="ghost"
              className={`h-8 px-3 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${mode === "video" ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40 hover:text-[#94a3b8]"}`}
              onClick={() => setMode("video")}>
              <Video className="h-3 w-3 mr-1.5" /> Vid Pod
            </Button>
            <Button size="sm" variant="ghost"
              className={`h-8 px-3 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${mode === "canvas" ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40 hover:text-[#94a3b8]"}`}
              onClick={() => setMode("canvas")}>
              <PenTool className="h-3 w-3 mr-1.5" /> Canvas
            </Button>
          </div>

          {/* Desktop: media controls */}
          <div className="hidden sm:flex items-center gap-1 ml-1">
            <div className="w-[1px] h-6 bg-white/10 mr-1" />
            {canModerate && toggleCamera && (
              <Button size="sm" variant="ghost"
                onClick={() => { toggleCamera(); if (!cameraEnabled) setMode("video"); }}
                className={`h-8 px-2 rounded-lg gap-1 text-[9px] font-black uppercase tracking-wide ${cameraEnabled ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/30 hover:text-white/60"}`}>
                {cameraEnabled ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                Cam
              </Button>
            )}
            {canModerate && toggleScreenShare && (
              <Button size="sm" variant="ghost"
                onClick={handleScreenShare}
                className={`h-8 px-2 rounded-lg gap-1 text-[9px] font-black uppercase tracking-wide ${screenShareEnabled ? "bg-blue-500/20 text-blue-400" : !screenShareSupported ? "text-white/20 cursor-not-allowed" : "text-white/30 hover:text-white/60"}`}>
                {screenShareEnabled ? <ScreenShare className="h-3.5 w-3.5" /> : <ScreenShareOff className="h-3.5 w-3.5" />}
                Share
              </Button>
            )}
            <Button size="sm" variant="ghost"
              onClick={() => setRecording((r) => !r)}
              className={`h-8 px-2 rounded-lg gap-1 text-[9px] font-black uppercase tracking-wide ${recording ? "bg-red-500/20 text-red-400" : "text-white/30 hover:text-white/60"}`}>
              <Circle className={`h-3.5 w-3.5 ${recording ? "fill-red-500" : ""}`} />
              {recording ? "Stop" : "Rec"}
            </Button>
            {canModerate && (
              <Button size="sm" variant="ghost"
                className="h-8 px-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]/50 hover:text-[#94a3b8] hover:bg-[#94a3b8]/10 gap-1"
                onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Add Entity
              </Button>
            )}
            {canModerate && (
              <Button size="sm" variant="ghost"
                className="h-8 px-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]/50 hover:text-[#94a3b8] hover:bg-[#94a3b8]/10 gap-1"
                onClick={() => setGuestInviteOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Invite Guest
              </Button>
            )}
            {setPTTActive && (
              <Button size="sm" variant="ghost"
                title={isPTTMode ? "Switch to Open Mic" : "Switch to Push-to-Talk"}
                className={`h-8 px-2 rounded-lg gap-1 text-[9px] font-black uppercase tracking-wide ${isPTTMode ? "bg-green-500/20 text-green-400" : "text-white/30 hover:text-white/60"}`}
                onClick={() => setIsPTTMode((v) => !v)}>
                <Hand className="h-3.5 w-3.5" />
                {isPTTMode ? "PTT" : "Open"}
              </Button>
            )}
            {sendReaction && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost"
                    title="Send a reaction"
                    className="h-8 px-2 rounded-lg text-white/30 hover:text-white/60">
                    <SmilePlus className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1.5 flex gap-1">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button key={emoji} onClick={() => sendReaction(emoji)}
                      className="h-8 w-8 rounded-lg text-lg hover:bg-accent/50 transition-colors">
                      {emoji}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            {(screenShareEnabled || cameraEnabled) && sendLiveKitText && (
              <Button size="sm" variant="ghost"
                title={screenShareEnabled ? "Ask JAZ to analyze your screen share" : "Ask JAZ to analyze your camera"}
                className="h-8 px-2 rounded-lg gap-1 text-[9px] font-black uppercase tracking-wide text-cyan-300/60 hover:text-cyan-300 hover:bg-cyan-500/10"
                onClick={() => {
                  sendLiveKitText(screenShareEnabled
                    ? "Please analyze my screen share and tell me what you see."
                    : "Please analyze my camera and tell me what you see.");
                  setMode("video");
                }}>
                <Eye className="h-3.5 w-3.5" />
                Ask JAZ
              </Button>
            )}
          </div>

          {/* Minimize + End call — always visible */}
          {onMinimize && (
            <Button size="icon" variant="ghost"
              title="Minimize to bubble"
              className="h-10 w-10 sm:h-8 sm:w-8 rounded-xl flex-shrink-0 text-white/40 hover:text-white hover:bg-white/10 transition-all ml-1"
              onClick={onMinimize}>
              <Minimize2 className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost"
            className="h-10 w-10 sm:h-8 sm:w-8 rounded-xl flex-shrink-0 bg-red-950/40 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white transition-all shadow-[0_0_10px_rgba(239,68,68,0.2)] hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] ml-1"
            onClick={handleEndCall}>
            <PhoneOff className="h-4 w-4" />
          </Button>
        </header>

        {/* ── Main Layout Body ───────────────────────────────── */}
        <div className={`relative z-10 flex-1 flex overflow-hidden ${isExpanded ? "flex-col md:flex-row gap-4 p-3 sm:p-4" : "flex-col"}`}>

          {/* LEFT PANE — cockpit sub-systems + participants (desktop only) */}
          {isCockpit && (
            <div className="hidden md:flex w-64 flex-shrink-0 flex-col gap-4">
              <div className="p-4 rounded-xl border border-[#94a3b8]/20 bg-black/40 backdrop-blur-md relative overflow-hidden group">
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
                </div>
              </div>
              <div className="flex-1 p-3 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                <h3 className="text-[10px] grid place-items-center mb-3 font-black uppercase tracking-[0.3em] text-white/40">
                  <span className="flex items-center gap-2"><Network className="h-3 w-3" /> Linked Entities</span>
                </h3>
                <div className="space-y-2">
                  {participants.map((p) => {
                    const color = colorMap.get(p.id) ?? "#94a3b8";
                    const isSpeaking = lastSpeakerId === p.agentId || lastSpeakerId === p.userId || p.status === "thinking" || p.status === "responding";
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border border-white/5 bg-white/[0.02]">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black relative"
                          style={{ background: `${color}15`, border: `1.5px solid ${isSpeaking ? color : `${color}28`}`, boxShadow: isSpeaking ? `0 0 10px ${color}55` : "none" }}>
                          {p.icon ? <span style={{ fontSize: "0.9rem" }}>{p.icon}</span> : p.participantType === "staff" ? <User className="h-4 w-4" style={{ color }} /> : p.participantType === "guest" ? <Contact className="h-4 w-4" style={{ color }} /> : <Bot className="h-4 w-4" style={{ color }} />}
                          <span className="absolute -bottom-0 -right-0 h-2 w-2 rounded-full border border-black"
                            style={{ background: p.status === "thinking" ? "#fbbf24" : p.status === "responding" ? color : p.status === "active" ? "#34d399" : "#ffffff20" }} />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-widest truncate" style={{ color }}>{p.name ?? "Unknown"}</span>
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
          )}

          {/* VIDEO GRID */}
          {isVideo && (() => {
            // Remote camera tracks are keyed by LiveKit identity: staff publish as
            // board-user-<userId>; agents (avatar) publish under their agent identity.
            // Guests publish under a per-join random identity (guest-<hex>) that
            // isn't persisted on the participant row, so their track can't be
            // matched by participant row — render them only via the "extra"
            // identities block below (labeled from the LiveKit `name` claim,
            // which the guest join route sets to their entered display name).
            const identityFor = (p: (typeof participants)[number]) =>
              p.userId ? `board-user-${p.userId}` : (p.name ?? "");
            const consumed = new Set<string>(["local"]);
            return (
              <div className="flex-1 rounded-xl p-3 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                <VideoTile track={localVideoTrack ?? undefined} name="You" status={micActive ? "speaking" : "muted"} />
                {participants.filter((p) => p.participantType !== "guest").map((p) => {
                  const name = p.name ?? "Unknown";
                  const identity = identityFor(p);
                  consumed.add(identity);
                  const remoteTracks = videoTracks?.get(identity);
                  return <VideoTile key={p.id} track={remoteTracks?.video} name={name} status={p.status} />;
                })}
                {/* Cameras from identities without a matchable participant row
                    (avatar workers, and guests — see note above) */}
                {videoTracks && Array.from(videoTracks.entries()).map(([identity, tracks]) =>
                  !consumed.has(identity) && tracks.video ? (
                    <VideoTile key={`extra-${identity}`} track={tracks.video} name={tracks.name || identity.replace(/^board-user-/, "")} />
                  ) : null
                )}
                {videoTracks && Array.from(videoTracks.entries()).map(([identity, tracks]) =>
                  tracks.screen ? (
                    <div key={`screen-${identity}`} className="col-span-full relative rounded-xl overflow-hidden border border-blue-500/40 aspect-video">
                      <VideoTile track={tracks.screen} name={identity === "local" ? "Your Screen" : `${tracks.name || identity.replace(/^board-user-/, "")} — Screen`} />
                      <span className="absolute top-2 left-2 text-[10px] font-black uppercase tracking-wide bg-blue-500/80 text-white px-2 py-0.5 rounded">Screen Share</span>
                    </div>
                  ) : null
                )}
              </div>
            );
          })()}

          {/* CANVAS — shared draw surface, synced via LiveKit data channel,
              buffered at the overlay level for replay + snapshot persistence */}
          {isCanvas && (
            <div className="flex-1 flex p-3 sm:p-4 overflow-hidden">
              <MeetingCanvas
                sendCanvasStroke={sendCanvasStroke}
                sendCanvasClear={sendCanvasClear}
                remoteEvent={canvasEvent}
                sendCanvasCursor={sendCanvasCursor}
                cursors={canvasCursors}
                bufferedStrokes={bufferedStrokes}
                bufferVersion={bufferVersion}
                onSaveSnapshot={onSaveSnapshot ? async () => {
                  setSavingSnapshot(true);
                  try {
                    await onSaveSnapshot();
                    pushToast({ title: "Canvas Saved", body: "Snapshot attached to the meeting as an artifact.", tone: "success" });
                    await refetchMeeting();
                  } catch (err) {
                    pushToast({ title: "Snapshot Failed", body: err instanceof Error ? err.message : "Could not save canvas.", tone: "error" });
                  } finally {
                    setSavingSnapshot(false);
                  }
                } : undefined}
                savingSnapshot={savingSnapshot}
              />
            </div>
          )}

          {/* CHAT STRIP — participant avatars (chat mode only, mobile-friendly scrollable row) */}
          {!isCockpit && !isVideo && !isCanvas && participants.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.04] bg-[#0a0a15] overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: "none" }}>
              {participants.map((p) => {
                const color = colorMap.get(p.id) ?? "#94a3b8";
                const isSpeaking = lastSpeakerId === p.agentId || lastSpeakerId === p.userId || p.status === "thinking" || p.status === "responding";
                return (
                  <div key={p.id} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-black relative select-none"
                      style={{ background: `${color}15`, border: `2px solid ${isSpeaking ? color : `${color}28`}`, boxShadow: isSpeaking ? `0 0 14px ${color}55` : "none", transition: "box-shadow 0.4s ease" }}>
                      {p.icon ? <span style={{ fontSize: "1rem" }}>{p.icon}</span> : p.participantType === "staff" ? <User className="h-4 w-4" style={{ color }} /> : p.participantType === "guest" ? <Contact className="h-4 w-4" style={{ color }} /> : <Bot className="h-4 w-4" style={{ color }} />}
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a15]"
                        style={{ background: p.status === "thinking" ? "#fbbf24" : p.status === "responding" ? color : p.status === "active" ? "#34d399" : "#ffffff20" }} />
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-tight" style={{ color: `${color}80` }}>{(p.name ?? "?").split(" ")[0]}</span>
                    {p.status === "thinking" && <span className="text-[7px] text-amber-400 font-bold animate-pulse">···</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* CENTER PANE: Chat thread + input */}
          {!isCanvas && (
            <div className={`flex flex-col min-w-0 bg-black/20 backdrop-blur-sm rounded-xl border border-white/5 relative overflow-hidden transition-all duration-500
              ${isVideo ? "hidden md:flex md:w-80 flex-shrink-0" : "flex-1"}`}>

              {isExpanded && (
                <div className="absolute inset-0 pointer-events-none opacity-20 hidden sm:block"
                  style={{ backgroundImage: `linear-gradient(rgba(0,243,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,243,255,0.1) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
              )}

              <div ref={threadRef}
                className={`flex-1 overflow-y-auto space-y-0.5 scroll-smooth relative z-10 ${isExpanded ? "px-4 sm:px-6 py-4 sm:py-6" : "px-3 sm:px-4 py-4"}`}
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(148,163,184,0.15) transparent" }}>

                {transcripts.length === 0 && outcomes.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-10">
                    <AgentAudioVisualizerAura
                      size="md"
                      state={toAgentState(agentStatus)}
                      color="#1FD5F9"
                      themeMode="dark"
                      className="mb-4"
                    />
                    <p className="text-[11px] text-white/40 font-black uppercase tracking-[0.3em]">Link Established</p>
                    <p className="text-[10px] text-[#94a3b8]/40 mt-3 tracking-widest uppercase">INITIALIZE PROTOCOL: /decide · /task · /risk</p>
                  </div>
                )}

                {transcripts.map((t, i) => {
                  const isUser = t.actorType === "user";
                  const participant = participants.find(p => p.agentId === t.actorId || p.userId === t.actorId);
                  const color = participant ? (colorMap.get(participant.id) ?? "#94a3b8") : "#e2e8f0";
                  const isCommand = t.text.startsWith("/");
                  const isMention = !isCommand && t.text.includes("@");
                  const prev = transcripts[i - 1];
                  const isGrouped = !!prev && prev.actorId === t.actorId;
                  const initials = isUser ? "B" : (participant?.name?.[0]?.toUpperCase() ?? "A");

                  return (
                    <div key={t.id} className={`flex gap-3 ${isGrouped ? "mt-0.5" : "mt-5"} ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                      {!isGrouped ? (
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-1 shadow-lg"
                          style={{ background: `${color}20`, border: `1px solid ${color}60`, color, boxShadow: `0 0 10px ${color}30` }}>
                          {participant?.icon ? <span style={{ fontSize: "0.85rem" }}>{participant.icon}</span> : initials}
                        </div>
                      ) : <div className="w-8 flex-shrink-0" />}
                      <div className={`flex flex-col gap-0.5 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
                        {!isGrouped && (
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] px-1 mb-0.5" style={{ color: isUser ? "rgba(255,255,255,0.4)" : color }}>
                            {isUser ? "Director" : (participant?.name ?? t.actorId)}
                          </span>
                        )}
                        <div className="px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words backdrop-blur-md shadow-sm border border-white/5"
                          style={
                            isCommand ? { background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.3)", color: "#94a3b8", fontFamily: "monospace" }
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

                {/* Artifact outcomes render as thumbnails in the telemetry pane only */}
                {!isCockpit && outcomes.filter((o) => o.type !== "artifact").map((o) => (
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
              <div className={`relative z-10 px-3 sm:px-4 py-3 flex-shrink-0 ${isExpanded ? "bg-black/40 border-t border-[#94a3b8]/20 rounded-b-xl" : "bg-[#09090f] border-t border-white/[0.06]"}`}>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="ghost"
                    className={`h-11 w-11 sm:h-10 sm:w-10 rounded-xl flex-shrink-0 transition-all select-none ${isPTTMode ? "ring-2 ring-green-500/50" : ""}`}
                    style={micActive ? { background: "rgba(239,68,68,0.2)", color: "#f87171", boxShadow: "0 0 15px rgba(239,68,68,0.3)" } : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
                    onClick={!isPTTMode ? toggleMic : undefined}
                    onPointerDown={isPTTMode ? () => setPTTActive?.(true) : undefined}
                    onPointerUp={isPTTMode ? () => { setPTTActive?.(false); } : undefined}
                    onPointerLeave={isPTTMode ? () => setPTTActive?.(false) : undefined}
                    title={isPTTMode ? "Hold to talk" : undefined}>
                    {micActive ? <Mic className="h-5 w-5 animate-pulse" /> : <MicOff className="h-5 w-5" />}
                  </Button>
                  <Input ref={inputRef}
                    placeholder="Transmit protocol or message…"
                    className="flex-1 h-11 sm:h-10 text-base sm:text-[13px] rounded-xl text-white placeholder:text-[#94a3b8]/30 focus-visible:ring-1 focus-visible:ring-[#94a3b8] transition-all"
                    style={{ background: isExpanded ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.04)", border: isExpanded ? "1px solid rgba(148,163,184,0.3)" : "1px solid rgba(255,255,255,0.08)" }}
                    value={commandText}
                    onChange={(e) => setCommandText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()} />
                  <Button size="icon"
                    className="h-11 w-11 sm:h-10 sm:w-10 rounded-xl flex-shrink-0 transition-all"
                    style={{ background: commandText.trim() ? "#94a3b8" : "rgba(148,163,184,0.1)", color: commandText.trim() ? "#050510" : "rgba(148,163,184,0.4)", boxShadow: commandText.trim() ? "0 0 15px rgba(148,163,184,0.4)" : undefined }}
                    onClick={handleSend}
                    disabled={!commandText.trim()}>
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT PANE: Telemetry (cockpit, desktop only) */}
          {isCockpit && (
            <div className="hidden md:flex w-80 flex-shrink-0 flex-col gap-4">
              <div className="flex-1 rounded-xl border border-[#94a3b8]/20 bg-black/40 backdrop-blur-md overflow-hidden flex flex-col relative group">
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
                      <p className="text-[9px] text-[#94a3b8]/30 uppercase tracking-[0.2em] border border-dashed border-[#94a3b8]/10 p-4 rounded-xl">No telemetry detected.<br />Issuing commands will<br />populate intelligence vectors.</p>
                    </div>
                  ) : outcomes.map((o) => {
                    const artifact = o.type === "artifact" ? parseArtifactContent(o.content) : null;
                    if (artifact) {
                      return (
                        <a key={o.id} href={artifact.contentPath} target="_blank" rel="noopener noreferrer"
                          className="block relative rounded-xl border overflow-hidden bg-black/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)] hover:border-[#94a3b8]/60 transition-colors"
                          style={{ borderColor: "rgba(148,163,184,0.3)" }}>
                          <img src={artifact.contentPath} alt={artifact.label ?? "Canvas snapshot"} className="w-full aspect-video object-cover" />
                          <div className="flex items-center gap-2 px-3 py-2">
                            <ImageIcon className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#94a3b8] truncate">
                              {artifact.label ?? "Canvas snapshot"}
                            </span>
                          </div>
                        </a>
                      );
                    }
                    return (
                    <div key={o.id} className="relative p-3 rounded-xl border bg-black/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                      style={o.type === "decision" ? { borderColor: "rgba(52,211,153,0.3)" } : o.type === "risk" ? { borderColor: "rgba(251,191,36,0.3)" } : { borderColor: "rgba(148,163,184,0.3)" }}>
                      <div className="flex items-start gap-2">
                        {o.type === "decision" && <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />}
                        {o.type === "risk" && <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 animate-pulse" />}
                        {o.type === "action_item" && <Zap className="h-4 w-4 text-[#94a3b8] flex-shrink-0" />}
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-[0.3em]" style={{ color: o.type === "decision" ? "#34d399" : o.type === "risk" ? "#fbbf24" : "#94a3b8" }}>
                            {o.type.replace("_", " ")}
                          </span>
                          <p className="text-[11px] text-white/70 leading-relaxed font-medium">{o.content}</p>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Mobile Bottom Action Bar ───────────────────────── */}
        <div className="flex sm:hidden items-center justify-around px-1 py-1.5 bg-black/70 border-t border-white/10 flex-shrink-0">
          {/* Mode: Chat */}
          <button
            onClick={() => setMode("chat")}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 transition-all ${mode === "chat" ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40"}`}>
            <Minimize className="h-5 w-5" />
            <span className="text-[8px] font-black uppercase tracking-wide">Chat</span>
          </button>
          {/* Mode: Cockpit */}
          <button
            onClick={() => setMode("cockpit")}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 transition-all ${mode === "cockpit" ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40"}`}>
            <Maximize className="h-5 w-5" />
            <span className="text-[8px] font-black uppercase tracking-wide">Cockpit</span>
          </button>
          {/* Mode: Vid Pod */}
          <button
            onClick={() => setMode("video")}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 transition-all ${mode === "video" ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40"}`}>
            <Video className="h-5 w-5" />
            <span className="text-[8px] font-black uppercase tracking-wide">Vid Pod</span>
          </button>
          {/* Mode: Canvas */}
          <button
            onClick={() => setMode("canvas")}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 transition-all ${mode === "canvas" ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40"}`}>
            <PenTool className="h-5 w-5" />
            <span className="text-[8px] font-black uppercase tracking-wide">Canvas</span>
          </button>
          {/* Camera */}
          {canModerate && toggleCamera && (
            <button
              onClick={() => { toggleCamera(); if (!cameraEnabled) setMode("video"); }}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 transition-all ${cameraEnabled ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/40"}`}>
              {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              <span className="text-[8px] font-black uppercase tracking-wide">Cam</span>
            </button>
          )}
          {/* Screen share */}
          {canModerate && toggleScreenShare && (
            <button
              onClick={handleScreenShare}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 transition-all ${screenShareEnabled ? "bg-blue-500/20 text-blue-400" : !screenShareSupported ? "text-white/20" : "text-white/40"}`}>
              {screenShareEnabled ? <ScreenShare className="h-5 w-5" /> : <ScreenShareOff className="h-5 w-5" />}
              <span className="text-[8px] font-black uppercase tracking-wide">Share</span>
            </button>
          )}
          {/* Rec */}
          <button
            onClick={() => setRecording((r) => !r)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 transition-all ${recording ? "bg-red-500/20 text-red-400" : "text-white/40"}`}>
            <Circle className={`h-5 w-5 ${recording ? "fill-red-500" : ""}`} />
            <span className="text-[8px] font-black uppercase tracking-wide">{recording ? "Stop" : "Rec"}</span>
          </button>
          {/* Reaction */}
          {sendReaction && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 text-white/40 transition-all">
                  <SmilePlus className="h-5 w-5" />
                  <span className="text-[8px] font-black uppercase tracking-wide">React</span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto p-1.5 flex gap-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button key={emoji} onClick={() => sendReaction(emoji)}
                    className="h-9 w-9 rounded-lg text-xl hover:bg-accent/50 transition-colors">
                    {emoji}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          {/* Ask JAZ to look */}
          {(screenShareEnabled || cameraEnabled) && sendLiveKitText && (
            <button
              onClick={() => {
                sendLiveKitText(screenShareEnabled
                  ? "Please analyze my screen share and tell me what you see."
                  : "Please analyze my camera and tell me what you see.");
                setMode("video");
              }}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[52px] min-h-[52px] rounded-xl px-1 text-cyan-300/60 transition-all">
              <Eye className="h-5 w-5" />
              <span className="text-[8px] font-black uppercase tracking-wide">Ask JAZ</span>
            </button>
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
      <InviteGuestDialog
        meetingId={meetingId}
        open={guestInviteOpen}
        onClose={() => setGuestInviteOpen(false)}
      />
    </div>
  );
}
