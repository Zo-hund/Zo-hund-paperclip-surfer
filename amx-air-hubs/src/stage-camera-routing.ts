import type { StageShot } from "./stage-production";

export type RoutableStageFeed = {
  id: string;
  participantIdentity?: string;
  source: "camera" | "screen";
  muted?: boolean;
  name?: string;
};

export type StageAudienceParticipant = {
  identity: string;
  metadata?: string;
};

const SHOT_INDEX: Record<StageShot, number> = { wide: 0, host: 1, audience: 2, crane: 3 };

export function stageFeedId(participantIdentity: string, source: RoutableStageFeed["source"]) {
  return `${participantIdentity}:${source}`;
}

export function sortStageVideoFeeds<T extends RoutableStageFeed>(feeds: Iterable<T>) {
  return [...feeds].sort((left, right) => {
    const sourceOrder = Number(left.source === "screen") - Number(right.source === "screen");
    if (sourceOrder) return sourceOrder;
    const leftIdentity = left.participantIdentity || left.id;
    const rightIdentity = right.participantIdentity || right.id;
    return leftIdentity.localeCompare(rightIdentity) || left.id.localeCompare(right.id);
  });
}

export function selectStageProgramFeed<T extends RoutableStageFeed>(feeds: Iterable<T>, shot: StageShot, route?: string) {
  const active = sortStageVideoFeeds(feeds).filter((feed) => !feed.muted);
  if (!active.length || route === "virtual") return null;
  if (route && route !== "auto") {
    return active.find((feed) => feed.id === route || feed.participantIdentity === route) || null;
  }
  return active[SHOT_INDEX[shot]] || active[0] || null;
}

export function isStageAudienceParticipant(participant: StageAudienceParticipant) {
  const identity = participant.identity.toLowerCase();
  if (identity.startsWith("stage-monitor-") || identity.startsWith("agent-") || identity.startsWith("amx-agent-")) return false;
  if (!participant.metadata) return true;
  try {
    const metadata = JSON.parse(participant.metadata) as Record<string, unknown>;
    const role = String(metadata.role || "").toLowerCase();
    const clientType = String(metadata.clientType || metadata.client_type || "").toLowerCase();
    return ![role, clientType].some((value) => ["agent", "monitor", "service", "stage-monitor"].includes(value))
      && !metadata.agentName
      && !metadata.agent_name;
  } catch {
    return true;
  }
}

export function countStageAudienceParticipants(participants: Iterable<StageAudienceParticipant>, localAudience = 1) {
  return [...participants].filter(isStageAudienceParticipant).length + localAudience;
}

export function stageMonitorRetryDelay(attempt: number) {
  return Math.min(30_000, 1_000 * (2 ** Math.min(Math.max(attempt, 0), 5)));
}
