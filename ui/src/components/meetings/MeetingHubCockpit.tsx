/**
 * MeetingHubCockpit
 *
 * The floating, draggable mini-meeting control that renders while the full
 * VoiceMeetingRoom is minimized. Two sizes:
 *   - "pill":  status aura + label + expand/end (compact, like a call chip)
 *   - "panel": mini cockpit — live roster with speaking indicators, mute,
 *              quick mode-switch buttons, and a live video/screen peek.
 *
 * Position + size persist in localStorage so the cockpit stays where the
 * user parked it across refreshes and sessions.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, ChevronDown, ChevronUp, Contact, Maximize2, Mic, MicOff,
  PenTool, PhoneOff, Radio, User, Video, MessageSquare, LayoutDashboard,
} from "lucide-react";
import type { AgentState } from "@livekit/components-react";
import { cn } from "../../lib/utils";
import { meetingsApi } from "../../api/meetings";
import { AgentAudioVisualizerAura } from "../agent-audio-visualizer-aura";
import type { LiveKitVoiceStatus, VideoTrackMap } from "../../hooks/useLiveKitVoice";
import type { RoomMode } from "./VoiceMeetingRoom";

const STORAGE_KEY = "paperclip.meetingCockpit";

type CockpitSize = "pill" | "panel";
type CockpitPrefs = { dx: number; dy: number; size: CockpitSize };

function loadPrefs(): CockpitPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { dx: 0, dy: 0, size: "pill", ...(JSON.parse(raw) as Partial<CockpitPrefs>) };
  } catch { /* ignore */ }
  return { dx: 0, dy: 0, size: "pill" };
}

function savePrefs(prefs: CockpitPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

function toAgentState(status: LiveKitVoiceStatus): AgentState {
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

function PeekVideo({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.srcObject = new MediaStream([track]);
      el.play().catch(() => {});
    }
    return () => { if (el) el.srcObject = null; };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className="w-full h-full object-cover" />;
}

export interface MeetingHubCockpitProps {
  meetingId: string;
  status: LiveKitVoiceStatus;
  muted: boolean;
  onToggleMute: () => void;
  /** Expand back into the full room, optionally jumping straight to a mode. */
  onExpand: (mode?: RoomMode) => void;
  onEnd: () => void;
  /** LiveKit identities currently speaking (staff identities are board-user-<userId>). */
  activeSpeakers: string[];
  videoTracks?: VideoTrackMap;
  localScreenTrack?: MediaStreamTrack | null;
  /** Most recent reaction emoji to echo on the cockpit (cleared by parent). */
  lastReactionEmoji?: string | null;
}

export function MeetingHubCockpit({
  meetingId,
  status,
  muted,
  onToggleMute,
  onExpand,
  onEnd,
  activeSpeakers,
  videoTracks,
  localScreenTrack,
  lastReactionEmoji,
}: MeetingHubCockpitProps) {
  const [prefs, setPrefs] = useState<CockpitPrefs>(loadPrefs);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ px: number; py: number; dx: number; dy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Light poll while minimized — the full room's 2.5s poll is not mounted.
  // (Empty meetingId = demo mount, e.g. the design guide — no polling.)
  const { data: meeting } = useQuery({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => meetingsApi.getDetail(meetingId),
    refetchInterval: 5000,
    enabled: !!meetingId,
  });
  const participants = meeting?.participants ?? [];

  const isSpeakingIdentity = useCallback(
    (userId: string | null | undefined, agentName: string | null | undefined) => {
      if (userId && activeSpeakers.includes(`board-user-${userId}`)) return true;
      // The dispatched voice agent speaks for agent participants; JAZ status covers it.
      if (agentName && activeSpeakers.some((id) => id.includes("voice-agent"))) {
        return status === "speaking";
      }
      return false;
    },
    [activeSpeakers, status],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setDragging(true);
    dragStart.current = { px: e.clientX, py: e.clientY, dx: prefs.dx, dy: prefs.dy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [prefs.dx, prefs.dy]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width ?? 260;
    const h = rect?.height ?? 48;
    // Offsets are measured from the bottom-right anchor; clamp inside viewport.
    const dx = Math.min(Math.max(dragStart.current.dx + (dragStart.current.px - e.clientX), 0), window.innerWidth - w - 24);
    const dy = Math.min(Math.max(dragStart.current.dy + (dragStart.current.py - e.clientY), 0), window.innerHeight - h - 24);
    setPrefs((p) => ({ ...p, dx, dy }));
  }, [dragging]);

  const onPointerUp = useCallback(() => {
    setDragging(false);
    dragStart.current = null;
    setPrefs((p) => { savePrefs(p); return p; });
  }, []);

  const setSize = useCallback((size: CockpitSize) => {
    setPrefs((p) => { const next = { ...p, size }; savePrefs(next); return next; });
  }, []);

  const label =
    status === "speaking" ? "JAZ Speaking" :
    status === "listening" ? "Listening" :
    status === "thinking" ? "Thinking" :
    status === "connecting" ? "Connecting…" :
    "On Air";

  // Peek priority: your screenshare > first remote screen > first remote camera.
  let peekTrack: MediaStreamTrack | null = localScreenTrack ?? null;
  if (!peekTrack && videoTracks) {
    for (const entry of videoTracks.values()) {
      if (entry.screen) { peekTrack = entry.screen; break; }
    }
    if (!peekTrack) {
      for (const entry of videoTracks.values()) {
        if (entry.video) { peekTrack = entry.video; break; }
      }
    }
  }

  const modeButtons: Array<{ mode: RoomMode; icon: typeof Video; title: string }> = [
    { mode: "chat", icon: MessageSquare, title: "Open chat" },
    { mode: "cockpit", icon: LayoutDashboard, title: "Open cockpit" },
    { mode: "video", icon: Video, title: "Open video pod" },
    { mode: "canvas", icon: PenTool, title: "Open canvas" },
  ];

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed z-[60] select-none animate-in slide-in-from-bottom-4 duration-300",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{ right: 24 + prefs.dx, bottom: 24 + prefs.dy }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {lastReactionEmoji && (
        <div key={lastReactionEmoji + String(Date.now()).slice(-4)} className="absolute -top-6 right-4 text-xl animate-bounce pointer-events-none">
          {lastReactionEmoji}
        </div>
      )}

      {prefs.size === "pill" ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/80 backdrop-blur-xl border border-primary/30 shadow-sm">
          <AgentAudioVisualizerAura size="icon" state={toAgentState(status)} color="#1FD5F9" themeMode="dark" className="flex-shrink-0" />
          <Radio className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wide text-primary/80 whitespace-nowrap">{label}</span>
          <button
            onClick={onToggleMute}
            className={cn("p-1 rounded-full transition-colors", muted ? "text-destructive hover:bg-destructive/10" : "text-primary/60 hover:text-primary hover:bg-primary/10")}
            title={muted ? "Unmute mic" : "Mute mic"}
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setSize("panel")}
            className="p-1 rounded-full text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors"
            title="Open mini cockpit"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => onExpand()}
            className="p-1 rounded-full text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors"
            title="Expand meeting room"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={onEnd}
            className="p-1 rounded-full text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="End call"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="w-80 rounded-xl bg-black/85 backdrop-blur-xl border border-primary/30 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/15">
            <AgentAudioVisualizerAura size="icon" state={toAgentState(status)} color="#1FD5F9" themeMode="dark" className="flex-shrink-0" />
            <span className="flex-1 text-xs font-medium uppercase tracking-wide text-primary/80 truncate">
              {meeting?.title ?? label}
            </span>
            <button onClick={() => setSize("pill")} className="p-1 rounded-md text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors" title="Collapse to pill">
              <ChevronDown className="h-4 w-4" />
            </button>
            <button onClick={() => onExpand()} className="p-1 rounded-md text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors" title="Expand meeting room">
              <Maximize2 className="h-4 w-4" />
            </button>
            <button onClick={onEnd} className="p-1 rounded-md text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors" title="End call">
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>

          {/* Video / screen peek */}
          {peekTrack && (
            <button onClick={() => onExpand("video")} className="block w-full aspect-video bg-black/60 border-b border-primary/10" title="Open video pod">
              <PeekVideo track={peekTrack} />
            </button>
          )}

          {/* Roster */}
          <div className="max-h-40 overflow-y-auto px-3 py-2 space-y-1" style={{ scrollbarWidth: "thin" }}>
            {participants.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No participants yet</p>
            ) : participants.map((p) => {
              const speaking = isSpeakingIdentity(p.userId, p.agentId ? p.name : null);
              return (
                <div key={p.id} className="flex items-center gap-2 py-1">
                  <span className={cn("relative flex h-2 w-2 flex-shrink-0")}>
                    {speaking && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                    <span className={cn("relative inline-flex rounded-full h-2 w-2", speaking ? "bg-emerald-400" : "bg-muted-foreground/30")} />
                  </span>
                  {p.participantType === "staff"
                    ? <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    : p.participantType === "guest"
                      ? <Contact className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      : <Bot className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className="text-xs text-foreground/80 truncate">{p.name ?? "Unknown"}</span>
                  {speaking && <span className="ml-auto text-[10px] text-emerald-400 uppercase tracking-wide">speaking</span>}
                </div>
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 px-3 py-2 border-t border-primary/15">
            <button
              onClick={onToggleMute}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                muted ? "bg-destructive/15 text-destructive" : "text-primary/70 hover:bg-primary/10 hover:text-primary",
              )}
              title={muted ? "Unmute mic" : "Mute mic"}
            >
              {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {muted ? "Muted" : "Live"}
            </button>
            <div className="flex-1" />
            {modeButtons.map(({ mode, icon: Icon, title }) => (
              <button
                key={mode}
                onClick={() => onExpand(mode)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title={title}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
