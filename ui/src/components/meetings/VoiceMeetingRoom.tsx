import { useState, useEffect, useRef } from "react";
import {
  Bot, Mic, MicOff, PhoneOff, UserPlus, Send,
  CheckCircle2, AlertTriangle, Zap, Maximize, Minimize,
  Video, VideoOff, ScreenShare, ScreenShareOff, Circle,
  Activity, Cpu, Radar, Crosshair, Network, BarChart2
} from "lucide-react";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { meetingsApi } from "../../api/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "../../context/ToastContext";
import { useQuery } from "@tanstack/react-query";
import { InviteAgentsDialog } from "./InviteAgentsDialog";
import type { VideoTrackMap } from "../../hooks/useLiveKitVoice";

interface VoiceMeetingRoomProps {
  meetingId: string;
  onClose: () => void;
  cameraEnabled?: boolean;
  toggleCamera?: () => void;
  screenShareEnabled?: boolean;
  toggleScreenShare?: () => void;
  videoTracks?: VideoTrackMap;
  localVideoTrack?: MediaStreamTrack | null;
  localScreenTrack?: MediaStreamTrack | null;
  sendText?: (text: string) => void;
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

export function VoiceMeetingRoom({ meetingId, onClose, cameraEnabled, toggleCamera, screenShareEnabled, toggleScreenShare, videoTracks, localVideoTrack, localScreenTrack, sendText: sendLiveKitText }: VoiceMeetingRoomProps) {
  const { startRecording, stopRecording } = useVoiceRecorder();
  const [micActive, setMicActive] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "cockpit" | "video">("cockpit");
  const [recording, setRecording] = useState(false);
  
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { pushToast } = useToast();

  const { data: meeting, refetch: refetchMeeting } = useQuery({
    queryKey: ["meeting-detail", meetingId],
    queryFn: () => meetingsApi.getDetail(meetingId),
    refetchInterval: 2500,
  });

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [meeting?.transcripts?.length, meeting?.outcomes?.length, mode]);

  const colorMap = new Map<string, string>();
  (meeting?.participants ?? []).forEach((p, i) => {
    colorMap.set(p.agentId, SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
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

  const transcripts = meeting?.transcripts ?? [];
  const participants = meeting?.participants ?? [];
  const outcomes = meeting?.outcomes ?? [];

  const isCockpit = mode === "cockpit";
  const isVideo = mode === "video";
  const isExpanded = isCockpit || isVideo;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-700 ease-in-out ${isExpanded ? "bg-black/90 backdrop-blur-md" : "bg-black/70 backdrop-blur-sm"}`}>
      
      {/* Sci-Fi Ambient Glow */}
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
        <header className={`relative z-10 flex items-center gap-2 md:gap-4 px-4 md:px-5 py-3 border-b flex-shrink-0 backdrop-blur-md
          ${isExpanded ? "border-[#94a3b8]/20 bg-black/40" : "border-white/[0.06] bg-[#09090f]"}`}>
          <div className="flex items-center gap-1.5 flex-shrink-0">
             {isExpanded && <Radar className="h-4 w-4 text-[#94a3b8] animate-pulse drop-shadow-[0_0_8px_rgba(148,163,184,0.8)] mr-1 hidden sm:block" />}
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-[pulse_1s_infinite] shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <span className={`text-[10px] font-black uppercase tracking-widest ${isExpanded ? "text-[#94a3b8]" : "text-red-400"}`}>
               {isExpanded ? "A.I. LIVE" : "LIVE"}
            </span>
            {micActive && (
              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-wide ml-2">
                <Mic className="h-3 w-3 animate-pulse" /> On Air
              </span>
            )}
            {recording && (
              <span className="flex items-center gap-1 text-[9px] font-black text-red-400 uppercase tracking-wide animate-pulse ml-2">
                <Circle className="h-2 w-2 fill-red-500" /> REC
              </span>
            )}
          </div>
          
          <h2 className="flex-1 text-[12px] md:text-[14px] font-black uppercase tracking-widest text-white/90 truncate ml-1 md:ml-2">
            {meeting?.title ?? "Strategic Session"}
            {isExpanded && <span className="ml-3 text-[9px] md:text-[10px] text-white/30 tracking-[0.3em] hidden sm:inline">// UPLINK ACTIVE</span>}
          </h2>

          <div className="flex items-center gap-1 md:gap-2">
            <Button
               size="sm"
               variant="ghost"
               className={`h-8 px-2 md:px-3 text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] transition-all 
                 ${mode === "chat" ? "bg-[#94a3b8]/20 text-[#94a3b8] shadow-[0_0_15px_rgba(148,163,184,0.2)]" : "text-white/40 hover:text-[#94a3b8]"}`}
               onClick={() => setMode("chat")}
            >
               <Minimize className="h-3 w-3 sm:mr-1.5" /> <span className="hidden sm:inline">Chat</span>
            </Button>
            <Button
               size="sm"
               variant="ghost"
               className={`h-8 px-2 md:px-3 text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] transition-all
                 ${mode === "cockpit" ? "bg-[#94a3b8]/20 text-[#94a3b8] shadow-[0_0_15px_rgba(148,163,184,0.2)]" : "text-white/40 hover:text-[#94a3b8]"}`}
               onClick={() => setMode("cockpit")}
            >
               <Maximize className="h-3 w-3 sm:mr-1.5" /> <span className="hidden sm:inline">Cockpit</span>
            </Button>
            <Button
               size="sm"
               variant="ghost"
               className={`h-8 px-2 md:px-3 text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] transition-all
                 ${mode === "video" ? "bg-[#94a3b8]/20 text-[#94a3b8] shadow-[0_0_15px_rgba(148,163,184,0.2)]" : "text-white/40 hover:text-[#94a3b8]"}`}
               onClick={() => setMode("video")}
            >
               <Video className="h-3 w-3 sm:mr-1.5" /> <span className="hidden sm:inline">Vid Pod</span>
            </Button>
          </div>

          <div className="w-[1px] h-6 bg-white/10 mx-1 hidden sm:block" />

          {/* Media controls — labeled for mobile */}
          {toggleCamera && (
            <Button size="sm" variant="ghost"
              onClick={() => { toggleCamera(); if (!cameraEnabled) setMode("video"); }}
              className={`h-8 px-2 rounded-lg gap-1 text-[9px] font-black uppercase tracking-wide ${cameraEnabled ? "bg-[#94a3b8]/20 text-[#94a3b8]" : "text-white/30 hover:text-white/60"}`}>
              {cameraEnabled ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
              <span>Cam</span>
            </Button>
          )}
          {toggleScreenShare && (
            <Button size="sm" variant="ghost"
              onClick={() => { toggleScreenShare(); if (!screenShareEnabled) setMode("video"); }}
              className={`h-8 px-2 rounded-lg gap-1 text-[9px] font-black uppercase tracking-wide ${screenShareEnabled ? "bg-blue-500/20 text-blue-400" : "text-white/30 hover:text-white/60"}`}>
              {screenShareEnabled ? <ScreenShare className="h-3.5 w-3.5" /> : <ScreenShareOff className="h-3.5 w-3.5" />}
              <span>Share</span>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setRecording((r) => !r)}
            className={`h-8 px-2 rounded-lg gap-1 text-[9px] font-black uppercase tracking-wide ${recording ? "bg-red-500/20 text-red-400" : "text-white/30 hover:text-white/60"}`}>
            <Circle className={`h-3.5 w-3.5 ${recording ? "fill-red-500" : ""}`} />
            <span>{recording ? "Stop" : "Rec"}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-3 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]/50 hover:text-[#94a3b8] hover:bg-[#94a3b8]/10 gap-1.5 flex-shrink-0 hidden sm:flex"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Entity
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg flex-shrink-0 bg-red-950/40 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white transition-all shadow-[0_0_10px_rgba(239,68,68,0.2)] hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] ml-1"
            onClick={handleEndCall}
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </header>

        {/* ── Main Layout Body ───────────────────────────────── */}
        <div className={`relative z-10 flex-1 flex overflow-hidden ${isExpanded ? "flex-col md:flex-row gap-4 p-4" : "flex-col"}`}>
          
          {/* LEFT PANE in Cockpit, GRID in Video, STRIP in Chat */}
          {isCockpit ? (
            <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-4">
              {/* Intel HUD */}
              <div className="p-4 rounded-xl border border-[#94a3b8]/20 bg-black/40 backdrop-blur-md relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-br from-[#94a3b8]/5 to-transparent pointer-events-none" />
                 <h3 className="text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 mb-4 text-[#94a3b8]/70 text-shadow-glow">
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

              {/* Participants Vertical */}
              <div className="flex-1 p-3 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                 <h3 className="text-[10px] grid place-items-center mb-3 font-black uppercase tracking-[0.3em] text-white/40">
                    <span className="flex items-center gap-2"><Network className="h-3 w-3" /> Linked Entities</span>
                 </h3>
                 <div className="space-y-2">
                    {participants.map((p) => {
                       const color = colorMap.get(p.agentId) ?? "#94a3b8";
                       const isSpeaking = lastSpeakerId === p.agentId || p.status === "thinking" || p.status === "responding";
                       return (
                          <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border border-white/5 bg-white/[0.02]">
                             <div
                                className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-black relative"
                                style={{
                                  background: `${color}15`, border: `1.5px solid ${isSpeaking ? color : `${color}28`}`,
                                  boxShadow: isSpeaking ? `0 0 10px ${color}55` : "none",
                                }}
                             >
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
            <div className="flex-1 rounded-xl p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              {/* Local participant tile */}
              <VideoTile track={localVideoTrack ?? undefined} name="You" status={micActive ? "speaking" : "muted"} />

              {/* Remote participants — use real video tracks when available */}
              {participants.map((p) => {
                const remoteTracks = videoTracks?.get(p.name);
                return (
                  <VideoTile
                    key={p.id}
                    track={remoteTracks?.video}
                    name={p.name}
                    status={p.status}
                  />
                );
              })}

              {/* Screen share tile — prominent, col-span-full */}
              {videoTracks && Array.from(videoTracks.entries()).map(([identity, tracks]) =>
                tracks.screen ? (
                  <div key={`screen-${identity}`} className="col-span-full relative rounded-xl overflow-hidden border border-blue-500/40 aspect-video">
                    <VideoTile track={tracks.screen} name={identity === "local" ? "Your Screen" : `${identity} — Screen`} />
                    <span className="absolute top-2 left-2 text-[10px] font-black uppercase tracking-wide bg-blue-500/80 text-white px-2 py-0.5 rounded">Screen Share</span>
                  </div>
                ) : null
              )}
            </div>
          ) : (
            participants.length > 0 && (
              <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.04] bg-[#0a0a15] overflow-x-auto flex-shrink-0 scrollbar-hide">
                {participants.map((p) => {
                  const color = colorMap.get(p.agentId) ?? "#94a3b8";
                  const isSpeaking = lastSpeakerId === p.agentId || p.status === "thinking" || p.status === "responding";
                  return (
                    <div key={p.id} className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-black relative select-none"
                        style={{
                          background: `${color}15`, border: `2px solid ${isSpeaking ? color : `${color}28`}`,
                          boxShadow: isSpeaking ? `0 0 14px ${color}55, 0 0 4px ${color}80` : "none",
                          transition: "box-shadow 0.4s ease, border-color 0.4s ease",
                        }}
                      >
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

          {/* CENTER PANE: The Main Thread (or Docked Right Pane in Video Mode) */}
          <div className={`flex flex-col min-w-0 bg-black/20 backdrop-blur-sm rounded-xl border border-white/5 relative overflow-hidden transition-all duration-500 ease-out 
            ${isVideo ? "w-full md:w-80 flex-shrink-0" : "flex-1"}`}>
             
             {isExpanded && (
                <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: `linear-gradient(rgba(0, 243, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 243, 255, 0.1) 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
             )}

            <div
              ref={threadRef}
              className={`flex-1 overflow-y-auto space-y-0.5 scroll-smooth relative z-10 ${isExpanded ? "px-6 py-6" : "px-4 py-4"}`}
              style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(148,163,184,0.15) transparent" }}
            >
              {transcripts.length === 0 && outcomes.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <div className="text-4xl mb-5 text-[#94a3b8]/40"><Crosshair className="h-16 w-16" /></div>
                  <p className="text-[11px] text-white/40 font-black uppercase tracking-[0.3em]">Link Established</p>
                  <p className="text-[10px] text-[#94a3b8]/40 mt-3 tracking-widest uppercase">INITIALIZE PROTOCOL: /decide · /task · /risk</p>
                </div>
              )}

              {transcripts.map((t, i) => {
                const isUser = t.actorType === "user";
                const participant = participants.find(p => p.agentId === t.actorId);
                const color = participant ? (colorMap.get(participant.agentId) ?? "#94a3b8") : "#e2e8f0";
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
                      <div className={`px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words backdrop-blur-md shadow-sm border border-white/5`}
                        style={
                          isCommand ? { background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.3)", color: "#94a3b8", fontFamily: "monospace", boxShadow: "0 0 15px rgba(148,163,184,0.1) inset" }
                          : isMention ? { background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "rgba(255,255,255,0.95)" }
                          : isUser ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.95)" }
                          : { background: `${color}12`, border: `1px solid ${color}30`, color: "rgba(255,255,255,0.95)" }
                        }
                      >
                        {t.text}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Chat & Video modes render outcomes interleaved */}
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

            {/* Input Strip contained in Center Pane in Expanded Modes */}
            <div className={`relative z-10 px-4 py-3 flex-shrink-0 ${isExpanded ? "bg-black/40 border-t border-[#94a3b8]/20 rounded-b-xl" : "bg-[#09090f] border-t border-white/[0.06]"}`}>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl flex-shrink-0 transition-all shadow-md"
                  style={micActive ? { background: "rgba(239,68,68,0.2)", color: "#f87171", boxShadow: "0 0 15px rgba(239,68,68,0.3)" } : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }} onClick={toggleMic}>
                  {micActive ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
                </Button>

                <Input ref={inputRef} placeholder="Transmit protocol or message…"
                  className="flex-1 h-10 text-[13px] rounded-xl text-white placeholder:text-[#94a3b8]/30 focus-visible:ring-1 focus-visible:ring-[#94a3b8] transition-all"
                  style={{ background: isExpanded ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.04)", border: isExpanded ? "1px solid rgba(148,163,184,0.3)" : "1px solid rgba(255,255,255,0.08)", boxShadow: isExpanded ? "inset 0 0 10px rgba(148,163,184,0.05)" : undefined }}
                  value={commandText} onChange={(e) => setCommandText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} />

                <Button size="icon" className="h-10 w-10 rounded-xl flex-shrink-0 transition-all shadow-lg"
                  style={{ background: commandText.trim() ? "#94a3b8" : "rgba(148,163,184,0.1)", color: commandText.trim() ? "#050510" : "rgba(148,163,184,0.4)", boxShadow: commandText.trim() ? "0 0 15px rgba(148,163,184,0.4)" : undefined }} onClick={handleSend} disabled={!commandText.trim()}>
                  <Send className="h-4.5 w-4.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* RIGHT PANE: Strategic Outcomes & Telemetry (Cockpit Only) */}
          {isCockpit && (
            <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
              <div className="flex-1 rounded-xl border border-[#94a3b8]/20 bg-black/40 backdrop-blur-md overflow-hidden flex flex-col relative group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#94a3b8]/5 rounded-bl-[100px] pointer-events-none" />
                <div className="px-4 py-3 border-b border-[#94a3b8]/10 flex items-center justify-between">
                   <h3 className="text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 text-[#94a3b8]/70 text-shadow-glow">
                      <BarChart2 className="h-3.5 w-3.5" /> Telemetry Feed
                   </h3>
                   <span className="text-[8px] uppercase font-black px-1.5 py-0.5 bg-[#94a3b8]/10 text-[#94a3b8] rounded">Syncing</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: "none" }}>
                  {outcomes.length === 0 ? (
                     <div className="h-full flex items-center justify-center text-center">
                        <p className="text-[9px] text-[#94a3b8]/30 uppercase tracking-[0.2em] border border-dashed border-[#94a3b8]/10 p-4 rounded-xl">No telemetry detected.<br/>Issuing commands will<br/>populate intelligence vectors.</p>
                     </div>
                  ) : outcomes.map((o) => (
                    <div key={o.id} className="relative p-3 rounded-xl border bg-black/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all group-hover:translate-x-0"
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
