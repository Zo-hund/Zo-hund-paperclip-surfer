import { useEffect, useState } from "react";
import {
  RemoteVideoTrack, Room, RoomEvent, Track,
  type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication,
} from "livekit-client";
import type { LiveVideoFeed } from "./LiveKitPod";
import { stageFeedId, stageMonitorRetryDelay } from "./stage-camera-routing";

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
  const [status, setStatus] = useState<StageFeedMonitorStatus>("connecting");

  useEffect(() => {
    let disposed = false;
    let connecting = false;
    let retryAttempt = 0;
    let retryTimer = 0;
    let tokenRequest: AbortController | null = null;
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
      const id = stageFeedId(participant.identity, source);
      feeds.set(id, {
        participantIdentity: participant.identity,
        track,
        feed: {
          id,
          participantIdentity: participant.identity,
          name: source === "screen" ? `${participant.name || participant.identity} / screen` : participant.name || participant.identity,
          local: false,
          source,
          stream: new MediaStream([track.mediaStreamTrack]),
          muted: track.isMuted,
        },
      });
      commit();
    };
    const subscribePublication = (publication: RemoteTrackPublication) => {
      publication.setSubscribed(publication.kind === Track.Kind.Video);
    };
    const subscribePublishedVideo = () => {
      room.remoteParticipants.forEach((participant) => participant.trackPublications.forEach(subscribePublication));
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
    room.on(RoomEvent.TrackPublished, subscribePublication);
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
    room.on(RoomEvent.Reconnected, () => {
      retryAttempt = 0;
      subscribePublishedVideo();
      updateStatus("live");
    });
    room.on(RoomEvent.Disconnected, () => {
      feeds.clear();
      commit();
      updateStatus("unavailable");
      scheduleRetry();
    });

    const scheduleRetry = () => {
      if (disposed) return;
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => { void connect(); }, stageMonitorRetryDelay(retryAttempt));
    };
    const connect = async () => {
      if (disposed || connecting) return;
      connecting = true;
      updateStatus("connecting");
      tokenRequest?.abort();
      tokenRequest = new AbortController();
      try {
        const response = await fetch("/api/livekit/viewer-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room: safeRoom, name: "AMX Stage Router", clientType: "stage-monitor" }),
          signal: tokenRequest.signal,
        });
        const credentials = await response.json().catch(() => ({})) as { serverUrl?: string; participantToken?: string };
        if (!response.ok || !credentials.serverUrl || !credentials.participantToken) throw new Error("Stage relay token unavailable");
        await room.connect(credentials.serverUrl, credentials.participantToken, { autoSubscribe: false });
        subscribePublishedVideo();
        retryAttempt = 0;
        updateStatus("live");
      } catch (error) {
        if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
        retryAttempt += 1;
        updateStatus("unavailable");
        scheduleRetry();
      } finally {
        connecting = false;
      }
    };
    void connect();
    return () => {
      disposed = true;
      tokenRequest?.abort();
      window.clearTimeout(retryTimer);
      feeds.clear();
      onVideoFeeds([]);
      void room.disconnect();
    };
  }, [onStatus, onVideoFeeds, safeRoom]);

  return <span className="stage-feed-monitor" data-status={status} data-room={safeRoom} hidden/>;
}
