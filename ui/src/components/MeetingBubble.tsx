/**
 * MeetingBubble
 *
 * Floating persistent agent bubble that appears when a meeting is minimized.
 * - Stays alive across ALL page navigations (mounted at App level)
 * - Captures DOM context every 4 seconds and sends to the Gemini relay
 * - Agent can see what page you're on and respond with full awareness
 * - Click to expand back to full Meeting Hub
 * - Draggable — can be moved anywhere on screen
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMeeting } from "../context/MeetingContext";
import { useCompany } from "../context/CompanyContext";
import {
  Minimize2, X, Mic, MicOff, Eye, EyeOff,
  Activity, ChevronUp,
} from "lucide-react";

// ── Screen context extractor ──────────────────────────────────────────────────

function extractPageContext(): string {
  const url = window.location.href;
  const title = document.title;
  const path = window.location.pathname;

  // Key text: headings
  const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
    .slice(0, 6)
    .map(h => h.textContent?.trim())
    .filter(Boolean)
    .join(" | ");

  // Visible buttons & interactive elements
  const buttons = Array.from(document.querySelectorAll("button,a[role='button']"))
    .slice(0, 10)
    .map(b => b.textContent?.trim().slice(0, 30))
    .filter(Boolean)
    .join(", ");

  // Badge/count numbers (pipeline counts, statuses)
  const badges = Array.from(document.querySelectorAll("[data-badge],[class*='badge'],[class*='Badge']"))
    .slice(0, 8)
    .map(b => b.textContent?.trim())
    .filter(Boolean)
    .join(", ");

  // Table row counts
  const tableRows = document.querySelectorAll("tr,li[class*='item'],li[class*='row']").length;

  // Any status chips visible on screen
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

// ── Waveform animation ────────────────────────────────────────────────────────

function MiniWaveform({ active }: { active: boolean }) {
  const bars = [0.4, 0.9, 0.6, 1, 0.5, 0.8, 0.3, 0.7];
  return (
    <div className="flex items-end gap-[2px] h-4">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-all duration-150"
          style={{
            height: active ? `${h * 100}%` : "20%",
            background: active
              ? `hsl(${200 + i * 8}, 80%, 65%)`
              : "hsl(220, 15%, 35%)",
            animation: active
              ? `pulse ${0.3 + i * 0.07}s ease-in-out infinite alternate`
              : "none",
          }}
        />
      ))}
    </div>
  );
}

// ── Main bubble ───────────────────────────────────────────────────────────────

export function MeetingBubble() {
  const { meetingId, meetingTitle, isMinimized, status,
    endMeeting, expand, sendToRelay, isCockpitExpanded,
  } = useMeeting();
  const { selectedCompany } = useCompany();
  const location = useLocation();
  const navigate = useNavigate();

  const [isMuted, setIsMuted] = useState(false);
  const [screenEye, setScreenEye] = useState(true);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [currentPageLabel, setCurrentPageLabel] = useState("");
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; bx: number; by: number } | null>(null);
  const contextLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Map path to page label
  const getLabel = useCallback((path: string) => {
    const seg = path.replace(/^\/[A-Z0-9]+\//, "/");
    const map: Record<string, string> = {
      "/": "Dashboard", "/dashboard": "Dashboard",
      "/agents": "Agents", "/issues": "Issues",
      "/approvals": "Approvals", "/meetings": "Meeting Hub",
      "/projects": "Projects", "/analytics": "Analytics",
      "/inbox": "Inbox", "/inbox/mine": "Inbox",
      "/briefcase": "Briefcase", "/settings": "Settings",
      "/members": "Team", "/dispatch/chain": "Chain of Command",
      "/amx/cockpit": "Cockpit",
    };
    let label = map[seg];
    if (!label) {
      for (const [k, v] of Object.entries(map)) {
        if (k !== "/" && seg.startsWith(k)) { label = v; break; }
      }
    }
    return label ?? "Platform";
  }, []);

  // Update page label on navigation
  useEffect(() => {
    setCurrentPageLabel(getLabel(location.pathname));
  }, [location.pathname, getLabel]);

  // Screen context capture loop — every 4s when bubble is visible + eye is on
  useEffect(() => {
    if (!isMinimized || !meetingId || !screenEye) {
      if (contextLoopRef.current) clearInterval(contextLoopRef.current);
      return;
    }

    const send = () => {
      try {
        const ctx = extractPageContext();
        sendToRelay({ type: "screen_context", content: ctx });
      } catch { /* ignore */ }
    };

    send(); // immediate first send
    contextLoopRef.current = setInterval(send, 4000);
    return () => {
      if (contextLoopRef.current) clearInterval(contextLoopRef.current);
    };
  }, [isMinimized, meetingId, screenEye, sendToRelay]);

  // Drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setIsDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, bx: dragPos.x, by: dragPos.y };
    e.preventDefault();
  }, [dragPos]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      setDragPos({
        x: dragStart.current.bx + (e.clientX - dragStart.current.mx),
        y: dragStart.current.by + (e.clientY - dragStart.current.my),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  const handleExpand = () => {
    expand();
    const prefix = selectedCompany?.issuePrefix;
    if (prefix) navigate(`/${prefix}/meetings`);
    else navigate("/meetings");
  };

  if (!meetingId || isCockpitExpanded) return null;

  const isSpeakingOrListening = status === "active" || status === "minimized";

  return (
    <div
      style={{
        position: "fixed",
        bottom: `${96 + dragPos.y * -1}px`,
        right: `${24 + dragPos.x * -1}px`,
        zIndex: 9999,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
      onMouseDown={onMouseDown}
    >
      {/* Main bubble */}
      <div
        className="relative flex flex-col items-center"
        style={{ filter: "drop-shadow(0 8px 32px rgba(0,120,255,0.25))" }}
      >
        {/* Expanded mini panel */}
        {showMenu && (
          <div
            className="absolute bottom-[calc(100%+12px)] right-0 min-w-[220px] rounded-2xl overflow-hidden border border-white/10"
            style={{
              background: "linear-gradient(135deg, rgba(10,15,30,0.97) 0%, rgba(15,20,40,0.97) 100%)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400/80">
                  AGENT SESSION
                </p>
                <p className="text-[11px] font-bold text-white/70 truncate max-w-[140px] mt-0.5">
                  {meetingTitle}
                </p>
              </div>
              <button
                onClick={() => setShowMenu(false)}
                className="text-white/30 hover:text-white/60 transition-colors p-1"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Page context indicator */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${screenEye ? "bg-blue-400" : "bg-white/20"}`}
                style={screenEye ? { boxShadow: "0 0 8px rgba(96,165,250,0.8)", animation: "pulse 2s infinite" } : {}} />
              <div>
                <p className="text-[9px] uppercase tracking-widest text-white/30 font-bold">
                  {screenEye ? "AGENT SEES" : "EYE PAUSED"}
                </p>
                <p className="text-[11px] font-black text-white/80">{currentPageLabel}</p>
              </div>
            </div>

            {/* Waveform */}
            <div className="px-4 py-3 border-b border-white/5">
              <MiniWaveform active={isSpeakingOrListening} />
            </div>

            {/* Controls */}
            <div className="px-3 py-3 flex items-center gap-2">
              <button
                onClick={() => setIsMuted(m => !m)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isMuted
                    ? "bg-red-500/20 text-red-400 border border-red-500/20"
                    : "bg-white/5 text-white/50 hover:bg-white/10 border border-white/5"
                }`}
              >
                {isMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                {isMuted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={() => setScreenEye(e => !e)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  !screenEye
                    ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/20"
                    : "bg-white/5 text-white/50 hover:bg-white/10 border border-white/5"
                }`}
              >
                {screenEye ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {screenEye ? "Eye On" : "Eye Off"}
              </button>
            </div>

            <div className="px-3 pb-3 flex items-center gap-2">
              <button
                onClick={handleExpand}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/30 transition-all"
              >
                <Minimize2 className="h-3 w-3" />
                Expand Hub
              </button>
              <button
                onClick={endMeeting}
                className="flex items-center justify-center p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/10 hover:bg-red-500/20 transition-all"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* The bubble itself */}
        <button
          onClick={() => setShowMenu(m => !m)}
          className="relative h-16 w-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, rgba(10,20,50,0.95) 0%, rgba(20,30,70,0.95) 100%)",
            border: "2px solid rgba(96,165,250,0.4)",
            boxShadow: isSpeakingOrListening
              ? "0 0 0 4px rgba(96,165,250,0.15), 0 0 0 8px rgba(96,165,250,0.08), 0 8px 32px rgba(0,0,0,0.5)"
              : "0 8px 32px rgba(0,0,0,0.5)",
            animation: isSpeakingOrListening ? "bubble-pulse 2s ease-in-out infinite" : "none",
          }}
        >
          {/* Inner agent avatar */}
          <div className="absolute inset-1 rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)" }}>
            {/* Agent icon — animated brain/AI */}
            <div className="relative flex items-center justify-center w-full h-full">
              <Activity
                className="h-6 w-6 text-blue-400"
                style={{
                  filter: "drop-shadow(0 0 6px rgba(96,165,250,0.8))",
                  animation: isSpeakingOrListening ? "pulse 1s ease-in-out infinite" : "none",
                }}
              />
            </div>
          </div>

          {/* Screen-eye indicator dot */}
          {screenEye && (
            <div
              className="absolute top-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#0a1428] bg-blue-400"
              style={{ boxShadow: "0 0 6px rgba(96,165,250,0.9)", animation: "pulse 2s infinite" }}
            />
          )}
        </button>

        {/* Page label below bubble */}
        <div
          className="mt-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-blue-300/70 pointer-events-none"
          style={{ background: "rgba(10,20,50,0.8)", border: "1px solid rgba(96,165,250,0.15)" }}
        >
          {currentPageLabel}
        </div>
      </div>

      <style>{`
        @keyframes bubble-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(96,165,250,0.15), 0 0 0 8px rgba(96,165,250,0.08), 0 8px 32px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(96,165,250,0.25), 0 0 0 12px rgba(96,165,250,0.1), 0 8px 32px rgba(0,0,0,0.5); }
        }
      `}</style>
    </div>
  );
}
