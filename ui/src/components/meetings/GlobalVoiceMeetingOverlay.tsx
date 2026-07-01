/**
 * GlobalVoiceMeetingOverlay
 *
 * Renders the VoiceMeetingRoom as a persistent overlay that survives page
 * navigation. Listens to MeetingContext.liveKitSessionId — when non-null it
 * connects to LiveKit and shows the room. When minimized it collapses to a
 * floating bubble in the bottom-right corner.
 *
 * Mounted once in App.tsx next to <OnboardingWizard /> so it is always present
 * regardless of which route is active.
 */
import { useEffect, useCallback } from "react";
import { PhoneOff, Maximize2, Radio } from "lucide-react";
import type { AgentState } from "@livekit/components-react";
import { useMeeting } from "../../context/MeetingContext";
import { useCompany } from "../../context/CompanyContext";
import { useDialog } from "../../context/DialogContext";
import { useLiveKitVoice, type LiveKitVoiceStatus } from "../../hooks/useLiveKitVoice";
import { AgentAudioVisualizerAura } from "../agent-audio-visualizer-aura";
import { VoiceMeetingRoom } from "./VoiceMeetingRoom";

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

function MeetingBubble({
  status,
  onExpand,
  onEnd,
}: {
  status: LiveKitVoiceStatus;
  onExpand: () => void;
  onEnd: () => void;
}) {
  const label =
    status === "speaking" ? "JAZ Speaking" :
    status === "listening" ? "Listening" :
    status === "thinking" ? "Thinking" :
    status === "connecting" ? "Connecting…" :
    "On Air";

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-3 py-2 rounded-full
                    bg-black/80 backdrop-blur-xl border border-primary/30 shadow-2xl
                    animate-in slide-in-from-bottom-4 duration-300">
      <AgentAudioVisualizerAura
        size="icon"
        state={toAgentState(status)}
        color="#1FD5F9"
        themeMode="dark"
        className="flex-shrink-0"
      />
      <Radio className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
      <span className="text-xs font-bold uppercase tracking-widest text-primary/80 whitespace-nowrap">
        {label}
      </span>
      <button
        onClick={onExpand}
        className="ml-2 p-1 rounded-lg text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors"
        title="Expand meeting room"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <button
        onClick={onEnd}
        className="p-1 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        title="End call"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

export function GlobalVoiceMeetingOverlay() {
  const {
    liveKitSessionId,
    liveKitAvatarEnabled,
    releaseLiveKit,
    isMinimized,
    minimize,
    expand,
  } = useMeeting();

  const { selectedCompanyId, selectedCompany, companies } = useCompany();
  const { openNewIssue, openNewAgent, openNewProject } = useDialog();

  const liveKit = useLiveKitVoice({
    roomName: liveKitSessionId ?? "amx-command-room",
    identity: "board-user",
    companyId: selectedCompanyId ?? undefined,
    companyPrefix: selectedCompany?.issuePrefix ?? undefined,
    companiesPrefixes: companies.map((c) => c.issuePrefix.toUpperCase()),
    avatarEnabled: liveKitAvatarEnabled,
    onToolCall: (name, args) => {
      if (name !== "open_modal") return;
      const modal = args.modal;
      if (modal === "new_issue") {
        openNewIssue({
          title: typeof args.title === "string" && args.title ? args.title : undefined,
          description: typeof args.description === "string" && args.description ? args.description : undefined,
          priority: typeof args.priority === "string" && args.priority ? args.priority : undefined,
        });
      } else if (modal === "new_agent") {
        openNewAgent();
      } else if (modal === "new_project") {
        openNewProject();
      }
    },
  });

  // Connect when a session is requested, disconnect when released
  useEffect(() => {
    if (liveKitSessionId && !liveKit.isConnected) {
      void liveKit.connect(liveKitSessionId);
    }
    if (!liveKitSessionId && liveKit.isConnected) {
      liveKit.disconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKitSessionId]);

  const handleEnd = useCallback(() => {
    liveKit.disconnect();
    releaseLiveKit();
  }, [liveKit, releaseLiveKit]);

  if (!liveKitSessionId) return null;

  if (isMinimized) {
    return (
      <MeetingBubble
        status={liveKit.status}
        onExpand={expand}
        onEnd={handleEnd}
      />
    );
  }

  // liveKitSessionId is the room name (e.g. "meeting-<uuid>").
  // VoiceMeetingRoom.meetingId must be the raw DB UUID only.
  const actualMeetingId = liveKitSessionId.startsWith("meeting-")
    ? liveKitSessionId.slice("meeting-".length)
    : liveKitSessionId;

  return (
    <VoiceMeetingRoom
      meetingId={actualMeetingId}
      onClose={handleEnd}
      onMinimize={minimize}
      agentStatus={liveKit.status}
      cameraEnabled={liveKit.cameraEnabled}
      toggleCamera={liveKit.toggleCamera}
      screenShareEnabled={liveKit.screenShareEnabled}
      toggleScreenShare={liveKit.toggleScreenShare}
      screenShareSupported={liveKit.screenShareSupported}
      videoTracks={liveKit.videoTracks}
      localVideoTrack={liveKit.localVideoTrack}
      localScreenTrack={liveKit.localScreenTrack}
      sendText={liveKit.sendText}
      setPTTActive={liveKit.setPTTActive}
    />
  );
}
