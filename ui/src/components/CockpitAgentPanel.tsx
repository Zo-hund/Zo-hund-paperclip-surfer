import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Mic, MicOff, Send, Radio, Terminal,
  Activity, ChevronRight, ChevronLeft, Volume2,
  Cpu, Shield, Zap, Settings, AlertTriangle,
  CheckCircle2, Play, Eye, EyeOff, RadioTower, Sparkles,
  Layers, BarChart2
} from "lucide-react";
import { useMeeting } from "../context/MeetingContext";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { agentsApi } from "../api/agents";
import { meetingsApi } from "../api/meetings";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const SPEAKER_COLORS = [
  "#60a5fa", "#34d399", "#a78bfa", "#fbbf24",
  "#f87171", "#2dd4bf", "#f472b6", "#c084fc"
];

function extractPageContext(): string {
  const url = window.location.href;
  const title = document.title;
  const path = window.location.pathname;

  const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
    .slice(0, 6)
    .map(h => h.textContent?.trim())
    .filter(Boolean)
    .join(" | ");

  const buttons = Array.from(document.querySelectorAll("button,a[role='button']"))
    .slice(0, 10)
    .map(b => b.textContent?.trim().slice(0, 30))
    .filter(Boolean)
    .join(", ");

  const badges = Array.from(document.querySelectorAll("[data-badge],[class*='badge'],[class*='Badge']"))
    .slice(0, 8)
    .map(b => b.textContent?.trim())
    .filter(Boolean)
    .join(", ");

  const tableRows = document.querySelectorAll("tr,li[class*='item'],li[class*='row']").length;

  const statusChips = Array.from(
    document.querySelectorAll("[class*='status'],[class*='Status'],[class*='chip'],[class*='tag']")
  )
    .slice(0, 8)
    .map(el => el.textContent?.trim().slice(0, 20))
    .filter(Boolean)
    .join(", ");

  return JSON.stringify({
    url, path, title,
    headings: headings || "(none)",
    buttons: buttons || "(none)",
    badges: badges || "(none)",
    tableRowCount: tableRows,
    statusChips: statusChips || "(none)",
  });
}

export function CockpitAgentPanel() {
  const {
    meetingId,
    meetingTitle,
    isMinimized,
    status,
    geminiStatus,
    startMeeting,
    endMeeting,
    sendToRelay,
    isCockpitExpanded,
    setCockpitExpanded,
    isMicMuted,
    setMicMuted,
    isSpeaking,
    audioLevel,
    transcript,
    commandLog,
    screenEye,
    setScreenEye,
    geminiError,
    triggerReconnect,
  } = useMeeting();

  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [inputText, setInputText] = useState("");
  const [visionMode, setVisionMode] = useState(true);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Fetch agents to display in the cockpit
  const { data: agents } = useQuery({
    queryKey: ["agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Fetch active company meetings to see if we can rejoin
  const { data: meetings } = useQuery({
    queryKey: ["meetings", selectedCompanyId],
    queryFn: () => meetingsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const startNewSession = useMutation({
    mutationFn: (title: string) =>
      meetingsApi.start({
        companyId: selectedCompanyId!,
        title,
        type: "board_meet",
      }),
    onSuccess: (meeting) => {
      startMeeting(meeting.id, meeting.title ?? "Strategic Session");
      queryClient.invalidateQueries({ queryKey: ["meetings", selectedCompanyId] });
      pushToast({ title: "Cockpit Activated", body: "AI Operations channel online.", tone: "success" });
    },
  });

  // Auto-connect/rejoin if an active meeting already exists and we are not in one
  useEffect(() => {
    if (!selectedCompanyId || meetingId || !meetings) return;
    const active = meetings.find((m) => m.status === "active");
    if (active) {
      console.log("[Cockpit] Auto-rejoining active session:", active.id);
      startMeeting(active.id, active.title);
    }
  }, [meetings, selectedCompanyId, meetingId, startMeeting]);

  // Auto-scroll transcript thread to bottom
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Handle typing text command to Gemini
  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");

    if (meetingId && geminiStatus !== "idle") {
      // Send text to Gemini Live session
      sendToRelay({ type: "text", text });
      
      // Manually add to transcript locally for instant UI feedback
      meetingsApi.addTranscript(meetingId, {
        actorType: "user",
        actorId: "Board Member",
        text,
        timestampOffset: 0,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
      }).catch(() => {});
    } else {
      pushToast({ title: "No Active Channel", body: "Please click Engage Cockpit to start.", tone: "warn" });
    }
  };

  const toggleMic = () => {
    setMicMuted(!isMicMuted);
    pushToast({
      title: !isMicMuted ? "Microphone Muted" : "Microphone Active",
      body: !isMicMuted ? "AI will not hear you." : "AI listening.",
      tone: !isMicMuted ? "warn" : "success"
    });
  };

  // Quick Command Triggers (sends text prompts to Gemini Live)
  const triggerQuickAction = (actionText: string, label: string) => {
    if (!meetingId) {
      pushToast({ title: "Cockpit Offline", body: "Activate Cockpit to trigger commands.", tone: "warn" });
      return;
    }
    pushToast({ title: "Triggering Action", body: label, tone: "info" });
    sendToRelay({ type: "text", text: actionText });
  };

  // Screen context capture loop — every 4s when cockpit is active + screenEye is on
  useEffect(() => {
    if (!meetingId || !screenEye) return;

    const send = () => {
      try {
        const ctx = extractPageContext();
        sendToRelay({ type: "screen_context", content: ctx });
      } catch (err) {
        console.warn("[Cockpit] Screen capture failed:", err);
      }
    };

    send(); // immediate first send
    const timer = setInterval(send, 4000);
    return () => clearInterval(timer);
  }, [meetingId, screenEye, sendToRelay]);

  if (!selectedCompanyId) return null;

  return (
    <div className="flex h-full shrink-0 relative z-30">
      {/* Collapse/Expand Toggle Tab */}
      <button
        type="button"
        onClick={() => setCockpitExpanded(!isCockpitExpanded)}
        className={cn(
          "absolute top-24 -left-6 h-12 w-6 rounded-l-md border border-r-0 border-border bg-card text-muted-foreground hover:text-foreground flex items-center justify-center transition-all shadow-[0_4px_12px_rgba(0,0,0,0.15)]",
          isSpeaking && "border-blue-500/40 text-blue-400"
        )}
      >
        {isCockpitExpanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Expanded Cockpit Panel */}
      <div
        className={cn(
          "h-full border-l border-border bg-card/95 backdrop-blur-xl flex flex-col overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isCockpitExpanded ? "w-96 opacity-100" : "w-0 opacity-0 pointer-events-none"
        )}
      >
        <div className="w-96 flex-1 flex flex-col min-w-[384px] text-foreground">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-black/10">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "p-1.5 rounded-lg border border-primary/20 bg-primary/5",
                meetingId && "border-blue-500/30 bg-blue-500/5"
              )}>
                <Shield className={cn("h-4 w-4 text-primary", meetingId && "text-blue-400 animate-pulse")} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground block">
                  AI Operations Cockpit
                </span>
                <span className="text-xs font-bold truncate max-w-[200px] block">
                  {meetingId ? meetingTitle : "System Standby"}
                </span>
              </div>
            </div>
            {meetingId ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] font-black uppercase tracking-wider text-red-400 hover:text-white hover:bg-red-500/20 border border-red-500/20 rounded-lg px-2.5"
                onClick={() => endMeeting()}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 text-[10px] font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 shadow-lg shadow-blue-500/20"
                onClick={() =>
                  startNewSession.mutate(
                    `Strategic Cockpit Session - ${new Date().toLocaleDateString()}`
                  )
                }
                disabled={startNewSession.isPending}
              >
                <RadioTower className="h-3 w-3 mr-1 animate-pulse" />
                Engage
              </Button>
            )}
          </div>

          {/* Connection Status & Live Info */}
          {meetingId && (
            <div className="flex flex-col border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2.5 px-5 py-2 bg-black/20 text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  geminiStatus === "speaking" ? "bg-blue-400 animate-pulse shadow-[0_0_8px_#60a5fa]" :
                  geminiStatus === "thinking" ? "bg-amber-400 animate-bounce" :
                  geminiStatus === "listening" ? "bg-emerald-400" :
                  geminiStatus === "error" ? "bg-red-400 animate-pulse shadow-[0_0_8px_#f87171]" : "bg-zinc-600"
                )} />
                <span>AI {geminiStatus}</span>
                <div className="w-px h-3.5 bg-border/80 ml-1" />
                <span className="text-[9px] lowercase text-white/40 truncate flex-1 text-right">
                  {selectedCompany?.name}
                </span>
              </div>
              {geminiError && (
                <div className="flex items-start gap-2 px-5 py-2.5 bg-red-950/20 border-t border-red-500/20 text-[11px] text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5 animate-pulse" />
                  <div className="flex-1">
                    <p className="font-bold uppercase tracking-wider text-[10px] text-red-400">Voice Link Error</p>
                    <p className="text-white/60 leading-normal text-[10px]">{geminiError}</p>
                    <button
                      type="button"
                      onClick={() => triggerReconnect()}
                      className="mt-1 font-bold text-red-400 hover:text-red-300 underline text-[10px] uppercase tracking-wider block"
                    >
                      Retry Connection
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Visual Agent Grid (Avatars) */}
          <div className="px-5 py-4 border-b border-border/80 bg-black/5 shrink-0">
            <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/80 mb-3 flex items-center gap-2">
              <Layers className="h-3 w-3" /> Hired Agents & Nodes
            </h4>
            <div className="grid grid-cols-5 gap-2.5">
              {agents && agents.length > 0 ? (
                agents.slice(0, 5).map((a, i) => {
                  const color = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
                  const isAgentSpeaking = isSpeaking && geminiStatus === "speaking" && i === 0; // Simulate speaker
                  return (
                    <Tooltip key={a.id}>
                      <TooltipTrigger asChild>
                        <div className="flex flex-col items-center gap-1 cursor-default group">
                          <div
                            className={cn(
                              "h-11 w-11 rounded-full flex items-center justify-center text-lg font-black relative border-2 transition-all duration-300",
                              a.status === "running" ? "border-emerald-500/40 bg-emerald-500/5" :
                              a.status === "paused" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/20"
                            )}
                            style={isAgentSpeaking ? { borderColor: color, boxShadow: `0 0 12px ${color}` } : {}}
                          >
                            {a.icon ? (
                              <span>{a.icon}</span>
                            ) : (
                              <Bot className="h-5 w-5 text-muted-foreground" style={isAgentSpeaking ? { color } : {}} />
                            )}
                            <span
                              className={cn(
                                "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-card",
                                a.status === "running" ? "bg-emerald-400" :
                                a.status === "paused" ? "bg-amber-400" : "bg-zinc-500"
                              )}
                            />
                          </div>
                          <span className="text-[8px] font-black uppercase text-muted-foreground truncate w-full text-center">
                            {a.name.split(" ")[0]}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs font-bold">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground">{a.role} ({a.status})</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              ) : (
                <div className="col-span-5 text-center py-2 text-[9px] uppercase tracking-widest text-muted-foreground">
                  No agents hired
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions Panel */}
          {meetingId && (
            <div className="px-5 py-3 border-b border-border/80 bg-black/10 shrink-0">
              <h4 className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/80 mb-2 flex items-center gap-2">
                <Zap className="h-3 w-3 text-amber-400" /> Cockpit Actions
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="h-8 text-[9px] font-bold uppercase tracking-widest border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-xl"
                  onClick={() => triggerQuickAction("Please review and approve all pending requests now.", "Approve Pending Requests")}
                >
                  Approve All
                </Button>
                <Button
                  variant="outline"
                  className="h-8 text-[9px] font-bold uppercase tracking-widest border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 rounded-xl"
                  onClick={() => triggerQuickAction("Please pause all active agent swarms immediately.", "Pause Hired Swarms")}
                >
                  Pause Swarms
                </Button>
                <Button
                  variant="outline"
                  className="h-8 text-[9px] font-bold uppercase tracking-widest border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 rounded-xl"
                  onClick={() => triggerQuickAction("Sync active system telemetry and state overview.", "Sync Telemetry Overview")}
                >
                  Sync Intel
                </Button>
              </div>
            </div>
          )}

          {/* scrolling feed (Transcript & Executing Tool calls) */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0 bg-black/5" style={{ scrollbarWidth: "thin" }}>
            {transcript.length === 0 && commandLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground/40 gap-3">
                <RadioTower className="h-10 w-10 animate-pulse" />
                <p className="text-[9px] uppercase tracking-[0.25em] font-black leading-relaxed">
                  Channel established.<br />Speak or type commands to start.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Scrolling transcripts */}
                {transcript.map((t, idx) => {
                  const isUser = t.role === "user";
                  return (
                    <div key={idx} className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/75 px-1">
                        {isUser ? "Director" : "AI Agent"}
                      </span>
                      <div
                        className={cn(
                          "px-3.5 py-2 rounded-2xl text-[12px] leading-relaxed break-words border",
                          isUser
                            ? "bg-primary/10 border-primary/20 text-foreground"
                            : "bg-blue-500/10 border-blue-500/25 text-white/90"
                        )}
                        style={isUser ? {} : { boxShadow: "0 0 15px rgba(59,130,246,0.05)" }}
                      >
                        {t.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          {/* Executing Terminal command log */}
          {meetingId && commandLog.length > 0 && (
            <div className="border-t border-border bg-black/45 px-5 py-2.5 shrink-0 max-h-32 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Terminal className="h-3 w-3 text-blue-400" />
                <span className="text-[8px] font-black uppercase tracking-widest text-blue-400/80">
                  Executing protocol
                </span>
              </div>
              <div className="space-y-1">
                {commandLog.slice(0, 3).map((cmd, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px] font-mono text-emerald-400/90 leading-tight">
                    <span className="shrink-0 text-emerald-500/60">&gt;</span>
                    <div className="min-w-0">
                      <span className="font-bold truncate block">{cmd.command}</span>
                      <span className="text-[9px] text-white/30 truncate block">{cmd.result}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input strip */}
          <div className="px-5 py-4 border-t border-border bg-card shrink-0">
            {meetingId ? (
              <div className="flex items-center gap-2">
                {/* Voice waveform animation & Mic mute button */}
                <button
                  type="button"
                  onClick={toggleMic}
                  className={cn(
                    "h-10 w-10 rounded-xl flex-shrink-0 flex items-center justify-center border shadow-inner transition-all",
                    isMicMuted
                      ? "bg-red-500/10 border-red-500/20 text-red-400"
                      : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.25)]"
                  )}
                >
                  {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 animate-pulse" />}
                </button>

                <div className="flex-1 relative flex items-center min-w-0">
                  <Input
                    placeholder={isMicMuted ? "Mic muted. Type commands..." : "Ask Gemini anything..."}
                    className="pr-10 h-10 text-[12px] bg-black/20 border-border rounded-xl text-white placeholder:text-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-blue-500"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    className={cn(
                      "absolute right-2 text-muted-foreground hover:text-white transition-colors p-1.5 rounded-lg",
                      inputText.trim() && "text-blue-400 hover:text-blue-300"
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-1">
                <Button
                  className="w-full h-10 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] bg-blue-600 hover:bg-blue-500 text-white gap-2 shadow-xl shadow-blue-500/20"
                  onClick={() =>
                    startNewSession.mutate(
                      `Strategic Cockpit Session - ${new Date().toLocaleDateString()}`
                    )
                  }
                  disabled={startNewSession.isPending}
                >
                  <RadioTower className="h-4 w-4 animate-pulse" />
                  Activate Strategic Cockpit
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
