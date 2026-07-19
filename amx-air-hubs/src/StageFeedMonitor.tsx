import { useEffect, useMemo, useState } from "react";
import {
  RemoteVideoTrack, Room, RoomEvent, Track,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from "livekit-client";
import type { LiveVideoFeed } from "./LiveKitPod";

export type StageFeedMonitorStatus = "connecting" | "live" | "unavailable";

interface Props {
  roomCode: string;
  onStatus: (status: StageFeedMonitorStatus) => void;
  onVideoFeeds: (feeds: LiveVideoFeed[]) => void;
}

type MonitoredFeed = {
  feed: LiveVideoFeed;
  participantIdentity: string;
  track: RemoteVideoTrack;
};

export function StageFeedMonitor({ roomCode, onStatus, onVideoFeeds }: Props) {
  const safeRoom = roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64) || "AMXSTAGE";
  const identity = useMemo(() => `stage-monitor-${crypto.randomUUID().slice(0, 12)}`, []);
  const [status, setStatus] = useState<StageFeedMonitorStatus>("connecting");

  useEffect(() => {
    let disposed = false;
    const room = new Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true });
    const feeds = new Map<string, MonitoredFeed>();
    const commit = () => {
      if (!disposed) onVideoFeeds([...feeds.values()].map((entry) => entry.feed));
    };
    const updateStatus = (next: StageFeedMonitorStatus) => {
      if (disposed) return;
      setStatus(next);
      onStatus(next);
    };
    const addFeed = (track: RemoteVideoTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      const source = publication.source === Track.Source.ScreenShare ? "screen" : "camera";
      const id = `${participant.identity}-${track.sid}`;
      feeds.set(id, {
        participantIdentity: participant.identity,
        track,
        feed: {
          id,
          name: source === "screen" ? `${participant.name || participant.identity} / screen` : participant.name || participant.identity,
          local: false,
          source,
          stream: new MediaStream([track.mediaStreamTrack]),
          muted: track.isMuted,
        },
      });
      commit();
    };
    const setMuted = (track: unknown, muted: boolean) => {
      if (!track) return;
      feeds.forEach((entry, id) => {
        if (entry.track === track) feeds.set(id, { ...entry, feed: { ...entry.feed, muted } });
      });
      commit();
    };

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Video) addFeed(track as RemoteVideoTrack, publication, participant);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      feeds.forEach((entry, id) => { if (entry.track === track) feeds.delete(id); });
      commit();
    });
    room.on(RoomEvent.TrackMuted, (publication) => setMuted(publication.track, true));
    room.on(RoomEvent.TrackUnmuted, (publication) => setMuted(publication.track, false));
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      feeds.forEach((entry, id) => { if (entry.participantIdentity === participant.identity) feeds.delete(id); });
      commit();
    });
    room.on(RoomEvent.Reconnecting, () => updateStatus("connecting"));
    room.on(RoomEvent.Reconnected, () => updateStatus("live"));
    room.on(RoomEvent.Disconnected, () => {
      feeds.clear();
      commit();
      updateStatus("unavailable");
    });

    const connect = async () => {
      updateStatus("connecting");
      try {
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room: safeRoom, identity, name: "AMX Stage Router", role: "viewer" }),
        });
        const credentials = await response.json().catch(() => ({})) as { serverUrl?: string; participantToken?: string };
        if (!response.ok || !credentials.serverUrl || !credentials.participantToken) {
          updateStatus("unavailable");
          return;
        }
        await room.connect(credentials.serverUrl, credentials.participantToken);
        updateStatus("live");
      } catch {
        updateStatus("unavailable");
      }
    };
    void connect();
    return () => {
      disposed = true;
      feeds.clear();
      onVideoFeeds([]);
      void room.disconnect();
    };
  }, [identity, onStatus, onVideoFeeds, safeRoom]);

  return <span className="stage-feed-monitor" data-status={status} data-room={safeRoom} hidden/>;
}
