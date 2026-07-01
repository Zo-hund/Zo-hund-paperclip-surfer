/**
 * MeetingContext
 *
 * Global context that keeps a meeting session alive across all page
 * navigations. The VoiceMeetingRoom registers its WebSocket reference
 * here so the MeetingBubble can send screen_context messages over the
 * same Gemini Live session even when the user has left the meetings page.
 */
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
  type MutableRefObject,
} from "react";

export type MeetingStatus =
  | "idle"
  | "connecting"
  | "active"
  | "minimized"
  | "ended";

export type GeminiStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "unavailable";

interface MeetingContextValue {
  /** Active meeting room ID (null when no meeting) */
  meetingId: string | null;
  /** Human-readable session title */
  meetingTitle: string;
  /** Whether the full hub is minimized to a bubble */
  isMinimized: boolean;
  /** Overall session status */
  status: MeetingStatus;
  /**
   * Shared WebSocket reference — VoiceMeetingRoom writes this when it
   * connects so MeetingBubble can send messages over the same session.
   */
  wsRef: MutableRefObject<WebSocket | null>;

  startMeeting: (meetingId: string, title: string) => void;
  minimize: () => void;
  expand: () => void;
  endMeeting: () => void;
  setStatus: (s: MeetingStatus) => void;
  /** Send a raw message over the shared WS (if open) */
  sendToRelay: (payload: object) => void;
  isCockpitExpanded: boolean;
  setCockpitExpanded: (expanded: boolean) => void;
  isMicMuted: boolean;
  setMicMuted: (muted: boolean) => void;
  isSpeaking: boolean;
  setIsSpeaking: (speaking: boolean) => void;
  audioLevel: number;
  setAudioLevel: (lvl: number) => void;
  transcript: any[];
  setTranscript: (t: any[]) => void;
  commandLog: any[];
  setCommandLog: (log: any[]) => void;
  screenEye: boolean;
  setScreenEye: (eye: boolean) => void;
  geminiStatus: GeminiStatus;
  setGeminiStatus: (status: GeminiStatus) => void;
  geminiError: string | null;
  setGeminiError: (error: string | null) => void;
  reconnectCount: number;
  triggerReconnect: () => void;

  // ── LiveKit global session ───────────────────────────────────────────────
  /** LiveKit room name the global overlay should connect to (null = no session) */
  liveKitSessionId: string | null;
  /** Whether the Runway visual avatar is requested for this session */
  liveKitAvatarEnabled: boolean;
  /** Request the GlobalVoiceMeetingOverlay to start a LiveKit session */
  requestLiveKit: (sessionId: string, avatarEnabled?: boolean) => void;
  /** Release the LiveKit session (overlay disconnects and hides) */
  releaseLiveKit: () => void;
}

const MeetingContext = createContext<MeetingContextValue | null>(null);

export function MeetingProvider({ children }: { children: ReactNode }) {
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [status, setStatus] = useState<MeetingStatus>("idle");
  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus>("idle");
  const [isCockpitExpanded, setCockpitExpanded] = useState(false); // Collapsed by default for a clean workspace, user can expand
  const [isMicMuted, setMicMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [commandLog, setCommandLog] = useState<any[]>([]);
  const [screenEye, setScreenEye] = useState(true);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [liveKitSessionId, setLiveKitSessionId] = useState<string | null>(null);
  const [liveKitAvatarEnabled, setLiveKitAvatarEnabled] = useState(false);

  // Shared WS ref — VoiceMeetingRoom writes it, MeetingBubble reads it
  const wsRef = useRef<WebSocket | null>(null);

  const triggerReconnect = useCallback(() => {
    setReconnectCount((c) => c + 1);
  }, []);

  const requestLiveKit = useCallback((id: string, avatar = false) => {
    setLiveKitSessionId(id);
    setLiveKitAvatarEnabled(avatar);
  }, []);

  const releaseLiveKit = useCallback(() => {
    setLiveKitSessionId(null);
    setLiveKitAvatarEnabled(false);
  }, []);

  const startMeeting = useCallback((id: string, title: string) => {
    setMeetingId(id);
    setMeetingTitle(title);
    setIsMinimized(false);
    setStatus("connecting");
    setGeminiStatus("connecting");
    setMicMuted(false);
    setIsSpeaking(false);
    setAudioLevel(0);
    setTranscript([]);
    setCommandLog([]);
    setScreenEye(true);
    setGeminiError(null);
    setCockpitExpanded(true); // Open cockpit automatically when meeting is started
  }, []);

  const minimize = useCallback(() => {
    setIsMinimized(true);
    setStatus("minimized");
  }, []);

  const expand = useCallback(() => {
    setIsMinimized(false);
    setStatus("active");
  }, []);

  const endMeeting = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* */ }
      wsRef.current = null;
    }
    setMeetingId(null);
    setMeetingTitle("");
    setIsMinimized(false);
    setStatus("idle");
    setMicMuted(false);
    setIsSpeaking(false);
    setAudioLevel(0);
    setTranscript([]);
    setCommandLog([]);
    setGeminiError(null);
    setLiveKitSessionId(null);
    setLiveKitAvatarEnabled(false);
  }, []);

  const sendToRelay = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return (
    <MeetingContext.Provider
      value={{
        meetingId,
        meetingTitle,
        isMinimized,
        status,
        wsRef,
        startMeeting,
        minimize,
        expand,
        endMeeting,
        setStatus,
        sendToRelay,
        isCockpitExpanded,
        setCockpitExpanded,
        isMicMuted,
        setMicMuted,
        isSpeaking,
        setIsSpeaking,
        audioLevel,
        setAudioLevel,
        transcript,
        setTranscript,
        commandLog,
        setCommandLog,
        screenEye,
        setScreenEye,
        geminiStatus,
        setGeminiStatus,
        geminiError,
        setGeminiError,
        reconnectCount,
        triggerReconnect,
        liveKitSessionId,
        liveKitAvatarEnabled,
        requestLiveKit,
        releaseLiveKit,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
}

export function useMeeting() {
  const ctx = useContext(MeetingContext);
  if (!ctx) throw new Error("useMeeting must be used within MeetingProvider");
  return ctx;
}
