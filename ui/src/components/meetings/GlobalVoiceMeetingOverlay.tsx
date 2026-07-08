/**
 * GlobalVoiceMeetingOverlay
 *
 * Renders the VoiceMeetingRoom as a persistent overlay that survives page
 * navigation. Listens to MeetingContext.liveKitSessionId — when non-null it
 * connects to LiveKit and shows the room. When minimized it renders the
 * draggable MeetingHubCockpit instead of unmounting the session, so audio,
 * canvas state, and reactions keep flowing.
 *
 * Mounted once in App.tsx next to <OnboardingWizard /> so it is always present
 * regardless of which route is active.
 */
import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMeeting } from "../../context/MeetingContext";
import { useCompany } from "../../context/CompanyContext";
import { useDialog } from "../../context/DialogContext";
import {
  useLiveKitVoice,
  type CanvasEvent,
  type CanvasCursorEvent,
  type ReactionEvent,
} from "../../hooks/useLiveKitVoice";
import { useMeetingCanvasBuffer } from "../../hooks/useMeetingCanvasBuffer";
import { authApi } from "../../api/auth";
import { assetsApi } from "../../api/assets";
import { meetingsApi } from "../../api/meetings";
import { VoiceMeetingRoom, type RoomMode } from "./VoiceMeetingRoom";
import { MeetingHubCockpit } from "./MeetingHubCockpit";

const CURSOR_TTL_MS = 2500;
const REACTION_TTL_MS = 3500;

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
  const [lastCanvasEvent, setLastCanvasEvent] = useState<CanvasEvent | null>(null);
  const [mode, setMode] = useState<RoomMode>("cockpit");
  const [cursors, setCursors] = useState<Map<string, CanvasCursorEvent>>(new Map());
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const canvasBuffer = useMeetingCanvasBuffer();
  const canvasBufferRef = useRef(canvasBuffer);
  canvasBufferRef.current = canvasBuffer;

  // Unique per-user LiveKit identity. The board-user prefix is load-bearing:
  // voice-agent/agent.py targets identities via identity.startswith("board-user").
  const { data: session } = useQuery({
    queryKey: ["auth-session"],
    queryFn: () => authApi.getSession(),
    staleTime: 5 * 60 * 1000,
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const identity = currentUserId ? `board-user-${currentUserId}` : "board-user";

  const handleCanvasEvent = useCallback((event: CanvasEvent) => {
    if (event.type === "canvas_stroke") {
      canvasBufferRef.current.addStroke({ points: event.points, color: event.color, width: event.width });
    } else if (event.type === "canvas_clear") {
      canvasBufferRef.current.clear();
    }
    setLastCanvasEvent(event);
  }, []);

  const handleCanvasCursor = useCallback((cursor: CanvasCursorEvent) => {
    setCursors((prev) => {
      const next = new Map(prev);
      next.set(cursor.identity, cursor);
      return next;
    });
  }, []);

  const handleReaction = useCallback((reaction: ReactionEvent) => {
    setReactions((prev) => [...prev.slice(-7), reaction]);
  }, []);

  // Prune stale cursors + expired reactions.
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
      setReactions((prev) => {
        const next = prev.filter((r) => now - r.ts <= REACTION_TTL_MS);
        return next.length === prev.length ? prev : next;
      });
    }, 500);
    return () => clearInterval(t);
  }, [cursors.size, reactions.length]);

  const liveKit = useLiveKitVoice({
    roomName: liveKitSessionId ?? "amx-command-room",
    identity,
    companyId: selectedCompanyId ?? undefined,
    companyPrefix: selectedCompany?.issuePrefix ?? undefined,
    companiesPrefixes: companies.map((c) => c.issuePrefix.toUpperCase()),
    avatarEnabled: liveKitAvatarEnabled,
    onNavigate: minimize,
    onCanvasEvent: handleCanvasEvent,
    onCanvasCursor: handleCanvasCursor,
    onReaction: handleReaction,
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

  // Buffer local strokes/clears too (the data channel doesn't loop back).
  const sendCanvasStroke = useCallback((stroke: { points: { x: number; y: number }[]; color: string; width: number }) => {
    canvasBufferRef.current.addStroke(stroke);
    liveKit.sendCanvasStroke(stroke);
  }, [liveKit.sendCanvasStroke]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendCanvasClear = useCallback(() => {
    canvasBufferRef.current.clear();
    liveKit.sendCanvasClear();
  }, [liveKit.sendCanvasClear]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Reset per-session UI state when the session changes.
  useEffect(() => {
    setMode("cockpit");
    setCursors(new Map());
    setReactions([]);
    canvasBufferRef.current.clear();
    setLastCanvasEvent(null);
  }, [liveKitSessionId]);

  const handleEnd = useCallback(() => {
    liveKit.disconnect();
    releaseLiveKit();
  }, [liveKit, releaseLiveKit]);

  // liveKitSessionId is the room name (e.g. "meeting-<uuid>").
  // VoiceMeetingRoom.meetingId must be the raw DB UUID only.
  const actualMeetingId = useMemo(() => {
    if (!liveKitSessionId) return null;
    return liveKitSessionId.startsWith("meeting-")
      ? liveKitSessionId.slice("meeting-".length)
      : liveKitSessionId;
  }, [liveKitSessionId]);

  /** Render the buffered canvas to PNG, upload it, and attach it to the meeting. */
  const saveCanvasSnapshot = useCallback(async () => {
    if (!actualMeetingId || !selectedCompanyId) throw new Error("No active meeting");
    const blob = await canvasBufferRef.current.toPngBlob();
    if (!blob) throw new Error("Canvas render failed");
    const label = `Canvas ${new Date().toLocaleString()}`;
    const file = new File([blob], `canvas-${Date.now()}.png`, { type: "image/png" });
    const asset = await assetsApi.uploadImage(selectedCompanyId, file, "meetings");
    await meetingsApi.action(actualMeetingId, "add_outcome", {
      type: "artifact",
      content: JSON.stringify({ label, assetId: asset.assetId, contentPath: asset.contentPath }),
    });
  }, [actualMeetingId, selectedCompanyId]);

  const expandToMode = useCallback((nextMode?: RoomMode) => {
    if (nextMode) setMode(nextMode);
    expand();
  }, [expand]);

  if (!liveKitSessionId || !actualMeetingId) return null;

  if (isMinimized) {
    return (
      <MeetingHubCockpit
        meetingId={actualMeetingId}
        status={liveKit.status}
        muted={liveKit.muted}
        onToggleMute={() => liveKit.setMuted(!liveKit.muted)}
        onExpand={expandToMode}
        onEnd={handleEnd}
        activeSpeakers={liveKit.activeSpeakers}
        videoTracks={liveKit.videoTracks}
        localScreenTrack={liveKit.localScreenTrack}
        lastReactionEmoji={reactions.length > 0 ? reactions[reactions.length - 1].emoji : null}
      />
    );
  }

  return (
    <VoiceMeetingRoom
      meetingId={actualMeetingId}
      onClose={handleEnd}
      onMinimize={minimize}
      agentStatus={liveKit.status}
      participantCount={liveKit.participantCount}
      mode={mode}
      onModeChange={setMode}
      cameraEnabled={liveKit.cameraEnabled}
      toggleCamera={liveKit.toggleCamera}
      screenShareEnabled={liveKit.screenShareEnabled}
      toggleScreenShare={liveKit.toggleScreenShare}
      screenShareSupported={liveKit.screenShareSupported}
      videoTracks={liveKit.videoTracks}
      localVideoTrack={liveKit.localVideoTrack}
      localScreenTrack={liveKit.localScreenTrack}
      sendText={liveKit.sendText}
      sendCanvasStroke={sendCanvasStroke}
      sendCanvasClear={sendCanvasClear}
      canvasEvent={lastCanvasEvent}
      canvasCursors={Array.from(cursors.values())}
      sendCanvasCursor={liveKit.sendCanvasCursor}
      bufferedStrokes={canvasBuffer.getStrokes()}
      bufferVersion={canvasBuffer.version}
      onSaveSnapshot={saveCanvasSnapshot}
      sendReaction={liveKit.sendReaction}
      reactions={reactions}
      setPTTActive={liveKit.setPTTActive}
      activeModule={liveKit.activeModule}
      clearModule={liveKit.clearModule}
    />
  );
}
