/**
 * GuestMeetingRoom
 *
 * The meeting UI rendered for an external guest after joining via a magic
 * link. Deliberately NOT a variant of VoiceMeetingRoom — that component is
 * tightly coupled to internal-only data (issue linkage, outcomes/telemetry,
 * slash commands to board routes, InviteAgentsDialog) and its "Leave" action
 * calls meetingsApi.finalize, which ends the meeting for everyone. A guest's
 * "Leave" must only disconnect their own LiveKit session.
 *
 * Reuses MeetingCanvas (pure LiveKit/UI-state, no internal coupling) and a
 * small local video-tile component mirroring VoiceMeetingRoom's. Chat is
 * ephemeral and data-channel-only — never meetingsApi.getDetail's persisted
 * transcripts/outcomes, which are internal-only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff, ScreenShare, ScreenShareOff, PenTool, MessageSquare, SmilePlus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGuestLiveKitVoice, type GuestConnectionParams } from "../../hooks/useGuestLiveKitVoice";
import type { CanvasEvent, CanvasCursorEvent, ReactionEvent } from "../../hooks/useLiveKitVoice";
import { MeetingCanvas } from "./MeetingCanvas";

const REACTION_EMOJIS = ["👍", "🔥", "🎉", "❤️", "😂", "👀"];
const CURSOR_TTL_MS = 2500;
const REACTION_TTL_MS = 3500;

function GuestVideoTile({ track, name }: { track?: MediaStreamTrack; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && track) {
      ref.current.srcObject = new MediaStream([track]);
      ref.current.play().catch(() => {});
    }
    return () => { if (ref.current) ref.current.srcObject = null; };
  }, [track]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-black/60 aspect-video border border-white/10">
      {track ? (
        <video ref={ref} autoPlay playsInline muted className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a14]">
          <span className="text-3xl font-black text-white/30">{name[0]?.toUpperCase()}</span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-gradient-to-t from-black/80">
        <span className="text-[11px] font-black text-white/90 uppercase tracking-wide">{name}</span>
      </div>
    </div>
  );
}

interface ChatMessage {
  text: string;
  identity?: string;
  ts: number;
}

export interface GuestMeetingRoomProps {
  connection: GuestConnectionParams;
  meetingTitle: string;
  /** Called after the guest leaves — parent decides what to show next (e.g. rejoin screen). */
  onLeave?: () => void;
}

export function GuestMeetingRoom({ connection, meetingTitle, onLeave }: GuestMeetingRoomProps) {
  const [view, setView] = useState<"video" | "canvas">("video");
  const [cursors, setCursors] = useState<Map<string, CanvasCursorEvent>>(new Map());
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [lastCanvasEvent, setLastCanvasEvent] = useState<CanvasEvent | null>(null);

  const handleCanvasEvent = useCallback((event: CanvasEvent) => setLastCanvasEvent(event), []);
  const handleCanvasCursor = useCallback((cursor: CanvasCursorEvent) => {
    setCursors((prev) => { const next = new Map(prev); next.set(cursor.identity, cursor); return next; });
  }, []);
  const handleReaction = useCallback((reaction: ReactionEvent) => {
    setReactions((prev) => [...prev.slice(-7), reaction]);
  }, []);
  const handleChatText = useCallback((text: string, identity?: string) => {
    setChat((prev) => [...prev.slice(-99), { text, identity, ts: Date.now() }]);
  }, []);

  const voice = useGuestLiveKitVoice({
    onCanvasEvent: handleCanvasEvent,
    onCanvasCursor: handleCanvasCursor,
    onReaction: handleReaction,
    onChatText: handleChatText,
  });

  useEffect(() => {
    void voice.connect(connection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cursors.size === 0 && reactions.length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, c] of next) {
          if (now - c.ts > CURSOR_TTL_MS) { next.delete(id); changed = true; }
        }
        return changed ? next : prev;
      });
      setReactions((prev) => prev.filter((r) => now - r.ts <= REACTION_TTL_MS));
    }, 500);
    return () => clearInterval(t);
  }, [cursors.size, reactions.length]);

  const handleLeave = useCallback(() => {
    voice.disconnect();
    onLeave?.();
  }, [voice, onLeave]);

  const handleSendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    voice.sendText(text);
    setChat((prev) => [...prev.slice(-99), { text, identity: connection.identity, ts: Date.now() }]);
    setChatInput("");
  }, [chatInput, voice, connection.identity]);

  const remoteEntries = Array.from(voice.videoTracks.entries());

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a14] text-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold truncate">{meetingTitle}</span>
        <span className="text-xs text-white/40">{voice.status}</span>
        <div className="flex-1" />
        <Button size="icon-sm" variant="ghost" onClick={() => setView(view === "video" ? "canvas" : "video")} title="Toggle canvas">
          <PenTool className="h-4 w-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => voice.setMuted(!voice.muted)}
          className={voice.muted ? "text-destructive" : ""}
          title={voice.muted ? "Unmute" : "Mute"}
        >
          {voice.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => void voice.toggleCamera()} title="Toggle camera">
          {voice.cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
        {voice.screenShareSupported && (
          <Button size="icon-sm" variant="ghost" onClick={() => void voice.toggleScreenShare()} title="Toggle screen share">
            {voice.screenShareEnabled ? <ScreenShare className="h-4 w-4" /> : <ScreenShareOff className="h-4 w-4" />}
          </Button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="icon-sm" variant="ghost" title="React"><SmilePlus className="h-4 w-4" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 flex gap-1.5">
            {REACTION_EMOJIS.map((emoji) => (
              <button key={emoji} onClick={() => voice.sendReaction(emoji)} className="text-lg hover:scale-125 transition-transform">
                {emoji}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="destructive" onClick={handleLeave} className="gap-1.5">
          <PhoneOff className="h-4 w-4" /> Leave
        </Button>
      </div>

      <div className="relative flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          {view === "video" ? (
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-3 p-4 overflow-y-auto content-start">
              <GuestVideoTile track={voice.localVideoTrack ?? undefined} name="You" />
              {remoteEntries.map(([identity, entry]) => (
                <GuestVideoTile key={identity} track={entry.video ?? entry.screen} name={identity.replace(/^board-user-/, "").slice(0, 12)} />
              ))}
            </div>
          ) : (
            <div className="flex-1 p-4">
              <MeetingCanvas
                sendCanvasStroke={voice.sendCanvasStroke}
                sendCanvasClear={voice.sendCanvasClear}
                remoteEvent={lastCanvasEvent}
                sendCanvasCursor={voice.sendCanvasCursor}
                cursors={Array.from(cursors.values())}
              />
            </div>
          )}

          {reactions.map((r) => (
            <div key={`${r.identity}-${r.ts}`} className="absolute bottom-20 right-6 text-2xl animate-bounce pointer-events-none">
              {r.emoji}
            </div>
          ))}
        </div>

        <div className="hidden md:flex w-72 flex-col border-l border-white/10">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 text-xs font-semibold uppercase tracking-wide text-white/50">
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {chat.map((m, i) => (
              <div key={i} className="text-xs">
                <span className="text-white/40">{m.identity ? m.identity.replace(/^board-user-/, "").slice(0, 12) : "them"}: </span>
                <span className="text-white/90">{m.text}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 border-t border-white/10">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSendChat(); }}
              placeholder="Message…"
              className="h-8 text-xs bg-black/40 border-white/10 text-white"
            />
            <Button size="icon-sm" variant="ghost" onClick={handleSendChat}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
