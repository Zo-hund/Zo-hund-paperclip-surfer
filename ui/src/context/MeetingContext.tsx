/**
 * MeetingContext
 *
 * Global context that keeps a meeting session alive across all page
 * navigations. Pages request a LiveKit session here; the
 * GlobalVoiceMeetingOverlay (mounted once in App) owns the actual room
 * connection and renders either the full VoiceMeetingRoom or the floating
 * MeetingHubCockpit when minimized.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type MeetingStatus =
  | "idle"
  | "connecting"
  | "active"
  | "minimized"
  | "ended";

interface MeetingContextValue {
  /** Active meeting room ID (null when no meeting) */
  meetingId: string | null;
  /** Human-readable session title */
  meetingTitle: string;
  /** Whether the full hub is minimized to the floating cockpit */
  isMinimized: boolean;
  /** Overall session status */
  status: MeetingStatus;

  startMeeting: (meetingId: string, title: string) => void;
  minimize: () => void;
  expand: () => void;
  endMeeting: () => void;
  setStatus: (s: MeetingStatus) => void;

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
  const [liveKitSessionId, setLiveKitSessionId] = useState<string | null>(null);
  const [liveKitAvatarEnabled, setLiveKitAvatarEnabled] = useState(false);

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
    setMeetingId(null);
    setMeetingTitle("");
    setIsMinimized(false);
    setStatus("idle");
    setLiveKitSessionId(null);
    setLiveKitAvatarEnabled(false);
  }, []);

  return (
    <MeetingContext.Provider
      value={{
        meetingId,
        meetingTitle,
        isMinimized,
        status,
        startMeeting,
        minimize,
        expand,
        endMeeting,
        setStatus,
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
